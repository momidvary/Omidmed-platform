-- Versioned clinician treatment-plan workflow.
-- Run after 006_case_episode_linkage.sql.

begin;

create table if not exists public.treatment_plans (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  episode_id uuid not null references public.care_episodes (id) on delete restrict,
  case_id uuid not null references public.cases (id) on delete restrict,
  version int not null check (version between 1 and 10000),
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'rejected', 'superseded')),
  planner_input jsonb not null,
  plan_output jsonb not null,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles (id) on delete restrict,
  reviewed_at timestamptz,
  review_note text,
  unique (case_id, version),
  check (jsonb_typeof(planner_input) = 'object'),
  check (jsonb_typeof(plan_output) = 'object'),
  check (pg_column_size(planner_input) <= 32768),
  check (pg_column_size(plan_output) <= 131072),
  check (review_note is null or char_length(review_note) <= 2000),
  check (
    (status = 'draft' and reviewed_by is null and reviewed_at is null)
    or
    (status <> 'draft' and reviewed_by is not null and reviewed_at is not null)
  )
);

create index if not exists treatment_plans_episode_idx
  on public.treatment_plans (episode_id, created_at desc);
create index if not exists treatment_plans_case_idx
  on public.treatment_plans (case_id, version desc);
create unique index if not exists treatment_plans_one_approved_case_idx
  on public.treatment_plans (case_id)
  where status = 'approved';

alter table public.treatment_plans enable row level security;
revoke all on table public.treatment_plans from anon, authenticated;
grant select on table public.treatment_plans to authenticated;

drop policy if exists "treatment plans clinician read" on public.treatment_plans;
create policy "treatment plans clinician read"
  on public.treatment_plans for select to authenticated
  using (private.can_manage_clinical_record(patient_id));

create or replace function private.validate_treatment_plan_linkage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.cases%rowtype;
begin
  select * into v_case
  from public.cases c
  where c.id = new.case_id;

  if not found then
    raise exception using errcode = '23503', message = 'Treatment-plan case does not exist';
  end if;
  if v_case.clinic_id is distinct from new.clinic_id
     or v_case.patient_id is distinct from new.patient_id
     or v_case.episode_id is distinct from new.episode_id then
    raise exception using
      errcode = '23514',
      message = 'Treatment plan must use the clinic, patient, and episode of its case';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_treatment_plan_linkage() from public;

drop trigger if exists validate_treatment_plan_linkage on public.treatment_plans;
create trigger validate_treatment_plan_linkage
before insert or update of clinic_id, patient_id, episode_id, case_id
on public.treatment_plans
for each row execute function private.validate_treatment_plan_linkage();

drop trigger if exists audit_row_change on public.treatment_plans;
create trigger audit_row_change
after insert or update or delete on public.treatment_plans
for each row execute function private.write_audit_log();

create or replace function public.save_treatment_plan_draft(
  p_case_id uuid,
  p_planner_input jsonb,
  p_plan_output jsonb
)
returns table (
  plan_id uuid,
  plan_version int,
  plan_status text,
  plan_created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_case public.cases%rowtype;
  v_version int;
  v_plan public.treatment_plans%rowtype;
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Clinician authentication is required';
  end if;
  if p_case_id is null
     or p_planner_input is null
     or jsonb_typeof(p_planner_input) <> 'object'
     or p_plan_output is null
     or jsonb_typeof(p_plan_output) <> 'object'
     or pg_column_size(p_planner_input) > 32768
     or pg_column_size(p_plan_output) > 131072 then
    raise exception using errcode = '22023', message = 'Treatment-plan payload is invalid';
  end if;

  select * into v_case
  from public.cases c
  where c.id = p_case_id
  for share;

  if not found
     or v_case.patient_id is null
     or v_case.episode_id is null then
    raise exception using errcode = '22023', message = 'A linked case is required';
  end if;
  if not private.can_manage_clinical_record(v_case.patient_id) then
    raise exception using errcode = '42501', message = 'Case access is not permitted';
  end if;
  if v_case.safety_screened_at is null
     or v_case.safety_disposition <> 'clear'
     or cardinality(v_case.red_flag_ids) <> 0 then
    raise exception using errcode = '23514', message = 'Clear structured safety screening is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_case_id::text, 0));
  select coalesce(max(tp.version), 0) + 1
    into v_version
  from public.treatment_plans tp
  where tp.case_id = p_case_id;

  insert into public.treatment_plans (
    clinic_id, patient_id, episode_id, case_id, version,
    planner_input, plan_output, created_by
  ) values (
    v_case.clinic_id, v_case.patient_id, v_case.episode_id, v_case.id, v_version,
    p_planner_input, p_plan_output, v_actor
  )
  returning * into v_plan;

  return query select v_plan.id, v_plan.version, v_plan.status, v_plan.created_at;
end;
$$;

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
  from public.treatment_plans tp
  where tp.id = p_plan_id
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
    from public.cases c
    where c.id = v_plan.case_id
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

  perform pg_advisory_xact_lock(hashtextextended(v_plan.case_id::text, 0));
  if v_status = 'approved' then
    update public.treatment_plans tp
    set status = 'superseded',
        reviewed_by = v_actor,
        reviewed_at = clock_timestamp(),
        review_note = 'Superseded by a newly approved version'
    where tp.case_id = v_plan.case_id
      and tp.status = 'approved';
  end if;

  update public.treatment_plans tp
  set status = v_status,
      reviewed_by = v_actor,
      reviewed_at = clock_timestamp(),
      review_note = v_note
  where tp.id = p_plan_id
  returning * into v_plan;

  return query select v_plan.id, v_plan.version, v_plan.status, v_plan.reviewed_at;
end;
$$;

revoke all on function public.save_treatment_plan_draft(uuid, jsonb, jsonb)
  from public, anon;
revoke all on function public.review_treatment_plan(uuid, text, text)
  from public, anon;
grant execute on function public.save_treatment_plan_draft(uuid, jsonb, jsonb)
  to authenticated;
grant execute on function public.review_treatment_plan(uuid, text, text)
  to authenticated;

comment on table public.treatment_plans is
  'Versioned clinician drafts and sign-off decisions; never written or published by AI directly.';

commit;
