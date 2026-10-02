-- Save precise patient-local schedules atomically with the existing reviewed draft.
begin;
create or replace function public.save_scheduled_prescription_draft(
  p_treatment_plan_id uuid, p_start_date date, p_end_date date,
  p_precautions text, p_stop_rules text, p_review_date date,
  p_items jsonb, p_schedule_timezone text
)
returns table (prescription_id uuid, prescription_version int,
  prescription_status text, prescription_created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_saved record;
  v_item jsonb;
  v_days smallint[];
begin
  if auth.uid() is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Clinician authentication required';
  end if;
  if p_schedule_timezone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names where name = p_schedule_timezone
  ) then
    raise exception using errcode = '22023', message = 'Valid timezone required';
  end if;
  -- Existing RPC enforces assignment, approved plan, safety and item validation.
  select * into strict v_saved from public.save_prescription_draft(
    p_treatment_plan_id, p_start_date, p_end_date, p_precautions,
    p_stop_rules, p_review_date, p_items);
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item -> 'scheduledWeekdays') is distinct from 'array' then
      raise exception using errcode = '22023', message = 'Exact weekdays required';
    end if;
    if exists (select 1 from jsonb_array_elements(v_item -> 'scheduledWeekdays') day
      where jsonb_typeof(day) <> 'number' or day::text !~ '^[0-6]$') then
      raise exception using errcode = '22023', message = 'Invalid weekday';
    end if;
    select array_agg(day::smallint order by day::smallint) into v_days
    from jsonb_array_elements_text(v_item -> 'scheduledWeekdays') day;
    if not private.is_valid_scheduled_weekdays(v_days)
       or cardinality(v_days) <> (v_item ->> 'daysPerWeek')::int then
      raise exception using errcode = '22023', message = 'Weekdays must match frequency';
    end if;
    if not coalesce(
      ((v_item ->> 'targetSets') ~ '^[1-9][0-9]{0,2}$'
       and (v_item ->> 'targetSets')::int between 1 and 50
       and (v_item ->> 'targetReps') ~ '^[1-9][0-9]{0,3}$'
       and (v_item ->> 'targetReps')::int between 1 and 1000
       and (v_item ->> 'targetDurationSeconds') is null)
      or
      ((v_item ->> 'targetDurationSeconds') ~ '^[1-9][0-9]{0,4}$'
       and (v_item ->> 'targetDurationSeconds')::int between 5 and 21600
       and (v_item ->> 'targetSets') is null and (v_item ->> 'targetReps') is null), false
    ) then
      raise exception using errcode = '22023', message = 'Sets and reps or total duration required';
    end if;
    update public.prescription_items set scheduled_weekdays = v_days,
      target_sets = (v_item ->> 'targetSets')::smallint,
      target_reps = (v_item ->> 'targetReps')::smallint,
      target_duration_seconds = (v_item ->> 'targetDurationSeconds')::integer
    where prescription_items.prescription_id = v_saved.prescription_id
      and exercise_id = v_item ->> 'exerciseId';
  end loop;
  update public.exercise_prescriptions set schedule_timezone = p_schedule_timezone
  where id = v_saved.prescription_id;
  return query select v_saved.prescription_id, v_saved.prescription_version,
    v_saved.prescription_status, v_saved.prescription_created_at;
end;
$$;
revoke all on function public.save_scheduled_prescription_draft(uuid,date,date,text,text,date,jsonb,text)
  from public, anon, service_role;
grant execute on function public.save_scheduled_prescription_draft(uuid,date,date,text,text,date,jsonb,text)
  to authenticated;
create or replace function private.validate_exercise_report_metrics()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  item public.prescription_items%rowtype;
begin
  select * into strict item from public.prescription_items where id = new.prescription_item_id;
  if item.target_sets is null and item.target_reps is null and item.target_duration_seconds is null then
    return new;
  end if;
  if item.target_duration_seconds is not null then
    if new.completed_duration_seconds is null or new.completed_sets is not null or new.completed_reps is not null then
      raise exception using errcode = '23514', message = 'Duration measurement required';
    end if;
    if new.status = 'complete' and new.completed_duration_seconds < item.target_duration_seconds then
      raise exception using errcode = '23514', message = 'Completion is below target';
    end if;
  else
    if new.completed_sets is null or new.completed_reps is null or new.completed_duration_seconds is not null then
      raise exception using errcode = '23514', message = 'Sets and repetitions required';
    end if;
    if new.status = 'complete' and (new.completed_sets < item.target_sets or new.completed_reps < item.target_reps) then
      raise exception using errcode = '23514', message = 'Completion is below target';
    end if;
  end if;
  if new.status = 'not_done' and coalesce(new.completed_sets, 0) + coalesce(new.completed_reps, 0) + coalesce(new.completed_duration_seconds, 0) <> 0 then
    raise exception using errcode = '23514', message = 'Not-done report must have zero measurements';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_exercise_report_metrics() from public, anon, authenticated, service_role;
drop trigger if exists validate_exercise_report_metrics on public.patient_exercise_completion_events;
create trigger validate_exercise_report_metrics before insert on public.patient_exercise_completion_events
for each row execute function private.validate_exercise_report_metrics();
commit;
