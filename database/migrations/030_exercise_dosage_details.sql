-- Professional exercise dosage on each prescription item: hold time, rest,
-- load, target intensity (RPE), acceptable pain during exercise, tempo,
-- side, sessions per day and a short patient-facing clinician cue.
-- All fields are optional so existing prescriptions stay valid; every value
-- is range-checked here and only written through the draft RPC.
-- Run after 029_case_clinical_findings.sql.

begin;

alter table public.prescription_items
  add column if not exists hold_seconds smallint,
  add column if not exists rest_seconds smallint,
  add column if not exists load_type text,
  add column if not exists load_detail text,
  add column if not exists target_rpe smallint,
  add column if not exists pain_limit smallint,
  add column if not exists tempo text,
  add column if not exists side text,
  add column if not exists times_per_day smallint,
  add column if not exists clinician_note text;

alter table public.prescription_items
  drop constraint if exists prescription_items_dosage_details_check,
  add constraint prescription_items_dosage_details_check
    check (
      (hold_seconds is null or hold_seconds between 1 and 300)
      and (rest_seconds is null or rest_seconds between 0 and 600)
      and (load_type is null or load_type in ('bodyweight', 'band', 'free_weight', 'machine', 'assisted', 'other'))
      and (load_detail is null or char_length(btrim(load_detail)) between 1 and 80)
      and (load_detail is null or load_type is not null)
      and (target_rpe is null or target_rpe between 1 and 10)
      and (pain_limit is null or pain_limit between 0 and 10)
      and (tempo is null or tempo ~ '^[0-9X]{1,2}(-[0-9X]{1,2}){1,3}$')
      and (side is null or side in ('left', 'right', 'both', 'alternating'))
      and (times_per_day is null or times_per_day between 1 and 12)
      and (clinician_note is null or char_length(btrim(clinician_note)) between 1 and 300)
    ) not valid;
alter table public.prescription_items
  validate constraint prescription_items_dosage_details_check;

-- Read one optional detail from the client JSON. Absent, null or blank means
-- "not prescribed"; anything else must match its exact form or the whole
-- draft is rejected (no partial prescription is left behind).
create or replace function private.prescription_item_int(p_item jsonb, p_key text, p_min int, p_max int)
returns smallint language plpgsql immutable set search_path = '' as $$
declare
  v_type text := jsonb_typeof(p_item -> p_key);
  v_value numeric;
begin
  if v_type is null or v_type = 'null' then
    return null;
  end if;
  if v_type <> 'number' then
    raise exception using errcode = '22023', message = format('Invalid %s', p_key);
  end if;
  v_value := (p_item ->> p_key)::numeric;
  if v_value <> trunc(v_value) or v_value < p_min or v_value > p_max then
    raise exception using errcode = '22023', message = format('Invalid %s', p_key);
  end if;
  return v_value::smallint;
end;
$$;
revoke all on function private.prescription_item_int(jsonb, text, int, int) from public, anon, authenticated, service_role;

create or replace function private.prescription_item_text(p_item jsonb, p_key text, p_max int)
returns text language plpgsql immutable set search_path = '' as $$
declare
  v_type text := jsonb_typeof(p_item -> p_key);
  v_value text;
begin
  if v_type is null or v_type = 'null' then
    return null;
  end if;
  if v_type <> 'string' then
    raise exception using errcode = '22023', message = format('Invalid %s', p_key);
  end if;
  v_value := nullif(btrim(regexp_replace(p_item ->> p_key, '\s+', ' ', 'g')), '');
  if v_value is not null and char_length(v_value) > p_max then
    raise exception using errcode = '22023', message = format('Invalid %s', p_key);
  end if;
  return v_value;
end;
$$;
revoke all on function private.prescription_item_text(jsonb, text, int) from public, anon, authenticated, service_role;

-- Same contract as migration 025, plus the optional dosage details.
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
  v_load_type text;
  v_load_detail text;
  v_tempo text;
  v_side text;
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

    v_load_type := private.prescription_item_text(v_item, 'loadType', 20);
    v_load_detail := private.prescription_item_text(v_item, 'loadDetail', 80);
    v_tempo := upper(private.prescription_item_text(v_item, 'tempo', 11));
    v_side := private.prescription_item_text(v_item, 'side', 20);
    if (v_load_type is not null and v_load_type not in ('bodyweight', 'band', 'free_weight', 'machine', 'assisted', 'other'))
       or (v_load_detail is not null and v_load_type is null)
       or (v_tempo is not null and v_tempo !~ '^[0-9X]{1,2}(-[0-9X]{1,2}){1,3}$')
       or (v_side is not null and v_side not in ('left', 'right', 'both', 'alternating')) then
      raise exception using errcode = '22023', message = 'Invalid dosage detail';
    end if;

    update public.prescription_items set
      scheduled_weekdays = v_days,
      target_sets = (v_item ->> 'targetSets')::smallint,
      target_reps = (v_item ->> 'targetReps')::smallint,
      target_duration_seconds = (v_item ->> 'targetDurationSeconds')::integer,
      hold_seconds = private.prescription_item_int(v_item, 'holdSeconds', 1, 300),
      rest_seconds = private.prescription_item_int(v_item, 'restSeconds', 0, 600),
      load_type = v_load_type,
      load_detail = v_load_detail,
      target_rpe = private.prescription_item_int(v_item, 'targetRpe', 1, 10),
      pain_limit = private.prescription_item_int(v_item, 'painLimit', 0, 10),
      tempo = v_tempo,
      side = v_side,
      times_per_day = private.prescription_item_int(v_item, 'timesPerDay', 1, 12),
      clinician_note = private.prescription_item_text(v_item, 'clinicianNote', 300)
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
