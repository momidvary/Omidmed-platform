-- Append-only safety screening plus patient-portal lifecycle enforcement.
-- Run after 012_access_and_ai_race_hardening.sql.

begin;

-- --------------------------------------------------------------------------
-- 1) A server-owned red-flag catalog and append-only screen history
-- --------------------------------------------------------------------------

create table if not exists public.safety_red_flag_catalog (
  id text primary key,
  disposition text not null
    check (disposition in ('medical-review', 'urgent', 'emergency')),
  severity_rank smallint not null check (severity_rank between 1 and 3),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (char_length(id) between 3 and 100)
);

insert into public.safety_red_flag_catalog (id, disposition, severity_rank)
values
  ('rf_cancer', 'medical-review', 1),
  ('rf_weightloss', 'medical-review', 1),
  ('rf_nightpain', 'medical-review', 1),
  ('rf_fracture_trauma', 'urgent', 2),
  ('rf_fracture_osteo', 'urgent', 2),
  ('rf_steroids', 'medical-review', 1),
  ('rf_fever', 'urgent', 2),
  ('rf_ivdu', 'urgent', 2),
  ('rf_immuno', 'medical-review', 1),
  ('rf_ce_saddle', 'emergency', 3),
  ('rf_ce_bladder', 'emergency', 3),
  ('rf_ce_sexual', 'emergency', 3),
  ('rf_neuro_progressive', 'urgent', 2),
  ('rf_neuro_bilateral', 'urgent', 2),
  ('rf_dvt_calf', 'urgent', 2),
  ('rf_dvt_risk', 'medical-review', 1),
  ('rf_cardiac_chest', 'emergency', 3),
  ('rf_cardiac_breath', 'emergency', 3),
  ('rf_severe_pain', 'urgent', 2)
on conflict (id) do update
set disposition = excluded.disposition,
    severity_rank = excluded.severity_rank;

alter table public.safety_red_flag_catalog enable row level security;
revoke all on table public.safety_red_flag_catalog
  from public, anon, authenticated, service_role;
grant select on table public.safety_red_flag_catalog to authenticated;
drop policy if exists "authenticated red flag catalog read"
  on public.safety_red_flag_catalog;
create policy "authenticated red flag catalog read"
  on public.safety_red_flag_catalog for select to authenticated
  using (active);

alter table public.cases
  add column if not exists safety_action_taken text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cases'::regclass
      and conname = 'cases_safety_action_length_check'
  ) then
    alter table public.cases
      add constraint cases_safety_action_length_check
      check (
        safety_action_taken is null
        or char_length(btrim(safety_action_taken)) between 3 and 4000
      ) not valid;
  end if;
end $$;

create table if not exists public.case_safety_screens (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete restrict,
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  disposition text not null
    check (disposition in ('clear', 'medical-review', 'urgent', 'emergency')),
  red_flag_ids text[] not null default '{}'::text[],
  notes text,
  action_taken text,
  screened_by uuid not null references public.profiles (id) on delete restrict,
  screened_at timestamptz not null,
  source text not null default 'clinician'
    check (source in ('clinician', 'legacy-import')),
  created_at timestamptz not null default now(),
  unique (case_id, screened_at),
  check (cardinality(red_flag_ids) <= 100),
  check (array_position(red_flag_ids, null) is null),
  check (notes is null or char_length(notes) <= 10000),
  check (action_taken is null or char_length(action_taken) <= 4000),
  check (
    (disposition = 'clear' and cardinality(red_flag_ids) = 0)
    or
    (disposition <> 'clear' and cardinality(red_flag_ids) > 0)
  )
);

create index if not exists case_safety_screens_case_time_idx
  on public.case_safety_screens (case_id, screened_at desc);
create index if not exists case_safety_screens_patient_time_idx
  on public.case_safety_screens (patient_id, screened_at desc);

alter table public.case_safety_screens enable row level security;
revoke all on table public.case_safety_screens
  from public, anon, authenticated, service_role;
grant select on table public.case_safety_screens to authenticated;

drop policy if exists "case safety history clinician read"
  on public.case_safety_screens;
create policy "case safety history clinician read"
  on public.case_safety_screens for select to authenticated
  using (
    private.can_manage_clinical_record(patient_id)
  );

create or replace function private.reject_case_safety_history_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'Case safety history is append-only';
end;
$$;

revoke all on function private.reject_case_safety_history_mutation()
  from public, anon, authenticated, service_role;
drop trigger if exists case_safety_history_immutable
  on public.case_safety_screens;
create trigger case_safety_history_immutable
before update or delete on public.case_safety_screens
for each row execute function private.reject_case_safety_history_mutation();

-- --------------------------------------------------------------------------
-- 2) Preserve treatment-plan signatures when a plan is superseded
-- --------------------------------------------------------------------------

alter table public.treatment_plans
  add column if not exists superseded_by uuid
    references public.profiles (id) on delete restrict,
  add column if not exists superseded_at timestamptz,
  add column if not exists supersede_reason text;

update public.treatment_plans
set superseded_by = coalesce(superseded_by, reviewed_by),
    superseded_at = coalesce(superseded_at, reviewed_at, created_at),
    supersede_reason = coalesce(
      supersede_reason,
      nullif(review_note, ''),
      'Legacy supersede event imported'
    )
where status = 'superseded'
  and (superseded_by is null or superseded_at is null);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.treatment_plans'::regclass
      and conname = 'treatment_plans_supersede_metadata_check'
  ) then
    alter table public.treatment_plans
      add constraint treatment_plans_supersede_metadata_check
      check (
        (
          status = 'superseded'
          and superseded_by is not null
          and superseded_at is not null
          and char_length(btrim(supersede_reason)) between 3 and 2000
        )
        or
        (
          status <> 'superseded'
          and superseded_by is null
          and superseded_at is null
          and supersede_reason is null
        )
      ) not valid;
  end if;
end $$;

drop index if exists public.treatment_plans_one_approved_case_idx;
create unique index if not exists treatment_plans_one_approved_episode_idx
  on public.treatment_plans (episode_id)
  where status = 'approved';

-- --------------------------------------------------------------------------
-- 3) The only supported update path for an existing case safety screen
-- --------------------------------------------------------------------------

create or replace function public.record_case_safety_screen(
  p_case_id uuid,
  p_red_flag_ids text[],
  p_notes text default null,
  p_action_taken text default null
)
returns table (
  screen_id uuid,
  case_id uuid,
  disposition text,
  red_flag_ids text[],
  notes text,
  action_taken text,
  screened_by uuid,
  screened_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_case public.cases%rowtype;
  v_flags text[];
  v_disposition text;
  v_notes text := nullif(btrim(p_notes), '');
  v_action text := nullif(btrim(p_action_taken), '');
  v_screen public.case_safety_screens%rowtype;
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using
      errcode = '42501', message = 'Clinician authentication is required';
  end if;
  if p_case_id is null
     or (v_notes is not null and char_length(v_notes) > 10000)
     or (v_action is not null and char_length(v_action) > 4000) then
    raise exception using errcode = '22023', message = 'Safety-screen input is invalid';
  end if;

  select coalesce(array_agg(flag_id order by flag_id), '{}'::text[])
    into v_flags
  from (
    select distinct btrim(value) as flag_id
    from unnest(coalesce(p_red_flag_ids, '{}'::text[])) as flags(value)
    where btrim(value) <> ''
  ) normalized;

  if cardinality(v_flags) > 100
     or exists (
       select 1
       from unnest(v_flags) flag_id
       left join public.safety_red_flag_catalog catalog
         on catalog.id = flag_id and catalog.active
       where catalog.id is null
     ) then
    raise exception using errcode = '22023', message = 'Safety-screen flags are invalid';
  end if;

  if cardinality(v_flags) = 0 then
    v_disposition := 'clear';
    v_action := null;
  else
    select catalog.disposition into v_disposition
    from public.safety_red_flag_catalog catalog
    where catalog.id = any(v_flags)
    order by catalog.severity_rank desc
    limit 1;
    if v_action is null or char_length(v_action) < 3 then
      raise exception using
        errcode = '22023',
        message = 'Documented escalation or referral action is required';
    end if;
  end if;

  select patient_case.* into v_case
  from public.cases patient_case
  where patient_case.id = p_case_id
  for update;
  if not found or v_case.patient_id is null or v_case.episode_id is null then
    raise exception using errcode = '22023', message = 'A linked case is required';
  end if;
  if not private.clinician_can_access_ai_case(
    v_actor, v_case.id, v_case.clinic_id
  ) then
    raise exception using errcode = '42501', message = 'Case access is not permitted';
  end if;

  update public.cases patient_case
  set red_flag_ids = v_flags,
      safety_disposition = v_disposition,
      safety_notes = v_notes,
      safety_action_taken = v_action,
      -- Force a new attestation event even when the clinical result is the
      -- same as the previous screen. The trigger replaces this with its own
      -- trusted clock value and appends a distinct history row.
      safety_screened_at = clock_timestamp()
  where patient_case.id = v_case.id
  returning patient_case.* into v_case;

  select history.* into v_screen
  from public.case_safety_screens history
  where history.case_id = v_case.id
    and history.screened_at = v_case.safety_screened_at;
  if not found then
    raise exception using errcode = '55000', message = 'Safety history was not recorded';
  end if;

  return query select
    v_screen.id, v_screen.case_id, v_screen.disposition,
    v_screen.red_flag_ids, v_screen.notes, v_screen.action_taken,
    v_screen.screened_by, v_screen.screened_at;
end;
$$;

revoke all on function public.record_case_safety_screen(
  uuid, text[], text, text
) from public, anon, service_role;
grant execute on function public.record_case_safety_screen(
  uuid, text[], text, text
) to authenticated;

-- Safety fields on existing cases may only be changed while running the
-- security-definer workflow above. Direct PostgREST UPDATE is rejected.
create or replace function private.stamp_case_safety_screen()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_changed boolean := false;
  v_rpc_owner text;
begin
  if tg_op = 'INSERT' then
    v_changed := true;
  else
    v_changed := new.safety_disposition is distinct from old.safety_disposition
      or new.red_flag_ids is distinct from old.red_flag_ids
      or new.safety_notes is distinct from old.safety_notes
      or new.safety_action_taken is distinct from old.safety_action_taken
      or new.safety_screened_by is distinct from old.safety_screened_by
      or new.safety_screened_at is distinct from old.safety_screened_at;
  end if;
  if not v_changed then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    select pg_catalog.pg_get_userbyid(proc.proowner)
      into v_rpc_owner
    from pg_catalog.pg_proc proc
    where proc.oid =
      'public.record_case_safety_screen(uuid,text[],text,text)'::regprocedure;
    if current_user::text is distinct from v_rpc_owner then
      raise exception using
        errcode = '42501',
        message = 'Use record_case_safety_screen to change safety state';
    end if;
  end if;

  new.red_flag_ids := coalesce(new.red_flag_ids, '{}'::text[]);
  if new.safety_disposition = 'not-screened' then
    new.red_flag_ids := '{}'::text[];
    new.safety_notes := null;
    new.safety_action_taken := null;
    new.safety_screened_by := null;
    new.safety_screened_at := null;
  elsif auth.uid() is null then
    raise exception using
      errcode = '23514',
      message = 'A completed safety screen requires an authenticated reviewer';
  else
    new.safety_screened_by := auth.uid();
    new.safety_screened_at := clock_timestamp();
  end if;
  return new;
end;
$$;

drop trigger if exists cases_stamp_safety_screen on public.cases;
create trigger cases_stamp_safety_screen
before insert or update of safety_disposition, red_flag_ids, safety_notes,
  safety_action_taken, safety_screened_by, safety_screened_at
on public.cases
for each row execute function private.stamp_case_safety_screen();

create or replace function private.persist_case_safety_effects()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.safety_screened_at is null
     or (
       tg_op = 'UPDATE'
       and new.safety_screened_at is not distinct from old.safety_screened_at
     ) then
    return new;
  end if;

  insert into public.case_safety_screens (
    case_id, clinic_id, patient_id, disposition, red_flag_ids,
    notes, action_taken, screened_by, screened_at
  ) values (
    new.id, new.clinic_id, new.patient_id, new.safety_disposition,
    new.red_flag_ids, new.safety_notes, new.safety_action_taken,
    new.safety_screened_by, new.safety_screened_at
  ) on conflict (case_id, screened_at) do nothing;

  if new.safety_disposition <> 'clear' then
    update public.exercise_prescriptions prescription
    set status = 'revoked',
        revoked_by = new.safety_screened_by,
        revoked_at = clock_timestamp()
    where prescription.case_id = new.id
      and prescription.status = 'published';

    update public.treatment_plans plan
    set status = 'superseded',
        superseded_by = new.safety_screened_by,
        superseded_at = clock_timestamp(),
        supersede_reason = 'Invalidated by a non-clear safety re-screen'
    where plan.episode_id = new.episode_id
      and plan.status = 'approved';
  end if;
  return new;
end;
$$;

revoke all on function private.persist_case_safety_effects()
  from public, anon, authenticated, service_role;
drop trigger if exists cases_persist_safety_effects on public.cases;
create trigger cases_persist_safety_effects
after insert or update of safety_disposition, red_flag_ids, safety_notes,
  safety_action_taken, safety_screened_by, safety_screened_at
on public.cases
for each row execute function private.persist_case_safety_effects();

-- Backfill a single historical event for pre-migration completed screens.
insert into public.case_safety_screens (
  case_id, clinic_id, patient_id, disposition, red_flag_ids,
  notes, action_taken, screened_by, screened_at, source
)
select
  patient_case.id, patient_case.clinic_id, patient_case.patient_id,
  patient_case.safety_disposition, patient_case.red_flag_ids,
  patient_case.safety_notes, patient_case.safety_action_taken,
  patient_case.safety_screened_by, patient_case.safety_screened_at,
  'legacy-import'
from public.cases patient_case
where patient_case.patient_id is not null
  and patient_case.safety_screened_at is not null
on conflict (case_id, screened_at) do nothing;

drop trigger if exists audit_row_change on public.case_safety_screens;
create trigger audit_row_change
after insert on public.case_safety_screens
for each row execute function private.write_audit_log();

-- --------------------------------------------------------------------------
-- 4) Safety-aware treatment-plan review without destroying prior signatures
-- --------------------------------------------------------------------------

create or replace function public.review_treatment_plan(
  p_plan_id uuid,
  p_decision text,
  p_review_note text default null
)
returns table (
  plan_id uuid,
  plan_version int,
  plan_status text,
  plan_reviewed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_plan public.treatment_plans%rowtype;
  v_case public.cases%rowtype;
  v_status text := lower(btrim(coalesce(p_decision, '')));
  v_note text := nullif(btrim(p_review_note), '');
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Clinician authentication is required';
  end if;
  if p_plan_id is null or v_status not in ('approved', 'rejected') then
    raise exception using errcode = '22023', message = 'Review decision is invalid';
  end if;
  if v_note is not null and char_length(v_note) > 2000 then
    raise exception using errcode = '22023', message = 'Review note is too long';
  end if;

  select * into v_plan
  from public.treatment_plans plan
  where plan.id = p_plan_id
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'Treatment plan was not found';
  end if;
  if not private.can_manage_clinical_record(v_plan.patient_id) then
    raise exception using errcode = '42501', message = 'Treatment-plan access is not permitted';
  end if;
  if v_plan.status <> 'draft' then
    raise exception using errcode = '23514', message = 'Only a draft may be reviewed';
  end if;

  if v_status = 'approved' then
    select * into v_case
    from public.cases patient_case
    where patient_case.id = v_plan.case_id
    for share;
    if not found
       or v_case.safety_screened_at is null
       or v_case.safety_disposition <> 'clear'
       or cardinality(v_case.red_flag_ids) <> 0 then
      raise exception using
        errcode = '23514',
        message = 'The current case safety screen does not permit approval';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_plan.episode_id::text, 0));
  if v_status = 'approved' then
    update public.treatment_plans plan
    set status = 'superseded',
        superseded_by = v_actor,
        superseded_at = clock_timestamp(),
        supersede_reason = 'Superseded by a newly approved version'
    where plan.episode_id = v_plan.episode_id
      and plan.status = 'approved';
  end if;

  update public.treatment_plans plan
  set status = v_status,
      reviewed_by = v_actor,
      reviewed_at = clock_timestamp(),
      review_note = v_note
  where plan.id = p_plan_id
  returning plan.* into v_plan;

  return query select
    v_plan.id, v_plan.version, v_plan.status, v_plan.reviewed_at;
end;
$$;

-- Do not reveal prescription/plan workflow state to a caller who no longer
-- has current access. Authorization is checked before status-specific errors.
create or replace function public.save_prescription_draft(
  p_treatment_plan_id uuid,
  p_start_date date,
  p_end_date date,
  p_precautions text,
  p_stop_rules text,
  p_review_date date,
  p_items jsonb
)
returns table (
  prescription_id uuid,
  prescription_version int,
  prescription_status text,
  prescription_created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_plan public.treatment_plans%rowtype;
  v_case public.cases%rowtype;
  v_prescription public.exercise_prescriptions%rowtype;
  v_item jsonb;
  v_exercise_id text;
  v_dosage text;
  v_days int;
  v_version int;
  v_order int := 0;
  v_seen text[] := '{}'::text[];
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Clinician authentication is required';
  end if;
  if p_treatment_plan_id is null
     or p_start_date is null
     or p_review_date is null
     or p_review_date < p_start_date
     or (p_end_date is not null and p_end_date < p_start_date)
     or p_precautions is null
     or char_length(btrim(p_precautions)) not between 3 and 4000
     or p_stop_rules is null
     or char_length(btrim(p_stop_rules)) not between 3 and 4000
     or p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 20
     or pg_column_size(p_items) > 65536 then
    raise exception using errcode = '22023', message = 'Prescription payload is invalid';
  end if;

  select * into v_plan
  from public.treatment_plans plan
  where plan.id = p_treatment_plan_id
  for share;
  if not found then
    raise exception using errcode = '42501', message = 'Prescription access is not permitted';
  end if;
  if not private.can_manage_clinical_record(v_plan.patient_id) then
    raise exception using errcode = '42501', message = 'Prescription access is not permitted';
  end if;
  if v_plan.status <> 'approved' then
    raise exception using errcode = '23514', message = 'An approved treatment plan is required';
  end if;

  select * into v_case
  from public.cases patient_case
  where patient_case.id = v_plan.case_id
  for share;
  if not found
     or v_case.safety_screened_at is null
     or v_case.safety_disposition <> 'clear'
     or cardinality(v_case.red_flag_ids) <> 0 then
    raise exception using errcode = '23514', message = 'Current clear safety screening is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_plan.episode_id::text, 0));
  select coalesce(max(prescription.version), 0) + 1 into v_version
  from public.exercise_prescriptions prescription
  where prescription.episode_id = v_plan.episode_id;

  insert into public.exercise_prescriptions (
    clinic_id, patient_id, episode_id, case_id, treatment_plan_id, version,
    start_date, end_date, precautions, stop_rules, review_date, created_by
  ) values (
    v_plan.clinic_id, v_plan.patient_id, v_plan.episode_id, v_plan.case_id,
    v_plan.id, v_version, p_start_date, p_end_date, btrim(p_precautions),
    btrim(p_stop_rules), p_review_date, v_actor
  ) returning * into v_prescription;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_exercise_id := btrim(coalesce(v_item ->> 'exerciseId', ''));
    v_dosage := btrim(coalesce(v_item ->> 'dosageFa', ''));
    if coalesce(v_item ->> 'daysPerWeek', '') !~ '^[1-7]$' then
      raise exception using errcode = '22023', message = 'Exercise frequency is invalid';
    end if;
    v_days := (v_item ->> 'daysPerWeek')::int;
    if v_exercise_id !~ '^[a-z0-9][a-z0-9_-]{1,99}$'
       or char_length(v_dosage) not between 3 and 500
       or v_exercise_id = any(v_seen) then
      raise exception using errcode = '22023', message = 'Prescription item is invalid or duplicated';
    end if;
    v_seen := array_append(v_seen, v_exercise_id);

    insert into public.prescription_items (
      prescription_id, exercise_id, dosage_fa, days_per_week, sort_order
    ) values (
      v_prescription.id, v_exercise_id, v_dosage, v_days, v_order
    );
    v_order := v_order + 1;
  end loop;

  return query select
    v_prescription.id, v_prescription.version, v_prescription.status,
    v_prescription.created_at;
end;
$$;

create or replace function public.publish_prescription(p_prescription_id uuid)
returns table (
  prescription_id uuid,
  prescription_version int,
  prescription_status text,
  prescription_published_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_prescription public.exercise_prescriptions%rowtype;
  v_plan public.treatment_plans%rowtype;
  v_case public.cases%rowtype;
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Clinician authentication is required';
  end if;

  select * into v_prescription
  from public.exercise_prescriptions prescription
  where prescription.id = p_prescription_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'Prescription access is not permitted';
  end if;
  if not private.can_manage_clinical_record(v_prescription.patient_id) then
    raise exception using errcode = '42501', message = 'Prescription access is not permitted';
  end if;
  if v_prescription.status <> 'draft' then
    raise exception using errcode = '23514', message = 'A draft prescription is required';
  end if;

  select * into v_plan
  from public.treatment_plans plan
  where plan.id = v_prescription.treatment_plan_id
  for share;
  if not found or v_plan.status <> 'approved' then
    raise exception using errcode = '23514', message = 'Treatment-plan approval is no longer current';
  end if;
  select * into v_case
  from public.cases patient_case
  where patient_case.id = v_prescription.case_id
  for share;
  if not found
     or v_case.safety_screened_at is null
     or v_case.safety_disposition <> 'clear'
     or cardinality(v_case.red_flag_ids) <> 0 then
    raise exception using errcode = '23514', message = 'Current clear safety screening is required';
  end if;
  if not exists (
    select 1 from public.prescription_items item
    where item.prescription_id = v_prescription.id
  ) then
    raise exception using errcode = '23514', message = 'Prescription has no exercise items';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_prescription.episode_id::text, 0));
  update public.exercise_prescriptions prescription
  set status = 'revoked',
      revoked_by = v_actor,
      revoked_at = clock_timestamp()
  where prescription.episode_id = v_prescription.episode_id
    and prescription.status = 'published';

  update public.exercise_prescriptions prescription
  set status = 'published',
      published_by = v_actor,
      published_at = clock_timestamp()
  where prescription.id = v_prescription.id
  returning prescription.* into v_prescription;

  return query select
    v_prescription.id, v_prescription.version, v_prescription.status,
    v_prescription.published_at;
end;
$$;

create or replace function public.revoke_prescription(p_prescription_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_prescription public.exercise_prescriptions%rowtype;
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Clinician authentication is required';
  end if;
  select prescription.* into v_prescription
  from public.exercise_prescriptions prescription
  where prescription.id = p_prescription_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'Prescription access is not permitted';
  end if;
  if not private.can_manage_clinical_record(v_prescription.patient_id) then
    raise exception using errcode = '42501', message = 'Prescription access is not permitted';
  end if;
  if v_prescription.status <> 'published' then
    raise exception using errcode = '23514', message = 'A published prescription is required';
  end if;
  update public.exercise_prescriptions prescription
  set status = 'revoked',
      revoked_by = v_actor,
      revoked_at = clock_timestamp()
  where prescription.id = p_prescription_id;
  return true;
end;
$$;

-- --------------------------------------------------------------------------
-- 5) Patient actions require an active episode and a current prescription
-- --------------------------------------------------------------------------

create or replace function private.is_active_episode_for_patient(
  p_episode_id uuid,
  p_patient_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.care_episodes episode
    where episode.id = p_episode_id
      and episode.patient_id = p_patient_id
      and episode.status = 'active'
      and episode.started_at <= current_date
      and (episode.ended_at is null or episode.ended_at >= current_date)
  );
$$;

create or replace function private.has_current_prescription(
  p_episode_id uuid,
  p_patient_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.exercise_prescriptions prescription
    join public.cases patient_case on patient_case.id = prescription.case_id
    where prescription.episode_id = p_episode_id
      and prescription.patient_id = p_patient_id
      and prescription.status = 'published'
      and prescription.start_date <= current_date
      and (prescription.end_date is null or prescription.end_date >= current_date)
      and patient_case.safety_disposition = 'clear'
      and patient_case.safety_screened_at is not null
      and cardinality(patient_case.red_flag_ids) = 0
  );
$$;

revoke all on function private.is_active_episode_for_patient(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.has_current_prescription(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.is_active_episode_for_patient(uuid, uuid)
  to authenticated;
grant execute on function private.has_current_prescription(uuid, uuid)
  to authenticated;

drop policy if exists "program read" on public.episode_program;
drop policy if exists "program manage" on public.episode_program;
revoke all on table public.episode_program
  from public, anon, authenticated, service_role;
grant select on table public.episode_program to service_role;

drop policy if exists "daily logs read" on public.patient_daily_logs;
drop policy if exists "daily logs write" on public.patient_daily_logs;
create policy "daily logs read"
  on public.patient_daily_logs for select to authenticated
  using (
    private.can_manage_clinical_record(private.episode_patient(episode_id))
    or private.is_linked_patient(private.episode_patient(episode_id))
  );
create policy "daily logs write"
  on public.patient_daily_logs for all to authenticated
  using (
    private.can_manage_clinical_record(private.episode_patient(episode_id))
    or (
      private.is_linked_patient(private.episode_patient(episode_id))
      and private.is_active_episode_for_patient(
        episode_id, private.episode_patient(episode_id)
      )
      and private.has_current_prescription(
        episode_id, private.episode_patient(episode_id)
      )
    )
  )
  with check (
    private.can_manage_clinical_record(private.episode_patient(episode_id))
    or (
      private.is_linked_patient(private.episode_patient(episode_id))
      and private.is_active_episode_for_patient(
        episode_id, private.episode_patient(episode_id)
      )
      and private.has_current_prescription(
        episode_id, private.episode_patient(episode_id)
      )
    )
  );

drop policy if exists "tickets insert" on public.tickets;
create policy "tickets insert"
  on public.tickets for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      private.can_reply_to_patient(patient_id)
      or (
        private.is_linked_patient(patient_id)
        and episode_id is not null
        and private.is_active_episode_for_patient(episode_id, patient_id)
      )
    )
  );

drop policy if exists "replies insert" on public.ticket_replies;
create policy "replies insert"
  on public.ticket_replies for insert to authenticated
  with check (
    sender = 'patient'
    and sender_user_id = auth.uid()
    and exists (
      select 1
      from public.tickets ticket
      where ticket.id = ticket_replies.ticket_id
        and private.is_linked_patient(ticket.patient_id)
        and ticket.episode_id is not null
        and private.is_active_episode_for_patient(
          ticket.episode_id, ticket.patient_id
        )
    )
  );

drop policy if exists "prescriptions scoped read"
  on public.exercise_prescriptions;
create policy "prescriptions scoped read"
  on public.exercise_prescriptions for select to authenticated
  using (
    private.can_manage_clinical_record(patient_id)
    or (
      status = 'published'
      and private.is_linked_patient(patient_id)
      and private.is_active_episode_for_patient(episode_id, patient_id)
      and start_date <= current_date
      and (end_date is null or end_date >= current_date)
      and exists (
        select 1
        from public.cases patient_case
        where patient_case.id = exercise_prescriptions.case_id
          and patient_case.safety_screened_at is not null
          and patient_case.safety_disposition = 'clear'
          and cardinality(patient_case.red_flag_ids) = 0
      )
    )
  );

drop policy if exists "prescription items scoped read"
  on public.prescription_items;
create policy "prescription items scoped read"
  on public.prescription_items for select to authenticated
  using (
    exists (
      select 1
      from public.exercise_prescriptions prescription
      where prescription.id = prescription_items.prescription_id
        and (
          private.can_manage_clinical_record(prescription.patient_id)
          or (
            prescription.status = 'published'
            and private.is_linked_patient(prescription.patient_id)
            and private.is_active_episode_for_patient(
              prescription.episode_id, prescription.patient_id
            )
            and prescription.start_date <= current_date
            and (
              prescription.end_date is null
              or prescription.end_date >= current_date
            )
            and exists (
              select 1
              from public.cases patient_case
              where patient_case.id = prescription.case_id
                and patient_case.safety_screened_at is not null
                and patient_case.safety_disposition = 'clear'
                and cardinality(patient_case.red_flag_ids) = 0
            )
          )
        )
    )
  );

-- Linked patients should never receive internal notes or therapist-only
-- measurements merely because they share the authenticated database role.
revoke select on table public.care_episodes from authenticated;
grant select (
  id, patient_id, title_fa, weekly_target, status,
  started_at, ended_at, created_at
) on table public.care_episodes to authenticated;

drop policy if exists "measurements read" on public.clinical_measurements;
create policy "measurements read"
  on public.clinical_measurements for select to authenticated
  using (
    private.can_manage_clinical_record(private.episode_patient(episode_id))
  );
drop policy if exists "sessions read" on public.sessions;
create policy "sessions read"
  on public.sessions for select to authenticated
  using (
    private.can_manage_clinical_record(private.episode_patient(episode_id))
  );

-- Backend service credentials must use audited SECURITY DEFINER workflows;
-- they do not need direct mutation or TRUNCATE rights on clinical artifacts.
revoke insert, update, delete, truncate
  on table public.treatment_plans from service_role;
revoke insert, update, delete, truncate
  on table public.exercise_prescriptions from service_role;
revoke insert, update, delete, truncate
  on table public.prescription_items from service_role;

comment on table public.case_safety_screens is
  'Append-only clinician safety assessments; the cases columns are only the current projection.';
comment on table public.episode_program is
  'Deprecated legacy program storage. Production patient and clinician access is disabled; migrate data to versioned prescriptions.';
comment on function public.record_case_safety_screen(uuid, text[], text, text) is
  'Records a server-classified safety assessment and atomically invalidates unsafe clinical artifacts.';

commit;
