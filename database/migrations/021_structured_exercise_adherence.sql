-- Per-exercise adherence events.  A daily aggregate cannot establish which
-- exercise was attempted, so patient reporting is recorded as immutable,
-- schedule-aware events and only accepted through the server-side RPC.
-- Run after 020_case_assessment_versioning.sql.

begin;

create or replace function private.is_valid_scheduled_weekdays(p_days smallint[])
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(
    cardinality(p_days) between 1 and 7
    and p_days <@ array[0,1,2,3,4,5,6]::smallint[]
    and cardinality(p_days) = cardinality(array(select distinct day from unnest(p_days) as day)),
    false
  );
$$;
revoke all on function private.is_valid_scheduled_weekdays(smallint[]) from public, anon, authenticated, service_role;

alter table public.exercise_prescriptions
  add column if not exists schedule_timezone text;
alter table public.exercise_prescriptions
  drop constraint if exists exercise_prescriptions_schedule_timezone_check,
  add constraint exercise_prescriptions_schedule_timezone_check
    check (
      schedule_timezone is null
      or schedule_timezone ~ '^[A-Za-z][A-Za-z0-9_+/-]{0,63}$'
    ) not valid;
alter table public.exercise_prescriptions
  validate constraint exercise_prescriptions_schedule_timezone_check;

alter table public.prescription_items
  add column if not exists scheduled_weekdays smallint[],
  add column if not exists target_sets smallint,
  add column if not exists target_reps smallint,
  add column if not exists target_duration_seconds integer;
alter table public.prescription_items
  drop constraint if exists prescription_items_scheduled_weekdays_check,
  drop constraint if exists prescription_items_targets_check,
  add constraint prescription_items_scheduled_weekdays_check
    check (
      scheduled_weekdays is null
      or (
        private.is_valid_scheduled_weekdays(scheduled_weekdays)
      )
    ) not valid,
  add constraint prescription_items_targets_check
    check (
      (target_sets is null or target_sets between 1 and 50)
      and (target_reps is null or target_reps between 1 and 1000)
      and (target_duration_seconds is null or target_duration_seconds between 5 and 21600)
      and num_nonnulls(target_sets, target_reps, target_duration_seconds) <= 2
    ) not valid;
alter table public.prescription_items
  validate constraint prescription_items_scheduled_weekdays_check;
alter table public.prescription_items
  validate constraint prescription_items_targets_check;

create table public.patient_exercise_completion_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  episode_id uuid not null references public.care_episodes (id) on delete restrict,
  prescription_id uuid not null references public.exercise_prescriptions (id) on delete restrict,
  prescription_item_id uuid not null references public.prescription_items (id) on delete restrict,
  local_date date not null,
  timezone_snapshot text not null,
  status text not null check (status in ('complete', 'partial', 'not_done')),
  completed_sets smallint,
  completed_reps smallint,
  completed_duration_seconds integer,
  pain_level smallint not null check (pain_level between 0 and 10),
  non_completion_reason text,
  recorded_by uuid not null references public.profiles (id) on delete restrict,
  client_submission_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  supersedes_id uuid references public.patient_exercise_completion_events (id) on delete restrict,
  correction_reason text,
  unique (recorded_by, client_submission_id),
  check (timezone_snapshot ~ '^[A-Za-z][A-Za-z0-9_+/-]{0,63}$'),
  check (completed_sets is null or completed_sets between 0 and 50),
  check (completed_reps is null or completed_reps between 0 and 1000),
  check (completed_duration_seconds is null or completed_duration_seconds between 0 and 21600),
  check (
    (status = 'complete' and non_completion_reason is null)
    or (status in ('partial', 'not_done') and char_length(btrim(coalesce(non_completion_reason, ''))) between 3 and 500)
  ),
  check (
    (supersedes_id is null and correction_reason is null)
    or (supersedes_id is not null and char_length(btrim(coalesce(correction_reason, ''))) between 3 and 500)
  )
);
create index if not exists patient_exercise_completion_events_patient_day_idx
  on public.patient_exercise_completion_events (patient_id, local_date desc, created_at desc);
create index if not exists patient_exercise_completion_events_item_day_idx
  on public.patient_exercise_completion_events (prescription_item_id, local_date desc, created_at desc);

alter table public.patient_exercise_completion_events enable row level security;
revoke all on table public.patient_exercise_completion_events from public, anon, authenticated, service_role;
grant select on table public.patient_exercise_completion_events to authenticated;
drop policy if exists "exercise adherence scoped read" on public.patient_exercise_completion_events;
create policy "exercise adherence scoped read"
  on public.patient_exercise_completion_events for select to authenticated
  using (
    private.is_linked_patient(patient_id)
    or private.can_manage_clinical_record(patient_id)
  );

create or replace function private.reject_exercise_completion_event_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '55000', message = 'Exercise completion events are append-only';
end;
$$;
revoke all on function private.reject_exercise_completion_event_mutation() from public, anon, authenticated, service_role;
drop trigger if exists patient_exercise_completion_events_immutable on public.patient_exercise_completion_events;
create trigger patient_exercise_completion_events_immutable
before update or delete or truncate on public.patient_exercise_completion_events
for each statement execute function private.reject_exercise_completion_event_mutation();

-- This RPC is deliberately service-role only. The route authenticates the
-- browser session and passes its immutable auth user id; the function checks
-- the patient-link and derives the local calendar date from the prescription.
create or replace function public.record_exercise_completion_event(
  p_actor_id uuid,
  p_patient_id uuid,
  p_episode_id uuid,
  p_prescription_item_id uuid,
  p_status text,
  p_pain_level smallint,
  p_client_submission_id uuid,
  p_completed_sets smallint default null,
  p_completed_reps smallint default null,
  p_completed_duration_seconds integer default null,
  p_non_completion_reason text default null
)
returns table (
  event_id uuid,
  local_date date,
  prescription_status text,
  alert_created boolean
)
language plpgsql security definer set search_path = '' as $$
declare
  v_profile_role text;
  v_item public.prescription_items%rowtype;
  v_prescription public.exercise_prescriptions%rowtype;
  v_local_date date;
  v_event_id uuid;
  v_alert_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service authentication is required';
  end if;
  if p_actor_id is null or p_patient_id is null or p_episode_id is null
     or p_prescription_item_id is null or p_client_submission_id is null
     or p_status not in ('complete', 'partial', 'not_done')
     or p_pain_level not between 0 and 10
     or (p_completed_sets is not null and p_completed_sets not between 0 and 50)
     or (p_completed_reps is not null and p_completed_reps not between 0 and 1000)
     or (p_completed_duration_seconds is not null and p_completed_duration_seconds not between 0 and 21600)
     or char_length(coalesce(p_non_completion_reason, '')) > 500
     or (p_status = 'complete' and p_non_completion_reason is not null)
     or (p_status <> 'complete' and char_length(btrim(coalesce(p_non_completion_reason, ''))) not between 3 and 500) then
    raise exception using errcode = '22023', message = 'Exercise completion payload is invalid';
  end if;

  select role into v_profile_role from public.profiles where id = p_actor_id;
  if v_profile_role <> 'patient' or exists (
    select 1 from public.clinic_members where user_id = p_actor_id
  ) or not exists (
    select 1 from public.patient_users access_grant
    where access_grant.patient_id = p_patient_id and access_grant.user_id = p_actor_id
      and access_grant.revoked_at is null
      and (access_grant.expires_at is null or access_grant.expires_at > clock_timestamp())
  ) then
    raise exception using errcode = '42501', message = 'Patient access is not permitted';
  end if;

  select prescription.* into v_prescription
  from public.exercise_prescriptions prescription
  join public.care_episodes episode on episode.id = prescription.episode_id
  join public.prescription_items item on item.prescription_id = prescription.id
  where item.id = p_prescription_item_id
    and prescription.patient_id = p_patient_id
    and prescription.episode_id = p_episode_id
    and episode.patient_id = p_patient_id
    and episode.status = 'active'
  for update of prescription;
  if not found or v_prescription.status <> 'published'
     or v_prescription.schedule_timezone is null
     or v_prescription.schedule_timezone not in (select name from pg_catalog.pg_timezone_names) then
    raise exception using errcode = '42501', message = 'A current structured prescription is required';
  end if;

  select * into v_item from public.prescription_items where id = p_prescription_item_id;
  if v_item.scheduled_weekdays is null then
    raise exception using errcode = '42501', message = 'A current structured prescription is required';
  end if;

  v_local_date := (clock_timestamp() at time zone v_prescription.schedule_timezone)::date;
  if v_local_date < v_prescription.start_date
     or (v_prescription.end_date is not null and v_local_date > v_prescription.end_date)
     or extract(dow from v_local_date)::smallint <> any(v_item.scheduled_weekdays) then
    raise exception using errcode = '23514', message = 'Exercise is not scheduled for the current local date';
  end if;

  select event.id into v_event_id
  from public.patient_exercise_completion_events event
  where event.recorded_by = p_actor_id and event.client_submission_id = p_client_submission_id;
  if found then
    return query select v_event_id, v_local_date, v_prescription.status, false;
    return;
  end if;

  insert into public.patient_exercise_completion_events (
    clinic_id, patient_id, episode_id, prescription_id, prescription_item_id,
    local_date, timezone_snapshot, status, completed_sets, completed_reps,
    completed_duration_seconds, pain_level, non_completion_reason, recorded_by,
    client_submission_id
  ) values (
    v_prescription.clinic_id, p_patient_id, p_episode_id, v_prescription.id,
    v_item.id, v_local_date, v_prescription.schedule_timezone, p_status,
    p_completed_sets, p_completed_reps, p_completed_duration_seconds,
    p_pain_level, nullif(btrim(p_non_completion_reason), ''), p_actor_id,
    p_client_submission_id
  ) returning id into v_event_id;

  if p_pain_level >= 7 then
    insert into public.clinical_alerts (
      clinic_id, patient_id, episode_id, case_id, prescription_id, alert_type,
      severity, source_table, source_id, source_recorded_at, metric_value, reported_by
    ) values (
      v_prescription.clinic_id, p_patient_id, p_episode_id, v_prescription.case_id,
      v_prescription.id, 'high-pain', 'urgent', 'exercise_completion_events',
      v_event_id, clock_timestamp(), p_pain_level, p_actor_id
    ) on conflict (alert_type, source_table, source_id) do nothing returning id into v_alert_id;

    if v_alert_id is not null then
      update public.exercise_prescriptions
      set status = 'suspended', suspended_by = v_prescription.published_by,
          suspended_at = clock_timestamp(), suspension_alert_id = v_alert_id
      where id = v_prescription.id and status = 'published';
      v_prescription.status := 'suspended';
    end if;
  end if;

  return query select v_event_id, v_local_date, v_prescription.status, v_alert_id is not null;
end;
$$;
revoke all on function public.record_exercise_completion_event(uuid, uuid, uuid, uuid, text, smallint, uuid, smallint, smallint, integer, text)
  from public, anon, authenticated;
grant execute on function public.record_exercise_completion_event(uuid, uuid, uuid, uuid, text, smallint, uuid, smallint, smallint, integer, text)
  to service_role;

-- Alert metadata stays free of exercise notes, as required by the outbox.
alter table public.clinical_alerts
  drop constraint if exists clinical_alerts_source_table_v2_check,
  drop constraint if exists clinical_alerts_source_table_v3_check;
alter table public.clinical_alerts
  add constraint clinical_alerts_source_table_v3_check
    check (source_table in ('patient_daily_logs', 'exercise_completion_events', 'tickets', 'ticket_replies')) not valid;
alter table public.clinical_alerts
  validate constraint clinical_alerts_source_table_v3_check;

commit;
