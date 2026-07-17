-- PhysioAI — Migration 014: security & data-integrity fixes.
-- Run AFTER 013. New order: 001→002→003→010→011→012→013→014.

-- ════════════════════════════════════════════════════════════════
-- 1) Lock down write_audit: internal (definer) triggers still work,
--    but no client can call it directly.
-- ════════════════════════════════════════════════════════════════
revoke all on function public.write_audit(text, text, uuid, uuid, uuid, uuid, jsonb) from public;
revoke all on function public.write_audit(text, text, uuid, uuid, uuid, uuid, jsonb) from anon;
revoke all on function public.write_audit(text, text, uuid, uuid, uuid, uuid, jsonb) from authenticated;
-- (the audit trigger functions are SECURITY DEFINER owned by postgres,
--  so their internal calls keep working)

-- ════════════════════════════════════════════════════════════════
-- 2) Split clinical background OUT of patients (column-level control).
--    clinic_staff keeps administrative fields on patients; the clinical
--    background is writable only by admin/owner/assigned therapist and
--    NOT readable by clinic_staff (revisit with an explicit permission
--    if a clinic ever needs staff read).
-- ════════════════════════════════════════════════════════════════
create table if not exists patient_clinical_background (
  patient_id uuid primary key references patients (id) on delete cascade,
  clinic_id uuid not null references clinics (id) on delete cascade,
  medical_history text,
  surgical_history text,
  medications text,
  allergies text,
  clinical_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id)
);
alter table patient_clinical_background enable row level security;

-- Migrate existing data (no data loss), then drop the clinical columns
-- from patients so RLS on the new table is the single control point.
insert into patient_clinical_background
    (patient_id, clinic_id, medical_history, surgical_history, medications, allergies)
  select id, clinic_id, medical_history, surgical_history, medications, allergies
  from patients
  where coalesce(medical_history, surgical_history, medications, allergies) is not null
on conflict (patient_id) do nothing;

alter table patients
  drop column if exists medical_history,
  drop column if exists surgical_history,
  drop column if exists medications,
  drop column if exists allergies;
-- (patients.general_notes stays: it is ADMINISTRATIVE notes; clinical
--  notes belong in patient_clinical_background.clinical_notes)

create policy "clinical background read" on patient_clinical_background for select
  using (public.can_manage_clinical_record(patient_id));
create policy "clinical background write" on patient_clinical_background for all
  using (public.can_manage_clinical_record(patient_id))
  with check (public.can_manage_clinical_record(patient_id));

drop trigger if exists clinical_background_touch on patient_clinical_background;
create trigger clinical_background_touch
  before update on patient_clinical_background
  for each row execute function public.touch_updated_at();

-- ════════════════════════════════════════════════════════════════
-- 3+4) Integrity + anti-spoof triggers. clinic_id / patient_id /
--      created_by / updated_by sent by the browser are never trusted:
--      they are derived server-side or must match; mismatches fail.
--      auth.uid() IS NULL (SQL editor / service role) is the documented
--      administrative exception and keeps provided values.
-- ════════════════════════════════════════════════════════════════
create or replace function public.is_clinical_member(p_user uuid, p_clinic uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = p_user and role = 'platform_admin')
      or exists (select 1 from clinic_members
                 where user_id = p_user and clinic_id = p_clinic
                   and member_role in ('clinic_owner', 'therapist'));
$$;

-- patients: stamp actor columns.
create or replace function public.patients_integrity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then new.created_by := auth.uid(); end if;
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists patients_aa_integrity on patients;
create trigger patients_aa_integrity
  before insert or update on patients
  for each row execute function public.patients_integrity();

-- care_episodes: clinic derived from the patient; therapist must be a
-- clinical member of that clinic.
create or replace function public.episodes_integrity()
returns trigger language plpgsql security definer set search_path = public as $$
declare pc uuid;
begin
  select clinic_id into pc from patients where id = new.patient_id;
  if pc is null then raise exception 'Unknown patient'; end if;
  new.clinic_id := pc;  -- never trust the browser value
  if new.primary_therapist_id is not null
     and not public.is_clinical_member(new.primary_therapist_id, pc) then
    raise exception 'primary_therapist_id is not a clinical member of this clinic';
  end if;
  if auth.uid() is not null then
    if tg_op = 'INSERT' then new.created_by := auth.uid(); end if;
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists care_episodes_aa_integrity on care_episodes;
create trigger care_episodes_aa_integrity
  before insert or update on care_episodes
  for each row execute function public.episodes_integrity();

-- assessments: patient/clinic derived from the episode.
create or replace function public.assessments_integrity()
returns trigger language plpgsql security definer set search_path = public as $$
declare ep record;
begin
  select patient_id, clinic_id into ep from care_episodes where id = new.care_episode_id;
  if ep.patient_id is null then raise exception 'Unknown care episode'; end if;
  new.patient_id := ep.patient_id;
  new.clinic_id := ep.clinic_id;
  if auth.uid() is not null then
    if tg_op = 'INSERT' then new.created_by := auth.uid(); end if;
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists assessments_aa_integrity on assessments;
create trigger assessments_aa_integrity
  before insert or update on assessments
  for each row execute function public.assessments_integrity();

-- sessions: patient/clinic derived from the episode; therapist must be
-- a clinical member of that clinic.
create or replace function public.sessions_integrity()
returns trigger language plpgsql security definer set search_path = public as $$
declare ep record;
begin
  select patient_id, clinic_id into ep from care_episodes where id = new.care_episode_id;
  if ep.patient_id is null then raise exception 'Unknown care episode'; end if;
  new.patient_id := ep.patient_id;
  new.clinic_id := ep.clinic_id;
  if new.therapist_id is not null
     and not public.is_clinical_member(new.therapist_id, ep.clinic_id) then
    raise exception 'therapist_id is not a clinical member of this clinic';
  end if;
  if auth.uid() is not null then
    if tg_op = 'INSERT' then new.created_by := auth.uid(); end if;
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists sessions_aa_integrity on sessions;
create trigger sessions_aa_integrity
  before insert or update on sessions
  for each row execute function public.sessions_integrity();

-- clinical_measurements: episode consistency, session must belong to the
-- same episode, metric definition must belong to the same clinic.
create or replace function public.measurements_integrity()
returns trigger language plpgsql security definer set search_path = public as $$
declare ep record; s record; d record;
begin
  select patient_id, clinic_id into ep from care_episodes where id = new.care_episode_id;
  if ep.patient_id is null then raise exception 'Unknown care episode'; end if;
  new.patient_id := ep.patient_id;
  new.clinic_id := ep.clinic_id;
  if new.session_id is not null then
    select care_episode_id, patient_id into s from sessions where id = new.session_id;
    if s.care_episode_id is distinct from new.care_episode_id
       or s.patient_id is distinct from new.patient_id then
      raise exception 'session_id does not belong to this care episode';
    end if;
  end if;
  if new.metric_definition_id is not null then
    select clinic_id into d from progress_metric_definitions where id = new.metric_definition_id;
    if d.clinic_id is distinct from new.clinic_id then
      raise exception 'metric definition belongs to another clinic';
    end if;
  end if;
  if new.therapist_id is not null
     and not public.is_clinical_member(new.therapist_id, ep.clinic_id) then
    raise exception 'therapist_id is not a clinical member of this clinic';
  end if;
  if auth.uid() is not null then
    if tg_op = 'INSERT' then new.created_by := auth.uid(); end if;
  end if;
  return new;
end $$;
drop trigger if exists measurements_aa_integrity on clinical_measurements;
create trigger measurements_aa_integrity
  before insert or update on clinical_measurements
  for each row execute function public.measurements_integrity();

-- progress_metric_definitions: stamp creator.
create or replace function public.metric_defs_integrity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and tg_op = 'INSERT' then
    new.created_by := auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists metric_defs_aa_integrity on progress_metric_definitions;
create trigger metric_defs_aa_integrity
  before insert or update on progress_metric_definitions
  for each row execute function public.metric_defs_integrity();

-- ════════════════════════════════════════════════════════════════
-- 5+9) Clinical READ tightening. Raw sessions/assessments are readable
--      ONLY by platform_admin / clinic_owner / ASSIGNED therapist —
--      membership alone (incl. clinic_staff and unassigned therapists)
--      is no longer enough. Staff get an administrative view without
--      any clinical content; patients keep their summaries view.
-- ════════════════════════════════════════════════════════════════
drop policy if exists "sessions read" on sessions;
create policy "sessions read" on sessions for select
  using (public.can_manage_clinical_record(patient_id));

drop policy if exists "assessments read" on assessments;
create policy "assessments read" on assessments for select
  using (public.can_manage_clinical_record(patient_id));

drop policy if exists "measurements read" on clinical_measurements;
create policy "measurements read" on clinical_measurements for select
  using (
    public.can_manage_clinical_record(patient_id)
    or (
      public.is_linked_patient(patient_id)
      and exists (
        select 1 from progress_metric_definitions d
        where d.id = clinical_measurements.metric_definition_id
          and d.patient_visible
      )
    )
  );

-- Administrative session view for clinic members (incl. clinic_staff):
-- scheduling columns only, zero clinical content.
create or replace view session_admin_view as
  select s.id, s.patient_id, s.care_episode_id, s.session_number,
         s.session_date, s.start_time, s.end_time, s.status, s.therapist_id
  from sessions s
  where public.is_platform_admin() or public.is_member_of(s.clinic_id);
grant select on session_admin_view to authenticated;

-- ════════════════════════════════════════════════════════════════
-- 6) Concurrency-safe, gap-free-forward session numbering.
--    A per-episode counter is atomically incremented (the UPDATE takes
--    a row lock, serialising concurrent inserts); numbers are NEVER
--    reused after delete or cancel, and a unique constraint is the
--    final guarantee.
-- ════════════════════════════════════════════════════════════════
alter table care_episodes
  add column if not exists next_session_number int not null default 1;

-- Initialise counters from existing data.
update care_episodes e
  set next_session_number = coalesce(
    (select max(s.session_number) from sessions s where s.care_episode_id = e.id), 0) + 1;

create or replace function public.assign_session_number()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if new.session_number is not null then
    return new;  -- explicit numbers are validated by the unique index
  end if;
  update care_episodes
     set next_session_number = next_session_number + 1
   where id = new.care_episode_id
   returning next_session_number - 1 into n;
  if n is null then raise exception 'Unknown care episode'; end if;
  new.session_number := n;
  return new;
end $$;
-- (trigger sessions_number from 012 keeps pointing at this function)

create unique index if not exists sessions_episode_number_unique
  on sessions (care_episode_id, session_number);

-- The legacy default from 001 ('planned') is no longer a valid status.
alter table sessions alter column status set default 'draft';

-- ════════════════════════════════════════════════════════════════
-- 7) Strict measurement value/type/unit validation: exactly the column
--    matching the definition's data_type may be set; unit must match.
-- ════════════════════════════════════════════════════════════════
create or replace function public.guard_measurement_type()
returns trigger language plpgsql security definer set search_path = public as $$
declare d record;
begin
  if new.metric_definition_id is null then return new; end if;
  select data_type, unit into d from progress_metric_definitions
    where id = new.metric_definition_id;

  if d.data_type in ('numeric', 'duration', 'distance', 'repetition') then
    if new.numeric_value is null then
      raise exception 'This metric requires a numeric value';
    end if;
    if new.boolean_value is not null or coalesce(new.categorical_value, '') <> ''
       or coalesce(new.text_value, '') <> '' then
      raise exception 'Only numeric_value may be set for this metric';
    end if;
  elsif d.data_type = 'boolean' then
    if new.boolean_value is null then
      raise exception 'This metric requires a boolean value';
    end if;
    if new.numeric_value is not null or coalesce(new.categorical_value, '') <> ''
       or coalesce(new.text_value, '') <> '' then
      raise exception 'Only boolean_value may be set for this metric';
    end if;
  elsif d.data_type = 'categorical' then
    if coalesce(new.categorical_value, '') = '' then
      raise exception 'This metric requires a categorical value';
    end if;
    if new.numeric_value is not null or new.boolean_value is not null
       or coalesce(new.text_value, '') <> '' then
      raise exception 'Only categorical_value may be set for this metric';
    end if;
  elsif d.data_type = 'text' then
    if coalesce(new.text_value, '') = '' then
      raise exception 'This metric requires a text value';
    end if;
    if new.numeric_value is not null or new.boolean_value is not null
       or coalesce(new.categorical_value, '') <> '' then
      raise exception 'Only text_value may be set for this metric';
    end if;
  end if;

  -- Units may never disagree with the definition.
  if new.unit is null then
    new.unit := d.unit;
  elsif d.unit is not null and new.unit <> d.unit then
    raise exception 'Unit % does not match the metric definition unit %', new.unit, d.unit;
  end if;
  return new;
end $$;
-- (trigger measurements_type_guard from 012 keeps pointing here)
