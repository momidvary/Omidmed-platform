-- Database-enforced shape bounds for treatment-plan snapshots.
-- Run after 010_ai_review_hardening.sql. Constraints are NOT VALID so legacy
-- rows can be remediated explicitly, while every new version is checked.

begin;

create or replace function private.is_bounded_text_array(
  p_value jsonb,
  p_min_items integer,
  p_max_items integer,
  p_max_chars integer
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_value) = 'array'
    and jsonb_array_length(p_value) between p_min_items and p_max_items
    and not exists (
      select 1
      from jsonb_array_elements(p_value) item
      where jsonb_typeof(item) <> 'string'
         or char_length(btrim(item #>> '{}')) not between 1 and p_max_chars
    ),
    false
  );
$$;

create or replace function private.is_valid_treatment_plan_input(p_value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_value) = 'object'
    and p_value ?& array[
      'region', 'stage', 'painSeverity', 'irritability',
      'mainImpairment', 'patientGoal', 'safetyConfirmed'
    ]
    and not exists (
      select 1
      from jsonb_object_keys(p_value) key
      where key <> all (array[
        'region', 'stage', 'painSeverity', 'irritability',
        'mainImpairment', 'patientGoal', 'safetyConfirmed', 'postOpDetails'
      ])
    )
    and jsonb_typeof(p_value -> 'region') = 'string'
    and char_length(btrim(p_value ->> 'region')) between 1 and 100
    and p_value ->> 'stage' in (
      'acute', 'subacute', 'chronic', 'post-op', 'return-to-sport'
    )
    and p_value ->> 'irritability' in ('low', 'moderate', 'high')
    and jsonb_typeof(p_value -> 'painSeverity') = 'number'
    and (p_value ->> 'painSeverity') ~ '^\d+$'
    and (p_value ->> 'painSeverity')::integer between 0 and 10
    and jsonb_typeof(p_value -> 'mainImpairment') = 'string'
    and char_length(p_value ->> 'mainImpairment') <= 2000
    and jsonb_typeof(p_value -> 'patientGoal') = 'string'
    and char_length(p_value ->> 'patientGoal') <= 2000
    and p_value -> 'safetyConfirmed' = 'true'::jsonb
    and (
      (
        p_value ->> 'stage' <> 'post-op'
        and not (p_value ? 'postOpDetails')
      )
      or (
        p_value ->> 'stage' = 'post-op'
        and jsonb_typeof(p_value -> 'postOpDetails') = 'object'
        and (p_value -> 'postOpDetails') ?& array[
          'procedure', 'surgeryDate', 'precautions',
          'weightBearingStatus', 'protocolConfirmed'
        ]
        and (
          select count(*) = 5
          from jsonb_object_keys(p_value -> 'postOpDetails')
        )
        and char_length(btrim(p_value #>> '{postOpDetails,procedure}')) between 1 and 1000
        and (p_value #>> '{postOpDetails,surgeryDate}') ~ '^\d{4}-\d{2}-\d{2}$'
        and char_length(btrim(p_value #>> '{postOpDetails,precautions}')) between 1 and 4000
        and char_length(btrim(p_value #>> '{postOpDetails,weightBearingStatus}')) between 1 and 1000
        and p_value #> '{postOpDetails,protocolConfirmed}' = 'true'::jsonb
      )
    ),
    false
  );
$$;

create or replace function private.is_valid_treatment_plan_output(p_value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_value) = 'object'
    and p_value ?& array[
      'manualTherapy', 'exerciseTherapy', 'mobility', 'strengthening',
      'motorControl', 'balance', 'education', 'homeProgram', 'frequency',
      'progression'
    ]
    and (
      select count(*) = 10
      from jsonb_object_keys(p_value)
    )
    and private.is_bounded_text_array(p_value -> 'manualTherapy', 0, 12, 1000)
    and private.is_bounded_text_array(p_value -> 'exerciseTherapy', 1, 12, 1000)
    and private.is_bounded_text_array(p_value -> 'mobility', 0, 12, 1000)
    and private.is_bounded_text_array(p_value -> 'strengthening', 0, 12, 1000)
    and private.is_bounded_text_array(p_value -> 'motorControl', 0, 12, 1000)
    and private.is_bounded_text_array(p_value -> 'balance', 0, 12, 1000)
    and private.is_bounded_text_array(p_value -> 'education', 1, 12, 1000)
    and private.is_bounded_text_array(p_value -> 'homeProgram', 1, 12, 1000)
    and jsonb_typeof(p_value -> 'frequency') = 'string'
    and char_length(btrim(p_value ->> 'frequency')) between 1 and 500
    and private.is_bounded_text_array(p_value -> 'progression', 1, 12, 1000),
    false
  );
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'treatment_plans_input_shape_check'
      and conrelid = 'public.treatment_plans'::regclass
  ) then
    alter table public.treatment_plans
      add constraint treatment_plans_input_shape_check
      check (private.is_valid_treatment_plan_input(planner_input)) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'treatment_plans_output_shape_check'
      and conrelid = 'public.treatment_plans'::regclass
  ) then
    alter table public.treatment_plans
      add constraint treatment_plans_output_shape_check
      check (private.is_valid_treatment_plan_output(plan_output)) not valid;
  end if;
end;
$$;

revoke all on function private.is_bounded_text_array(jsonb, integer, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function private.is_valid_treatment_plan_input(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.is_valid_treatment_plan_output(jsonb)
  from public, anon, authenticated, service_role;

comment on constraint treatment_plans_input_shape_check
  on public.treatment_plans is
  'New planner snapshots must match the bounded clinician workflow input shape.';
comment on constraint treatment_plans_output_shape_check
  on public.treatment_plans is
  'New treatment plan versions must match the bounded editable plan shape.';

commit;
