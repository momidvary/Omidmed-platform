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
    update public.prescription_items set scheduled_weekdays = v_days
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
commit;
