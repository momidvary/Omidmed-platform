-- Correct schedule membership and make authenticated retries payload-bound.
-- Forward migration: do not change the applied 021 checksum.
begin;

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
  v_previous public.patient_exercise_completion_events%rowtype;
  v_item public.prescription_items%rowtype;
  v_prescription public.exercise_prescriptions%rowtype;
  v_local_date date;
  v_event_id uuid;
  v_alert_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'Service authentication is required';
  end if;
  if p_actor_id is null or p_patient_id is null or p_episode_id is null
     or p_prescription_item_id is null or p_client_submission_id is null
     or p_status is null or p_pain_level is null
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
  if v_profile_role is distinct from 'patient' or exists (
    select 1 from public.clinic_members where user_id = p_actor_id
  ) or not exists (
    select 1 from public.patient_users access_grant
    where access_grant.patient_id = p_patient_id and access_grant.user_id = p_actor_id
      and access_grant.revoked_at is null
      and (access_grant.expires_at is null or access_grant.expires_at > clock_timestamp())
  ) then
    raise exception using errcode = '42501', message = 'Patient access is not permitted';
  end if;

  -- Serialize retries before checking mutable prescription state.
  perform pg_advisory_xact_lock(hashtextextended(
    p_actor_id::text || ':' || p_client_submission_id::text, 22));
  select * into v_previous
  from public.patient_exercise_completion_events event
  where event.recorded_by = p_actor_id
    and event.client_submission_id = p_client_submission_id;
  if found then
    if v_previous.patient_id is distinct from p_patient_id
       or v_previous.episode_id is distinct from p_episode_id
       or v_previous.prescription_item_id is distinct from p_prescription_item_id
       or v_previous.status is distinct from p_status
       or v_previous.pain_level is distinct from p_pain_level
       or v_previous.completed_sets is distinct from p_completed_sets
       or v_previous.completed_reps is distinct from p_completed_reps
       or v_previous.completed_duration_seconds is distinct from p_completed_duration_seconds
       or v_previous.non_completion_reason is distinct from nullif(btrim(p_non_completion_reason), '') then
      raise exception using errcode = '23505', message = 'Submission key already used for a different payload';
    end if;
    return query select v_previous.id, v_previous.local_date, prescription.status,
      exists (select 1 from public.clinical_alerts alert
              where alert.source_table = 'exercise_completion_events'
                and alert.source_id = v_previous.id)
    from public.exercise_prescriptions prescription
    where prescription.id = v_previous.prescription_id;
    return;
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
     or not (extract(dow from v_local_date)::smallint = any(v_item.scheduled_weekdays)) then
    raise exception using errcode = '23514', message = 'Exercise is not scheduled for the current local date';
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


commit;

