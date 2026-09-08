-- Append-only clinician session notes and versioned outcome measurements.
-- Run after 017_ticket_workflow_and_escalation.sql.

begin;

create table if not exists public.outcome_measure_catalog_versions (
  instrument_key text not null,
  version integer not null check (version between 1 and 1000),
  display_name text not null,
  score_min numeric(10,2) not null,
  score_max numeric(10,2) not null,
  unit text not null,
  direction text not null check (direction in ('higher-better', 'higher-worse')),
  active boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  primary key (instrument_key, version),
  check (instrument_key ~ '^[a-z0-9][a-z0-9_-]{1,99}$'),
  check (char_length(btrim(display_name)) between 2 and 200),
  check (score_min < score_max),
  check (char_length(btrim(unit)) between 1 and 40)
);
create unique index if not exists outcome_measure_catalog_one_active_idx
  on public.outcome_measure_catalog_versions (instrument_key) where active;

insert into public.outcome_measure_catalog_versions (
  instrument_key, version, display_name, score_min, score_max, unit,
  direction, active
) values
  ('nrs_pain', 1, 'Numeric Pain Rating Scale (NPRS/NRS)', 0, 10, '0–10', 'higher-worse', true),
  ('lefs', 1, 'Lower Extremity Functional Scale (LEFS)', 0, 80, '0–80', 'higher-better', true),
  ('odi', 1, 'Oswestry Disability Index (ODI)', 0, 100, '%', 'higher-worse', true),
  ('ndi', 1, 'Neck Disability Index (NDI)', 0, 50, '0–50', 'higher-worse', true),
  ('quickdash', 1, 'QuickDASH', 0, 100, '0–100', 'higher-worse', true),
  ('psfs', 1, 'Patient-Specific Functional Scale (PSFS)', 0, 10, '0–10', 'higher-better', true)
on conflict (instrument_key, version) do update
set display_name = excluded.display_name,
    score_min = excluded.score_min,
    score_max = excluded.score_max,
    unit = excluded.unit,
    direction = excluded.direction,
    active = excluded.active;

alter table public.outcome_measure_catalog_versions enable row level security;
revoke all on table public.outcome_measure_catalog_versions
  from public, anon, authenticated, service_role;
grant select on table public.outcome_measure_catalog_versions to authenticated;
drop policy if exists "authenticated outcome catalog read"
  on public.outcome_measure_catalog_versions;
create policy "authenticated outcome catalog read"
  on public.outcome_measure_catalog_versions for select to authenticated
  using (active);

create table if not exists public.clinical_session_notes (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  episode_id uuid not null references public.care_episodes (id) on delete restrict,
  case_id uuid references public.cases (id) on delete restrict,
  occurred_at timestamptz not null,
  subjective text not null default '',
  objective text not null default '',
  interventions text not null default '',
  response text not null default '',
  plan text not null default '',
  authored_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  supersedes_id uuid references public.clinical_session_notes (id) on delete restrict,
  correction_reason text,
  check (
    char_length(subjective) <= 10000
    and char_length(objective) <= 10000
    and char_length(interventions) <= 10000
    and char_length(response) <= 10000
    and char_length(plan) <= 10000
    and (
      char_length(btrim(subjective)) > 0
      or char_length(btrim(objective)) > 0
      or char_length(btrim(interventions)) > 0
      or char_length(btrim(response)) > 0
      or char_length(btrim(plan)) > 0
    )
  ),
  check (
    (supersedes_id is null and correction_reason is null)
    or (
      supersedes_id is not null
      and char_length(btrim(correction_reason)) between 3 and 1000
    )
  )
);
create unique index if not exists clinical_session_notes_one_correction_idx
  on public.clinical_session_notes (supersedes_id)
  where supersedes_id is not null;
create index if not exists clinical_session_notes_episode_time_idx
  on public.clinical_session_notes (episode_id, occurred_at desc, created_at desc);

create table if not exists public.outcome_measurements_v2 (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  episode_id uuid not null references public.care_episodes (id) on delete restrict,
  case_id uuid references public.cases (id) on delete restrict,
  instrument_key text not null,
  instrument_version integer not null,
  instrument_name_snapshot text not null,
  score numeric(10,2) not null,
  score_min_snapshot numeric(10,2) not null,
  score_max_snapshot numeric(10,2) not null,
  unit_snapshot text not null,
  direction_snapshot text not null,
  measured_at date not null,
  notes text,
  authored_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  supersedes_id uuid references public.outcome_measurements_v2 (id) on delete restrict,
  correction_reason text,
  foreign key (instrument_key, instrument_version)
    references public.outcome_measure_catalog_versions (instrument_key, version)
    on delete restrict,
  check (score between score_min_snapshot and score_max_snapshot),
  check (direction_snapshot in ('higher-better', 'higher-worse')),
  check (char_length(coalesce(notes, '')) <= 5000),
  check (
    (supersedes_id is null and correction_reason is null)
    or (
      supersedes_id is not null
      and char_length(btrim(correction_reason)) between 3 and 1000
    )
  )
);
create unique index if not exists outcome_measurements_v2_one_correction_idx
  on public.outcome_measurements_v2 (supersedes_id)
  where supersedes_id is not null;
create index if not exists outcome_measurements_v2_episode_time_idx
  on public.outcome_measurements_v2 (
    episode_id, instrument_key, measured_at desc, created_at desc
  );

alter table public.clinical_session_notes enable row level security;
alter table public.outcome_measurements_v2 enable row level security;
revoke all on table public.clinical_session_notes
  from public, anon, authenticated, service_role;
revoke all on table public.outcome_measurements_v2
  from public, anon, authenticated, service_role;
grant select on table public.clinical_session_notes to authenticated;
grant select on table public.outcome_measurements_v2 to authenticated;

drop policy if exists "clinical session notes clinician read"
  on public.clinical_session_notes;
create policy "clinical session notes clinician read"
  on public.clinical_session_notes for select to authenticated
  using (private.can_manage_clinical_record(patient_id));
drop policy if exists "outcome measurements clinician read"
  on public.outcome_measurements_v2;
create policy "outcome measurements clinician read"
  on public.outcome_measurements_v2 for select to authenticated
  using (private.can_manage_clinical_record(patient_id));

create or replace function private.reject_clinical_documentation_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'Signed clinical documentation is append-only; create a correction';
end;
$$;
revoke all on function private.reject_clinical_documentation_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists clinical_session_notes_immutable
  on public.clinical_session_notes;
create trigger clinical_session_notes_immutable
before update or delete on public.clinical_session_notes
for each row execute function private.reject_clinical_documentation_mutation();
drop trigger if exists outcome_measurements_v2_immutable
  on public.outcome_measurements_v2;
create trigger outcome_measurements_v2_immutable
before update or delete on public.outcome_measurements_v2
for each row execute function private.reject_clinical_documentation_mutation();

drop trigger if exists audit_row_change on public.clinical_session_notes;
create trigger audit_row_change
after insert on public.clinical_session_notes
for each row execute function private.write_audit_log();
drop trigger if exists audit_row_change on public.outcome_measurements_v2;
create trigger audit_row_change
after insert on public.outcome_measurements_v2
for each row execute function private.write_audit_log();

create or replace function private.load_documentation_context(
  p_episode_id uuid,
  p_case_id uuid,
  out clinic_id uuid,
  out patient_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinic_id uuid;
  v_patient_id uuid;
begin
  select patient.clinic_id, episode.patient_id
    into v_clinic_id, v_patient_id
  from public.care_episodes episode
  join public.patients patient on patient.id = episode.patient_id
  where episode.id = p_episode_id
  for key share of episode, patient;
  if not found or not private.can_manage_clinical_record(v_patient_id) then
    raise exception using errcode = '42501', message = 'Episode access is not permitted';
  end if;
  if p_case_id is not null and not exists (
    select 1 from public.cases patient_case
    where patient_case.id = p_case_id
      and patient_case.patient_id = v_patient_id
      and patient_case.episode_id = p_episode_id
      and patient_case.clinic_id = v_clinic_id
  ) then
    raise exception using errcode = '23514', message = 'Case does not belong to this episode';
  end if;
  clinic_id := v_clinic_id;
  patient_id := v_patient_id;
end;
$$;
revoke all on function private.load_documentation_context(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.append_clinical_session_note(
  p_episode_id uuid,
  p_case_id uuid,
  p_occurred_at timestamptz,
  p_subjective text,
  p_objective text,
  p_interventions text,
  p_response text,
  p_plan text,
  p_supersedes_id uuid default null,
  p_correction_reason text default null
)
returns table (
  note_id uuid,
  authored_by uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_clinic_id uuid;
  v_patient_id uuid;
  v_original public.clinical_session_notes%rowtype;
  v_note public.clinical_session_notes%rowtype;
  v_reason text := nullif(btrim(coalesce(p_correction_reason, '')), '');
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Clinician authentication is required';
  end if;
  if p_occurred_at is null
     or p_occurred_at < '2000-01-01'::timestamptz
     or p_occurred_at > clock_timestamp() + interval '1 day'
     or greatest(
       char_length(coalesce(p_subjective, '')),
       char_length(coalesce(p_objective, '')),
       char_length(coalesce(p_interventions, '')),
       char_length(coalesce(p_response, '')),
       char_length(coalesce(p_plan, ''))
     ) > 10000
     or concat(
       btrim(coalesce(p_subjective, '')),
       btrim(coalesce(p_objective, '')),
       btrim(coalesce(p_interventions, '')),
       btrim(coalesce(p_response, '')),
       btrim(coalesce(p_plan, ''))
     ) = ''
     or (p_supersedes_id is null and v_reason is not null)
     or (p_supersedes_id is not null and char_length(coalesce(v_reason, '')) not between 3 and 1000) then
    raise exception using errcode = '22023', message = 'Session note content is invalid';
  end if;

  select context.clinic_id, context.patient_id
    into v_clinic_id, v_patient_id
  from private.load_documentation_context(p_episode_id, p_case_id) context;

  if p_supersedes_id is not null then
    select original.* into v_original
    from public.clinical_session_notes original
    where original.id = p_supersedes_id
    for key share;
    if not found
       or v_original.episode_id <> p_episode_id
       or exists (
         select 1 from public.clinical_session_notes correction
         where correction.supersedes_id = p_supersedes_id
       ) then
      raise exception using errcode = '23514', message = 'Session note cannot be corrected';
    end if;
  end if;

  insert into public.clinical_session_notes (
    clinic_id, patient_id, episode_id, case_id, occurred_at,
    subjective, objective, interventions, response, plan,
    authored_by, supersedes_id, correction_reason
  ) values (
    v_clinic_id, v_patient_id, p_episode_id, p_case_id, p_occurred_at,
    btrim(coalesce(p_subjective, '')), btrim(coalesce(p_objective, '')),
    btrim(coalesce(p_interventions, '')), btrim(coalesce(p_response, '')),
    btrim(coalesce(p_plan, '')), v_actor, p_supersedes_id, v_reason
  ) returning * into v_note;
  return query select v_note.id, v_note.authored_by, v_note.created_at;
end;
$$;

create or replace function public.record_outcome_measurement_v2(
  p_episode_id uuid,
  p_case_id uuid,
  p_instrument_key text,
  p_score numeric,
  p_measured_at date,
  p_notes text default null,
  p_supersedes_id uuid default null,
  p_correction_reason text default null
)
returns table (
  measurement_id uuid,
  authored_by uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_clinic_id uuid;
  v_patient_id uuid;
  v_catalog public.outcome_measure_catalog_versions%rowtype;
  v_original public.outcome_measurements_v2%rowtype;
  v_measurement public.outcome_measurements_v2%rowtype;
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_reason text := nullif(btrim(coalesce(p_correction_reason, '')), '');
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Clinician authentication is required';
  end if;
  if p_instrument_key is null
     or p_score is null
     or p_measured_at is null
     or p_measured_at < '2000-01-01'::date
     or p_measured_at > current_date + 1
     or char_length(coalesce(v_notes, '')) > 5000
     or (p_supersedes_id is null and v_reason is not null)
     or (p_supersedes_id is not null and char_length(coalesce(v_reason, '')) not between 3 and 1000) then
    raise exception using errcode = '22023', message = 'Outcome measurement is invalid';
  end if;

  select context.clinic_id, context.patient_id
    into v_clinic_id, v_patient_id
  from private.load_documentation_context(p_episode_id, p_case_id) context;

  if p_supersedes_id is not null then
    select original.* into v_original
    from public.outcome_measurements_v2 original
    where original.id = p_supersedes_id
    for key share;
    if not found
       or v_original.episode_id <> p_episode_id
       or v_original.instrument_key <> p_instrument_key
       or exists (
         select 1 from public.outcome_measurements_v2 correction
         where correction.supersedes_id = p_supersedes_id
       ) then
      raise exception using errcode = '23514', message = 'Outcome measurement cannot be corrected';
    end if;
    select catalog.* into v_catalog
    from public.outcome_measure_catalog_versions catalog
    where catalog.instrument_key = v_original.instrument_key
      and catalog.version = v_original.instrument_version;
  else
    select catalog.* into v_catalog
    from public.outcome_measure_catalog_versions catalog
    where catalog.instrument_key = p_instrument_key and catalog.active
    for key share;
  end if;
  if not found or p_score < v_catalog.score_min or p_score > v_catalog.score_max then
    raise exception using errcode = '22023', message = 'Outcome score is outside the reviewed instrument range';
  end if;

  insert into public.outcome_measurements_v2 (
    clinic_id, patient_id, episode_id, case_id,
    instrument_key, instrument_version, instrument_name_snapshot,
    score, score_min_snapshot, score_max_snapshot, unit_snapshot,
    direction_snapshot, measured_at, notes, authored_by,
    supersedes_id, correction_reason
  ) values (
    v_clinic_id, v_patient_id, p_episode_id, p_case_id,
    v_catalog.instrument_key, v_catalog.version, v_catalog.display_name,
    p_score, v_catalog.score_min, v_catalog.score_max, v_catalog.unit,
    v_catalog.direction, p_measured_at, v_notes, v_actor,
    p_supersedes_id, v_reason
  ) returning * into v_measurement;
  return query select
    v_measurement.id, v_measurement.authored_by, v_measurement.created_at;
end;
$$;

revoke all on function public.append_clinical_session_note(
  uuid, uuid, timestamptz, text, text, text, text, text, uuid, text
) from public, anon, authenticated, service_role;
revoke all on function public.record_outcome_measurement_v2(
  uuid, uuid, text, numeric, date, text, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.append_clinical_session_note(
  uuid, uuid, timestamptz, text, text, text, text, text, uuid, text
) to authenticated;
grant execute on function public.record_outcome_measurement_v2(
  uuid, uuid, text, numeric, date, text, uuid, text
) to authenticated;

-- Retire the mutable legacy documentation paths. Historical rows remain
-- readable to currently authorized clinicians but cannot be changed further.
drop policy if exists "sessions manage" on public.sessions;
drop policy if exists "measurements write" on public.clinical_measurements;
revoke insert, update, delete, truncate on table public.sessions
  from authenticated, service_role;
revoke insert, update, delete, truncate on table public.clinical_measurements
  from authenticated, service_role;
revoke insert, update, delete, truncate on table public.clinical_session_notes
  from authenticated, service_role;
revoke insert, update, delete, truncate on table public.outcome_measurements_v2
  from authenticated, service_role;

comment on table public.clinical_session_notes is
  'Append-only signed session documentation; corrections are new rows linked by supersedes_id.';
comment on table public.outcome_measurements_v2 is
  'Append-only scored outcomes with immutable catalog-version snapshots and attributed corrections.';
comment on table public.sessions is
  'Legacy read-only session rows; new signed documentation uses clinical_session_notes.';
comment on table public.clinical_measurements is
  'Legacy read-only measurement rows; new outcomes use outcome_measurements_v2.';

commit;
