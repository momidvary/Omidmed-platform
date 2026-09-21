-- Included by security_ci_tests.sql inside its disposable fixture transaction.
reset role;
select set_config('request.jwt.claims', '{}', true);
do $$
declare
  rx public.exercise_prescriptions%rowtype;
  item_id uuid;
  first_result record;
  retry_result record;
  submission uuid := gen_random_uuid();
  actor uuid := '10000000-0000-4000-8000-000000000006';
begin
  select * into strict rx from public.exercise_prescriptions
  where patient_id = '30000000-0000-4000-8000-000000000001'
  order by version desc limit 1;
  update public.exercise_prescriptions set status = 'revoked',
    revoked_by = created_by, revoked_at = clock_timestamp()
  where episode_id = rx.episode_id and status in ('published', 'suspended');
  update public.exercise_prescriptions set status = 'published',
    published_by = created_by, published_at = clock_timestamp(),
    revoked_by = null, revoked_at = null, suspended_by = null,
    suspended_at = null, suspension_alert_id = null,
    schedule_timezone = 'Asia/Tehran', start_date = current_date - 2,
    end_date = current_date + 10
  where id = rx.id;
  update public.care_episodes set status = 'active', ended_at = null where id = rx.episode_id;
  update public.patient_users set revoked_at = null, revoked_by = null,
    revocation_reason = null, expires_at = null
  where patient_id = rx.patient_id and user_id = actor;
  select id into strict item_id from public.prescription_items where prescription_id = rx.id limit 1;
  update public.prescription_items set scheduled_weekdays = array[0,1,2,3,4,5,6]::smallint[]
  where id = item_id;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  select * into strict first_result from public.record_exercise_completion_event(
    actor, rx.patient_id, rx.episode_id, item_id, 'complete', 8::smallint, submission);
  if first_result.prescription_status <> 'suspended' or not first_result.alert_created
     or first_result.local_date <> (clock_timestamp() at time zone 'Asia/Tehran')::date then
    raise exception 'FAIL: multi-day completion did not atomically suspend and alert on local date';
  end if;
  select * into strict retry_result from public.record_exercise_completion_event(
    actor, rx.patient_id, rx.episode_id, item_id, 'complete', 8::smallint, submission);
  if retry_result.event_id <> first_result.event_id
     or retry_result.local_date <> first_result.local_date or not retry_result.alert_created then
    raise exception 'FAIL: retry lost original event or alert';
  end if;
  begin
    perform public.record_exercise_completion_event(
      actor, rx.patient_id, rx.episode_id, item_id, 'complete', 1::smallint, submission);
    raise exception 'FAIL: reused submission key accepted different pain';
  exception when unique_violation then null;
  end;
  if (select count(*) from public.patient_exercise_completion_events
      where recorded_by = actor and client_submission_id = submission) <> 1 then
    raise exception 'FAIL: retry duplicated event';
  end if;
  update public.exercise_prescriptions set status = 'published',
    suspended_by = null, suspended_at = null, suspension_alert_id = null
  where id = rx.id;
  update public.prescription_items set scheduled_weekdays = array[
    ((extract(dow from clock_timestamp() at time zone 'Asia/Tehran')::int + 1) % 7)::smallint
  ] where id = item_id;
  begin
    perform public.record_exercise_completion_event(
      actor, rx.patient_id, rx.episode_id, item_id, 'complete', 1::smallint, gen_random_uuid());
    raise exception 'FAIL: unscheduled day accepted';
  exception when check_violation then null;
  end;
end;
$$;
