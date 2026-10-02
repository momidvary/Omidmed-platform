-- Operational clinical alerts and safe prescription suspension/resume.
-- Run after 013_clinical_safety_and_portal_controls.sql.

begin;

-- Exactly one active episode can drive patient actions for a patient.
create unique index if not exists care_episodes_one_active_patient_idx
  on public.care_episodes (patient_id)
  where status = 'active';

create table if not exists public.clinical_alerts (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  episode_id uuid not null references public.care_episodes (id) on delete restrict,
  case_id uuid references public.cases (id) on delete restrict,
  prescription_id uuid references public.exercise_prescriptions (id) on delete restrict,
  alert_type text not null check (alert_type in ('high-pain')),
  severity text not null check (severity in ('urgent', 'emergency')),
  source_table text not null check (source_table in ('patient_daily_logs')),
  source_id uuid not null,
  source_recorded_at timestamptz not null,
  metric_value smallint check (metric_value between 0 and 10),
  reported_by uuid references public.profiles (id) on delete restrict,
  status text not null default 'open'
    check (status in ('open', 'acknowledged', 'resolved')),
  created_at timestamptz not null default clock_timestamp(),
  acknowledged_by uuid references public.profiles (id) on delete restrict,
  acknowledged_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete restrict,
  resolved_at timestamptz,
  resolution_note text,
  unique (alert_type, source_table, source_id),
  check (char_length(coalesce(resolution_note, '')) <= 2000),
  check (
    (status = 'open'
      and acknowledged_by is null and acknowledged_at is null
      and resolved_by is null and resolved_at is null
      and resolution_note is null)
    or
    (status = 'acknowledged'
      and acknowledged_by is not null and acknowledged_at is not null
      and resolved_by is null and resolved_at is null
      and resolution_note is null)
    or
    (status = 'resolved'
      and resolved_by is not null and resolved_at is not null
      and char_length(btrim(resolution_note)) between 3 and 2000)
  )
);

create index if not exists clinical_alerts_clinic_queue_idx
  on public.clinical_alerts (clinic_id, status, severity, created_at desc);
create index if not exists clinical_alerts_patient_time_idx
  on public.clinical_alerts (patient_id, created_at desc);

alter table public.clinical_alerts enable row level security;
revoke all on table public.clinical_alerts
  from public, anon, authenticated, service_role;
grant select on table public.clinical_alerts to authenticated;

drop policy if exists "clinical alerts assigned clinician read"
  on public.clinical_alerts;
create policy "clinical alerts assigned clinician read"
  on public.clinical_alerts for select to authenticated
  using (private.can_manage_clinical_record(patient_id));

-- A suspended prescription retains the original publication signature. The
-- suspension metadata points to the idempotent alert that caused the pause.
alter table public.exercise_prescriptions
  add column if not exists suspended_by uuid
    references public.profiles (id) on delete restrict,
  add column if not exists suspended_at timestamptz,
  add column if not exists suspension_alert_id uuid
    references public.clinical_alerts (id) on delete restrict;

-- Replace the original inline status/state checks without depending on the
-- auto-generated constraint names used by PostgreSQL.
do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select constraint_row.conname
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.exercise_prescriptions'::regclass
      and constraint_row.contype = 'c'
      and (
        pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%status%ANY%'
        or pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%status =%'
        or constraint_row.conname in (
          'exercise_prescriptions_status_v2_check',
          'exercise_prescriptions_state_v2_check'
        )
      )
  loop
    execute format(
      'alter table public.exercise_prescriptions drop constraint %I',
      v_constraint.conname
    );
  end loop;
end $$;

alter table public.exercise_prescriptions
  add constraint exercise_prescriptions_status_v2_check
    check (status in ('draft', 'published', 'suspended', 'revoked')) not valid,
  add constraint exercise_prescriptions_state_v2_check
    check (
      (
        status = 'draft'
        and published_by is null and published_at is null
        and revoked_by is null and revoked_at is null
        and suspended_by is null and suspended_at is null
        and suspension_alert_id is null
      )
      or
      (
        status = 'published'
        and published_by is not null and published_at is not null
        and revoked_by is null and revoked_at is null
        and suspended_by is null and suspended_at is null
        and suspension_alert_id is null
      )
      or
      (
        status = 'suspended'
        and published_by is not null and published_at is not null
        and revoked_by is null and revoked_at is null
        and suspended_by is not null and suspended_at is not null
        and suspension_alert_id is not null
      )
      or
      (
        status = 'revoked'
        and published_by is not null and published_at is not null
        and revoked_by is not null and revoked_at is not null
        and (
          (
            suspended_by is null and suspended_at is null
            and suspension_alert_id is null
          )
          or
          (
            suspended_by is not null and suspended_at is not null
            and suspension_alert_id is not null
          )
        )
      )
    ) not valid;

alter table public.exercise_prescriptions
  validate constraint exercise_prescriptions_status_v2_check;
alter table public.exercise_prescriptions
  validate constraint exercise_prescriptions_state_v2_check;

drop index if exists public.exercise_prescriptions_one_published_idx;
create unique index if not exists exercise_prescriptions_one_actionable_idx
  on public.exercise_prescriptions (episode_id)
  where status in ('published', 'suspended');

-- High pain is converted into an idempotent operational alert inside the
-- same transaction as the patient log, then the current prescription pauses.
create or replace function private.create_high_pain_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient_id uuid;
  v_clinic_id uuid;
  v_case_id uuid;
  v_prescription public.exercise_prescriptions%rowtype;
  v_alert_id uuid;
begin
  if new.pain_level < 7
     or (tg_op = 'UPDATE' and old.pain_level >= 7) then
    return new;
  end if;

  select episode.patient_id, patient.clinic_id
    into v_patient_id, v_clinic_id
  from public.care_episodes episode
  join public.patients patient on patient.id = episode.patient_id
  where episode.id = new.episode_id;
  if not found then
    raise exception using errcode = '23503', message = 'Alert episode is unavailable';
  end if;

  select prescription.* into v_prescription
  from public.exercise_prescriptions prescription
  where prescription.episode_id = new.episode_id
    and prescription.status = 'published'
    and prescription.start_date <= new.date
    and (prescription.end_date is null or prescription.end_date >= new.date)
  order by prescription.published_at desc
  limit 1
  for update;

  if found then
    v_case_id := v_prescription.case_id;
  else
    select patient_case.id into v_case_id
    from public.cases patient_case
    where patient_case.episode_id = new.episode_id
    order by patient_case.created_at desc, patient_case.id desc
    limit 1;
  end if;

  insert into public.clinical_alerts (
    clinic_id, patient_id, episode_id, case_id, prescription_id,
    alert_type, severity, source_table, source_id, source_recorded_at,
    metric_value, reported_by
  ) values (
    v_clinic_id, v_patient_id, new.episode_id, v_case_id,
    case when v_prescription.id is null then null else v_prescription.id end,
    'high-pain', 'urgent', 'patient_daily_logs', new.id,
    new.date::timestamp at time zone 'UTC', new.pain_level, auth.uid()
  )
  on conflict (alert_type, source_table, source_id) do nothing
  returning id into v_alert_id;

  if v_alert_id is null then
    select alert.id into v_alert_id
    from public.clinical_alerts alert
    where alert.alert_type = 'high-pain'
      and alert.source_table = 'patient_daily_logs'
      and alert.source_id = new.id;
  end if;

  if v_prescription.id is not null then
    update public.exercise_prescriptions prescription
    set status = 'suspended',
        suspended_by = coalesce(auth.uid(), v_prescription.published_by),
        suspended_at = clock_timestamp(),
        suspension_alert_id = v_alert_id
    where prescription.id = v_prescription.id
      and prescription.status = 'published';
  end if;
  return new;
end;
$$;

revoke all on function private.create_high_pain_alert()
  from public, anon, authenticated, service_role;
drop trigger if exists patient_daily_logs_high_pain_alert
  on public.patient_daily_logs;
create trigger patient_daily_logs_high_pain_alert
after insert or update of pain_level on public.patient_daily_logs
for each row execute function private.create_high_pain_alert();

drop trigger if exists audit_row_change on public.clinical_alerts;
create trigger audit_row_change
after insert or update on public.clinical_alerts
for each row execute function private.write_audit_log();

create or replace function public.acknowledge_clinical_alert(p_alert_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_alert public.clinical_alerts%rowtype;
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Clinician authentication is required';
  end if;
  select alert.* into v_alert
  from public.clinical_alerts alert
  where alert.id = p_alert_id
  for update;
  if not found or not private.can_manage_clinical_record(v_alert.patient_id) then
    raise exception using errcode = '42501', message = 'Alert access is not permitted';
  end if;
  if v_alert.status = 'resolved' then
    raise exception using errcode = '23514', message = 'Resolved alert cannot be acknowledged';
  end if;
  if v_alert.status = 'open' then
    update public.clinical_alerts alert
    set status = 'acknowledged',
        acknowledged_by = v_actor,
        acknowledged_at = clock_timestamp()
    where alert.id = v_alert.id;
  end if;
  return true;
end;
$$;

create or replace function public.resolve_clinical_alert(
  p_alert_id uuid,
  p_resolution_note text,
  p_resume_prescription boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_note text := nullif(btrim(p_resolution_note), '');
  v_alert public.clinical_alerts%rowtype;
  v_prescription public.exercise_prescriptions%rowtype;
  v_case public.cases%rowtype;
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Clinician authentication is required';
  end if;
  if v_note is null or char_length(v_note) not between 3 and 2000 then
    raise exception using errcode = '22023', message = 'Resolution note is required';
  end if;

  select alert.* into v_alert
  from public.clinical_alerts alert
  where alert.id = p_alert_id
  for update;
  if not found or not private.can_manage_clinical_record(v_alert.patient_id) then
    raise exception using errcode = '42501', message = 'Alert access is not permitted';
  end if;
  if v_alert.status = 'resolved' then
    return true;
  end if;

  if coalesce(p_resume_prescription, false) then
    if v_alert.prescription_id is null then
      raise exception using errcode = '23514', message = 'Alert has no suspended prescription';
    end if;
    select prescription.* into v_prescription
    from public.exercise_prescriptions prescription
    where prescription.id = v_alert.prescription_id
      and prescription.status = 'suspended'
      and prescription.suspension_alert_id = v_alert.id
    for update;
    if not found then
      raise exception using errcode = '23514', message = 'Suspended prescription is unavailable';
    end if;

    select patient_case.* into v_case
    from public.cases patient_case
    where patient_case.id = v_prescription.case_id
    for share;
    if not found
       or v_case.safety_disposition <> 'clear'
       or v_case.safety_screened_at is null
       or v_case.safety_screened_at <= v_alert.created_at
       or cardinality(v_case.red_flag_ids) <> 0
       or not private.is_active_episode_for_patient(
         v_prescription.episode_id, v_prescription.patient_id
       )
       or v_prescription.start_date > current_date
       or (v_prescription.end_date is not null and v_prescription.end_date < current_date)
       or not exists (
         select 1
         from public.treatment_plans plan
         where plan.id = v_prescription.treatment_plan_id
           and plan.status = 'approved'
       )
       or exists (
         select 1
         from public.clinical_alerts other_alert
         where other_alert.episode_id = v_alert.episode_id
           and other_alert.id <> v_alert.id
           and other_alert.status in ('open', 'acknowledged')
       ) then
      raise exception using
        errcode = '23514',
        message = 'A newer clear safety screen and current plan are required before resume';
    end if;

    update public.exercise_prescriptions prescription
    set status = 'published',
        suspended_by = null,
        suspended_at = null,
        suspension_alert_id = null
    where prescription.id = v_prescription.id;
  end if;

  update public.clinical_alerts alert
  set status = 'resolved',
      resolved_by = v_actor,
      resolved_at = clock_timestamp(),
      resolution_note = v_note
  where alert.id = v_alert.id;
  return true;
end;
$$;

revoke all on function public.acknowledge_clinical_alert(uuid)
  from public, anon, service_role;
revoke all on function public.resolve_clinical_alert(uuid, text, boolean)
  from public, anon, service_role;
grant execute on function public.acknowledge_clinical_alert(uuid)
  to authenticated;
grant execute on function public.resolve_clinical_alert(uuid, text, boolean)
  to authenticated;

-- A non-clear clinician re-screen permanently revokes both published and
-- temporarily suspended prescriptions. Publication signatures remain intact.
create or replace function private.persist_case_safety_effects()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.safety_screened_at is not null
     and not (
       tg_op = 'UPDATE'
       and new.safety_screened_at is not distinct from old.safety_screened_at
     ) then
    insert into public.case_safety_screens (
      case_id, clinic_id, patient_id, disposition, red_flag_ids,
      notes, action_taken, screened_by, screened_at
    ) values (
      new.id, new.clinic_id, new.patient_id, new.safety_disposition,
      new.red_flag_ids, new.safety_notes, new.safety_action_taken,
      new.safety_screened_by, new.safety_screened_at
    ) on conflict (case_id, screened_at) do nothing;
  end if;

  if new.safety_disposition <> 'clear' then
    update public.exercise_prescriptions prescription
    set status = 'revoked',
        revoked_by = new.safety_screened_by,
        revoked_at = clock_timestamp()
    where prescription.case_id = new.id
      and prescription.status in ('published', 'suspended');

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

revoke insert, update, delete, truncate on table public.clinical_alerts
  from service_role;

comment on table public.clinical_alerts is
  'Operational, idempotent clinician alerts. Contains references and workflow metadata, not copied free-text PHI.';
comment on function public.resolve_clinical_alert(uuid, text, boolean) is
  'Resolves an assigned-clinician alert; optional resume requires a newer clear safety screen and current plan.';

commit;
