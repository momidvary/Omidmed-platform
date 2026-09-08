-- PhysioAI — Migration 004: security, tenant-integrity, and audit hardening
-- Run AFTER 001_schema.sql, 002_rls.sql, and 003_security_fixes.sql.
--
-- This migration deliberately does not edit or replay the earlier migrations.
-- It is safe to re-run: columns, constraints, indexes, policies, functions,
-- and triggers are created/replaced by stable names.
--
-- Existing rows are not silently deleted or rewritten. New CHECK/FK
-- constraints are installed NOT VALID so they protect all new writes while
-- allowing an operator to inspect and remediate legacy rows before running
-- ALTER TABLE ... VALIDATE CONSTRAINT in a later maintenance window.

-- ============================================================================
-- 1) Private authorization helpers
-- ============================================================================
-- SECURITY DEFINER helpers must not live in an API-exposed schema. Policies
-- need EXECUTE permission on them, so merely revoking EXECUTE while leaving
-- them in public would break RLS. Keep them in a non-exposed private schema,
-- grant authenticated users only USAGE + EXECUTE, and do not add `private` to
-- Supabase Project Settings -> API -> Exposed schemas.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
alter default privileges in schema private revoke execute on functions from public;

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role = 'platform_admin'
  );
$$;

create or replace function private.is_member_of(p_clinic uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clinic_members m
    where m.clinic_id = p_clinic and m.user_id = auth.uid()
  );
$$;

create or replace function private.is_owner_of(p_clinic uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clinic_members m
    where m.clinic_id = p_clinic
      and m.user_id = auth.uid()
      and m.member_role = 'clinic_owner'
  );
$$;

create or replace function private.patient_clinic(p_patient uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.clinic_id from public.patients p where p.id = p_patient;
$$;

create or replace function private.episode_patient(p_episode uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.patient_id from public.care_episodes e where e.id = p_episode;
$$;

create or replace function private.ticket_patient(p_ticket uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.patient_id from public.tickets t where t.id = p_ticket;
$$;

create or replace function private.is_linked_patient(p_patient uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.patient_users pu
    where pu.patient_id = p_patient and pu.user_id = auth.uid()
  );
$$;

create or replace function private.is_assigned_therapist(p_patient uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.patient_therapists pt
    join public.patients p on p.id = pt.patient_id
    join public.clinic_members m
      on m.clinic_id = p.clinic_id
     and m.user_id = pt.therapist_id
     and m.member_role = 'therapist'
    where pt.patient_id = p_patient and pt.therapist_id = auth.uid()
  );
$$;

create or replace function private.is_staff_of(p_clinic uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clinic_members m
    where m.clinic_id = p_clinic
      and m.user_id = auth.uid()
      and m.member_role = 'clinic_staff'
  );
$$;

create or replace function private.can_view_patient(p_patient uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not private.is_platform_admin()
    and (
      private.is_owner_of(private.patient_clinic(p_patient))
      or private.is_assigned_therapist(p_patient)
      or private.is_linked_patient(p_patient)
    );
$$;

create or replace function private.can_edit_patient_demographics(p_patient uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not private.is_platform_admin()
    and (
      private.is_owner_of(private.patient_clinic(p_patient))
      or private.is_assigned_therapist(p_patient)
    );
$$;

create or replace function private.can_manage_clinical_record(p_patient uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not private.is_platform_admin()
    and (
      private.is_owner_of(private.patient_clinic(p_patient))
      or private.is_assigned_therapist(p_patient)
    );
$$;

create or replace function private.can_manage_appointment(p_clinic uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not private.is_platform_admin()
    and private.is_member_of(p_clinic)
    and not private.is_staff_of(p_clinic);
$$;

-- Ticket conversations contain clinical communications. Clinic staff and
-- platform administrators do not receive implicit access. A platform support
-- workflow must use a separately designed, time-limited break-glass path.
create or replace function private.can_reply_to_patient(p_patient uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not private.is_platform_admin()
    and (
      private.is_owner_of(private.patient_clinic(p_patient))
      or private.is_assigned_therapist(p_patient)
    );
$$;

create or replace function private.can_access_ticket_patient(p_patient uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not private.is_platform_admin()
    and (
      private.is_linked_patient(p_patient)
      or private.can_reply_to_patient(p_patient)
    );
$$;

-- ============================================================================
-- 2) Safety-screen data for clinician intake cases
-- ============================================================================

alter table public.cases
  add column if not exists red_flag_ids text[] not null default '{}'::text[],
  add column if not exists safety_disposition text not null default 'not-screened',
  add column if not exists safety_notes text,
  add column if not exists safety_screened_by uuid,
  add column if not exists safety_screened_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cases'::regclass
      and conname = 'cases_safety_screened_by_fkey'
  ) then
    alter table public.cases
      add constraint cases_safety_screened_by_fkey
      foreign key (safety_screened_by) references public.profiles (id)
      on delete restrict not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cases'::regclass
      and conname = 'cases_safety_disposition_check'
  ) then
    alter table public.cases
      add constraint cases_safety_disposition_check
      check (safety_disposition in (
        'not-screened', 'clear', 'medical-review', 'urgent', 'emergency'
      )) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cases'::regclass
      and conname = 'cases_safety_state_consistency_check'
  ) then
    alter table public.cases
      add constraint cases_safety_state_consistency_check
      check (
        case
          when cardinality(red_flag_ids) > 100 then false
          when octet_length(array_to_string(red_flag_ids, ',')) > 10000 then false
          when array_position(red_flag_ids, null) is not null then false
          when array_position(red_flag_ids, '') is not null then false
          when safety_disposition = 'not-screened' then
            cardinality(red_flag_ids) = 0
            and safety_notes is null
            and safety_screened_by is null
            and safety_screened_at is null
          when safety_disposition = 'clear' then
            cardinality(red_flag_ids) = 0
            and safety_screened_by is not null
            and safety_screened_at is not null
          when safety_disposition in ('medical-review', 'urgent', 'emergency') then
            cardinality(red_flag_ids) > 0
            and safety_screened_by is not null
            and safety_screened_at is not null
          else false
        end
      ) not valid;
  end if;
end $$;

create index if not exists cases_safety_disposition_idx
  on public.cases (safety_disposition);

-- Stamp the authenticated safety reviewer on every safety-state change.
create or replace function private.stamp_case_safety_screen()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_changed boolean := false;
begin
  if tg_op = 'INSERT' then
    v_changed := true;
  else
    v_changed := new.safety_disposition is distinct from old.safety_disposition
      or new.red_flag_ids is distinct from old.red_flag_ids
      or new.safety_notes is distinct from old.safety_notes
      or new.safety_screened_by is distinct from old.safety_screened_by
      or new.safety_screened_at is distinct from old.safety_screened_at;
  end if;

  if not v_changed then
    return new;
  end if;

  new.red_flag_ids := coalesce(new.red_flag_ids, '{}'::text[]);

  if new.safety_disposition = 'not-screened' then
    new.red_flag_ids := '{}'::text[];
    new.safety_notes := null;
    new.safety_screened_by := null;
    new.safety_screened_at := null;
  elsif auth.uid() is null then
    raise exception using
      errcode = '23514',
      message = 'A completed safety screen requires an authenticated reviewer';
  else
    -- Never trust actor or time supplied by the browser.
    new.safety_screened_by := auth.uid();
    new.safety_screened_at := clock_timestamp();
  end if;

  return new;
end;
$$;

drop trigger if exists cases_stamp_safety_screen on public.cases;
create trigger cases_stamp_safety_screen
  before insert or update of safety_disposition, red_flag_ids, safety_notes,
    safety_screened_by, safety_screened_at
  on public.cases
  for each row execute function private.stamp_case_safety_screen();

-- ============================================================================
-- 3) Length/range constraints (new writes enforced; legacy rows not yet scanned)
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_lengths_check') then
    alter table public.profiles add constraint profiles_lengths_check check (
      char_length(full_name) <= 200
      and (phone is null or char_length(phone) between 3 and 32)
    ) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.clinics'::regclass and conname = 'clinics_lengths_check') then
    alter table public.clinics add constraint clinics_lengths_check check (
      char_length(btrim(name)) between 1 and 200
      and (city is null or char_length(city) <= 120)
      and (phone is null or char_length(phone) between 3 and 32)
    ) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.patients'::regclass and conname = 'patients_values_check') then
    alter table public.patients add constraint patients_values_check check (
      char_length(btrim(full_name)) between 1 and 200
      and (national_id is null or char_length(national_id) between 4 and 32)
      and (phone is null or char_length(phone) between 3 and 32)
      and (birth_year is null or birth_year between 1800 and 2200)
      and (gender is null or gender in ('male', 'female', 'other', 'unspecified'))
    ) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.care_episodes'::regclass and conname = 'care_episodes_values_check') then
    alter table public.care_episodes add constraint care_episodes_values_check check (
      char_length(btrim(title_fa)) between 1 and 500
      and (therapist_note_fa is null or char_length(therapist_note_fa) <= 20000)
      and weekly_target between 1 and 14
      and (ended_at is null or ended_at >= started_at)
    ) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.episode_program'::regclass and conname = 'episode_program_values_check') then
    alter table public.episode_program add constraint episode_program_values_check check (
      char_length(btrim(exercise_id)) between 1 and 200
      and char_length(btrim(dosage_fa)) between 1 and 2000
      and days_per_week between 1 and 7
    ) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.sessions'::regclass and conname = 'sessions_notes_length_check') then
    alter table public.sessions add constraint sessions_notes_length_check check (
      notes is null or char_length(notes) <= 20000
    ) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.appointments'::regclass and conname = 'appointments_values_check') then
    alter table public.appointments add constraint appointments_values_check check (
      duration_min between 5 and 480
      and (notes is null or char_length(notes) <= 10000)
    ) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.exercises'::regclass and conname = 'exercises_values_check') then
    alter table public.exercises add constraint exercises_values_check check (
      char_length(btrim(name)) between 1 and 300
      and (name_fa is null or char_length(name_fa) <= 300)
      and (content is null or octet_length(content::text) <= 262144)
    ) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.tickets'::regclass and conname = 'tickets_lengths_check') then
    alter table public.tickets add constraint tickets_lengths_check check (
      char_length(btrim(subject)) between 1 and 200
      and char_length(btrim(message)) between 1 and 10000
      and (exercise_id is null or char_length(exercise_id) <= 200)
    ) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.ticket_replies'::regclass and conname = 'ticket_replies_values_check') then
    alter table public.ticket_replies add constraint ticket_replies_values_check check (
      char_length(btrim(content)) between 1 and 10000
      and (
        (sender = 'ai' and sender_user_id is null)
        or (sender in ('therapist', 'patient') and sender_user_id is not null)
      )
    ) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.cases'::regclass and conname = 'cases_values_check') then
    alter table public.cases add constraint cases_values_check check (
      char_length(btrim(name)) between 1 and 200
      and (age is null or age between 0 and 120)
      and pain_intensity between 0 and 10
      and char_length(btrim(main_complaint)) between 1 and 10000
      and char_length(coalesce(pain_location, '')) <= 2000
      and char_length(coalesce(duration, '')) <= 500
      and char_length(coalesce(mechanism, '')) <= 5000
      and char_length(coalesce(aggravating, '')) <= 5000
      and char_length(coalesce(easing, '')) <= 5000
      and char_length(coalesce(medical_history, '')) <= 20000
      and char_length(coalesce(surgical_history, '')) <= 20000
      and char_length(coalesce(imaging, '')) <= 20000
      and char_length(coalesce(medications, '')) <= 10000
      and char_length(coalesce(functional_limitations, '')) <= 10000
      and char_length(coalesce(patient_goal, '')) <= 5000
      and char_length(coalesce(safety_notes, '')) <= 10000
    ) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.clinical_measurements'::regclass and conname = 'clinical_measurements_values_check') then
    alter table public.clinical_measurements add constraint clinical_measurements_values_check check (
      char_length(btrim(kind)) between 1 and 100
      and octet_length(value::text) <= 65536
      and (notes is null or char_length(notes) <= 10000)
    ) not valid;
  end if;
end $$;

-- One automated acknowledgement per ticket. If a production database already
-- contains duplicates, this statement intentionally fails instead of deleting
-- medical communication; inspect and merge those rows explicitly, then rerun.
create unique index if not exists ticket_replies_one_ai_per_ticket_idx
  on public.ticket_replies (ticket_id)
  where sender = 'ai';

-- ============================================================================
-- 4) Server-managed metadata and immutable identity/tenant fields
-- ============================================================================

create or replace function private.force_created_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.created_at := clock_timestamp();
  end if;
  return new;
end;
$$;

create or replace function private.force_created_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

create or replace function private.enforce_immutable_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_field text;
begin
  foreach v_field in array tg_argv loop
    if (to_jsonb(old) -> v_field) is distinct from (to_jsonb(new) -> v_field) then
      raise exception using
        errcode = '23514',
        message = format('%I.%I is immutable', tg_table_name, v_field);
    end if;
  end loop;
  return new;
end;
$$;

-- Force server timestamps on authenticated API inserts.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'profiles', 'clinics', 'clinic_members', 'patients', 'care_episodes',
    'sessions', 'appointments', 'exercises', 'tickets', 'ticket_replies',
    'cases', 'clinical_measurements'
  ] loop
    execute format('drop trigger if exists force_created_at on public.%I', v_table);
    execute format(
      'create trigger force_created_at before insert on public.%I '
      'for each row execute function private.force_created_at()',
      v_table
    );
  end loop;

  foreach v_table in array array['patients', 'exercises', 'tickets', 'cases'] loop
    execute format('drop trigger if exists force_created_by on public.%I', v_table);
    execute format(
      'create trigger force_created_by before insert on public.%I '
      'for each row execute function private.force_created_by()',
      v_table
    );
  end loop;
end $$;

-- Identity, tenant, author, and creation timestamps cannot be rewritten.
do $$
declare
  v_table text;
  v_fields text[];
  v_args text;
begin
  for v_table, v_fields in
    select * from (values
      ('profiles', array['id', 'created_at']::text[]),
      ('clinics', array['id', 'created_at']::text[]),
      ('clinic_members', array['id', 'clinic_id', 'user_id', 'created_at']::text[]),
      ('patients', array['id', 'clinic_id', 'created_by', 'created_at']::text[]),
      ('patient_users', array['patient_id', 'user_id']::text[]),
      ('patient_therapists', array['patient_id', 'therapist_id']::text[]),
      ('care_episodes', array['id', 'patient_id', 'created_at']::text[]),
      ('episode_program', array['id', 'episode_id']::text[]),
      ('patient_daily_logs', array['id', 'episode_id', 'date']::text[]),
      ('sessions', array['id', 'episode_id', 'created_at']::text[]),
      ('appointments', array['id', 'clinic_id', 'patient_id', 'created_at']::text[]),
      ('exercises', array['id', 'clinic_id', 'created_by', 'created_at']::text[]),
      ('tickets', array['id', 'patient_id', 'episode_id', 'created_by', 'created_at']::text[]),
      ('ticket_replies', array['id', 'ticket_id', 'sender', 'sender_user_id', 'created_at']::text[]),
      ('cases', array['id', 'clinic_id', 'patient_id', 'created_by', 'created_at']::text[]),
      ('clinical_measurements', array['id', 'episode_id', 'therapist_id', 'created_at']::text[])
    ) as config(table_name, fields)
  loop
    select string_agg(quote_literal(f), ', ' order by ord)
      into v_args
    from unnest(v_fields) with ordinality as x(f, ord);

    execute format('drop trigger if exists immutable_identity_fields on public.%I', v_table);
    execute format(
      'create trigger immutable_identity_fields before update on public.%I '
      'for each row execute function private.enforce_immutable_fields(%s)',
      v_table,
      v_args
    );
  end loop;
end $$;

-- ============================================================================
-- 5) Cross-tenant relationship validation
-- ============================================================================

create or replace function private.validate_tenant_relationships()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient uuid;
  v_clinic uuid;
begin
  if tg_table_name = 'appointments' then
    select p.clinic_id into v_clinic
    from public.patients p where p.id = new.patient_id;

    if v_clinic is null then
      raise exception using errcode = '23503', message = 'Appointment patient does not exist';
    end if;
    if v_clinic is distinct from new.clinic_id then
      raise exception using errcode = '23514', message = 'Appointment patient must belong to appointment clinic';
    end if;
    if new.therapist_id is not null and not exists (
      select 1 from public.clinic_members m
      where m.clinic_id = new.clinic_id
        and m.user_id = new.therapist_id
        and m.member_role in ('clinic_owner', 'therapist')
    ) then
      raise exception using errcode = '23514', message = 'Appointment therapist must be a clinician in appointment clinic';
    end if;

  elsif tg_table_name = 'cases' then
    if new.patient_id is not null then
      select p.clinic_id into v_clinic
      from public.patients p where p.id = new.patient_id;
      if v_clinic is null then
        raise exception using errcode = '23503', message = 'Case patient does not exist';
      end if;
      if v_clinic is distinct from new.clinic_id then
        raise exception using errcode = '23514', message = 'Case patient must belong to case clinic';
      end if;
    end if;

  elsif tg_table_name = 'tickets' then
    if new.episode_id is not null then
      select e.patient_id into v_patient
      from public.care_episodes e where e.id = new.episode_id;
      if v_patient is null then
        raise exception using errcode = '23503', message = 'Ticket episode does not exist';
      end if;
      if v_patient is distinct from new.patient_id then
        raise exception using errcode = '23514', message = 'Ticket episode must belong to ticket patient';
      end if;
    end if;

  elsif tg_table_name = 'patient_therapists' then
    select p.clinic_id into v_clinic
    from public.patients p where p.id = new.patient_id;
    if v_clinic is null then
      raise exception using errcode = '23503', message = 'Assigned patient does not exist';
    end if;
    if not exists (
      select 1 from public.clinic_members m
      where m.clinic_id = v_clinic
        and m.user_id = new.therapist_id
        and m.member_role in ('clinic_owner', 'therapist')
    ) then
      raise exception using errcode = '23514', message = 'Assigned therapist must be a clinician in patient clinic';
    end if;

  elsif tg_table_name in ('sessions', 'clinical_measurements') then
    select e.patient_id, p.clinic_id into v_patient, v_clinic
    from public.care_episodes e
    join public.patients p on p.id = e.patient_id
    where e.id = new.episode_id;

    if v_patient is null then
      raise exception using errcode = '23503', message = 'Clinical episode does not exist';
    end if;
    if new.therapist_id is not null and not exists (
      select 1 from public.clinic_members m
      where m.clinic_id = v_clinic
        and m.user_id = new.therapist_id
        and m.member_role in ('clinic_owner', 'therapist')
    ) then
      raise exception using errcode = '23514', message = 'Clinical therapist must be a clinician in patient clinic';
    end if;
  end if;

  return new;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'appointments', 'cases', 'tickets', 'patient_therapists',
    'sessions', 'clinical_measurements'
  ] loop
    execute format('drop trigger if exists validate_tenant_relationships on public.%I', v_table);
    execute format(
      'create trigger validate_tenant_relationships before insert or update on public.%I '
      'for each row execute function private.validate_tenant_relationships()',
      v_table
    );
  end loop;
end $$;

-- ============================================================================
-- 6) Append-only audit log (metadata only; no duplicated clinical text/PII)
-- ============================================================================

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default clock_timestamp(),
  transaction_id bigint not null default txid_current(),
  actor_user_id uuid,
  actor_database_role text not null default session_user,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  table_schema text not null,
  table_name text not null,
  row_id text,
  clinic_id uuid,
  patient_id uuid,
  changed_fields text[] not null default '{}'::text[]
);

create index if not exists audit_log_occurred_at_idx on public.audit_log (occurred_at desc);
create index if not exists audit_log_actor_idx on public.audit_log (actor_user_id, occurred_at desc);
create index if not exists audit_log_clinic_idx on public.audit_log (clinic_id, occurred_at desc);
create index if not exists audit_log_patient_idx on public.audit_log (patient_id, occurred_at desc);

alter table public.audit_log enable row level security;

create or replace function private.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_old jsonb;
  v_new jsonb;
  v_changed text[] := '{}'::text[];
  v_row_id text;
  v_patient uuid;
  v_clinic uuid;
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
  else
    v_row := to_jsonb(new);
  end if;

  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    select coalesce(array_agg(k order by k), '{}'::text[])
      into v_changed
    from jsonb_object_keys(v_old || v_new) as fields(k)
    where (v_old -> k) is distinct from (v_new -> k);
  else
    select coalesce(array_agg(k order by k), '{}'::text[])
      into v_changed
    from jsonb_object_keys(v_row) as fields(k);
  end if;

  v_row_id := coalesce(
    v_row ->> 'id',
    case when nullif(v_row ->> 'user_id', '') is not null then
      concat_ws(':', v_row ->> 'patient_id', v_row ->> 'user_id')
    end,
    case when nullif(v_row ->> 'therapist_id', '') is not null then
      concat_ws(':', v_row ->> 'patient_id', v_row ->> 'therapist_id')
    end
  );

  if tg_table_name = 'patients' then
    v_patient := nullif(v_row ->> 'id', '')::uuid;
  elsif nullif(v_row ->> 'patient_id', '') is not null then
    v_patient := (v_row ->> 'patient_id')::uuid;
  elsif nullif(v_row ->> 'episode_id', '') is not null then
    select e.patient_id into v_patient
    from public.care_episodes e
    where e.id = (v_row ->> 'episode_id')::uuid;
  elsif nullif(v_row ->> 'ticket_id', '') is not null then
    select t.patient_id into v_patient
    from public.tickets t
    where t.id = (v_row ->> 'ticket_id')::uuid;
  end if;

  if tg_table_name = 'clinics' then
    v_clinic := nullif(v_row ->> 'id', '')::uuid;
  elsif nullif(v_row ->> 'clinic_id', '') is not null then
    v_clinic := (v_row ->> 'clinic_id')::uuid;
  elsif v_patient is not null then
    select p.clinic_id into v_clinic
    from public.patients p where p.id = v_patient;
  end if;

  insert into public.audit_log (
    actor_user_id, actor_database_role, action, table_schema, table_name,
    row_id, clinic_id, patient_id, changed_fields
  ) values (
    auth.uid(), session_user, tg_op, tg_table_schema, tg_table_name,
    v_row_id, v_clinic, v_patient, v_changed
  );

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create or replace function private.prevent_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'audit_log is append-only';
end;
$$;

drop trigger if exists audit_log_no_update_or_delete on public.audit_log;
create trigger audit_log_no_update_or_delete
  before update or delete on public.audit_log
  for each row execute function private.prevent_audit_mutation();

drop trigger if exists audit_log_no_truncate on public.audit_log;
create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function private.prevent_audit_mutation();

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'profiles', 'clinics', 'clinic_members', 'patients', 'patient_users',
    'patient_therapists', 'care_episodes', 'episode_program',
    'patient_daily_logs', 'clinical_measurements', 'sessions', 'appointments',
    'exercises', 'tickets', 'ticket_replies', 'cases'
  ] loop
    execute format('drop trigger if exists audit_row_change on public.%I', v_table);
    execute format(
      'create trigger audit_row_change after insert or update or delete on public.%I '
      'for each row execute function private.write_audit_log()',
      v_table
    );
  end loop;
end $$;

-- Authenticated users can only read the audit log through its RLS policy.
revoke all on table public.audit_log from anon, authenticated;
grant select on table public.audit_log to authenticated;
revoke insert, update, delete, truncate on table public.audit_log from service_role;
grant select on table public.audit_log to service_role;

-- ============================================================================
-- 7) Replace public-helper policies with private-helper policies
-- ============================================================================

-- profiles
drop policy if exists "own profile read" on public.profiles;
drop policy if exists "own profile update" on public.profiles;
create policy "own profile read" on public.profiles for select
  using (id = auth.uid() or private.is_platform_admin());
create policy "own profile update" on public.profiles for update
  using (id = auth.uid() or private.is_platform_admin())
  with check (id = auth.uid() or private.is_platform_admin());

-- clinics
drop policy if exists "clinic read" on public.clinics;
drop policy if exists "clinic admin write" on public.clinics;
drop policy if exists "clinic owner update" on public.clinics;
create policy "clinic read" on public.clinics for select
  using (private.is_platform_admin() or private.is_member_of(id));
create policy "clinic admin write" on public.clinics for all
  using (private.is_platform_admin()) with check (private.is_platform_admin());
create policy "clinic owner update" on public.clinics for update
  using (private.is_owner_of(id)) with check (private.is_owner_of(id));

-- clinic membership
drop policy if exists "members read" on public.clinic_members;
drop policy if exists "members manage" on public.clinic_members;
create policy "members read" on public.clinic_members for select
  using (private.is_platform_admin() or private.is_member_of(clinic_id));
create policy "members manage" on public.clinic_members for all
  using (private.is_platform_admin() or private.is_owner_of(clinic_id))
  with check (private.is_platform_admin() or private.is_owner_of(clinic_id));

-- patients
drop policy if exists "patient read" on public.patients;
drop policy if exists "patient insert" on public.patients;
drop policy if exists "patient update" on public.patients;
drop policy if exists "patient delete" on public.patients;
create policy "patient read" on public.patients for select
  using (private.can_view_patient(id));
-- New patient + episode creation is exposed only through the validated,
-- atomic public.create_patient_episode() workflow below.
create policy "patient update" on public.patients for update
  using (private.can_edit_patient_demographics(id))
  with check (
    private.can_edit_patient_demographics(id)
    and clinic_id = private.patient_clinic(id)
  );
create policy "patient delete" on public.patients for delete
  using (
    not private.is_platform_admin()
    and private.is_owner_of(clinic_id)
  );

-- Patient-login links: only clinic owners and platform admins may grant or
-- revoke access. In particular, clinic_staff cannot link themselves and gain
-- the patient's write permissions.
drop policy if exists "patient_users read" on public.patient_users;
drop policy if exists "patient_users manage" on public.patient_users;
create policy "patient_users read" on public.patient_users for select
  using (
    not private.is_platform_admin()
    and (user_id = auth.uid() or private.can_view_patient(patient_id))
  );
create policy "patient_users manage" on public.patient_users for all
  using (
    not private.is_platform_admin()
    and private.is_owner_of(private.patient_clinic(patient_id))
  )
  with check (
    not private.is_platform_admin()
    and private.is_owner_of(private.patient_clinic(patient_id))
  );

drop policy if exists "patient_therapists read" on public.patient_therapists;
drop policy if exists "patient_therapists manage" on public.patient_therapists;
create policy "patient_therapists read" on public.patient_therapists for select
  using (
    not private.is_platform_admin()
    and (therapist_id = auth.uid() or private.can_view_patient(patient_id))
  );
create policy "patient_therapists manage" on public.patient_therapists for all
  using (
    not private.is_platform_admin()
    and private.is_owner_of(private.patient_clinic(patient_id))
  )
  with check (
    not private.is_platform_admin()
    and private.is_owner_of(private.patient_clinic(patient_id))
  );

-- Clinical records
drop policy if exists "episodes read" on public.care_episodes;
drop policy if exists "episodes manage" on public.care_episodes;
create policy "episodes read" on public.care_episodes for select
  using (private.can_view_patient(patient_id));
create policy "episodes manage" on public.care_episodes for all
  using (private.can_manage_clinical_record(patient_id))
  with check (private.can_manage_clinical_record(patient_id));

drop policy if exists "program read" on public.episode_program;
drop policy if exists "program manage" on public.episode_program;
create policy "program read" on public.episode_program for select
  using (private.can_view_patient(private.episode_patient(episode_id)));
create policy "program manage" on public.episode_program for all
  using (private.can_manage_clinical_record(private.episode_patient(episode_id)))
  with check (private.can_manage_clinical_record(private.episode_patient(episode_id)));

drop policy if exists "daily logs read" on public.patient_daily_logs;
drop policy if exists "daily logs write" on public.patient_daily_logs;
create policy "daily logs read" on public.patient_daily_logs for select
  using (private.can_view_patient(private.episode_patient(episode_id)));
create policy "daily logs write" on public.patient_daily_logs for all
  using (
    private.is_linked_patient(private.episode_patient(episode_id))
    or private.can_manage_clinical_record(private.episode_patient(episode_id))
  )
  with check (
    private.is_linked_patient(private.episode_patient(episode_id))
    or private.can_manage_clinical_record(private.episode_patient(episode_id))
  );

drop policy if exists "measurements read" on public.clinical_measurements;
drop policy if exists "measurements write" on public.clinical_measurements;
create policy "measurements read" on public.clinical_measurements for select
  using (private.can_view_patient(private.episode_patient(episode_id)));
create policy "measurements write" on public.clinical_measurements for all
  using (private.can_manage_clinical_record(private.episode_patient(episode_id)))
  with check (
    private.can_manage_clinical_record(private.episode_patient(episode_id))
    and therapist_id = auth.uid()
  );

drop policy if exists "sessions read" on public.sessions;
drop policy if exists "sessions manage" on public.sessions;
create policy "sessions read" on public.sessions for select
  using (private.can_view_patient(private.episode_patient(episode_id)));
create policy "sessions manage" on public.sessions for all
  using (private.can_manage_clinical_record(private.episode_patient(episode_id)))
  with check (
    private.can_manage_clinical_record(private.episode_patient(episode_id))
    and (
      therapist_id is null
      or therapist_id = auth.uid()
      or private.is_owner_of(private.patient_clinic(private.episode_patient(episode_id)))
    )
  );

-- Administrative and clinic-scoped records
drop policy if exists "appointments read" on public.appointments;
drop policy if exists "appointments manage" on public.appointments;
create policy "appointments read" on public.appointments for select
  using (private.can_view_patient(patient_id));
create policy "appointments manage" on public.appointments for all
  using (
    clinic_id = private.patient_clinic(patient_id)
    and private.can_manage_clinical_record(patient_id)
  )
  with check (
    clinic_id = private.patient_clinic(patient_id)
    and private.can_manage_clinical_record(patient_id)
  );

drop policy if exists "exercises read" on public.exercises;
drop policy if exists "exercises manage" on public.exercises;
create policy "exercises read" on public.exercises for select
  using (private.is_platform_admin() or private.is_member_of(clinic_id));
create policy "exercises manage" on public.exercises for all
  using (private.is_platform_admin() or private.is_member_of(clinic_id))
  with check (private.is_platform_admin() or private.is_member_of(clinic_id));

drop policy if exists "tickets read" on public.tickets;
drop policy if exists "tickets insert" on public.tickets;
drop policy if exists "tickets update" on public.tickets;
create policy "tickets read" on public.tickets for select
  using (private.can_access_ticket_patient(patient_id));
create policy "tickets insert" on public.tickets for insert
  with check (
    private.can_access_ticket_patient(patient_id)
    and created_by = auth.uid()
  );
-- No direct UPDATE policy is recreated. A clinician reply and the transition
-- to `answered` must happen together through public.reply_to_ticket().

drop policy if exists "replies read" on public.ticket_replies;
drop policy if exists "replies insert" on public.ticket_replies;
create policy "replies read" on public.ticket_replies for select
  using (
    private.can_access_ticket_patient(private.ticket_patient(ticket_id))
  );
create policy "replies insert" on public.ticket_replies for insert
  with check (
    sender = 'patient'
    and sender_user_id = auth.uid()
    and private.is_linked_patient(private.ticket_patient(ticket_id))
  );

drop policy if exists "cases read" on public.cases;
drop policy if exists "cases insert" on public.cases;
drop policy if exists "cases update" on public.cases;
drop policy if exists "cases delete" on public.cases;
create policy "cases read" on public.cases for select
  using (
    not private.is_platform_admin()
    and (
      private.is_owner_of(clinic_id)
      or private.is_assigned_therapist(patient_id)
      or (
        created_by = auth.uid()
        and private.is_member_of(clinic_id)
        and not private.is_staff_of(clinic_id)
      )
    )
  );
create policy "cases insert" on public.cases for insert
  with check (
    not private.is_platform_admin()
    and created_by = auth.uid()
    and private.is_member_of(clinic_id)
    and not private.is_staff_of(clinic_id)
    and (
      patient_id is null
      or private.is_owner_of(clinic_id)
      or private.is_assigned_therapist(patient_id)
    )
  );
create policy "cases update" on public.cases for update
  using (
    not private.is_platform_admin()
    and (
      private.is_owner_of(clinic_id)
      or private.is_assigned_therapist(patient_id)
      or (
        patient_id is null
        and created_by = auth.uid()
        and private.is_member_of(clinic_id)
        and not private.is_staff_of(clinic_id)
      )
    )
  )
  with check (
    not private.is_platform_admin()
    and (
      private.is_owner_of(clinic_id)
      or private.is_assigned_therapist(patient_id)
      or (
        patient_id is null
        and created_by = auth.uid()
        and private.is_member_of(clinic_id)
        and not private.is_staff_of(clinic_id)
      )
    )
  );
create policy "cases delete" on public.cases for delete
  using (
    not private.is_platform_admin()
    and private.is_owner_of(clinic_id)
  );

drop policy if exists "platform admin audit read" on public.audit_log;
create policy "platform admin audit read" on public.audit_log for select
  using (private.is_platform_admin());

-- Use the private admin helper in the role-escalation trigger too.
create or replace function private.guard_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not private.is_platform_admin() then
    raise exception 'Only a platform admin can change roles';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_role_guard on public.profiles;
create trigger profiles_role_guard
  before update on public.profiles
  for each row execute function private.guard_role_change();

-- ============================================================================
-- 8) Authenticated, atomic workflow RPCs
-- ============================================================================

-- Keep the Auth trigger safe even if an attacker-controlled object is ever
-- added to an exposed schema. Truncate untrusted signup metadata to the
-- profile constraint instead of allowing it to break user provisioning.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 200)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Insert a clinician reply and close the ticket in one database transaction.
-- Actor and sender are derived from auth.uid(); neither is accepted from the
-- browser. The locked authorization row prevents a concurrent revocation from
-- racing the write.
create or replace function public.reply_to_ticket(
  p_ticket_id uuid,
  p_content text
)
returns table (
  reply_id uuid,
  ticket_id uuid,
  sender text,
  sender_user_id uuid,
  content text,
  created_at timestamptz,
  ticket_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_patient_id uuid;
  v_clinic_id uuid;
  v_reply public.ticket_replies%rowtype;
  v_authorized boolean := false;
begin
  if v_actor is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required';
  end if;

  if private.is_platform_admin() then
    raise exception using
      errcode = '42501',
      message = 'Platform support has no implicit access to clinical tickets';
  end if;

  if p_ticket_id is null
     or p_content is null
     or char_length(btrim(p_content)) not between 1 and 10000 then
    raise exception using
      errcode = '22023',
      message = 'Reply content must contain between 1 and 10000 characters';
  end if;

  select t.patient_id, p.clinic_id
    into v_patient_id, v_clinic_id
  from public.tickets t
  join public.patients p on p.id = t.patient_id
  where t.id = p_ticket_id
  for update of t;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'Ticket was not found';
  end if;

  -- Clinic owners can reply without being listed as an assigned therapist.
  perform 1
  from public.clinic_members m
  where m.clinic_id = v_clinic_id
    and m.user_id = v_actor
    and m.member_role = 'clinic_owner'
  for key share;
  v_authorized := found;

  if not v_authorized then
    -- A therapist must retain both the patient assignment and an active
    -- therapist membership in this exact clinic.
    perform 1
    from public.patient_therapists pt
    join public.clinic_members m
      on m.clinic_id = v_clinic_id
     and m.user_id = pt.therapist_id
     and m.member_role = 'therapist'
    where pt.patient_id = v_patient_id
      and pt.therapist_id = v_actor
    for key share of pt, m;
    v_authorized := found;
  end if;

  if not v_authorized then
    raise exception using
      errcode = '42501',
      message = 'Only the clinic owner or assigned therapist may reply';
  end if;

  insert into public.ticket_replies (
    ticket_id, sender, sender_user_id, content
  ) values (
    p_ticket_id, 'therapist', v_actor, btrim(p_content)
  )
  returning * into v_reply;

  update public.tickets t
  set status = 'answered'
  where t.id = p_ticket_id;

  return query
  select
    v_reply.id,
    v_reply.ticket_id,
    v_reply.sender,
    v_reply.sender_user_id,
    v_reply.content,
    v_reply.created_at,
    'answered'::text;
end;
$$;

-- Create the patient record, initial episode, and optional assignment as one
-- unit. A therapist-created patient is always assigned back to that therapist;
-- owners may choose any active therapist member of the clinic or leave it
-- unassigned.
create or replace function public.create_patient_episode(
  p_clinic_id uuid,
  p_full_name text,
  p_phone text,
  p_birth_year int,
  p_gender text,
  p_title_fa text,
  p_weekly_target int,
  p_assigned_therapist_id uuid default null
)
returns table (
  patient_id uuid,
  episode_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_member_role text;
  v_assignment uuid := p_assigned_therapist_id;
  v_phone text := nullif(btrim(p_phone), '');
  v_gender text := case when p_gender is null then null else lower(btrim(p_gender)) end;
  v_patient_id uuid;
  v_episode_id uuid;
begin
  if v_actor is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required';
  end if;

  if private.is_platform_admin() then
    raise exception using
      errcode = '42501',
      message = 'Platform support has no implicit access to patient creation';
  end if;

  if p_clinic_id is null then
    raise exception using errcode = '22023', message = 'Clinic is required';
  end if;
  if p_full_name is null
     or char_length(btrim(p_full_name)) not between 1 and 200 then
    raise exception using
      errcode = '22023',
      message = 'Patient name must contain between 1 and 200 characters';
  end if;
  if v_phone is not null and char_length(v_phone) not between 3 and 32 then
    raise exception using
      errcode = '22023',
      message = 'Phone must contain between 3 and 32 characters';
  end if;
  if p_birth_year is not null
     and p_birth_year not between 1800 and extract(year from current_date)::int then
    raise exception using
      errcode = '22023',
      message = 'Birth year is outside the accepted range';
  end if;
  if v_gender is not null
     and v_gender not in ('male', 'female', 'other', 'unspecified') then
    raise exception using
      errcode = '22023',
      message = 'Gender value is not supported';
  end if;
  if p_title_fa is null
     or char_length(btrim(p_title_fa)) not between 1 and 500 then
    raise exception using
      errcode = '22023',
      message = 'Episode title must contain between 1 and 500 characters';
  end if;
  if p_weekly_target is null or p_weekly_target not between 1 and 14 then
    raise exception using
      errcode = '22023',
      message = 'Weekly target must be between 1 and 14';
  end if;

  select m.member_role::text
    into v_member_role
  from public.clinic_members m
  where m.clinic_id = p_clinic_id
    and m.user_id = v_actor
    and m.member_role in ('clinic_owner', 'therapist')
  for key share;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Only a clinic owner or therapist member may create a patient';
  end if;

  if v_member_role = 'therapist' then
    if v_assignment is not null and v_assignment is distinct from v_actor then
      raise exception using
        errcode = '42501',
        message = 'A therapist may assign a new patient only to themself';
    end if;
    v_assignment := v_actor;
  end if;

  if v_assignment is not null then
    perform 1
    from public.clinic_members m
    where m.clinic_id = p_clinic_id
      and m.user_id = v_assignment
      and m.member_role = 'therapist'
    for key share;

    if not found then
      raise exception using
        errcode = '22023',
        message = 'Assigned therapist must be an active therapist in the clinic';
    end if;
  end if;

  insert into public.patients (
    clinic_id, full_name, phone, birth_year, gender, created_by
  ) values (
    p_clinic_id, btrim(p_full_name), v_phone, p_birth_year, v_gender, v_actor
  )
  returning id into v_patient_id;

  insert into public.care_episodes (
    patient_id, title_fa, weekly_target
  ) values (
    v_patient_id, btrim(p_title_fa), p_weekly_target
  )
  returning id into v_episode_id;

  if v_assignment is not null then
    insert into public.patient_therapists (patient_id, therapist_id)
    values (v_patient_id, v_assignment);
  end if;

  return query select v_patient_id, v_episode_id;
end;
$$;

-- Minimal directory used by the patient registry. It deliberately returns no
-- phone, role, or other profile fields and is bounded to avoid an unbounded
-- PostgREST response. Clinic staff and platform admins have no implicit access.
create or replace function public.list_clinic_therapists(
  p_clinic_id uuid
)
returns table (
  id uuid,
  full_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required';
  end if;

  if private.is_platform_admin() then
    raise exception using
      errcode = '42501',
      message = 'Platform support has no implicit access to clinician directories';
  end if;

  if p_clinic_id is null or not exists (
    select 1
    from public.clinic_members caller
    where caller.clinic_id = p_clinic_id
      and caller.user_id = v_actor
      and caller.member_role in ('clinic_owner', 'therapist')
  ) then
    raise exception using
      errcode = '42501',
      message = 'Only a clinic owner or therapist member may list therapists';
  end if;

  return query
  select p.id, p.full_name
  from public.clinic_members m
  join public.profiles p on p.id = m.user_id
  where m.clinic_id = p_clinic_id
    and m.member_role = 'therapist'
  order by lower(p.full_name), p.id
  limit 500;
end;
$$;

-- ============================================================================
-- 9) Function privileges
-- ============================================================================
-- First remove the default PUBLIC execute privilege from every private
-- function, then grant only the boolean/lookup helpers needed by RLS.

revoke all on all functions in schema private from public, anon, authenticated;

grant execute on function private.is_platform_admin() to authenticated;
grant execute on function private.is_member_of(uuid) to authenticated;
grant execute on function private.is_owner_of(uuid) to authenticated;
grant execute on function private.patient_clinic(uuid) to authenticated;
grant execute on function private.episode_patient(uuid) to authenticated;
grant execute on function private.ticket_patient(uuid) to authenticated;
grant execute on function private.is_linked_patient(uuid) to authenticated;
grant execute on function private.is_assigned_therapist(uuid) to authenticated;
grant execute on function private.is_staff_of(uuid) to authenticated;
grant execute on function private.can_view_patient(uuid) to authenticated;
grant execute on function private.can_edit_patient_demographics(uuid) to authenticated;
grant execute on function private.can_manage_clinical_record(uuid) to authenticated;
grant execute on function private.can_manage_appointment(uuid) to authenticated;
grant execute on function private.can_reply_to_patient(uuid) to authenticated;
grant execute on function private.can_access_ticket_patient(uuid) to authenticated;

-- These two workflow functions are the deliberately exposed API surface.
-- service_role is also denied: trusted backend automation should use a
-- separate purpose-built path instead of impersonating a clinician.
revoke all on function public.reply_to_ticket(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.reply_to_ticket(uuid, text) to authenticated;

revoke all on function public.create_patient_episode(
  uuid, text, text, int, text, text, int, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.create_patient_episode(
  uuid, text, text, int, text, text, int, uuid
) to authenticated;

revoke all on function public.list_clinic_therapists(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_clinic_therapists(uuid) to authenticated;

-- Retain the old public functions for migration compatibility, but make them
-- unavailable to PostgREST callers. No policy created above depends on them.
revoke all on function public.is_platform_admin() from public, anon, authenticated;
revoke all on function public.is_member_of(uuid) from public, anon, authenticated;
revoke all on function public.is_owner_of(uuid) from public, anon, authenticated;
revoke all on function public.can_manage_patient(uuid) from public, anon, authenticated;
revoke all on function public.can_access_patient(uuid) from public, anon, authenticated;
revoke all on function public.episode_patient(uuid) from public, anon, authenticated;
revoke all on function public.patient_clinic(uuid) from public, anon, authenticated;
revoke all on function public.is_linked_patient(uuid) from public, anon, authenticated;
revoke all on function public.is_assigned_therapist(uuid) from public, anon, authenticated;
revoke all on function public.is_staff_of(uuid) from public, anon, authenticated;
revoke all on function public.can_view_patient(uuid) from public, anon, authenticated;
revoke all on function public.can_edit_patient_demographics(uuid) from public, anon, authenticated;
revoke all on function public.can_manage_clinical_record(uuid) from public, anon, authenticated;
revoke all on function public.can_manage_appointment(uuid) from public, anon, authenticated;
revoke all on function public.ticket_patient(uuid) from public, anon, authenticated;
revoke all on function public.guard_role_change() from public, anon, authenticated;
revoke all on function public.handle_new_user()
  from public, anon, authenticated, service_role;

comment on table public.audit_log is
  'Append-only security/clinical change metadata. Row contents and PHI are intentionally not duplicated.';
comment on column public.cases.safety_disposition is
  'Required red-flag state: not-screened, clear, medical-review, urgent, or emergency.';
comment on function public.reply_to_ticket(uuid, text) is
  'Authenticated owner/assigned-therapist RPC: inserts an attributed reply and atomically marks its ticket answered.';
comment on function public.create_patient_episode(
  uuid, text, text, int, text, text, int, uuid
) is
  'Authenticated owner/therapist RPC: atomically creates a patient, initial episode, and validated assignment.';
comment on function public.list_clinic_therapists(uuid) is
  'Bounded clinic directory RPC returning only therapist id and full_name to owner/therapist members.';
