-- Append-only, clinician-attributed intake assessment history.
-- Run after 019_notification_outbox.sql.

begin;

-- The browser submits one exact, bounded snapshot. Keeping validation in a
-- private helper makes the RPC fail closed when fields are omitted, renamed,
-- mistyped, or added by an incompatible client.
create or replace function private.is_valid_case_assessment_payload(
  p_value jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_age numeric;
  v_pain numeric;
begin
  if p_value is null
     or jsonb_typeof(p_value) <> 'object'
     or pg_column_size(p_value) > 100000
     or not p_value ?& array[
       'name', 'age', 'gender', 'region', 'main_complaint',
       'pain_location', 'pain_intensity', 'duration', 'mechanism',
       'aggravating', 'easing', 'medical_history', 'surgical_history',
       'imaging', 'medications', 'functional_limitations', 'patient_goal'
     ]
     or (select count(*) from jsonb_object_keys(p_value)) <> 17
     or jsonb_typeof(p_value -> 'name') <> 'string'
     or jsonb_typeof(p_value -> 'age') not in ('number', 'null')
     or jsonb_typeof(p_value -> 'gender') not in ('string', 'null')
     or jsonb_typeof(p_value -> 'region') <> 'string'
     or jsonb_typeof(p_value -> 'main_complaint') <> 'string'
     or jsonb_typeof(p_value -> 'pain_location') <> 'string'
     or jsonb_typeof(p_value -> 'pain_intensity') <> 'number'
     or jsonb_typeof(p_value -> 'duration') <> 'string'
     or jsonb_typeof(p_value -> 'mechanism') <> 'string'
     or jsonb_typeof(p_value -> 'aggravating') <> 'string'
     or jsonb_typeof(p_value -> 'easing') <> 'string'
     or jsonb_typeof(p_value -> 'medical_history') <> 'string'
     or jsonb_typeof(p_value -> 'surgical_history') <> 'string'
     or jsonb_typeof(p_value -> 'imaging') <> 'string'
     or jsonb_typeof(p_value -> 'medications') <> 'string'
     or jsonb_typeof(p_value -> 'functional_limitations') <> 'string'
     or jsonb_typeof(p_value -> 'patient_goal') <> 'string' then
    return false;
  end if;

  begin
    v_age := (p_value ->> 'age')::numeric;
    v_pain := (p_value ->> 'pain_intensity')::numeric;
  exception when others then
    return false;
  end;

  return
    char_length(btrim(p_value ->> 'name')) between 1 and 200
    and (
      v_age is null
      or (v_age between 0 and 120 and v_age = trunc(v_age))
    )
    and (
      p_value ->> 'gender' is null
      or p_value ->> 'gender' in ('male', 'female', 'other')
    )
    and p_value ->> 'region' in (
      'neck', 'shoulder', 'low-back', 'hip', 'knee', 'ankle-foot',
      'post-op', 'neuro', 'sports'
    )
    and char_length(btrim(p_value ->> 'main_complaint')) between 1 and 10000
    and v_pain between 0 and 10
    and v_pain = trunc(v_pain)
    and char_length(p_value ->> 'pain_location') <= 2000
    and char_length(p_value ->> 'duration') <= 500
    and char_length(p_value ->> 'mechanism') <= 5000
    and char_length(p_value ->> 'aggravating') <= 5000
    and char_length(p_value ->> 'easing') <= 5000
    and char_length(p_value ->> 'medical_history') <= 20000
    and char_length(p_value ->> 'surgical_history') <= 20000
    and char_length(p_value ->> 'imaging') <= 20000
    and char_length(p_value ->> 'medications') <= 10000
    and char_length(p_value ->> 'functional_limitations') <= 10000
    and char_length(p_value ->> 'patient_goal') <= 5000;
end;
$$;
revoke all on function private.is_valid_case_assessment_payload(jsonb)
  from public, anon, authenticated, service_role;

create table if not exists public.case_assessment_versions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete restrict,
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  patient_id uuid references public.patients (id) on delete restrict,
  episode_id uuid references public.care_episodes (id) on delete restrict,
  version integer not null check (version between 1 and 1000000),
  change_type text not null
    check (change_type in ('initial', 'correction', 'reassessment')),
  assessed_at timestamptz not null,
  name text not null,
  age integer,
  gender text,
  region text,
  main_complaint text not null,
  pain_location text,
  pain_intensity integer not null,
  duration text,
  mechanism text,
  aggravating text,
  easing text,
  medical_history text,
  surgical_history text,
  imaging text,
  medications text,
  functional_limitations text,
  patient_goal text,
  authored_by uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  supersedes_id uuid
    references public.case_assessment_versions (id) on delete restrict,
  change_reason text,
  source text not null default 'clinician'
    check (source in ('clinician', 'legacy-import')),
  unique (case_id, version),
  check (
    (
      version = 1
      and change_type = 'initial'
      and supersedes_id is null
      and change_reason is null
    )
    or (
      version > 1
      and change_type in ('correction', 'reassessment')
      and supersedes_id is not null
      and change_reason is not null
      and char_length(btrim(change_reason)) between 3 and 1000
    )
  ),
  check (source = 'clinician' or change_type = 'initial'),
  -- Historical rows are preserved exactly even if they predate validation.
  -- Every post-migration clinician write must satisfy the strict shape below.
  check (
    source = 'legacy-import'
    or (
      patient_id is not null
      and episode_id is not null
      and authored_by is not null
      and assessed_at >= '2000-01-01'::timestamptz
      and assessed_at <= created_at + interval '1 day'
      and char_length(btrim(name)) between 1 and 200
      and (age is null or age between 0 and 120)
      and (gender is null or gender in ('male', 'female', 'other'))
      and region is not null
      and region in (
        'neck', 'shoulder', 'low-back', 'hip', 'knee', 'ankle-foot',
        'post-op', 'neuro', 'sports'
      )
      and char_length(btrim(main_complaint)) between 1 and 10000
      and pain_intensity between 0 and 10
      and char_length(coalesce(pain_location, '')) <= 2000
      and char_length(coalesce(duration, '')) <= 500
      and char_length(coalesce(mechanism, '')) <= 5000
      and char_length(coalesce(aggravating, '')) <= 5000
      and char_length(coalesce(easing, '')) <= 5000
      and char_length(coalesce(medical_history, '')) <= 20000
      and char_length(coalesce(surgical_history, '')) <= 20000
      and char_length(coalesce(imaging, '')) <= 20000
      and char_length(coalesce(medications, '')) <= 10000
      and char_length(coalesce(functional_limitations, '')) <= 10000
      and char_length(coalesce(patient_goal, '')) <= 5000
    )
  )
);

create unique index if not exists case_assessment_versions_one_successor_idx
  on public.case_assessment_versions (supersedes_id)
  where supersedes_id is not null;
create index if not exists case_assessment_versions_case_current_idx
  on public.case_assessment_versions (case_id, version desc);
create index if not exists case_assessment_versions_episode_time_idx
  on public.case_assessment_versions (episode_id, assessed_at desc)
  where episode_id is not null;

alter table public.case_assessment_versions enable row level security;
revoke all on table public.case_assessment_versions
  from public, anon, authenticated, service_role;
grant select on table public.case_assessment_versions to authenticated;

drop policy if exists "case assessment history clinician read"
  on public.case_assessment_versions;
create policy "case assessment history clinician read"
  on public.case_assessment_versions for select to authenticated
  using (
    patient_id is not null
    and private.can_manage_clinical_record(patient_id)
  );

create or replace function private.reject_case_assessment_history_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'Signed case assessment history is append-only; add a revision';
end;
$$;
revoke all on function private.reject_case_assessment_history_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists case_assessment_versions_immutable
  on public.case_assessment_versions;
create trigger case_assessment_versions_immutable
before update or delete on public.case_assessment_versions
for each row execute function private.reject_case_assessment_history_mutation();
drop trigger if exists case_assessment_versions_no_truncate
  on public.case_assessment_versions;
create trigger case_assessment_versions_no_truncate
before truncate on public.case_assessment_versions
for each statement execute function private.reject_case_assessment_history_mutation();

-- Validate tenant identity and a single linear history even for trusted SQL.
create or replace function private.validate_case_assessment_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.cases%rowtype;
  v_parent public.case_assessment_versions%rowtype;
begin
  select patient_case.* into v_case
  from public.cases patient_case
  where patient_case.id = new.case_id
  for key share;
  if not found
     or new.clinic_id is distinct from v_case.clinic_id
     or new.patient_id is distinct from v_case.patient_id
     or new.episode_id is distinct from v_case.episode_id then
    raise exception using
      errcode = '23514', message = 'Assessment identity does not match its case';
  end if;

  if row(
       new.name, new.age, new.gender, new.region, new.main_complaint,
       new.pain_location, new.pain_intensity, new.duration, new.mechanism,
       new.aggravating, new.easing, new.medical_history,
       new.surgical_history, new.imaging, new.medications,
       new.functional_limitations, new.patient_goal
     ) is distinct from row(
       v_case.name, v_case.age, v_case.gender, v_case.region,
       v_case.main_complaint, v_case.pain_location, v_case.pain_intensity,
       v_case.duration, v_case.mechanism, v_case.aggravating, v_case.easing,
       v_case.medical_history, v_case.surgical_history, v_case.imaging,
       v_case.medications, v_case.functional_limitations, v_case.patient_goal
     ) then
    raise exception using
      errcode = '23514', message = 'Assessment snapshot does not match the case projection';
  end if;

  if new.version = 1 then
    if exists (
      select 1 from public.case_assessment_versions assessment
      where assessment.case_id = new.case_id
    ) then
      raise exception using
        errcode = '23514', message = 'Initial assessment version already exists';
    end if;
  else
    select parent.* into v_parent
    from public.case_assessment_versions parent
    where parent.id = new.supersedes_id
    for key share;
    if not found
       or v_parent.case_id <> new.case_id
       or new.version <> v_parent.version + 1
       or exists (
         select 1 from public.case_assessment_versions successor
         where successor.supersedes_id = v_parent.id
       ) then
      raise exception using
        errcode = '23514', message = 'Assessment revision chain is invalid';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.validate_case_assessment_version()
  from public, anon, authenticated, service_role;
drop trigger if exists case_assessment_versions_validate_chain
  on public.case_assessment_versions;
create trigger case_assessment_versions_validate_chain
before insert on public.case_assessment_versions
for each row execute function private.validate_case_assessment_version();

drop trigger if exists audit_row_change on public.case_assessment_versions;
create trigger audit_row_change
after insert on public.case_assessment_versions
for each row execute function private.write_audit_log();

-- Preserve a faithful initial snapshot for every case that existed before the
-- migration. Null actors/links remain explicit instead of being fabricated.
insert into public.case_assessment_versions (
  case_id, clinic_id, patient_id, episode_id, version, change_type,
  assessed_at, name, age, gender, region, main_complaint, pain_location,
  pain_intensity, duration, mechanism, aggravating, easing, medical_history,
  surgical_history, imaging, medications, functional_limitations,
  patient_goal, authored_by, created_at, source
)
select
  patient_case.id, patient_case.clinic_id, patient_case.patient_id,
  patient_case.episode_id, 1, 'initial', patient_case.created_at,
  patient_case.name, patient_case.age, patient_case.gender,
  patient_case.region, patient_case.main_complaint,
  patient_case.pain_location, patient_case.pain_intensity,
  patient_case.duration, patient_case.mechanism, patient_case.aggravating,
  patient_case.easing, patient_case.medical_history,
  patient_case.surgical_history, patient_case.imaging,
  patient_case.medications, patient_case.functional_limitations,
  patient_case.patient_goal, patient_case.created_by,
  patient_case.created_at, 'legacy-import'
from public.cases patient_case
where not exists (
  select 1 from public.case_assessment_versions assessment
  where assessment.case_id = patient_case.id
);

-- New case inserts create their initial signed version in the same transaction.
create or replace function private.capture_initial_case_assessment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.case_assessment_versions (
    case_id, clinic_id, patient_id, episode_id, version, change_type,
    assessed_at, name, age, gender, region, main_complaint, pain_location,
    pain_intensity, duration, mechanism, aggravating, easing, medical_history,
    surgical_history, imaging, medications, functional_limitations,
    patient_goal, authored_by, source
  ) values (
    new.id, new.clinic_id, new.patient_id, new.episode_id, 1, 'initial',
    new.created_at, new.name, new.age, new.gender, new.region,
    new.main_complaint, new.pain_location, new.pain_intensity,
    new.duration, new.mechanism, new.aggravating, new.easing,
    new.medical_history, new.surgical_history, new.imaging,
    new.medications, new.functional_limitations, new.patient_goal,
    new.created_by,
    case
      when auth.uid() is not null and new.created_by = auth.uid()
        then 'clinician'
      else 'legacy-import'
    end
  );
  return new;
end;
$$;
revoke all on function private.capture_initial_case_assessment()
  from public, anon, authenticated, service_role;
drop trigger if exists cases_capture_initial_assessment on public.cases;
create trigger cases_capture_initial_assessment
after insert on public.cases
for each row execute function private.capture_initial_case_assessment();

-- The projection may only be updated from the attributed revision workflow.
create or replace function private.enforce_case_assessment_projection()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_rpc_owner text;
begin
  select pg_catalog.pg_get_userbyid(proc.proowner)
    into v_rpc_owner
  from pg_catalog.pg_proc proc
  where proc.oid =
    'public.record_case_assessment_revision(uuid,uuid,text,text,timestamptz,jsonb)'::regprocedure;
  if current_user::text is distinct from v_rpc_owner then
    raise exception using
      errcode = '42501',
      message = 'Use record_case_assessment_revision to change an assessment';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_case_assessment_projection()
  from public, anon, authenticated, service_role;

create or replace function public.record_case_assessment_revision(
  p_case_id uuid,
  p_supersedes_id uuid,
  p_change_type text,
  p_change_reason text,
  p_assessed_at timestamptz,
  p_assessment jsonb
)
returns table (
  assessment_version_id uuid,
  assessment_version integer,
  authored_by uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_case public.cases%rowtype;
  v_current public.case_assessment_versions%rowtype;
  v_new public.case_assessment_versions%rowtype;
  v_payload record;
  v_reason text := nullif(btrim(coalesce(p_change_reason, '')), '');
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using
      errcode = '42501', message = 'Clinician authentication is required';
  end if;
  if p_case_id is null
     or p_supersedes_id is null
     or p_change_type is null
     or p_change_type not in ('correction', 'reassessment')
     or char_length(coalesce(v_reason, '')) not between 3 and 1000
     or p_assessed_at is null
     or p_assessed_at < '2000-01-01'::timestamptz
     or p_assessed_at > clock_timestamp() + interval '1 day'
     or not private.is_valid_case_assessment_payload(p_assessment) then
    raise exception using
      errcode = '22023', message = 'Assessment revision input is invalid';
  end if;

  select * into v_payload
  from jsonb_to_record(p_assessment) as payload(
    name text, age integer, gender text, region text,
    main_complaint text, pain_location text, pain_intensity integer,
    duration text, mechanism text, aggravating text, easing text,
    medical_history text, surgical_history text, imaging text,
    medications text, functional_limitations text, patient_goal text
  );

  select patient_case.* into v_case
  from public.cases patient_case
  where patient_case.id = p_case_id
  for update;
  if not found
     or v_case.patient_id is null
     or v_case.episode_id is null
     or not private.clinician_can_access_ai_case(
       v_actor, v_case.id, v_case.clinic_id
     ) then
    raise exception using
      errcode = '42501', message = 'Case access is not permitted';
  end if;

  select assessment.* into v_current
  from public.case_assessment_versions assessment
  where assessment.case_id = v_case.id
  order by assessment.version desc
  limit 1
  for update;
  if not found or v_current.id <> p_supersedes_id then
    raise exception using
      errcode = '23514',
      message = 'Assessment changed after it was loaded; refresh before revising';
  end if;

  if row(
       v_case.name, v_case.age, v_case.gender, v_case.region,
       v_case.main_complaint, v_case.pain_location, v_case.pain_intensity,
       v_case.duration, v_case.mechanism, v_case.aggravating, v_case.easing,
       v_case.medical_history, v_case.surgical_history, v_case.imaging,
       v_case.medications, v_case.functional_limitations, v_case.patient_goal
     ) is distinct from row(
       v_current.name, v_current.age, v_current.gender, v_current.region,
       v_current.main_complaint, v_current.pain_location,
       v_current.pain_intensity, v_current.duration, v_current.mechanism,
       v_current.aggravating, v_current.easing, v_current.medical_history,
       v_current.surgical_history, v_current.imaging,
       v_current.medications, v_current.functional_limitations,
       v_current.patient_goal
     ) then
    raise exception using
      errcode = '55000',
      message = 'Case projection is inconsistent with signed assessment history';
  end if;

  if p_change_type = 'correction' then
    if p_assessed_at is distinct from v_current.assessed_at then
      raise exception using
        errcode = '22023',
        message = 'A correction must retain the original assessment time';
    end if;
    if row(
         btrim(v_payload.name), v_payload.age, v_payload.gender,
         v_payload.region, btrim(v_payload.main_complaint),
         btrim(v_payload.pain_location), v_payload.pain_intensity,
         btrim(v_payload.duration), btrim(v_payload.mechanism),
         btrim(v_payload.aggravating), btrim(v_payload.easing),
         btrim(v_payload.medical_history), btrim(v_payload.surgical_history),
         btrim(v_payload.imaging), btrim(v_payload.medications),
         btrim(v_payload.functional_limitations),
         btrim(v_payload.patient_goal)
       ) is not distinct from row(
         v_current.name, v_current.age, v_current.gender, v_current.region,
         v_current.main_complaint, v_current.pain_location,
         v_current.pain_intensity, v_current.duration, v_current.mechanism,
         v_current.aggravating, v_current.easing, v_current.medical_history,
         v_current.surgical_history, v_current.imaging,
         v_current.medications, v_current.functional_limitations,
         v_current.patient_goal
       ) then
      raise exception using
        errcode = '22023', message = 'A correction must change assessment content';
    end if;
  elsif p_assessed_at < v_current.assessed_at then
    raise exception using
      errcode = '22023',
      message = 'A reassessment cannot predate the current assessment';
  end if;

  update public.cases patient_case
  set name = btrim(v_payload.name),
      age = v_payload.age,
      gender = v_payload.gender,
      region = v_payload.region,
      main_complaint = btrim(v_payload.main_complaint),
      pain_location = btrim(v_payload.pain_location),
      pain_intensity = v_payload.pain_intensity,
      duration = btrim(v_payload.duration),
      mechanism = btrim(v_payload.mechanism),
      aggravating = btrim(v_payload.aggravating),
      easing = btrim(v_payload.easing),
      medical_history = btrim(v_payload.medical_history),
      surgical_history = btrim(v_payload.surgical_history),
      imaging = btrim(v_payload.imaging),
      medications = btrim(v_payload.medications),
      functional_limitations = btrim(v_payload.functional_limitations),
      patient_goal = btrim(v_payload.patient_goal)
  where patient_case.id = v_case.id
  returning patient_case.* into v_case;

  insert into public.case_assessment_versions (
    case_id, clinic_id, patient_id, episode_id, version, change_type,
    assessed_at, name, age, gender, region, main_complaint, pain_location,
    pain_intensity, duration, mechanism, aggravating, easing, medical_history,
    surgical_history, imaging, medications, functional_limitations,
    patient_goal, authored_by, supersedes_id, change_reason, source
  ) values (
    v_case.id, v_case.clinic_id, v_case.patient_id, v_case.episode_id,
    v_current.version + 1, p_change_type, p_assessed_at,
    v_case.name, v_case.age, v_case.gender, v_case.region,
    v_case.main_complaint, v_case.pain_location, v_case.pain_intensity,
    v_case.duration, v_case.mechanism, v_case.aggravating, v_case.easing,
    v_case.medical_history, v_case.surgical_history, v_case.imaging,
    v_case.medications, v_case.functional_limitations, v_case.patient_goal,
    v_actor, v_current.id, v_reason, 'clinician'
  ) returning * into v_new;

  return query select v_new.id, v_new.version, v_new.authored_by, v_new.created_at;
end;
$$;

revoke all on function public.record_case_assessment_revision(
  uuid, uuid, text, text, timestamptz, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.record_case_assessment_revision(
  uuid, uuid, text, text, timestamptz, jsonb
) to authenticated;

drop trigger if exists cases_assessment_projection_rpc_only on public.cases;
create trigger cases_assessment_projection_rpc_only
before update of name, age, gender, region, main_complaint, pain_location,
  pain_intensity, duration, mechanism, aggravating, easing, medical_history,
  surgical_history, imaging, medications, functional_limitations, patient_goal
on public.cases
for each row execute function private.enforce_case_assessment_projection();

-- There are no remaining supported direct UPDATE or DELETE operations on a
-- clinical intake. Safety and assessment changes use their attributed RPCs.
drop policy if exists "cases update" on public.cases;
drop policy if exists "cases delete" on public.cases;
revoke update, delete, truncate on table public.cases
  from public, anon, authenticated, service_role;
revoke insert, update, delete, truncate
  on table public.case_assessment_versions
  from public, anon, authenticated, service_role;

comment on table public.case_assessment_versions is
  'Append-only signed intake snapshots. Corrections and reassessments form one linear, attributed version chain.';
comment on table public.cases is
  'Current case projection. Assessment and safety changes are RPC-only; signed assessment history is authoritative.';
comment on function public.record_case_assessment_revision(
  uuid, uuid, text, text, timestamptz, jsonb
) is
  'Authenticated owner/assigned-therapist workflow for a stale-write-safe correction or reassessment.';

commit;
