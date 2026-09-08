-- Draft/publish/revoke workflow for patient exercise prescriptions.
-- Run after 007_treatment_plan_workflow.sql.

begin;

create table if not exists public.exercise_prescriptions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  episode_id uuid not null references public.care_episodes (id) on delete restrict,
  case_id uuid not null references public.cases (id) on delete restrict,
  treatment_plan_id uuid not null references public.treatment_plans (id) on delete restrict,
  version int not null check (version between 1 and 10000),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'revoked')),
  start_date date not null,
  end_date date,
  precautions text not null,
  stop_rules text not null,
  review_date date not null,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  published_by uuid references public.profiles (id) on delete restrict,
  published_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete restrict,
  revoked_at timestamptz,
  unique (episode_id, version),
  check (end_date is null or end_date >= start_date),
  check (review_date >= start_date),
  check (char_length(btrim(precautions)) between 3 and 4000),
  check (char_length(btrim(stop_rules)) between 3 and 4000),
  check (
    (status = 'draft' and published_by is null and published_at is null and revoked_by is null and revoked_at is null)
    or
    (status = 'published' and published_by is not null and published_at is not null and revoked_by is null and revoked_at is null)
    or
    (status = 'revoked' and published_by is not null and published_at is not null and revoked_by is not null and revoked_at is not null)
  )
);

create table if not exists public.prescription_items (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references public.exercise_prescriptions (id) on delete restrict,
  exercise_id text not null,
  dosage_fa text not null,
  days_per_week int not null check (days_per_week between 1 and 7),
  sort_order int not null check (sort_order between 0 and 100),
  created_at timestamptz not null default now(),
  unique (prescription_id, exercise_id),
  check (exercise_id ~ '^[a-z0-9][a-z0-9_-]{1,99}$'),
  check (char_length(btrim(dosage_fa)) between 3 and 500)
);

create index if not exists exercise_prescriptions_episode_idx
  on public.exercise_prescriptions (episode_id, version desc);
create unique index if not exists exercise_prescriptions_one_published_idx
  on public.exercise_prescriptions (episode_id)
  where status = 'published';
create index if not exists prescription_items_parent_idx
  on public.prescription_items (prescription_id, sort_order);

alter table public.exercise_prescriptions enable row level security;
alter table public.prescription_items enable row level security;
revoke all on public.exercise_prescriptions from anon, authenticated;
revoke all on public.prescription_items from anon, authenticated;
grant select on public.exercise_prescriptions to authenticated;
grant select on public.prescription_items to authenticated;

drop policy if exists "prescriptions scoped read" on public.exercise_prescriptions;
create policy "prescriptions scoped read"
  on public.exercise_prescriptions for select to authenticated
  using (
    private.can_manage_clinical_record(patient_id)
    or (
      status = 'published'
      and private.is_linked_patient(patient_id)
    )
  );

drop policy if exists "prescription items scoped read" on public.prescription_items;
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
          )
        )
    )
  );

create or replace function private.validate_prescription_linkage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.treatment_plans%rowtype;
begin
  select * into v_plan
  from public.treatment_plans tp
  where tp.id = new.treatment_plan_id;
  if not found then
    raise exception using errcode = '23503', message = 'Treatment plan does not exist';
  end if;
  if v_plan.clinic_id is distinct from new.clinic_id
     or v_plan.patient_id is distinct from new.patient_id
     or v_plan.episode_id is distinct from new.episode_id
     or v_plan.case_id is distinct from new.case_id then
    raise exception using
      errcode = '23514',
      message = 'Prescription must use the clinic, patient, episode, and case of its treatment plan';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_prescription_linkage() from public;
drop trigger if exists validate_prescription_linkage on public.exercise_prescriptions;
create trigger validate_prescription_linkage
before insert or update of clinic_id, patient_id, episode_id, case_id, treatment_plan_id
on public.exercise_prescriptions
for each row execute function private.validate_prescription_linkage();

drop trigger if exists audit_row_change on public.exercise_prescriptions;
create trigger audit_row_change
after insert or update or delete on public.exercise_prescriptions
for each row execute function private.write_audit_log();
drop trigger if exists audit_row_change on public.prescription_items;
create trigger audit_row_change
after insert or update or delete on public.prescription_items
for each row execute function private.write_audit_log();

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
  from public.treatment_plans tp
  where tp.id = p_treatment_plan_id
  for share;
  if not found or v_plan.status <> 'approved' then
    raise exception using errcode = '23514', message = 'An approved treatment plan is required';
  end if;
  if not private.can_manage_clinical_record(v_plan.patient_id) then
    raise exception using errcode = '42501', message = 'Prescription access is not permitted';
  end if;

  select * into v_case
  from public.cases c
  where c.id = v_plan.case_id
  for share;
  if not found
     or v_case.safety_screened_at is null
     or v_case.safety_disposition <> 'clear'
     or cardinality(v_case.red_flag_ids) <> 0 then
    raise exception using errcode = '23514', message = 'Current clear safety screening is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_plan.episode_id::text, 0));
  select coalesce(max(p.version), 0) + 1 into v_version
  from public.exercise_prescriptions p
  where p.episode_id = v_plan.episode_id;

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
  from public.exercise_prescriptions p
  where p.id = p_prescription_id
  for update;
  if not found or v_prescription.status <> 'draft' then
    raise exception using errcode = '23514', message = 'A draft prescription is required';
  end if;
  if not private.can_manage_clinical_record(v_prescription.patient_id) then
    raise exception using errcode = '42501', message = 'Prescription access is not permitted';
  end if;

  select * into v_plan
  from public.treatment_plans tp
  where tp.id = v_prescription.treatment_plan_id
  for share;
  if not found or v_plan.status <> 'approved' then
    raise exception using errcode = '23514', message = 'Treatment-plan approval is no longer current';
  end if;
  select * into v_case
  from public.cases c
  where c.id = v_prescription.case_id
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
  update public.exercise_prescriptions p
  set status = 'revoked',
      revoked_by = v_actor,
      revoked_at = clock_timestamp()
  where p.episode_id = v_prescription.episode_id
    and p.status = 'published';

  update public.exercise_prescriptions p
  set status = 'published',
      published_by = v_actor,
      published_at = clock_timestamp()
  where p.id = v_prescription.id
  returning * into v_prescription;

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
  v_patient uuid;
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Clinician authentication is required';
  end if;
  select p.patient_id into v_patient
  from public.exercise_prescriptions p
  where p.id = p_prescription_id and p.status = 'published'
  for update;
  if not found then
    raise exception using errcode = '23514', message = 'A published prescription is required';
  end if;
  if not private.can_manage_clinical_record(v_patient) then
    raise exception using errcode = '42501', message = 'Prescription access is not permitted';
  end if;
  update public.exercise_prescriptions p
  set status = 'revoked', revoked_by = v_actor, revoked_at = clock_timestamp()
  where p.id = p_prescription_id;
  return true;
end;
$$;

revoke all on function public.save_prescription_draft(uuid, date, date, text, text, date, jsonb)
  from public, anon;
revoke all on function public.publish_prescription(uuid) from public, anon;
revoke all on function public.revoke_prescription(uuid) from public, anon;
grant execute on function public.save_prescription_draft(uuid, date, date, text, text, date, jsonb)
  to authenticated;
grant execute on function public.publish_prescription(uuid) to authenticated;
grant execute on function public.revoke_prescription(uuid) to authenticated;

comment on table public.exercise_prescriptions is
  'Clinician-authored prescription versions; only an explicitly published version is patient-visible.';

commit;
