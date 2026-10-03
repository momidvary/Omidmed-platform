-- GENERATED FILE — do not edit. Rebuild with:
--   node database/scripts/build-sql-editor-bundle.mjs
--
-- PhysioAI: all migrations (001–028) for the Supabase SQL Editor.
-- Run on a project whose public schema is EMPTY (fresh project, or after
-- 01_reset_app_schema.sql). Paste the whole file and press Run once.

do $preflight$
declare
  v_applied int;
  v_pending text;
begin
  if to_regclass('public.schema_migrations') is not null then
    execute $q$select count(*) from public.schema_migrations where status = 'applied'$q$
      into v_applied;
    execute $q$select string_agg(filename, ', ' order by version)
                from public.schema_migrations where status <> 'applied'$q$
      into v_pending;
    if v_applied >= 28 and v_pending is null then
      raise exception using
        errcode = '55000',
        message = format('Already installed: all %s migrations are applied. Nothing to do here; continue with 03_first_clinic_owner.sql (later upgrades: node database/scripts/migrate.mjs).', v_applied);
    end if;
    raise exception using
      errcode = '55000',
      message = format('A previous run stopped part-way: %s of 28 migrations applied; unfinished: %s. Run 01_reset_app_schema.sql, then this file again. If it stops again, send the FIRST error shown.', v_applied, coalesce(v_pending, 'none recorded'));
  end if;
  if to_regclass('public.profiles') is not null
     or to_regclass('public.clinics') is not null
     or to_regclass('public.patients') is not null
     or to_regclass('public.care_episodes') is not null then
    raise exception using
      errcode = '55000',
      message = 'The public schema already has app tables. Run 01_reset_app_schema.sql first (only if it holds no real data).';
  end if;
end
$preflight$;

create table public.schema_migrations (
  version text primary key check (version ~ '^[0-9]{3}$'),
  filename text not null unique,
  checksum text not null check (checksum ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('applying', 'applied')),
  started_at timestamptz not null default clock_timestamp(),
  applied_at timestamptz
);
revoke all on table public.schema_migrations from public, anon, authenticated, service_role;

-- ════════════════════════════════════════════════════════════════
-- 001_schema.sql
-- ════════════════════════════════════════════════════════════════
insert into public.schema_migrations (version, filename, checksum, status)
values ('001', '001_schema.sql', '89f5156121002c4dd13435b2dd6f0204e82c1659afd052c0b38b54b787b16ca3', 'applying');

-- PhysioAI — Migration 001: core schema (roles, clinics, patients, episodes)
-- Run FIRST in the Supabase SQL editor. Then run 002_rls.sql.
--
-- ⚠ This replaces the old demo schema: the previous demo tables (which
-- held only sample data and anon policies) are dropped.

-- ── Drop the old demo schema ────────────────────────────────────
drop table if exists ticket_replies cascade;
drop table if exists tickets cascade;
drop table if exists patient_progress cascade;
drop table if exists patient_program cascade;
drop table if exists patients cascade;
drop table if exists cases cascade;

-- ── Roles & profiles ────────────────────────────────────────────
do $$ begin
  create type user_role as enum
    ('platform_admin', 'clinic_owner', 'therapist', 'clinic_staff', 'patient');
exception when duplicate_object then null; end $$;

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role user_role not null default 'patient',
  full_name text not null default '',
  phone text,
  created_at timestamptz not null default now()
);

-- Every new auth user automatically gets a profile (role: patient).
-- Staff roles are granted afterwards by an admin (see docs/RAHNAMA-FA.md).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Clinics & membership ────────────────────────────────────────
create table clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  phone text,
  created_at timestamptz not null default now()
);

create table clinic_members (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  member_role user_role not null
    check (member_role in ('clinic_owner', 'therapist', 'clinic_staff')),
  created_at timestamptz not null default now(),
  unique (clinic_id, user_id)
);

-- ── Patients (clinic-owned records; login is via Supabase Auth) ─
create table patients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics (id) on delete cascade,
  full_name text not null,
  national_id text,           -- identifier on file only; NEVER a credential
  phone text,
  birth_year int,
  gender text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

-- Which auth users may act as which patient (e.g. the patient themself,
-- or a family member's account).
create table patient_users (
  patient_id uuid not null references patients (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  primary key (patient_id, user_id)
);

-- Therapist ↔ patient assignment.
create table patient_therapists (
  patient_id uuid not null references patients (id) on delete cascade,
  therapist_id uuid not null references profiles (id) on delete cascade,
  primary key (patient_id, therapist_id)
);

-- ── Care episodes: one patient can have several treatment courses ─
create table care_episodes (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  title_fa text not null,               -- e.g. 'توان‌بخشی بعد از تعویض زانو'
  therapist_note_fa text,
  weekly_target int not null default 5,
  status text not null default 'active'
    check (status in ('active', 'completed', 'paused')),
  started_at date not null default current_date,
  ended_at date,
  created_at timestamptz not null default now()
);

-- Prescribed exercise program, per episode.
create table episode_program (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references care_episodes (id) on delete cascade,
  exercise_id text not null,
  dosage_fa text not null,
  days_per_week int not null default 5
);

-- Daily progress log, per episode.
create table progress (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references care_episodes (id) on delete cascade,
  date date not null,
  pain_level int not null check (pain_level between 0 and 10),
  completed boolean not null default true,
  unique (episode_id, date)
);

-- Treatment sessions delivered in the clinic, per episode.
create table sessions (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references care_episodes (id) on delete cascade,
  therapist_id uuid references profiles (id),
  scheduled_at timestamptz,
  status text not null default 'planned'
    check (status in ('planned', 'done', 'cancelled')),
  notes text,
  created_at timestamptz not null default now()
);

-- Appointments (booking calendar).
create table appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics (id) on delete cascade,
  patient_id uuid not null references patients (id) on delete cascade,
  therapist_id uuid references profiles (id),
  starts_at timestamptz not null,
  duration_min int not null default 30,
  status text not null default 'booked'
    check (status in ('booked', 'done', 'cancelled', 'no_show')),
  notes text,
  created_at timestamptz not null default now()
);

-- Clinic-defined custom exercises (the built-in library ships in code).
create table exercises (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics (id) on delete cascade,
  name text not null,
  name_fa text,
  content jsonb,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

-- ── Tickets ─────────────────────────────────────────────────────
create table tickets (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  episode_id uuid references care_episodes (id) on delete set null,
  exercise_id text,
  subject text not null,
  message text not null,
  status text not null default 'open' check (status in ('open', 'answered')),
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create table ticket_replies (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets (id) on delete cascade,
  sender text not null check (sender in ('ai', 'therapist', 'patient')),
  content text not null,
  created_at timestamptz not null default now()
);

-- ── Clinician intake cases (clinic-scoped) ──────────────────────
create table cases (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics (id) on delete cascade,
  patient_id uuid references patients (id) on delete set null,
  created_by uuid references profiles (id),
  name text not null,
  age int,
  gender text,
  region text,
  main_complaint text not null,
  pain_location text,
  pain_intensity int not null default 5,
  duration text,
  mechanism text,
  aggravating text,
  easing text,
  medical_history text,
  surgical_history text,
  imaging text,
  medications text,
  functional_limitations text,
  patient_goal text,
  created_at timestamptz not null default now()
);

create index on clinic_members (user_id);
create index on patients (clinic_id);
create index on patient_users (user_id);
create index on patient_therapists (therapist_id);
create index on care_episodes (patient_id);
create index on progress (episode_id);
create index on tickets (patient_id);
create index on cases (clinic_id);

update public.schema_migrations
set status = 'applied', applied_at = clock_timestamp()
where version = '001' and status = 'applying';

-- ════════════════════════════════════════════════════════════════
-- 002_rls.sql
-- ════════════════════════════════════════════════════════════════
insert into public.schema_migrations (version, filename, checksum, status)
values ('002', '002_rls.sql', 'c375a81a8bcea2599c3df83edbd63c35654fa8f7f25bdaf3ab5dfa193c528d24', 'applying');

-- PhysioAI — Migration 002: Row Level Security
-- Run AFTER 001_schema.sql. There are NO anon policies: every access
-- requires an authenticated user, and access is scoped by role,
-- clinic membership, therapist assignment, or patient linkage.

-- ── Helper functions (security definer to avoid RLS recursion) ──
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'platform_admin'
  );
$$;

create or replace function public.is_member_of(p_clinic uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from clinic_members
    where clinic_id = p_clinic and user_id = auth.uid()
  );
$$;

create or replace function public.is_owner_of(p_clinic uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from clinic_members
    where clinic_id = p_clinic and user_id = auth.uid()
      and member_role = 'clinic_owner'
  );
$$;

-- Staff-side access to a patient record: platform admin, a member of the
-- patient's clinic, or a therapist explicitly assigned to the patient.
create or replace function public.can_manage_patient(p_patient uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin()
    or exists (
      select 1 from patients p
      join clinic_members m on m.clinic_id = p.clinic_id
      where p.id = p_patient and m.user_id = auth.uid()
    )
    or exists (
      select 1 from patient_therapists pt
      where pt.patient_id = p_patient and pt.therapist_id = auth.uid()
    );
$$;

-- Any access to a patient record: staff-side access OR the linked patient.
create or replace function public.can_access_patient(p_patient uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_manage_patient(p_patient)
    or exists (
      select 1 from patient_users pu
      where pu.patient_id = p_patient and pu.user_id = auth.uid()
    );
$$;

create or replace function public.episode_patient(p_episode uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select patient_id from care_episodes where id = p_episode;
$$;

-- ── Enable RLS everywhere ───────────────────────────────────────
alter table profiles enable row level security;
alter table clinics enable row level security;
alter table clinic_members enable row level security;
alter table patients enable row level security;
alter table patient_users enable row level security;
alter table patient_therapists enable row level security;
alter table care_episodes enable row level security;
alter table episode_program enable row level security;
alter table progress enable row level security;
alter table sessions enable row level security;
alter table appointments enable row level security;
alter table exercises enable row level security;
alter table tickets enable row level security;
alter table ticket_replies enable row level security;
alter table cases enable row level security;

-- ── profiles ────────────────────────────────────────────────────
create policy "own profile read" on profiles for select
  using (id = auth.uid() or public.is_platform_admin());
create policy "own profile update" on profiles for update
  using (id = auth.uid() or public.is_platform_admin())
  with check (id = auth.uid() or public.is_platform_admin());

-- Role escalation guard: only a platform admin may change `role`.
create or replace function public.guard_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and not public.is_platform_admin() then
    raise exception 'Only a platform admin can change roles';
  end if;
  return new;
end $$;

drop trigger if exists profiles_role_guard on profiles;
create trigger profiles_role_guard
  before update on profiles
  for each row execute function public.guard_role_change();

-- ── clinics ─────────────────────────────────────────────────────
create policy "clinic read" on clinics for select
  using (public.is_platform_admin() or public.is_member_of(id));
create policy "clinic admin write" on clinics for all
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "clinic owner update" on clinics for update
  using (public.is_owner_of(id)) with check (public.is_owner_of(id));

-- ── clinic_members ──────────────────────────────────────────────
create policy "members read" on clinic_members for select
  using (public.is_platform_admin() or public.is_member_of(clinic_id));
create policy "members manage" on clinic_members for all
  using (public.is_platform_admin() or public.is_owner_of(clinic_id))
  with check (public.is_platform_admin() or public.is_owner_of(clinic_id));

-- ── patients ────────────────────────────────────────────────────
create policy "patient read" on patients for select
  using (public.can_access_patient(id));
create policy "patient insert" on patients for insert
  with check (public.is_platform_admin() or public.is_member_of(clinic_id));
create policy "patient update" on patients for update
  using (public.can_manage_patient(id)) with check (public.can_manage_patient(id));
create policy "patient delete" on patients for delete
  using (public.is_platform_admin() or public.is_owner_of(clinic_id));

-- ── patient_users / patient_therapists ──────────────────────────
create policy "patient_users read" on patient_users for select
  using (user_id = auth.uid() or public.can_manage_patient(patient_id));
create policy "patient_users manage" on patient_users for all
  using (public.can_manage_patient(patient_id))
  with check (public.can_manage_patient(patient_id));

create policy "patient_therapists read" on patient_therapists for select
  using (therapist_id = auth.uid() or public.can_manage_patient(patient_id));
create policy "patient_therapists manage" on patient_therapists for all
  using (public.can_manage_patient(patient_id))
  with check (public.can_manage_patient(patient_id));

-- ── care_episodes ───────────────────────────────────────────────
create policy "episodes read" on care_episodes for select
  using (public.can_access_patient(patient_id));
create policy "episodes manage" on care_episodes for all
  using (public.can_manage_patient(patient_id))
  with check (public.can_manage_patient(patient_id));

-- ── episode_program ─────────────────────────────────────────────
create policy "program read" on episode_program for select
  using (public.can_access_patient(public.episode_patient(episode_id)));
create policy "program manage" on episode_program for all
  using (public.can_manage_patient(public.episode_patient(episode_id)))
  with check (public.can_manage_patient(public.episode_patient(episode_id)));

-- ── progress (patients log their own; staff can correct) ────────
create policy "progress read" on progress for select
  using (public.can_access_patient(public.episode_patient(episode_id)));
create policy "progress write" on progress for all
  using (public.can_access_patient(public.episode_patient(episode_id)))
  with check (public.can_access_patient(public.episode_patient(episode_id)));

-- ── sessions ────────────────────────────────────────────────────
create policy "sessions read" on sessions for select
  using (public.can_access_patient(public.episode_patient(episode_id)));
create policy "sessions manage" on sessions for all
  using (public.can_manage_patient(public.episode_patient(episode_id)))
  with check (public.can_manage_patient(public.episode_patient(episode_id)));

-- ── appointments ────────────────────────────────────────────────
create policy "appointments read" on appointments for select
  using (public.can_access_patient(patient_id));
create policy "appointments manage" on appointments for all
  using (public.is_platform_admin() or public.is_member_of(clinic_id))
  with check (public.is_platform_admin() or public.is_member_of(clinic_id));

-- ── exercises (clinic custom library) ───────────────────────────
create policy "exercises read" on exercises for select
  using (public.is_platform_admin() or public.is_member_of(clinic_id));
create policy "exercises manage" on exercises for all
  using (public.is_platform_admin() or public.is_member_of(clinic_id))
  with check (public.is_platform_admin() or public.is_member_of(clinic_id));

-- ── tickets & replies ───────────────────────────────────────────
create policy "tickets read" on tickets for select
  using (public.can_access_patient(patient_id));
create policy "tickets insert" on tickets for insert
  with check (public.can_access_patient(patient_id));
create policy "tickets update" on tickets for update
  using (public.can_manage_patient(patient_id))
  with check (public.can_manage_patient(patient_id));

create policy "replies read" on ticket_replies for select
  using (exists (
    select 1 from tickets t
    where t.id = ticket_id and public.can_access_patient(t.patient_id)
  ));
create policy "replies insert" on ticket_replies for insert
  with check (exists (
    select 1 from tickets t
    where t.id = ticket_id and public.can_access_patient(t.patient_id)
  ));

-- ── cases (clinic-scoped intake records) ────────────────────────
create policy "cases read" on cases for select
  using (public.is_platform_admin() or public.is_member_of(clinic_id));
create policy "cases write" on cases for all
  using (public.is_platform_admin() or public.is_member_of(clinic_id))
  with check (public.is_platform_admin() or public.is_member_of(clinic_id));

update public.schema_migrations
set status = 'applied', applied_at = clock_timestamp()
where version = '002' and status = 'applying';

-- ════════════════════════════════════════════════════════════════
-- 003_security_fixes.sql
-- ════════════════════════════════════════════════════════════════
insert into public.schema_migrations (version, filename, checksum, status)
values ('003', '003_security_fixes.sql', 'd08547c4da4b543bf0289c86e26051f80eef8e7ee032033ba5d67df2d035a54d', 'applying');

-- PhysioAI — Migration 003: security fixes (run AFTER 001 and 002)
--
-- 1) Safe one-time bootstrap of the first platform_admin
-- 2) Granular access functions replacing the catch-all can_manage_patient
-- 3) ticket_replies sender hardening (+ sender_user_id, no client 'ai')
-- 4) Split patient self-reports (patient_daily_logs) from
--    therapist-recorded clinical_measurements
-- 5) created_by / therapist_id anti-spoofing checks

-- ════════════════════════════════════════════════════════════════
-- 1) Bootstrap the first platform_admin
-- ════════════════════════════════════════════════════════════════
-- The role-change guard (002) blocks non-admins from changing roles,
-- which also blocks creating the FIRST admin. Fix the guard to allow
-- administrative contexts (SQL editor / service role have no JWT →
-- auth.uid() is null; RLS already blocks anon/authenticated writes
-- they don't own, so this opens nothing to end users):

create or replace function public.guard_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_platform_admin() then
    raise exception 'Only a platform admin can change roles';
  end if;
  return new;
end $$;

-- One-time bootstrap function. Only runs while NO platform_admin exists,
-- and is NOT executable by anon/authenticated — only the SQL editor
-- (postgres) or the service role can call it.
create or replace function public.bootstrap_platform_admin(target_user uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from profiles where role = 'platform_admin') then
    raise exception 'Bootstrap refused: a platform_admin already exists';
  end if;
  if not exists (select 1 from profiles where id = target_user) then
    raise exception 'No profile found for user %. Create the user first (Authentication → Users).', target_user;
  end if;
  update profiles set role = 'platform_admin' where id = target_user;
  return 'platform_admin bootstrapped for ' || target_user;
end $$;

revoke all on function public.bootstrap_platform_admin(uuid) from public;
revoke all on function public.bootstrap_platform_admin(uuid) from anon;
revoke all on function public.bootstrap_platform_admin(uuid) from authenticated;

-- ════════════════════════════════════════════════════════════════
-- 2) Granular access functions
-- ════════════════════════════════════════════════════════════════
create or replace function public.patient_clinic(p_patient uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select clinic_id from patients where id = p_patient;
$$;

create or replace function public.is_linked_patient(p_patient uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from patient_users
    where patient_id = p_patient and user_id = auth.uid()
  );
$$;

create or replace function public.is_assigned_therapist(p_patient uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from patient_therapists
    where patient_id = p_patient and therapist_id = auth.uid()
  );
$$;

create or replace function public.is_staff_of(p_clinic uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from clinic_members
    where clinic_id = p_clinic and user_id = auth.uid()
      and member_role = 'clinic_staff'
  );
$$;

-- View a patient: admin, any member of the patient's clinic, an assigned
-- therapist, or the linked patient themself.
create or replace function public.can_view_patient(p_patient uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin()
    or public.is_member_of(public.patient_clinic(p_patient))
    or public.is_assigned_therapist(p_patient)
    or public.is_linked_patient(p_patient);
$$;

-- Edit administrative/demographic patient data: admin, clinic owner,
-- clinic staff, or an assigned therapist.
create or replace function public.can_edit_patient_demographics(p_patient uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin()
    or public.is_owner_of(public.patient_clinic(p_patient))
    or public.is_staff_of(public.patient_clinic(p_patient))
    or public.is_assigned_therapist(p_patient);
$$;

-- Manage the clinical record (episodes, programs, sessions, measurements,
-- assessments): admin, clinic owner, or the ASSIGNED therapist only.
-- clinic_staff is deliberately excluded.
create or replace function public.can_manage_clinical_record(p_patient uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin()
    or public.is_owner_of(public.patient_clinic(p_patient))
    or public.is_assigned_therapist(p_patient);
$$;

-- Appointments are administrative: any clinic member.
create or replace function public.can_manage_appointment(p_clinic uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or public.is_member_of(p_clinic);
$$;

create or replace function public.ticket_patient(p_ticket uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select patient_id from tickets where id = p_ticket;
$$;

-- ════════════════════════════════════════════════════════════════
-- 3) Split patient self-reports from clinical measurements
-- ════════════════════════════════════════════════════════════════
alter table progress rename to patient_daily_logs;

create table clinical_measurements (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references care_episodes (id) on delete cascade,
  therapist_id uuid not null references profiles (id),
  measured_at date not null default current_date,
  kind text not null,            -- e.g. 'ROM', 'strength', 'functional_test'
  value jsonb not null,
  notes text,
  created_at timestamptz not null default now()
);
create index on clinical_measurements (episode_id);
alter table clinical_measurements enable row level security;

-- ════════════════════════════════════════════════════════════════
-- 4) ticket_replies hardening
-- ════════════════════════════════════════════════════════════════
alter table ticket_replies
  add column if not exists sender_user_id uuid references profiles (id);

-- ════════════════════════════════════════════════════════════════
-- 5) Replace the coarse policies with granular ones
-- ════════════════════════════════════════════════════════════════

-- patients
drop policy if exists "patient read" on patients;
drop policy if exists "patient insert" on patients;
drop policy if exists "patient update" on patients;
drop policy if exists "patient delete" on patients;
create policy "patient read" on patients for select
  using (public.can_view_patient(id));
create policy "patient insert" on patients for insert
  with check (public.is_platform_admin() or public.is_member_of(clinic_id));
create policy "patient update" on patients for update
  using (public.can_edit_patient_demographics(id))
  with check (public.can_edit_patient_demographics(id));
create policy "patient delete" on patients for delete
  using (public.is_platform_admin() or public.is_owner_of(clinic_id));

-- patient_users / patient_therapists: linking is owner/admin work
drop policy if exists "patient_users read" on patient_users;
drop policy if exists "patient_users manage" on patient_users;
create policy "patient_users read" on patient_users for select
  using (user_id = auth.uid() or public.can_view_patient(patient_id));
create policy "patient_users manage" on patient_users for all
  using (public.is_platform_admin() or public.is_owner_of(public.patient_clinic(patient_id))
         or public.is_staff_of(public.patient_clinic(patient_id)))
  with check (public.is_platform_admin() or public.is_owner_of(public.patient_clinic(patient_id))
              or public.is_staff_of(public.patient_clinic(patient_id)));

drop policy if exists "patient_therapists read" on patient_therapists;
drop policy if exists "patient_therapists manage" on patient_therapists;
create policy "patient_therapists read" on patient_therapists for select
  using (therapist_id = auth.uid() or public.can_view_patient(patient_id));
create policy "patient_therapists manage" on patient_therapists for all
  using (public.is_platform_admin() or public.is_owner_of(public.patient_clinic(patient_id)))
  with check (public.is_platform_admin() or public.is_owner_of(public.patient_clinic(patient_id)));

-- care_episodes / episode_program: clinical record
drop policy if exists "episodes read" on care_episodes;
drop policy if exists "episodes manage" on care_episodes;
create policy "episodes read" on care_episodes for select
  using (public.can_view_patient(patient_id));
create policy "episodes manage" on care_episodes for all
  using (public.can_manage_clinical_record(patient_id))
  with check (public.can_manage_clinical_record(patient_id));

drop policy if exists "program read" on episode_program;
drop policy if exists "program manage" on episode_program;
create policy "program read" on episode_program for select
  using (public.can_view_patient(public.episode_patient(episode_id)));
create policy "program manage" on episode_program for all
  using (public.can_manage_clinical_record(public.episode_patient(episode_id)))
  with check (public.can_manage_clinical_record(public.episode_patient(episode_id)));

-- patient_daily_logs: the linked patient writes their OWN logs;
-- clinical managers may also correct them. Staff cannot.
drop policy if exists "progress read" on patient_daily_logs;
drop policy if exists "progress write" on patient_daily_logs;
create policy "daily logs read" on patient_daily_logs for select
  using (public.can_view_patient(public.episode_patient(episode_id)));
create policy "daily logs write" on patient_daily_logs for all
  using (public.is_linked_patient(public.episode_patient(episode_id))
         or public.can_manage_clinical_record(public.episode_patient(episode_id)))
  with check (public.is_linked_patient(public.episode_patient(episode_id))
              or public.can_manage_clinical_record(public.episode_patient(episode_id)));

-- clinical_measurements: therapists/owners only; patients read-only.
-- therapist_id cannot be spoofed: non-admins must record as themselves.
create policy "measurements read" on clinical_measurements for select
  using (public.can_view_patient(public.episode_patient(episode_id)));
create policy "measurements write" on clinical_measurements for all
  using (public.can_manage_clinical_record(public.episode_patient(episode_id)))
  with check (
    public.can_manage_clinical_record(public.episode_patient(episode_id))
    and (therapist_id = auth.uid() or public.is_platform_admin())
  );

-- sessions: clinical record; therapist_id anti-spoofing
drop policy if exists "sessions read" on sessions;
drop policy if exists "sessions manage" on sessions;
create policy "sessions read" on sessions for select
  using (public.can_view_patient(public.episode_patient(episode_id)));
create policy "sessions manage" on sessions for all
  using (public.can_manage_clinical_record(public.episode_patient(episode_id)))
  with check (
    public.can_manage_clinical_record(public.episode_patient(episode_id))
    and (therapist_id is null or therapist_id = auth.uid() or public.is_platform_admin()
         or public.is_owner_of(public.patient_clinic(public.episode_patient(episode_id))))
  );

-- appointments: administrative
drop policy if exists "appointments read" on appointments;
drop policy if exists "appointments manage" on appointments;
create policy "appointments read" on appointments for select
  using (public.can_view_patient(patient_id));
create policy "appointments manage" on appointments for all
  using (public.can_manage_appointment(clinic_id))
  with check (public.can_manage_appointment(clinic_id));

-- tickets: created_by must be the real author
drop policy if exists "tickets read" on tickets;
drop policy if exists "tickets insert" on tickets;
drop policy if exists "tickets update" on tickets;
create policy "tickets read" on tickets for select
  using (public.can_view_patient(patient_id));
create policy "tickets insert" on tickets for insert
  with check (public.can_view_patient(patient_id) and created_by = auth.uid());
create policy "tickets update" on tickets for update
  using (public.can_manage_clinical_record(patient_id))
  with check (public.can_manage_clinical_record(patient_id));

-- ticket_replies:
--   patient  → only sender='patient', as themself
--   owner / assigned therapist → only sender='therapist', as themself
--   sender='ai' is NEVER writable from the client; only the service role
--   (server route handler) bypasses RLS to insert it.
drop policy if exists "replies read" on ticket_replies;
drop policy if exists "replies insert" on ticket_replies;
create policy "replies read" on ticket_replies for select
  using (public.can_view_patient(public.ticket_patient(ticket_id)));
create policy "replies insert" on ticket_replies for insert
  with check (
    sender_user_id = auth.uid()
    and (
      (sender = 'patient'
        and public.is_linked_patient(public.ticket_patient(ticket_id)))
      or
      (sender = 'therapist'
        and public.can_manage_clinical_record(public.ticket_patient(ticket_id)))
    )
  );

-- cases: clinical intake records — staff may read, not write
drop policy if exists "cases read" on cases;
drop policy if exists "cases write" on cases;
create policy "cases read" on cases for select
  using (public.is_platform_admin() or public.is_member_of(clinic_id));
create policy "cases insert" on cases for insert
  with check (
    (public.is_platform_admin() or (public.is_member_of(clinic_id) and not public.is_staff_of(clinic_id)))
    and created_by = auth.uid()
  );
create policy "cases update" on cases for update
  using (public.is_platform_admin() or (public.is_member_of(clinic_id) and not public.is_staff_of(clinic_id)))
  with check (public.is_platform_admin() or (public.is_member_of(clinic_id) and not public.is_staff_of(clinic_id)));
create policy "cases delete" on cases for delete
  using (public.is_platform_admin() or public.is_owner_of(clinic_id));

-- The old catch-all functions remain for backward compatibility of any
-- external tooling, but no policy uses can_manage_patient any more.

update public.schema_migrations
set status = 'applied', applied_at = clock_timestamp()
where version = '003' and status = 'applying';

-- ════════════════════════════════════════════════════════════════
-- 004_security_hardening.sql
-- ════════════════════════════════════════════════════════════════
insert into public.schema_migrations (version, filename, checksum, status)
values ('004', '004_security_hardening.sql', '6791d1c36ad5dc49445aa8d125d3a58d3507bfc82116f5e25d7857688aaf43d7', 'applying');

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

update public.schema_migrations
set status = 'applied', applied_at = clock_timestamp()
where version = '004' and status = 'applying';

-- ════════════════════════════════════════════════════════════════
-- 005_ai_governance.sql
-- ════════════════════════════════════════════════════════════════
insert into public.schema_migrations (version, filename, checksum, status)
values ('005', '005_ai_governance.sql', 'ba749801e2ff443169bf1c939928e8106f04a1f6130336abeeb48d6b0abb2b36', 'applying');

-- AI governance and append-only review trail.
-- Run after 004_security_hardening.sql. The clinical AI route remains disabled
-- unless server configuration and data-processing approval are explicit.

begin;

create table if not exists public.ai_generation_audits (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  case_id uuid references public.cases (id) on delete set null,
  requested_by uuid not null references public.profiles (id) on delete restrict,
  provider text not null check (provider in ('openai')),
  model text not null check (char_length(model) between 1 and 100),
  provider_response_id text,
  prompt_version text not null check (char_length(prompt_version) between 1 and 100),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  context_snapshot jsonb not null,
  output jsonb,
  usage jsonb,
  status text not null check (status in ('generated', 'refused', 'error')),
  safety_signal_ids text[] not null default '{}',
  error_code text,
  created_at timestamptz not null default now(),
  unique (requested_by, request_id),
  check (pg_column_size(context_snapshot) <= 65536),
  check (output is null or pg_column_size(output) <= 131072),
  check ((status = 'generated' and output is not null) or status <> 'generated')
);

create index if not exists ai_generation_audits_rate_limit_idx
  on public.ai_generation_audits (requested_by, created_at desc);
create index if not exists ai_generation_audits_case_idx
  on public.ai_generation_audits (case_id, created_at desc);

create table if not exists public.ai_generation_reviews (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.ai_generation_audits (id) on delete restrict,
  reviewer_id uuid not null references public.profiles (id) on delete restrict,
  decision text not null check (decision in ('accepted', 'edited', 'rejected')),
  edited_output jsonb,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  unique (audit_id, reviewer_id),
  check ((decision = 'edited' and edited_output is not null) or decision <> 'edited'),
  check (edited_output is null or pg_column_size(edited_output) <= 131072)
);

create index if not exists ai_generation_reviews_audit_idx
  on public.ai_generation_reviews (audit_id, created_at desc);

alter table public.ai_generation_audits enable row level security;
alter table public.ai_generation_reviews enable row level security;

revoke all on public.ai_generation_audits from anon, authenticated;
revoke all on public.ai_generation_reviews from anon, authenticated;
grant select on public.ai_generation_audits to authenticated;
grant select on public.ai_generation_reviews to authenticated;

drop policy if exists "ai audit requester or clinic owner read" on public.ai_generation_audits;
create policy "ai audit requester or clinic owner read"
  on public.ai_generation_audits for select to authenticated
  using (
    not private.is_platform_admin()
    and (
      requested_by = auth.uid()
      or private.is_owner_of(clinic_id)
    )
  );

drop policy if exists "ai review visible with audit" on public.ai_generation_reviews;
create policy "ai review visible with audit"
  on public.ai_generation_reviews for select to authenticated
  using (
    exists (
      select 1
      from public.ai_generation_audits audit
      where audit.id = ai_generation_reviews.audit_id
        and not private.is_platform_admin()
        and (
          audit.requested_by = auth.uid()
          or private.is_owner_of(audit.clinic_id)
        )
    )
  );

comment on table public.ai_generation_audits is
  'Append-only server-written snapshots of clinical AI drafts. No client write grants.';
comment on table public.ai_generation_reviews is
  'Append-only clinician accept/edit/reject decisions. Written by a guarded server endpoint.';

commit;

update public.schema_migrations
set status = 'applied', applied_at = clock_timestamp()
where version = '005' and status = 'applying';

-- ════════════════════════════════════════════════════════════════
-- 006_case_episode_linkage.sql
-- ════════════════════════════════════════════════════════════════
insert into public.schema_migrations (version, filename, checksum, status)
values ('006', '006_case_episode_linkage.sql', '3e43851c014184a97c49b8129fca0afd8c1555160f8b8dbf4b7720a58029abd4', 'applying');

-- Bind every new clinician intake case to a real patient and care episode.
-- Run after 005_ai_governance.sql.
--
-- Existing detached rows are preserved for an explicit remediation pass. The
-- NOT VALID constraints protect every new/updated row immediately and can be
-- validated after legacy cases have been linked or archived.

begin;

alter table public.cases
  add column if not exists episode_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.cases'::regclass
      and conname = 'cases_episode_id_fkey'
  ) then
    alter table public.cases
      add constraint cases_episode_id_fkey
      foreign key (episode_id)
      references public.care_episodes (id)
      on delete restrict
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.cases'::regclass
      and conname = 'cases_patient_episode_required_check'
  ) then
    alter table public.cases
      add constraint cases_patient_episode_required_check
      check (patient_id is not null and episode_id is not null)
      not valid;
  end if;
end $$;

create index if not exists cases_episode_id_idx
  on public.cases (episode_id);

create or replace function private.validate_case_episode_linkage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_episode_patient uuid;
  v_episode_clinic uuid;
begin
  if new.patient_id is null or new.episode_id is null then
    raise exception using
      errcode = '23514',
      message = 'A case must be linked to both a patient and a care episode';
  end if;

  select e.patient_id, p.clinic_id
    into v_episode_patient, v_episode_clinic
  from public.care_episodes e
  join public.patients p on p.id = e.patient_id
  where e.id = new.episode_id;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'The selected care episode does not exist';
  end if;
  if v_episode_patient is distinct from new.patient_id then
    raise exception using
      errcode = '23514',
      message = 'The selected care episode belongs to a different patient';
  end if;
  if v_episode_clinic is distinct from new.clinic_id then
    raise exception using
      errcode = '23514',
      message = 'The selected care episode belongs to a different clinic';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_case_episode_linkage() from public;

drop trigger if exists validate_case_episode_linkage on public.cases;
create trigger validate_case_episode_linkage
before insert or update of patient_id, episode_id, clinic_id
on public.cases
for each row execute function private.validate_case_episode_linkage();

-- 004 made patient_id immutable. Replace only the cases trigger so a legacy
-- row may be linked exactly once; an established patient/episode link remains
-- immutable afterwards.
create or replace function private.enforce_case_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.id is distinct from new.id
     or old.clinic_id is distinct from new.clinic_id
     or old.created_by is distinct from new.created_by
     or old.created_at is distinct from new.created_at then
    raise exception using
      errcode = '23514',
      message = 'Case identity, tenant, author, and creation time are immutable';
  end if;

  if old.patient_id is not null
     and old.patient_id is distinct from new.patient_id then
    raise exception using
      errcode = '23514',
      message = 'An established case patient link is immutable';
  end if;
  if old.episode_id is not null
     and old.episode_id is distinct from new.episode_id then
    raise exception using
      errcode = '23514',
      message = 'An established case episode link is immutable';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_case_identity() from public;

drop trigger if exists immutable_identity_fields on public.cases;
create trigger immutable_identity_fields
before update on public.cases
for each row execute function private.enforce_case_identity();

comment on column public.cases.episode_id is
  'Care episode selected at intake; must belong to cases.patient_id and clinic_id.';

commit;

update public.schema_migrations
set status = 'applied', applied_at = clock_timestamp()
where version = '006' and status = 'applying';

-- ════════════════════════════════════════════════════════════════
-- 007_treatment_plan_workflow.sql
-- ════════════════════════════════════════════════════════════════
insert into public.schema_migrations (version, filename, checksum, status)
values ('007', '007_treatment_plan_workflow.sql', 'd7f1d435b952ddfc7a1e74b373eff0a6c95ac8c9a3febbcb1bd38d302c48a68b', 'applying');

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

update public.schema_migrations
set status = 'applied', applied_at = clock_timestamp()
where version = '007' and status = 'applying';

-- ════════════════════════════════════════════════════════════════
-- 008_exercise_prescriptions.sql
-- ════════════════════════════════════════════════════════════════
insert into public.schema_migrations (version, filename, checksum, status)
values ('008', '008_exercise_prescriptions.sql', 'a951f9fd63758acd0bf1eddafc955ea30c4e8ebf42e0a87522950fa83d689e21', 'applying');

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

update public.schema_migrations
set status = 'applied', applied_at = clock_timestamp()
where version = '008' and status = 'applying';

-- ════════════════════════════════════════════════════════════════
-- 009_ai_request_reservations.sql
-- ════════════════════════════════════════════════════════════════
insert into public.schema_migrations (version, filename, checksum, status)
values ('009', '009_ai_request_reservations.sql', 'dec8ce08a3bfc1f1409988db08a8110782b67c79eed836e836cd312fced898c1', 'applying');

-- Atomic clinical-AI request reservation and bounded daily usage.
-- Run after 008_exercise_prescriptions.sql. Provider calls are reserved before
-- leaving the database so retries cannot create duplicate spend for one
-- idempotency key and concurrent requests cannot bypass quota checks.

begin;

alter table public.ai_generation_audits
  add column if not exists completed_at timestamptz;

update public.ai_generation_audits
set completed_at = coalesce(completed_at, created_at)
where status <> 'pending';

alter table public.ai_generation_audits
  drop constraint if exists ai_generation_audits_status_check;
alter table public.ai_generation_audits
  add constraint ai_generation_audits_status_check
  check (status in ('pending', 'generated', 'refused', 'error')) not valid;
alter table public.ai_generation_audits
  validate constraint ai_generation_audits_status_check;

alter table public.ai_generation_audits
  drop constraint if exists ai_generation_audits_completion_check;
alter table public.ai_generation_audits
  add constraint ai_generation_audits_completion_check
  check (
    (
      status = 'pending'
      and completed_at is null
      and output is null
    )
    or (
      status = 'generated'
      and completed_at is not null
      and output is not null
    )
    or (
      status in ('refused', 'error')
      and completed_at is not null
      and output is null
    )
  ) not valid;
alter table public.ai_generation_audits
  validate constraint ai_generation_audits_completion_check;

create index if not exists ai_generation_audits_clinic_quota_idx
  on public.ai_generation_audits (clinic_id, created_at desc);

create or replace function public.reserve_ai_generation(
  p_request_id uuid,
  p_clinic_id uuid,
  p_case_id uuid,
  p_requested_by uuid,
  p_model text,
  p_prompt_version text,
  p_input_hash text,
  p_context_snapshot jsonb,
  p_per_minute_limit integer,
  p_daily_user_limit integer,
  p_daily_clinic_limit integer
)
returns table (
  reservation_outcome text,
  audit_id uuid,
  audit_status text,
  audit_case_id uuid,
  audit_input_hash text,
  audit_prompt_version text,
  audit_model text,
  audit_output jsonb,
  audit_error_code text,
  audit_created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_audit public.ai_generation_audits%rowtype;
  v_case public.cases%rowtype;
  v_count bigint;
  v_now timestamptz := clock_timestamp();
  v_utc_day_start timestamptz :=
    date_trunc('day', clock_timestamp() at time zone 'UTC') at time zone 'UTC';
begin
  if p_request_id is null
     or p_clinic_id is null
     or p_case_id is null
     or p_requested_by is null then
    raise exception using errcode = '22023', message = 'AI reservation identifiers are required';
  end if;
  if p_model is null or char_length(btrim(p_model)) not between 1 and 100
     or p_prompt_version is null
     or char_length(btrim(p_prompt_version)) not between 1 and 100
     or p_input_hash is null
     or p_input_hash !~ '^[0-9a-f]{64}$'
     or p_context_snapshot is null
     or pg_column_size(p_context_snapshot) > 65536 then
    raise exception using errcode = '22023', message = 'Invalid AI reservation metadata';
  end if;
  if p_per_minute_limit not between 1 and 20
     or p_daily_user_limit not between 1 and 1000
     or p_daily_clinic_limit not between 1 and 100000 then
    raise exception using errcode = '22023', message = 'Invalid AI quota configuration';
  end if;

  -- Always take locks in the same order. A hash collision only serializes two
  -- unrelated requests; it cannot grant access or weaken a quota.
  perform pg_advisory_xact_lock(
    hashtextextended('physioai-ai-user:' || p_requested_by::text, 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('physioai-ai-clinic:' || p_clinic_id::text, 0)
  );

  select c.* into v_case
  from public.cases c
  where c.id = p_case_id
    and c.clinic_id = p_clinic_id;
  if not found then
    raise exception using errcode = '42501', message = 'Case is unavailable for AI generation';
  end if;

  if not exists (
    select 1
    from public.profiles profile
    join public.clinic_members membership
      on membership.user_id = profile.id
     and membership.clinic_id = p_clinic_id
    where profile.id = p_requested_by
      and profile.role in ('clinic_owner', 'therapist')
      and membership.member_role in ('clinic_owner', 'therapist')
      and (
        membership.member_role = 'clinic_owner'
        or v_case.created_by = p_requested_by
        or exists (
          select 1
          from public.patient_therapists assignment
          where assignment.patient_id = v_case.patient_id
            and assignment.therapist_id = p_requested_by
        )
      )
  ) then
    raise exception using errcode = '42501', message = 'Clinician cannot reserve AI generation for this case';
  end if;

  select audit.* into v_audit
  from public.ai_generation_audits audit
  where audit.requested_by = p_requested_by
    and audit.request_id = p_request_id
  for update;

  if found then
    if v_audit.case_id is distinct from p_case_id
       or v_audit.clinic_id is distinct from p_clinic_id
       or v_audit.input_hash is distinct from p_input_hash
       or v_audit.prompt_version is distinct from p_prompt_version then
      return query select
        'conflict'::text, v_audit.id, v_audit.status, v_audit.case_id,
        v_audit.input_hash, v_audit.prompt_version, v_audit.model,
        v_audit.output, v_audit.error_code, v_audit.created_at;
      return;
    end if;

    if v_audit.status = 'pending'
       and v_audit.created_at < v_now - interval '2 minutes' then
      update public.ai_generation_audits
      set status = 'error',
          error_code = 'reservation_expired',
          completed_at = v_now
      where id = v_audit.id
      returning * into v_audit;
    end if;

    return query select
      'existing'::text, v_audit.id, v_audit.status, v_audit.case_id,
      v_audit.input_hash, v_audit.prompt_version, v_audit.model,
      v_audit.output, v_audit.error_code, v_audit.created_at;
    return;
  end if;

  select count(*) into v_count
  from public.ai_generation_audits audit
  where audit.requested_by = p_requested_by
    and audit.created_at >= v_now - interval '1 minute';
  if v_count >= p_per_minute_limit then
    return query select
      'minute_limit'::text, null::uuid, null::text, null::uuid,
      null::text, null::text, null::text, null::jsonb, null::text,
      null::timestamptz;
    return;
  end if;

  select count(*) into v_count
  from public.ai_generation_audits audit
  where audit.requested_by = p_requested_by
    and audit.created_at >= v_utc_day_start;
  if v_count >= p_daily_user_limit then
    return query select
      'user_daily_limit'::text, null::uuid, null::text, null::uuid,
      null::text, null::text, null::text, null::jsonb, null::text,
      null::timestamptz;
    return;
  end if;

  select count(*) into v_count
  from public.ai_generation_audits audit
  where audit.clinic_id = p_clinic_id
    and audit.created_at >= v_utc_day_start;
  if v_count >= p_daily_clinic_limit then
    return query select
      'clinic_daily_limit'::text, null::uuid, null::text, null::uuid,
      null::text, null::text, null::text, null::jsonb, null::text,
      null::timestamptz;
    return;
  end if;

  insert into public.ai_generation_audits (
    request_id, clinic_id, case_id, requested_by, provider, model,
    prompt_version, input_hash, context_snapshot, status, safety_signal_ids,
    created_at, completed_at
  ) values (
    p_request_id, p_clinic_id, p_case_id, p_requested_by, 'openai',
    btrim(p_model), btrim(p_prompt_version), p_input_hash,
    p_context_snapshot, 'pending', '{}', v_now, null
  )
  returning * into v_audit;

  return query select
    'reserved'::text, v_audit.id, v_audit.status, v_audit.case_id,
    v_audit.input_hash, v_audit.prompt_version, v_audit.model,
    v_audit.output, v_audit.error_code, v_audit.created_at;
end;
$$;

create or replace function public.complete_ai_generation(
  p_audit_id uuid,
  p_requested_by uuid,
  p_status text,
  p_model text,
  p_provider_response_id text,
  p_output jsonb,
  p_usage jsonb,
  p_error_code text
)
returns table (
  audit_id uuid,
  audit_status text,
  audit_model text,
  audit_output jsonb,
  audit_error_code text,
  audit_created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_audit public.ai_generation_audits%rowtype;
begin
  if p_audit_id is null or p_requested_by is null
     or p_status not in ('generated', 'refused', 'error')
     or p_model is null or char_length(btrim(p_model)) not between 1 and 100
     or (p_provider_response_id is not null and char_length(p_provider_response_id) > 255)
     or (p_error_code is not null and char_length(p_error_code) > 100)
     or (p_usage is not null and pg_column_size(p_usage) > 65536)
     or (p_output is not null and pg_column_size(p_output) > 131072)
     or (p_status = 'generated' and p_output is null)
     or (p_status <> 'generated' and p_output is not null) then
    raise exception using errcode = '22023', message = 'Invalid AI completion metadata';
  end if;

  select audit.* into v_audit
  from public.ai_generation_audits audit
  where audit.id = p_audit_id
    and audit.requested_by = p_requested_by
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'AI reservation is unavailable';
  end if;
  if v_audit.status <> 'pending' then
    raise exception using errcode = '55000', message = 'AI reservation is already complete';
  end if;

  update public.ai_generation_audits
  set status = p_status,
      model = btrim(p_model),
      provider_response_id = p_provider_response_id,
      output = p_output,
      usage = p_usage,
      error_code = p_error_code,
      completed_at = clock_timestamp()
  where id = p_audit_id
  returning * into v_audit;

  return query select
    v_audit.id, v_audit.status, v_audit.model, v_audit.output,
    v_audit.error_code, v_audit.created_at;
end;
$$;

revoke all on function public.reserve_ai_generation(
  uuid, uuid, uuid, uuid, text, text, text, jsonb, integer, integer, integer
) from public, anon, authenticated;
revoke all on function public.complete_ai_generation(
  uuid, uuid, text, text, text, jsonb, jsonb, text
) from public, anon, authenticated;
grant execute on function public.reserve_ai_generation(
  uuid, uuid, uuid, uuid, text, text, text, jsonb, integer, integer, integer
) to service_role;
grant execute on function public.complete_ai_generation(
  uuid, uuid, text, text, text, jsonb, jsonb, text
) to service_role;

revoke insert, update, delete, truncate
  on table public.ai_generation_audits from service_role;
grant select on table public.ai_generation_audits to service_role;

comment on function public.reserve_ai_generation(
  uuid, uuid, uuid, uuid, text, text, text, jsonb, integer, integer, integer
) is 'Service-only atomic idempotency reservation and user/clinic clinical-AI quota gate.';
comment on function public.complete_ai_generation(
  uuid, uuid, text, text, text, jsonb, jsonb, text
) is 'Service-only one-way completion of a pending clinical-AI audit reservation.';

commit;

update public.schema_migrations
set status = 'applied', applied_at = clock_timestamp()
where version = '009' and status = 'applying';

-- ════════════════════════════════════════════════════════════════
-- 010_ai_review_hardening.sql
-- ════════════════════════════════════════════════════════════════
insert into public.schema_migrations (version, filename, checksum, status)
values ('010', '010_ai_review_hardening.sql', '6a8a9f3f524d3586abbb15b676a93fe17019383612eb40c803cc5c0aa1f90966', 'applying');

-- Atomic, service-only clinician review workflow for generated AI drafts.
-- Run after 009_ai_request_reservations.sql.

begin;

create or replace function public.record_ai_generation_review(
  p_audit_id uuid,
  p_reviewer_id uuid,
  p_decision text,
  p_edited_output jsonb,
  p_notes text
)
returns table (
  review_outcome text,
  review_id uuid,
  review_decision text,
  review_created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_audit public.ai_generation_audits%rowtype;
  v_review public.ai_generation_reviews%rowtype;
  v_created boolean := false;
begin
  if p_audit_id is null
     or p_reviewer_id is null
     or p_decision not in ('accepted', 'edited', 'rejected')
     or (p_decision = 'edited' and p_edited_output is null)
     or (p_decision <> 'edited' and p_edited_output is not null)
     or (p_edited_output is not null and pg_column_size(p_edited_output) > 131072)
     or (p_notes is not null and char_length(btrim(p_notes)) > 2000) then
    raise exception using errcode = '22023', message = 'Invalid AI review metadata';
  end if;

  select audit.* into v_audit
  from public.ai_generation_audits audit
  where audit.id = p_audit_id
  for share;
  if not found or v_audit.status <> 'generated' or v_audit.output is null then
    raise exception using errcode = '23514', message = 'Only generated AI drafts can be reviewed';
  end if;

  if not exists (
    select 1
    from public.profiles profile
    join public.clinic_members membership
      on membership.user_id = profile.id
     and membership.clinic_id = v_audit.clinic_id
    where profile.id = p_reviewer_id
      and profile.role in ('clinic_owner', 'therapist')
      and membership.member_role in ('clinic_owner', 'therapist')
      and (
        v_audit.requested_by = p_reviewer_id
        or membership.member_role = 'clinic_owner'
      )
  ) then
    raise exception using errcode = '42501', message = 'Clinician cannot review this AI generation';
  end if;

  insert into public.ai_generation_reviews (
    audit_id, reviewer_id, decision, edited_output, notes
  ) values (
    p_audit_id, p_reviewer_id, p_decision, p_edited_output,
    nullif(btrim(p_notes), '')
  )
  on conflict (audit_id, reviewer_id) do nothing
  returning * into v_review;

  if found then
    v_created := true;
  else
    select review.* into strict v_review
    from public.ai_generation_reviews review
    where review.audit_id = p_audit_id
      and review.reviewer_id = p_reviewer_id;
  end if;

  return query select
    case when v_created then 'created' else 'existing' end::text,
    v_review.id, v_review.decision, v_review.created_at;
end;
$$;

revoke all on function public.record_ai_generation_review(
  uuid, uuid, text, jsonb, text
) from public, anon, authenticated;
grant execute on function public.record_ai_generation_review(
  uuid, uuid, text, jsonb, text
) to service_role;

revoke insert, update, delete, truncate
  on table public.ai_generation_reviews from service_role;
grant select on table public.ai_generation_reviews to service_role;

comment on function public.record_ai_generation_review(
  uuid, uuid, text, jsonb, text
) is 'Service-only idempotent accept/edit/reject record for a completed AI generation.';

commit;

update public.schema_migrations
set status = 'applied', applied_at = clock_timestamp()
where version = '010' and status = 'applying';

-- ════════════════════════════════════════════════════════════════
-- 011_treatment_plan_validation.sql
-- ════════════════════════════════════════════════════════════════
insert into public.schema_migrations (version, filename, checksum, status)
values ('011', '011_treatment_plan_validation.sql', 'f7b25ef5978b0f4a9cff053dd817ac6b638e6945f8d9246b67d977b8b5ea8732', 'applying');

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

update public.schema_migrations
set status = 'applied', applied_at = clock_timestamp()
where version = '011' and status = 'applying';

-- ════════════════════════════════════════════════════════════════
-- 012_access_and_ai_race_hardening.sql
-- ════════════════════════════════════════════════════════════════
insert into public.schema_migrations (version, filename, checksum, status)
values ('012', '012_access_and_ai_race_hardening.sql', 'b44f86af25d6dddb26da43ee365c058a3587284d97f77235cd10c854bb3217fc', 'applying');

-- Follow-up access hardening and clinical-AI race protection.
-- Run after 011_treatment_plan_validation.sql.

begin;

-- Membership helpers must also respect the user's current global role. This
-- prevents stale/mismatched membership rows from silently restoring access.
create or replace function private.is_member_of(p_clinic uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clinic_members membership
    join public.profiles profile on profile.id = membership.user_id
    where membership.clinic_id = p_clinic
      and membership.user_id = auth.uid()
      and (
        (membership.member_role = 'clinic_owner' and profile.role = 'clinic_owner')
        or (
          membership.member_role = 'therapist'
          and profile.role in ('clinic_owner', 'therapist')
        )
        or (
          membership.member_role = 'clinic_staff'
          and profile.role = 'clinic_staff'
        )
      )
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
    from public.clinic_members membership
    join public.profiles profile on profile.id = membership.user_id
    where membership.clinic_id = p_clinic
      and membership.user_id = auth.uid()
      and membership.member_role = 'clinic_owner'
      and profile.role = 'clinic_owner'
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
    from public.clinic_members membership
    join public.profiles profile on profile.id = membership.user_id
    where membership.clinic_id = p_clinic
      and membership.user_id = auth.uid()
      and membership.member_role = 'clinic_staff'
      and profile.role = 'clinic_staff'
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
    from public.patient_therapists assignment
    join public.patients patient on patient.id = assignment.patient_id
    join public.clinic_members membership
      on membership.clinic_id = patient.clinic_id
     and membership.user_id = assignment.therapist_id
     and membership.member_role = 'therapist'
    join public.profiles profile on profile.id = assignment.therapist_id
    where assignment.patient_id = p_patient
      and assignment.therapist_id = auth.uid()
      and profile.role in ('clinic_owner', 'therapist')
  );
$$;

create or replace function private.guard_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is not distinct from old.role then
    return new;
  end if;

  if auth.uid() is not null then
    if auth.uid() = old.id then
      raise exception using errcode = '42501', message = 'Users cannot change their own global role';
    end if;
    if not private.is_platform_admin() then
      raise exception using errcode = '42501', message = 'Only a platform admin can change roles';
    end if;
  end if;

  if (old.role = 'platform_admin' or new.role = 'platform_admin')
     and exists (
       select 1 from public.clinic_members membership
       where membership.user_id = old.id
     ) then
    raise exception using
      errcode = '23514',
      message = 'Remove every clinic membership before entering or leaving the platform_admin role';
  end if;
  return new;
end;
$$;

create or replace function private.reject_platform_admin_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.profiles profile
    where profile.id = new.user_id and profile.role = 'platform_admin'
  ) then
    raise exception using
      errcode = '23514',
      message = 'A platform administrator cannot also hold clinic membership';
  end if;
  return new;
end;
$$;

revoke all on function private.reject_platform_admin_membership() from public;

-- Do not silently carry a forbidden legacy overlap into the new policy. An
-- operator must explicitly remove the membership and rerun this migration.
do $$
begin
  if exists (
    select 1
    from public.clinic_members membership
    join public.profiles profile on profile.id = membership.user_id
    where profile.role = 'platform_admin'
  ) then
    raise exception using
      errcode = '23514',
      message = 'Remove platform administrator clinic memberships before applying migration 012';
  end if;
end;
$$;

drop trigger if exists clinic_members_reject_platform_admin
  on public.clinic_members;
create trigger clinic_members_reject_platform_admin
before insert or update of user_id on public.clinic_members
for each row execute function private.reject_platform_admin_membership();

-- Explicit-user authorization used by service-only AI operations. It mirrors
-- clinician case access without depending on the service role's auth.uid().
create or replace function private.clinician_can_access_ai_case(
  p_user_id uuid,
  p_case_id uuid,
  p_clinic_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.cases patient_case
    join public.profiles profile on profile.id = p_user_id
    join public.clinic_members membership
      on membership.clinic_id = patient_case.clinic_id
     and membership.user_id = p_user_id
    where patient_case.id = p_case_id
      and patient_case.clinic_id = p_clinic_id
      and profile.role in ('clinic_owner', 'therapist')
      and membership.member_role in ('clinic_owner', 'therapist')
      and (
        (
          profile.role = 'clinic_owner'
          and membership.member_role = 'clinic_owner'
        )
        or exists (
          select 1
          from public.patient_therapists assignment
          where assignment.patient_id = patient_case.patient_id
            and assignment.therapist_id = p_user_id
        )
      )
  );
$$;

create or replace function private.can_read_ai_audit(
  p_requested_by uuid,
  p_case_id uuid,
  p_clinic_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not private.is_platform_admin()
    and private.clinician_can_access_ai_case(
      auth.uid(), p_case_id, p_clinic_id
    )
    and (
      p_requested_by = auth.uid()
      or private.is_owner_of(p_clinic_id)
    );
$$;

drop policy if exists "ai audit requester or clinic owner read"
  on public.ai_generation_audits;
create policy "ai audit requester or clinic owner read"
  on public.ai_generation_audits for select to authenticated
  using (private.can_read_ai_audit(requested_by, case_id, clinic_id));

drop policy if exists "ai review visible with audit"
  on public.ai_generation_reviews;
create policy "ai review visible with audit"
  on public.ai_generation_reviews for select to authenticated
  using (
    exists (
      select 1
      from public.ai_generation_audits audit
      where audit.id = ai_generation_reviews.audit_id
        and private.can_read_ai_audit(
          audit.requested_by, audit.case_id, audit.clinic_id
        )
    )
  );

-- Recheck authorization and safety inside the reservation transaction and
-- again when the provider result returns. If either changed while the model
-- was running, convert the completion to a refused audit and discard output.
create or replace function private.guard_ai_generation_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.cases%rowtype;
  v_must_validate boolean := false;
  v_valid boolean := false;
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    v_must_validate := true;
  elsif tg_op = 'UPDATE'
        and old.status = 'pending'
        and new.status = 'generated' then
    v_must_validate := true;
  end if;
  if not v_must_validate then
    return new;
  end if;

  select patient_case.* into v_case
  from public.cases patient_case
  where patient_case.id = new.case_id
    and patient_case.clinic_id = new.clinic_id
  for share;

  v_valid := found
    and v_case.safety_screened_at is not null
    and v_case.safety_disposition = 'clear'
    and cardinality(v_case.red_flag_ids) = 0
    and private.clinician_can_access_ai_case(
      new.requested_by, new.case_id, new.clinic_id
    );

  if v_valid then
    return new;
  end if;
  if tg_op = 'INSERT' then
    raise exception using
      errcode = '23514',
      message = 'Current case safety and clinician access are required for AI reservation';
  end if;

  new.status := 'refused';
  new.output := null;
  new.error_code := 'authorization_or_safety_changed';
  new.completed_at := coalesce(new.completed_at, clock_timestamp());
  return new;
end;
$$;

revoke all on function private.guard_ai_generation_transition() from public;
drop trigger if exists ai_generation_guard_transition
  on public.ai_generation_audits;
create trigger ai_generation_guard_transition
before insert or update of status, output on public.ai_generation_audits
for each row execute function private.guard_ai_generation_transition();

create or replace function private.guard_ai_generation_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_audit public.ai_generation_audits%rowtype;
  v_case public.cases%rowtype;
begin
  select audit.* into v_audit
  from public.ai_generation_audits audit
  where audit.id = new.audit_id
  for share;
  if not found or v_audit.status <> 'generated' then
    raise exception using errcode = '23514', message = 'AI generation is not reviewable';
  end if;

  select patient_case.* into v_case
  from public.cases patient_case
  where patient_case.id = v_audit.case_id
    and patient_case.clinic_id = v_audit.clinic_id
  for share;
  if not found
     or v_case.safety_screened_at is null
     or v_case.safety_disposition <> 'clear'
     or cardinality(v_case.red_flag_ids) <> 0
     or not private.clinician_can_access_ai_case(
       new.reviewer_id, v_audit.case_id, v_audit.clinic_id
     )
     or not (
       new.reviewer_id = v_audit.requested_by
       or exists (
         select 1
         from public.profiles profile
         join public.clinic_members membership
           on membership.user_id = profile.id
          and membership.clinic_id = v_audit.clinic_id
         where profile.id = new.reviewer_id
           and profile.role = 'clinic_owner'
           and membership.member_role = 'clinic_owner'
       )
     ) then
    raise exception using
      errcode = '23514',
      message = 'Current case safety and clinician access are required for AI review';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_ai_generation_review() from public;
drop trigger if exists ai_generation_review_guard
  on public.ai_generation_reviews;
create trigger ai_generation_review_guard
before insert on public.ai_generation_reviews
for each row execute function private.guard_ai_generation_review();

revoke all on function private.clinician_can_access_ai_case(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.can_read_ai_audit(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
-- RLS policies execute as the querying role, so this one guarded helper must
-- remain executable by authenticated. It returns no row contents itself and
-- rechecks current case access before permitting the policy row.
grant execute on function private.can_read_ai_audit(uuid, uuid, uuid)
  to authenticated;

commit;

update public.schema_migrations
set status = 'applied', applied_at = clock_timestamp()
where version = '012' and status = 'applying';

-- ════════════════════════════════════════════════════════════════
-- 013_clinical_safety_and_portal_controls.sql
-- ════════════════════════════════════════════════════════════════
insert into public.schema_migrations (version, filename, checksum, status)
values ('013', '013_clinical_safety_and_portal_controls.sql', 'c7010674cd136270388b885148ef7a43249af401732675afeae295dd3703a909', 'applying');

-- Append-only safety screening plus patient-portal lifecycle enforcement.
-- Run after 012_access_and_ai_race_hardening.sql.

begin;

-- --------------------------------------------------------------------------
-- 1) A server-owned red-flag catalog and append-only screen history
-- --------------------------------------------------------------------------

create table if not exists public.safety_red_flag_catalog (
  id text primary key,
  disposition text not null
    check (disposition in ('medical-review', 'urgent', 'emergency')),
  severity_rank smallint not null check (severity_rank between 1 and 3),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (char_length(id) between 3 and 100)
);

insert into public.safety_red_flag_catalog (id, disposition, severity_rank)
values
  ('rf_cancer', 'medical-review', 1),
  ('rf_weightloss', 'medical-review', 1),
  ('rf_nightpain', 'medical-review', 1),
  ('rf_fracture_trauma', 'urgent', 2),
  ('rf_fracture_osteo', 'urgent', 2),
  ('rf_steroids', 'medical-review', 1),
  ('rf_fever', 'urgent', 2),
  ('rf_ivdu', 'urgent', 2),
  ('rf_immuno', 'medical-review', 1),
  ('rf_ce_saddle', 'emergency', 3),
  ('rf_ce_bladder', 'emergency', 3),
  ('rf_ce_sexual', 'emergency', 3),
  ('rf_neuro_progressive', 'urgent', 2),
  ('rf_neuro_bilateral', 'urgent', 2),
  ('rf_dvt_calf', 'urgent', 2),
  ('rf_dvt_risk', 'medical-review', 1),
  ('rf_cardiac_chest', 'emergency', 3),
  ('rf_cardiac_breath', 'emergency', 3),
  ('rf_severe_pain', 'urgent', 2)
on conflict (id) do update
set disposition = excluded.disposition,
    severity_rank = excluded.severity_rank;

alter table public.safety_red_flag_catalog enable row level security;
revoke all on table public.safety_red_flag_catalog
  from public, anon, authenticated, service_role;
grant select on table public.safety_red_flag_catalog to authenticated;
drop policy if exists "authenticated red flag catalog read"
  on public.safety_red_flag_catalog;
create policy "authenticated red flag catalog read"
  on public.safety_red_flag_catalog for select to authenticated
  using (active);

alter table public.cases
  add column if not exists safety_action_taken text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cases'::regclass
      and conname = 'cases_safety_action_length_check'
  ) then
    alter table public.cases
      add constraint cases_safety_action_length_check
      check (
        safety_action_taken is null
        or char_length(btrim(safety_action_taken)) between 3 and 4000
      ) not valid;
  end if;
end $$;

create table if not exists public.case_safety_screens (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete restrict,
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  disposition text not null
    check (disposition in ('clear', 'medical-review', 'urgent', 'emergency')),
  red_flag_ids text[] not null default '{}'::text[],
  notes text,
  action_taken text,
  screened_by uuid not null references public.profiles (id) on delete restrict,
  screened_at timestamptz not null,
  source text not null default 'clinician'
    check (source in ('clinician', 'legacy-import')),
  created_at timestamptz not null default now(),
  unique (case_id, screened_at),
  check (cardinality(red_flag_ids) <= 100),
  check (array_position(red_flag_ids, null) is null),
  check (notes is null or char_length(notes) <= 10000),
  check (action_taken is null or char_length(action_taken) <= 4000),
  check (
    (disposition = 'clear' and cardinality(red_flag_ids) = 0)
    or
    (disposition <> 'clear' and cardinality(red_flag_ids) > 0)
  )
);

create index if not exists case_safety_screens_case_time_idx
  on public.case_safety_screens (case_id, screened_at desc);
create index if not exists case_safety_screens_patient_time_idx
  on public.case_safety_screens (patient_id, screened_at desc);

alter table public.case_safety_screens enable row level security;
revoke all on table public.case_safety_screens
  from public, anon, authenticated, service_role;
grant select on table public.case_safety_screens to authenticated;

drop policy if exists "case safety history clinician read"
  on public.case_safety_screens;
create policy "case safety history clinician read"
  on public.case_safety_screens for select to authenticated
  using (
    private.can_manage_clinical_record(patient_id)
  );

create or replace function private.reject_case_safety_history_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'Case safety history is append-only';
end;
$$;

revoke all on function private.reject_case_safety_history_mutation()
  from public, anon, authenticated, service_role;
drop trigger if exists case_safety_history_immutable
  on public.case_safety_screens;
create trigger case_safety_history_immutable
before update or delete on public.case_safety_screens
for each row execute function private.reject_case_safety_history_mutation();

-- --------------------------------------------------------------------------
-- 2) Preserve treatment-plan signatures when a plan is superseded
-- --------------------------------------------------------------------------

alter table public.treatment_plans
  add column if not exists superseded_by uuid
    references public.profiles (id) on delete restrict,
  add column if not exists superseded_at timestamptz,
  add column if not exists supersede_reason text;

update public.treatment_plans
set superseded_by = coalesce(superseded_by, reviewed_by),
    superseded_at = coalesce(superseded_at, reviewed_at, created_at),
    supersede_reason = coalesce(
      supersede_reason,
      nullif(review_note, ''),
      'Legacy supersede event imported'
    )
where status = 'superseded'
  and (superseded_by is null or superseded_at is null);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.treatment_plans'::regclass
      and conname = 'treatment_plans_supersede_metadata_check'
  ) then
    alter table public.treatment_plans
      add constraint treatment_plans_supersede_metadata_check
      check (
        (
          status = 'superseded'
          and superseded_by is not null
          and superseded_at is not null
          and char_length(btrim(supersede_reason)) between 3 and 2000
        )
        or
        (
          status <> 'superseded'
          and superseded_by is null
          and superseded_at is null
          and supersede_reason is null
        )
      ) not valid;
  end if;
end $$;

drop index if exists public.treatment_plans_one_approved_case_idx;
create unique index if not exists treatment_plans_one_approved_episode_idx
  on public.treatment_plans (episode_id)
  where status = 'approved';

-- --------------------------------------------------------------------------
-- 3) The only supported update path for an existing case safety screen
-- --------------------------------------------------------------------------

create or replace function public.record_case_safety_screen(
  p_case_id uuid,
  p_red_flag_ids text[],
  p_notes text default null,
  p_action_taken text default null
)
returns table (
  screen_id uuid,
  case_id uuid,
  disposition text,
  red_flag_ids text[],
  notes text,
  action_taken text,
  screened_by uuid,
  screened_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_case public.cases%rowtype;
  v_flags text[];
  v_disposition text;
  v_notes text := nullif(btrim(p_notes), '');
  v_action text := nullif(btrim(p_action_taken), '');
  v_screen public.case_safety_screens%rowtype;
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using
      errcode = '42501', message = 'Clinician authentication is required';
  end if;
  if p_case_id is null
     or (v_notes is not null and char_length(v_notes) > 10000)
     or (v_action is not null and char_length(v_action) > 4000) then
    raise exception using errcode = '22023', message = 'Safety-screen input is invalid';
  end if;

  select coalesce(array_agg(flag_id order by flag_id), '{}'::text[])
    into v_flags
  from (
    select distinct btrim(value) as flag_id
    from unnest(coalesce(p_red_flag_ids, '{}'::text[])) as flags(value)
    where btrim(value) <> ''
  ) normalized;

  if cardinality(v_flags) > 100
     or exists (
       select 1
       from unnest(v_flags) flag_id
       left join public.safety_red_flag_catalog catalog
         on catalog.id = flag_id and catalog.active
       where catalog.id is null
     ) then
    raise exception using errcode = '22023', message = 'Safety-screen flags are invalid';
  end if;

  if cardinality(v_flags) = 0 then
    v_disposition := 'clear';
    v_action := null;
  else
    select catalog.disposition into v_disposition
    from public.safety_red_flag_catalog catalog
    where catalog.id = any(v_flags)
    order by catalog.severity_rank desc
    limit 1;
    if v_action is null or char_length(v_action) < 3 then
      raise exception using
        errcode = '22023',
        message = 'Documented escalation or referral action is required';
    end if;
  end if;

  select patient_case.* into v_case
  from public.cases patient_case
  where patient_case.id = p_case_id
  for update;
  if not found or v_case.patient_id is null or v_case.episode_id is null then
    raise exception using errcode = '22023', message = 'A linked case is required';
  end if;
  if not private.clinician_can_access_ai_case(
    v_actor, v_case.id, v_case.clinic_id
  ) then
    raise exception using errcode = '42501', message = 'Case access is not permitted';
  end if;

  update public.cases patient_case
  set red_flag_ids = v_flags,
      safety_disposition = v_disposition,
      safety_notes = v_notes,
      safety_action_taken = v_action,
      -- Force a new attestation event even when the clinical result is the
      -- same as the previous screen. The trigger replaces this with its own
      -- trusted clock value and appends a distinct history row.
      safety_screened_at = clock_timestamp()
  where patient_case.id = v_case.id
  returning patient_case.* into v_case;

  select history.* into v_screen
  from public.case_safety_screens history
  where history.case_id = v_case.id
    and history.screened_at = v_case.safety_screened_at;
  if not found then
    raise exception using errcode = '55000', message = 'Safety history was not recorded';
  end if;

  return query select
    v_screen.id, v_screen.case_id, v_screen.disposition,
    v_screen.red_flag_ids, v_screen.notes, v_screen.action_taken,
    v_screen.screened_by, v_screen.screened_at;
end;
$$;

revoke all on function public.record_case_safety_screen(
  uuid, text[], text, text
) from public, anon, service_role;
grant execute on function public.record_case_safety_screen(
  uuid, text[], text, text
) to authenticated;

-- Safety fields on existing cases may only be changed while running the
-- security-definer workflow above. Direct PostgREST UPDATE is rejected.
create or replace function private.stamp_case_safety_screen()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_changed boolean := false;
  v_rpc_owner text;
begin
  if tg_op = 'INSERT' then
    v_changed := true;
  else
    v_changed := new.safety_disposition is distinct from old.safety_disposition
      or new.red_flag_ids is distinct from old.red_flag_ids
      or new.safety_notes is distinct from old.safety_notes
      or new.safety_action_taken is distinct from old.safety_action_taken
      or new.safety_screened_by is distinct from old.safety_screened_by
      or new.safety_screened_at is distinct from old.safety_screened_at;
  end if;
  if not v_changed then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    select pg_catalog.pg_get_userbyid(proc.proowner)
      into v_rpc_owner
    from pg_catalog.pg_proc proc
    where proc.oid =
      'public.record_case_safety_screen(uuid,text[],text,text)'::regprocedure;
    if current_user::text is distinct from v_rpc_owner then
      raise exception using
        errcode = '42501',
        message = 'Use record_case_safety_screen to change safety state';
    end if;
  end if;

  new.red_flag_ids := coalesce(new.red_flag_ids, '{}'::text[]);
  if new.safety_disposition = 'not-screened' then
    new.red_flag_ids := '{}'::text[];
    new.safety_notes := null;
    new.safety_action_taken := null;
    new.safety_screened_by := null;
    new.safety_screened_at := null;
  elsif auth.uid() is null then
    raise exception using
      errcode = '23514',
      message = 'A completed safety screen requires an authenticated reviewer';
  else
    new.safety_screened_by := auth.uid();
    new.safety_screened_at := clock_timestamp();
  end if;
  return new;
end;
$$;

drop trigger if exists cases_stamp_safety_screen on public.cases;
create trigger cases_stamp_safety_screen
before insert or update of safety_disposition, red_flag_ids, safety_notes,
  safety_action_taken, safety_screened_by, safety_screened_at
on public.cases
for each row execute function private.stamp_case_safety_screen();

create or replace function private.persist_case_safety_effects()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.safety_screened_at is null
     or (
       tg_op = 'UPDATE'
       and new.safety_screened_at is not distinct from old.safety_screened_at
     ) then
    return new;
  end if;

  insert into public.case_safety_screens (
    case_id, clinic_id, patient_id, disposition, red_flag_ids,
    notes, action_taken, screened_by, screened_at
  ) values (
    new.id, new.clinic_id, new.patient_id, new.safety_disposition,
    new.red_flag_ids, new.safety_notes, new.safety_action_taken,
    new.safety_screened_by, new.safety_screened_at
  ) on conflict (case_id, screened_at) do nothing;

  if new.safety_disposition <> 'clear' then
    update public.exercise_prescriptions prescription
    set status = 'revoked',
        revoked_by = new.safety_screened_by,
        revoked_at = clock_timestamp()
    where prescription.case_id = new.id
      and prescription.status = 'published';

    update public.treatment_plans plan
    set status = 'superseded',
        superseded_by = new.safety_screened_by,
        superseded_at = clock_timestamp(),
        supersede_reason = 'Invalidated by a non-clear safety re-screen'
    where plan.episode_id = new.episode_id
      and plan.status = 'approved';
  end if;
  return new;
end;
$$;

revoke all on function private.persist_case_safety_effects()
  from public, anon, authenticated, service_role;
drop trigger if exists cases_persist_safety_effects on public.cases;
create trigger cases_persist_safety_effects
after insert or update of safety_disposition, red_flag_ids, safety_notes,
  safety_action_taken, safety_screened_by, safety_screened_at
on public.cases
for each row execute function private.persist_case_safety_effects();

-- Backfill a single historical event for pre-migration completed screens.
insert into public.case_safety_screens (
  case_id, clinic_id, patient_id, disposition, red_flag_ids,
  notes, action_taken, screened_by, screened_at, source
)
select
  patient_case.id, patient_case.clinic_id, patient_case.patient_id,
  patient_case.safety_disposition, patient_case.red_flag_ids,
  patient_case.safety_notes, patient_case.safety_action_taken,
  patient_case.safety_screened_by, patient_case.safety_screened_at,
  'legacy-import'
from public.cases patient_case
where patient_case.patient_id is not null
  and patient_case.safety_screened_at is not null
on conflict (case_id, screened_at) do nothing;

drop trigger if exists audit_row_change on public.case_safety_screens;
create trigger audit_row_change
after insert on public.case_safety_screens
for each row execute function private.write_audit_log();

-- --------------------------------------------------------------------------
-- 4) Safety-aware treatment-plan review without destroying prior signatures
-- --------------------------------------------------------------------------

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
  from public.treatment_plans plan
  where plan.id = p_plan_id
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
    from public.cases patient_case
    where patient_case.id = v_plan.case_id
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

  perform pg_advisory_xact_lock(hashtextextended(v_plan.episode_id::text, 0));
  if v_status = 'approved' then
    update public.treatment_plans plan
    set status = 'superseded',
        superseded_by = v_actor,
        superseded_at = clock_timestamp(),
        supersede_reason = 'Superseded by a newly approved version'
    where plan.episode_id = v_plan.episode_id
      and plan.status = 'approved';
  end if;

  update public.treatment_plans plan
  set status = v_status,
      reviewed_by = v_actor,
      reviewed_at = clock_timestamp(),
      review_note = v_note
  where plan.id = p_plan_id
  returning plan.* into v_plan;

  return query select
    v_plan.id, v_plan.version, v_plan.status, v_plan.reviewed_at;
end;
$$;

-- Do not reveal prescription/plan workflow state to a caller who no longer
-- has current access. Authorization is checked before status-specific errors.
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
  from public.treatment_plans plan
  where plan.id = p_treatment_plan_id
  for share;
  if not found then
    raise exception using errcode = '42501', message = 'Prescription access is not permitted';
  end if;
  if not private.can_manage_clinical_record(v_plan.patient_id) then
    raise exception using errcode = '42501', message = 'Prescription access is not permitted';
  end if;
  if v_plan.status <> 'approved' then
    raise exception using errcode = '23514', message = 'An approved treatment plan is required';
  end if;

  select * into v_case
  from public.cases patient_case
  where patient_case.id = v_plan.case_id
  for share;
  if not found
     or v_case.safety_screened_at is null
     or v_case.safety_disposition <> 'clear'
     or cardinality(v_case.red_flag_ids) <> 0 then
    raise exception using errcode = '23514', message = 'Current clear safety screening is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_plan.episode_id::text, 0));
  select coalesce(max(prescription.version), 0) + 1 into v_version
  from public.exercise_prescriptions prescription
  where prescription.episode_id = v_plan.episode_id;

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
  from public.exercise_prescriptions prescription
  where prescription.id = p_prescription_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'Prescription access is not permitted';
  end if;
  if not private.can_manage_clinical_record(v_prescription.patient_id) then
    raise exception using errcode = '42501', message = 'Prescription access is not permitted';
  end if;
  if v_prescription.status <> 'draft' then
    raise exception using errcode = '23514', message = 'A draft prescription is required';
  end if;

  select * into v_plan
  from public.treatment_plans plan
  where plan.id = v_prescription.treatment_plan_id
  for share;
  if not found or v_plan.status <> 'approved' then
    raise exception using errcode = '23514', message = 'Treatment-plan approval is no longer current';
  end if;
  select * into v_case
  from public.cases patient_case
  where patient_case.id = v_prescription.case_id
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
  update public.exercise_prescriptions prescription
  set status = 'revoked',
      revoked_by = v_actor,
      revoked_at = clock_timestamp()
  where prescription.episode_id = v_prescription.episode_id
    and prescription.status = 'published';

  update public.exercise_prescriptions prescription
  set status = 'published',
      published_by = v_actor,
      published_at = clock_timestamp()
  where prescription.id = v_prescription.id
  returning prescription.* into v_prescription;

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
  v_prescription public.exercise_prescriptions%rowtype;
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Clinician authentication is required';
  end if;
  select prescription.* into v_prescription
  from public.exercise_prescriptions prescription
  where prescription.id = p_prescription_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'Prescription access is not permitted';
  end if;
  if not private.can_manage_clinical_record(v_prescription.patient_id) then
    raise exception using errcode = '42501', message = 'Prescription access is not permitted';
  end if;
  if v_prescription.status <> 'published' then
    raise exception using errcode = '23514', message = 'A published prescription is required';
  end if;
  update public.exercise_prescriptions prescription
  set status = 'revoked',
      revoked_by = v_actor,
      revoked_at = clock_timestamp()
  where prescription.id = p_prescription_id;
  return true;
end;
$$;

-- --------------------------------------------------------------------------
-- 5) Patient actions require an active episode and a current prescription
-- --------------------------------------------------------------------------

create or replace function private.is_active_episode_for_patient(
  p_episode_id uuid,
  p_patient_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.care_episodes episode
    where episode.id = p_episode_id
      and episode.patient_id = p_patient_id
      and episode.status = 'active'
      and episode.started_at <= current_date
      and (episode.ended_at is null or episode.ended_at >= current_date)
  );
$$;

create or replace function private.has_current_prescription(
  p_episode_id uuid,
  p_patient_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.exercise_prescriptions prescription
    join public.cases patient_case on patient_case.id = prescription.case_id
    where prescription.episode_id = p_episode_id
      and prescription.patient_id = p_patient_id
      and prescription.status = 'published'
      and prescription.start_date <= current_date
      and (prescription.end_date is null or prescription.end_date >= current_date)
      and patient_case.safety_disposition = 'clear'
      and patient_case.safety_screened_at is not null
      and cardinality(patient_case.red_flag_ids) = 0
  );
$$;

revoke all on function private.is_active_episode_for_patient(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.has_current_prescription(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.is_active_episode_for_patient(uuid, uuid)
  to authenticated;
grant execute on function private.has_current_prescription(uuid, uuid)
  to authenticated;

drop policy if exists "program read" on public.episode_program;
drop policy if exists "program manage" on public.episode_program;
revoke all on table public.episode_program
  from public, anon, authenticated, service_role;
grant select on table public.episode_program to service_role;

drop policy if exists "daily logs read" on public.patient_daily_logs;
drop policy if exists "daily logs write" on public.patient_daily_logs;
create policy "daily logs read"
  on public.patient_daily_logs for select to authenticated
  using (
    private.can_manage_clinical_record(private.episode_patient(episode_id))
    or private.is_linked_patient(private.episode_patient(episode_id))
  );
create policy "daily logs write"
  on public.patient_daily_logs for all to authenticated
  using (
    private.can_manage_clinical_record(private.episode_patient(episode_id))
    or (
      private.is_linked_patient(private.episode_patient(episode_id))
      and private.is_active_episode_for_patient(
        episode_id, private.episode_patient(episode_id)
      )
      and private.has_current_prescription(
        episode_id, private.episode_patient(episode_id)
      )
    )
  )
  with check (
    private.can_manage_clinical_record(private.episode_patient(episode_id))
    or (
      private.is_linked_patient(private.episode_patient(episode_id))
      and private.is_active_episode_for_patient(
        episode_id, private.episode_patient(episode_id)
      )
      and private.has_current_prescription(
        episode_id, private.episode_patient(episode_id)
      )
    )
  );

drop policy if exists "tickets insert" on public.tickets;
create policy "tickets insert"
  on public.tickets for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      private.can_reply_to_patient(patient_id)
      or (
        private.is_linked_patient(patient_id)
        and episode_id is not null
        and private.is_active_episode_for_patient(episode_id, patient_id)
      )
    )
  );

drop policy if exists "replies insert" on public.ticket_replies;
create policy "replies insert"
  on public.ticket_replies for insert to authenticated
  with check (
    sender = 'patient'
    and sender_user_id = auth.uid()
    and exists (
      select 1
      from public.tickets ticket
      where ticket.id = ticket_replies.ticket_id
        and private.is_linked_patient(ticket.patient_id)
        and ticket.episode_id is not null
        and private.is_active_episode_for_patient(
          ticket.episode_id, ticket.patient_id
        )
    )
  );

drop policy if exists "prescriptions scoped read"
  on public.exercise_prescriptions;
create policy "prescriptions scoped read"
  on public.exercise_prescriptions for select to authenticated
  using (
    private.can_manage_clinical_record(patient_id)
    or (
      status = 'published'
      and private.is_linked_patient(patient_id)
      and private.is_active_episode_for_patient(episode_id, patient_id)
      and start_date <= current_date
      and (end_date is null or end_date >= current_date)
      and exists (
        select 1
        from public.cases patient_case
        where patient_case.id = exercise_prescriptions.case_id
          and patient_case.safety_screened_at is not null
          and patient_case.safety_disposition = 'clear'
          and cardinality(patient_case.red_flag_ids) = 0
      )
    )
  );

drop policy if exists "prescription items scoped read"
  on public.prescription_items;
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
            and private.is_active_episode_for_patient(
              prescription.episode_id, prescription.patient_id
            )
            and prescription.start_date <= current_date
            and (
              prescription.end_date is null
              or prescription.end_date >= current_date
            )
            and exists (
              select 1
              from public.cases patient_case
              where patient_case.id = prescription.case_id
                and patient_case.safety_screened_at is not null
                and patient_case.safety_disposition = 'clear'
                and cardinality(patient_case.red_flag_ids) = 0
            )
          )
        )
    )
  );

-- Linked patients should never receive internal notes or therapist-only
-- measurements merely because they share the authenticated database role.
revoke select on table public.care_episodes from authenticated;
grant select (
  id, patient_id, title_fa, weekly_target, status,
  started_at, ended_at, created_at
) on table public.care_episodes to authenticated;

drop policy if exists "measurements read" on public.clinical_measurements;
create policy "measurements read"
  on public.clinical_measurements for select to authenticated
  using (
    private.can_manage_clinical_record(private.episode_patient(episode_id))
  );
drop policy if exists "sessions read" on public.sessions;
create policy "sessions read"
  on public.sessions for select to authenticated
  using (
    private.can_manage_clinical_record(private.episode_patient(episode_id))
  );

-- Backend service credentials must use audited SECURITY DEFINER workflows;
-- they do not need direct mutation or TRUNCATE rights on clinical artifacts.
revoke insert, update, delete, truncate
  on table public.treatment_plans from service_role;
revoke insert, update, delete, truncate
  on table public.exercise_prescriptions from service_role;
revoke insert, update, delete, truncate
  on table public.prescription_items from service_role;

comment on table public.case_safety_screens is
  'Append-only clinician safety assessments; the cases columns are only the current projection.';
comment on table public.episode_program is
  'Deprecated legacy program storage. Production patient and clinician access is disabled; migrate data to versioned prescriptions.';
comment on function public.record_case_safety_screen(uuid, text[], text, text) is
  'Records a server-classified safety assessment and atomically invalidates unsafe clinical artifacts.';

commit;

update public.schema_migrations
set status = 'applied', applied_at = clock_timestamp()
where version = '013' and status = 'applying';

-- ════════════════════════════════════════════════════════════════
-- 014_clinical_alerts.sql
-- ════════════════════════════════════════════════════════════════
insert into public.schema_migrations (version, filename, checksum, status)
values ('014', '014_clinical_alerts.sql', 'f701242586c87004c834265b65e24a72ae20cb85203bbd0d22faca09118b20aa', 'applying');

-- Operational clinical alerts and safe prescription suspension/resume.
-- Run after 013_clinical_safety_and_portal_controls.sql.

begin;

-- Exactly one active episode can drive patient actions for a patient.
create unique index if not exists care_episodes_one_active_patient_idx
  on public.care_episodes (patient_id)
  where status = 'active';

create table if not exists public.clinical_alerts (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  episode_id uuid not null references public.care_episodes (id) on delete restrict,
  case_id uuid references public.cases (id) on delete restrict,
  prescription_id uuid references public.exercise_prescriptions (id) on delete restrict,
  alert_type text not null check (alert_type in ('high-pain')),
  severity text not null check (severity in ('urgent', 'emergency')),
  source_table text not null check (source_table in ('patient_daily_logs')),
  source_id uuid not null,
  source_recorded_at timestamptz not null,
  metric_value smallint check (metric_value between 0 and 10),
  reported_by uuid references public.profiles (id) on delete restrict,
  status text not null default 'open'
    check (status in ('open', 'acknowledged', 'resolved')),
  created_at timestamptz not null default clock_timestamp(),
  acknowledged_by uuid references public.profiles (id) on delete restrict,
  acknowledged_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete restrict,
  resolved_at timestamptz,
  resolution_note text,
  unique (alert_type, source_table, source_id),
  check (char_length(coalesce(resolution_note, '')) <= 2000),
  check (
    (status = 'open'
      and acknowledged_by is null and acknowledged_at is null
      and resolved_by is null and resolved_at is null
      and resolution_note is null)
    or
    (status = 'acknowledged'
      and acknowledged_by is not null and acknowledged_at is not null
      and resolved_by is null and resolved_at is null
      and resolution_note is null)
    or
    (status = 'resolved'
      and resolved_by is not null and resolved_at is not null
      and char_length(btrim(resolution_note)) between 3 and 2000)
  )
);

create index if not exists clinical_alerts_clinic_queue_idx
  on public.clinical_alerts (clinic_id, status, severity, created_at desc);
create index if not exists clinical_alerts_patient_time_idx
  on public.clinical_alerts (patient_id, created_at desc);

alter table public.clinical_alerts enable row level security;
revoke all on table public.clinical_alerts
  from public, anon, authenticated, service_role;
grant select on table public.clinical_alerts to authenticated;

drop policy if exists "clinical alerts assigned clinician read"
  on public.clinical_alerts;
create policy "clinical alerts assigned clinician read"
  on public.clinical_alerts for select to authenticated
  using (private.can_manage_clinical_record(patient_id));

-- A suspended prescription retains the original publication signature. The
-- suspension metadata points to the idempotent alert that caused the pause.
alter table public.exercise_prescriptions
  add column if not exists suspended_by uuid
    references public.profiles (id) on delete restrict,
  add column if not exists suspended_at timestamptz,
  add column if not exists suspension_alert_id uuid
    references public.clinical_alerts (id) on delete restrict;

-- Replace the original inline status/state checks without depending on the
-- auto-generated constraint names used by PostgreSQL.
do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select constraint_row.conname
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.exercise_prescriptions'::regclass
      and constraint_row.contype = 'c'
      and (
        pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%status%ANY%'
        or pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%status =%'
        or constraint_row.conname in (
          'exercise_prescriptions_status_v2_check',
          'exercise_prescriptions_state_v2_check'
        )
      )
  loop
    execute format(
      'alter table public.exercise_prescriptions drop constraint %I',
      v_constraint.conname
    );
  end loop;
end $$;

alter table public.exercise_prescriptions
  add constraint exercise_prescriptions_status_v2_check
    check (status in ('draft', 'published', 'suspended', 'revoked')) not valid,
  add constraint exercise_prescriptions_state_v2_check
    check (
      (
        status = 'draft'
        and published_by is null and published_at is null
        and revoked_by is null and revoked_at is null
        and suspended_by is null and suspended_at is null
        and suspension_alert_id is null
      )
      or
      (
        status = 'published'
        and published_by is not null and published_at is not null
        and revoked_by is null and revoked_at is null
        and suspended_by is null and suspended_at is null
        and suspension_alert_id is null
      )
      or
      (
        status = 'suspended'
        and published_by is not null and published_at is not null
        and revoked_by is null and revoked_at is null
        and suspended_by is not null and suspended_at is not null
        and suspension_alert_id is not null
      )
      or
      (
        status = 'revoked'
        and published_by is not null and published_at is not null
        and revoked_by is not null and revoked_at is not null
        and (
          (
            suspended_by is null and suspended_at is null
            and suspension_alert_id is null
          )
          or
          (
            suspended_by is not null and suspended_at is not null
            and suspension_alert_id is not null
          )
        )
      )
    ) not valid;

alter table public.exercise_prescriptions
  validate constraint exercise_prescriptions_status_v2_check;
alter table public.exercise_prescriptions
  validate constraint exercise_prescriptions_state_v2_check;

drop index if exists public.exercise_prescriptions_one_published_idx;
create unique index if not exists exercise_prescriptions_one_actionable_idx
  on public.exercise_prescriptions (episode_id)
  where status in ('published', 'suspended');

-- High pain is converted into an idempotent operational alert inside the
-- same transaction as the patient log, then the current prescription pauses.
create or replace function private.create_high_pain_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient_id uuid;
  v_clinic_id uuid;
  v_case_id uuid;
  v_prescription public.exercise_prescriptions%rowtype;
  v_alert_id uuid;
begin
  if new.pain_level < 7
     or (tg_op = 'UPDATE' and old.pain_level >= 7) then
    return new;
  end if;

  select episode.patient_id, patient.clinic_id
    into v_patient_id, v_clinic_id
  from public.care_episodes episode
  join public.patients patient on patient.id = episode.patient_id
  where episode.id = new.episode_id;
  if not found then
    raise exception using errcode = '23503', message = 'Alert episode is unavailable';
  end if;

  select prescription.* into v_prescription
  from public.exercise_prescriptions prescription
  where prescription.episode_id = new.episode_id
    and prescription.status = 'published'
    and prescription.start_date <= new.date
    and (prescription.end_date is null or prescription.end_date >= new.date)
  order by prescription.published_at desc
  limit 1
  for update;

  if found then
    v_case_id := v_prescription.case_id;
  else
    select patient_case.id into v_case_id
    from public.cases patient_case
    where patient_case.episode_id = new.episode_id
    order by patient_case.created_at desc, patient_case.id desc
    limit 1;
  end if;

  insert into public.clinical_alerts (
    clinic_id, patient_id, episode_id, case_id, prescription_id,
    alert_type, severity, source_table, source_id, source_recorded_at,
    metric_value, reported_by
  ) values (
    v_clinic_id, v_patient_id, new.episode_id, v_case_id,
    case when v_prescription.id is null then null else v_prescription.id end,
    'high-pain', 'urgent', 'patient_daily_logs', new.id,
    new.date::timestamp at time zone 'UTC', new.pain_level, auth.uid()
  )
  on conflict (alert_type, source_table, source_id) do nothing
  returning id into v_alert_id;

  if v_alert_id is null then
    select alert.id into v_alert_id
    from public.clinical_alerts alert
    where alert.alert_type = 'high-pain'
      and alert.source_table = 'patient_daily_logs'
      and alert.source_id = new.id;
  end if;

  if v_prescription.id is not null then
    update public.exercise_prescriptions prescription
    set status = 'suspended',
        suspended_by = coalesce(auth.uid(), v_prescription.published_by),
        suspended_at = clock_timestamp(),
        suspension_alert_id = v_alert_id
    where prescription.id = v_prescription.id
      and prescription.status = 'published';
  end if;
  return new;
end;
$$;

revoke all on function private.create_high_pain_alert()
  from public, anon, authenticated, service_role;
drop trigger if exists patient_daily_logs_high_pain_alert
  on public.patient_daily_logs;
create trigger patient_daily_logs_high_pain_alert
after insert or update of pain_level on public.patient_daily_logs
for each row execute function private.create_high_pain_alert();

drop trigger if exists audit_row_change on public.clinical_alerts;
create trigger audit_row_change
after insert or update on public.clinical_alerts
for each row execute function private.write_audit_log();

create or replace function public.acknowledge_clinical_alert(p_alert_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_alert public.clinical_alerts%rowtype;
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Clinician authentication is required';
  end if;
  select alert.* into v_alert
  from public.clinical_alerts alert
  where alert.id = p_alert_id
  for update;
  if not found or not private.can_manage_clinical_record(v_alert.patient_id) then
    raise exception using errcode = '42501', message = 'Alert access is not permitted';
  end if;
  if v_alert.status = 'resolved' then
    raise exception using errcode = '23514', message = 'Resolved alert cannot be acknowledged';
  end if;
  if v_alert.status = 'open' then
    update public.clinical_alerts alert
    set status = 'acknowledged',
        acknowledged_by = v_actor,
        acknowledged_at = clock_timestamp()
    where alert.id = v_alert.id;
  end if;
  return true;
end;
$$;

create or replace function public.resolve_clinical_alert(
  p_alert_id uuid,
  p_resolution_note text,
  p_resume_prescription boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_note text := nullif(btrim(p_resolution_note), '');
  v_alert public.clinical_alerts%rowtype;
  v_prescription public.exercise_prescriptions%rowtype;
  v_case public.cases%rowtype;
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Clinician authentication is required';
  end if;
  if v_note is null or char_length(v_note) not between 3 and 2000 then
    raise exception using errcode = '22023', message = 'Resolution note is required';
  end if;

  select alert.* into v_alert
  from public.clinical_alerts alert
  where alert.id = p_alert_id
  for update;
  if not found or not private.can_manage_clinical_record(v_alert.patient_id) then
    raise exception using errcode = '42501', message = 'Alert access is not permitted';
  end if;
  if v_alert.status = 'resolved' then
    return true;
  end if;

  if coalesce(p_resume_prescription, false) then
    if v_alert.prescription_id is null then
      raise exception using errcode = '23514', message = 'Alert has no suspended prescription';
    end if;
    select prescription.* into v_prescription
    from public.exercise_prescriptions prescription
    where prescription.id = v_alert.prescription_id
      and prescription.status = 'suspended'
      and prescription.suspension_alert_id = v_alert.id
    for update;
    if not found then
      raise exception using errcode = '23514', message = 'Suspended prescription is unavailable';
    end if;

    select patient_case.* into v_case
    from public.cases patient_case
    where patient_case.id = v_prescription.case_id
    for share;
    if not found
       or v_case.safety_disposition <> 'clear'
       or v_case.safety_screened_at is null
       or v_case.safety_screened_at <= v_alert.created_at
       or cardinality(v_case.red_flag_ids) <> 0
       or not private.is_active_episode_for_patient(
         v_prescription.episode_id, v_prescription.patient_id
       )
       or v_prescription.start_date > current_date
       or (v_prescription.end_date is not null and v_prescription.end_date < current_date)
       or not exists (
         select 1
         from public.treatment_plans plan
         where plan.id = v_prescription.treatment_plan_id
           and plan.status = 'approved'
       )
       or exists (
         select 1
         from public.clinical_alerts other_alert
         where other_alert.episode_id = v_alert.episode_id
           and other_alert.id <> v_alert.id
           and other_alert.status in ('open', 'acknowledged')
       ) then
      raise exception using
        errcode = '23514',
        message = 'A newer clear safety screen and current plan are required before resume';
    end if;

    update public.exercise_prescriptions prescription
    set status = 'published',
        suspended_by = null,
        suspended_at = null,
        suspension_alert_id = null
    where prescription.id = v_prescription.id;
  end if;

  update public.clinical_alerts alert
  set status = 'resolved',
      resolved_by = v_actor,
      resolved_at = clock_timestamp(),
      resolution_note = v_note
  where alert.id = v_alert.id;
  return true;
end;
$$;

revoke all on function public.acknowledge_clinical_alert(uuid)
  from public, anon, service_role;
revoke all on function public.resolve_clinical_alert(uuid, text, boolean)
  from public, anon, service_role;
grant execute on function public.acknowledge_clinical_alert(uuid)
  to authenticated;
grant execute on function public.resolve_clinical_alert(uuid, text, boolean)
  to authenticated;

-- A non-clear clinician re-screen permanently revokes both published and
-- temporarily suspended prescriptions. Publication signatures remain intact.
create or replace function private.persist_case_safety_effects()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.safety_screened_at is not null
     and not (
       tg_op = 'UPDATE'
       and new.safety_screened_at is not distinct from old.safety_screened_at
     ) then
    insert into public.case_safety_screens (
      case_id, clinic_id, patient_id, disposition, red_flag_ids,
      notes, action_taken, screened_by, screened_at
    ) values (
      new.id, new.clinic_id, new.patient_id, new.safety_disposition,
      new.red_flag_ids, new.safety_notes, new.safety_action_taken,
      new.safety_screened_by, new.safety_screened_at
    ) on conflict (case_id, screened_at) do nothing;
  end if;

  if new.safety_disposition <> 'clear' then
    update public.exercise_prescriptions prescription
    set status = 'revoked',
        revoked_by = new.safety_screened_by,
        revoked_at = clock_timestamp()
    where prescription.case_id = new.id
      and prescription.status in ('published', 'suspended');

    update public.treatment_plans plan
    set status = 'superseded',
        superseded_by = new.safety_screened_by,
        superseded_at = clock_timestamp(),
        supersede_reason = 'Invalidated by a non-clear safety re-screen'
    where plan.episode_id = new.episode_id
      and plan.status = 'approved';
  end if;
  return new;
end;
$$;

revoke insert, update, delete, truncate on table public.clinical_alerts
  from service_role;

comment on table public.clinical_alerts is
  'Operational, idempotent clinician alerts. Contains references and workflow metadata, not copied free-text PHI.';
comment on function public.resolve_clinical_alert(uuid, text, boolean) is
  'Resolves an assigned-clinician alert; optional resume requires a newer clear safety screen and current plan.';

commit;

update public.schema_migrations
set status = 'applied', applied_at = clock_timestamp()
where version = '014' and status = 'applying';

-- ════════════════════════════════════════════════════════════════
-- 015_patient_onboarding_and_episode_lifecycle.sql
-- ════════════════════════════════════════════════════════════════
insert into public.schema_migrations (version, filename, checksum, status)
values ('015', '015_patient_onboarding_and_episode_lifecycle.sql', '81f764b1bb831db0f6c33bed8fe6c2fc3f4e23318138cfea3a70d4b3444ec75c', 'applying');

-- Patient account onboarding, clinician assignment, and episode lifecycle.
-- Run after 014_clinical_alerts.sql.

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- --------------------------------------------------------------------------
-- 1) Retained patient records and time-bounded portal access grants
-- --------------------------------------------------------------------------

alter table public.patients
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid
    references public.profiles (id) on delete restrict,
  add column if not exists archive_reason text;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.patients'::regclass
      and conname = 'patients_archive_state_check'
  ) then
    alter table public.patients
      add constraint patients_archive_state_check check (
        (
          archived_at is null and archived_by is null and archive_reason is null
        )
        or
        (
          archived_at is not null and archived_by is not null
          and char_length(btrim(archive_reason)) between 3 and 1000
        )
      ) not valid;
  end if;
end $$;

alter table public.patient_users
  add column if not exists relationship text not null default 'self',
  add column if not exists authorized_at timestamptz not null default clock_timestamp(),
  add column if not exists authorized_by uuid
    references public.profiles (id) on delete restrict,
  add column if not exists expires_at timestamptz,
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid
    references public.profiles (id) on delete restrict,
  add column if not exists revocation_reason text;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.patient_users'::regclass
      and conname = 'patient_users_grant_state_check'
  ) then
    alter table public.patient_users
      add constraint patient_users_grant_state_check check (
        relationship in ('self', 'parent', 'guardian', 'caregiver')
        and (relationship = 'self' or expires_at is not null)
        and (expires_at is null or expires_at > authorized_at)
        and (
          (revoked_at is null and revoked_by is null and revocation_reason is null)
          or
          (
            revoked_at is not null and revoked_by is not null
            and revoked_at >= authorized_at
            and char_length(btrim(revocation_reason)) between 3 and 1000
          )
        )
      ) not valid;
  end if;
end $$;

create index if not exists patient_users_active_user_idx
  on public.patient_users (user_id, patient_id)
  where revoked_at is null;

create table if not exists public.patient_access_events (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete restrict,
  event_type text not null check (event_type in ('authorized', 'revoked')),
  relationship text not null
    check (relationship in ('self', 'parent', 'guardian', 'caregiver')),
  actor_id uuid not null references public.profiles (id) on delete restrict,
  expires_at timestamptz,
  reason text,
  created_at timestamptz not null default clock_timestamp(),
  check (reason is null or char_length(btrim(reason)) between 3 and 1000)
);

create index if not exists patient_access_events_patient_time_idx
  on public.patient_access_events (patient_id, created_at desc);

create table if not exists public.patient_invitation_attempts (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  requested_by uuid not null references public.profiles (id) on delete restrict,
  email_hash text not null check (char_length(email_hash) = 64),
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists patient_invitation_attempts_actor_time_idx
  on public.patient_invitation_attempts (requested_by, created_at desc);
create index if not exists patient_invitation_attempts_patient_time_idx
  on public.patient_invitation_attempts (patient_id, created_at desc);

alter table public.patient_access_events enable row level security;
alter table public.patient_invitation_attempts enable row level security;
revoke all on table public.patient_access_events
  from public, anon, authenticated, service_role;
revoke all on table public.patient_invitation_attempts
  from public, anon, authenticated, service_role;

create or replace function private.reject_patient_access_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'Patient access events are append-only';
end;
$$;

revoke all on function private.reject_patient_access_event_mutation()
  from public, anon, authenticated, service_role;
drop trigger if exists patient_access_events_immutable
  on public.patient_access_events;
create trigger patient_access_events_immutable
before update or delete or truncate on public.patient_access_events
for each statement execute function private.reject_patient_access_event_mutation();

-- An account link stops granting PHI access immediately when it is revoked,
-- expired, belongs to a non-patient profile, or the account joins clinic staff.
create or replace function private.is_linked_patient(p_patient uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.patient_users access_grant
    join public.profiles profile on profile.id = access_grant.user_id
    where access_grant.patient_id = p_patient
      and access_grant.user_id = auth.uid()
      and access_grant.revoked_at is null
      and (
        access_grant.expires_at is null
        or access_grant.expires_at > clock_timestamp()
      )
      and profile.role = 'patient'
      and not exists (
        select 1 from public.clinic_members membership
        where membership.user_id = access_grant.user_id
      )
  );
$$;

revoke all on function private.is_linked_patient(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.is_linked_patient(uuid) to authenticated;

drop policy if exists "patient_users read" on public.patient_users;
drop policy if exists "patient_users manage" on public.patient_users;
drop policy if exists "patient portal grant scoped read" on public.patient_users;
create policy "patient portal grant scoped read"
  on public.patient_users for select to authenticated
  using (
    private.is_owner_of(private.patient_clinic(patient_id))
    or private.is_assigned_therapist(patient_id)
    or (
      user_id = auth.uid()
      and revoked_at is null
      and (expires_at is null or expires_at > clock_timestamp())
    )
  );

revoke all on table public.patient_users
  from public, anon, authenticated, service_role;
grant select (
  patient_id, user_id, relationship, authorized_at, expires_at, revoked_at
) on table public.patient_users to authenticated;

-- --------------------------------------------------------------------------
-- 2) Portal-link workflows. Email lookup never runs in the browser and the
--    API receives only a bounded status, not another user's identity record.
-- --------------------------------------------------------------------------

create or replace function public.reserve_patient_invitation(
  p_patient_id uuid,
  p_email text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_patient public.patients%rowtype;
  v_email text := lower(btrim(p_email));
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Clinic-owner authentication is required';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
     or char_length(v_email) > 254 then
    raise exception using errcode = '22023', message = 'A valid email address is required';
  end if;

  select patient.* into v_patient
  from public.patients patient
  where patient.id = p_patient_id
  for update;
  if not found or v_patient.archived_at is not null
     or not private.is_owner_of(v_patient.clinic_id) then
    raise exception using errcode = '42501', message = 'Patient access is not permitted';
  end if;

  if (
    select count(*) from public.patient_invitation_attempts attempt
    where attempt.requested_by = v_actor
      and attempt.created_at > clock_timestamp() - interval '1 hour'
  ) >= 10 then
    raise exception using errcode = 'P0001', message = 'Invitation rate limit reached';
  end if;
  if exists (
    select 1 from public.patient_invitation_attempts attempt
    where attempt.patient_id = p_patient_id
      and attempt.email_hash = encode(extensions.digest(v_email, 'sha256'), 'hex')
      and attempt.created_at > clock_timestamp() - interval '10 minutes'
  ) then
    raise exception using errcode = 'P0001', message = 'Please wait before inviting this address again';
  end if;

  insert into public.patient_invitation_attempts (
    clinic_id, patient_id, requested_by, email_hash
  ) values (
    v_patient.clinic_id, p_patient_id, v_actor,
    encode(extensions.digest(v_email, 'sha256'), 'hex')
  );
  return true;
end;
$$;

create or replace function public.link_patient_account_by_email(
  p_patient_id uuid,
  p_email text,
  p_relationship text,
  p_expires_at timestamptz default null,
  p_authority_attested boolean default false
)
returns table (account_found boolean, link_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_patient public.patients%rowtype;
  v_email text := lower(btrim(p_email));
  v_relationship text := lower(btrim(p_relationship));
  v_user_id uuid;
  v_changed boolean := false;
  v_row_count integer := 0;
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Clinic-owner authentication is required';
  end if;
  if not coalesce(p_authority_attested, false) then
    raise exception using errcode = '22023', message = 'Patient consent or legal authority must be attested';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
     or char_length(v_email) > 254 then
    raise exception using errcode = '22023', message = 'A valid email address is required';
  end if;
  if v_relationship not in ('self', 'parent', 'guardian', 'caregiver') then
    raise exception using errcode = '22023', message = 'Relationship is not supported';
  end if;
  if p_expires_at is not null and p_expires_at <= clock_timestamp() then
    raise exception using errcode = '22023', message = 'Access expiry must be in the future';
  end if;
  if v_relationship <> 'self' and (
    p_expires_at is null or p_expires_at > clock_timestamp() + interval '366 days'
  ) then
    raise exception using errcode = '22023', message = 'Delegate access must expire within 366 days';
  end if;

  select patient.* into v_patient
  from public.patients patient
  where patient.id = p_patient_id
  for update;
  if not found or v_patient.archived_at is not null
     or not private.is_owner_of(v_patient.clinic_id) then
    raise exception using errcode = '42501', message = 'Patient access is not permitted';
  end if;

  select auth_user.id into v_user_id
  from auth.users auth_user
  where lower(auth_user.email) = v_email
  order by auth_user.created_at
  limit 1;
  if v_user_id is null then
    return query select false, 'account-not-found'::text;
    return;
  end if;

  if not exists (
    select 1 from public.profiles profile
    where profile.id = v_user_id and profile.role = 'patient'
  ) or exists (
    select 1 from public.clinic_members membership
    where membership.user_id = v_user_id
  ) then
    raise exception using errcode = '23514', message = 'Only a patient-only account may receive portal access';
  end if;

  if v_relationship = 'self' and exists (
    select 1 from public.patient_users existing
    where existing.user_id = v_user_id
      and existing.patient_id <> p_patient_id
      and existing.relationship = 'self'
      and existing.revoked_at is null
      and (existing.expires_at is null or existing.expires_at > clock_timestamp())
  ) then
    raise exception using errcode = '23514', message = 'This account already represents another patient';
  end if;

  insert into public.patient_users (
    patient_id, user_id, relationship, authorized_at, authorized_by,
    expires_at, revoked_at, revoked_by, revocation_reason
  ) values (
    p_patient_id, v_user_id, v_relationship, clock_timestamp(), v_actor,
    p_expires_at, null, null, null
  )
  on conflict (patient_id, user_id) do update
  set relationship = excluded.relationship,
      authorized_at = excluded.authorized_at,
      authorized_by = excluded.authorized_by,
      expires_at = excluded.expires_at,
      revoked_at = null,
      revoked_by = null,
      revocation_reason = null
  where patient_users.revoked_at is not null
     or patient_users.relationship is distinct from excluded.relationship
     or patient_users.expires_at is distinct from excluded.expires_at;
  get diagnostics v_row_count = row_count;
  v_changed := v_row_count > 0;

  if v_changed then
    insert into public.patient_access_events (
      patient_id, user_id, event_type, relationship,
      actor_id, expires_at, reason
    ) values (
      p_patient_id, v_user_id, 'authorized', v_relationship,
      v_actor, p_expires_at, 'Consent or legal authority attested by clinic owner'
    );
  end if;

  return query select true, case when v_changed then 'linked' else 'already-linked' end;
end;
$$;

create or replace function public.revoke_patient_account_link(
  p_patient_id uuid,
  p_user_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_reason text := nullif(btrim(p_reason), '');
  v_relationship text;
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Clinic-owner authentication is required';
  end if;
  if v_reason is null or char_length(v_reason) not between 3 and 1000 then
    raise exception using errcode = '22023', message = 'Revocation reason is required';
  end if;
  if not exists (
    select 1 from public.patients patient
    where patient.id = p_patient_id
      and private.is_owner_of(patient.clinic_id)
  ) then
    raise exception using errcode = '42501', message = 'Patient access is not permitted';
  end if;

  update public.patient_users access_grant
  set revoked_at = clock_timestamp(),
      revoked_by = v_actor,
      revocation_reason = v_reason
  where access_grant.patient_id = p_patient_id
    and access_grant.user_id = p_user_id
    and access_grant.revoked_at is null
  returning access_grant.relationship into v_relationship;
  if not found then
    return false;
  end if;

  insert into public.patient_access_events (
    patient_id, user_id, event_type, relationship, actor_id, reason
  ) values (
    p_patient_id, p_user_id, 'revoked', v_relationship, v_actor, v_reason
  );
  return true;
end;
$$;

create or replace function public.list_patient_account_links(p_patient_ids uuid[])
returns table (
  patient_id uuid,
  user_id uuid,
  full_name text,
  email text,
  relationship text,
  authorized_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or private.is_platform_admin()
     or p_patient_ids is null
     or cardinality(p_patient_ids) not between 1 and 100 then
    raise exception using errcode = '42501', message = 'Patient-link access is not permitted';
  end if;
  if exists (
    select 1
    from unnest(p_patient_ids) requested(patient_id)
    left join public.patients patient on patient.id = requested.patient_id
    where patient.id is null or not private.can_manage_clinical_record(patient.id)
  ) then
    raise exception using errcode = '42501', message = 'Patient-link access is not permitted';
  end if;

  return query
  select grant_row.patient_id,
         grant_row.user_id,
         profile.full_name,
         case when private.is_owner_of(patient.clinic_id) then auth_user.email else null end,
         grant_row.relationship,
         grant_row.authorized_at,
         grant_row.expires_at,
         grant_row.revoked_at
  from public.patient_users grant_row
  join public.patients patient on patient.id = grant_row.patient_id
  join public.profiles profile on profile.id = grant_row.user_id
  join auth.users auth_user on auth_user.id = grant_row.user_id
  where grant_row.patient_id = any(p_patient_ids)
  order by grant_row.patient_id, grant_row.revoked_at nulls first, grant_row.authorized_at desc
  limit 500;
end;
$$;

-- --------------------------------------------------------------------------
-- 3) Atomic patient, assignment, and episode lifecycle workflows
-- --------------------------------------------------------------------------

-- Daily progress has one row per date, so values above seven are impossible
-- to fulfill. Existing out-of-range rows must be corrected before migration.
alter table public.care_episodes
  drop constraint if exists care_episodes_values_check;
alter table public.care_episodes
  add constraint care_episodes_values_check check (
    char_length(btrim(title_fa)) between 1 and 500
    and (therapist_note_fa is null or char_length(therapist_note_fa) <= 20000)
    and weekly_target between 1 and 7
    and (ended_at is null or ended_at >= started_at)
  ) not valid;
alter table public.care_episodes
  validate constraint care_episodes_values_check;

create or replace function public.update_patient_record(
  p_patient_id uuid,
  p_full_name text,
  p_phone text,
  p_birth_year int,
  p_gender text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_patient public.patients%rowtype;
  v_name text := btrim(p_full_name);
  v_phone text := nullif(btrim(p_phone), '');
  v_gender text := case when p_gender is null then null else lower(btrim(p_gender)) end;
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Clinician authentication is required';
  end if;
  if char_length(v_name) not between 2 and 120
     or (v_phone is not null and char_length(v_phone) not between 7 and 16)
     or (p_birth_year is not null and p_birth_year not between 1900 and extract(year from current_date)::int)
     or (v_gender is not null and v_gender not in ('male', 'female', 'other')) then
    raise exception using errcode = '22023', message = 'Patient demographics are invalid';
  end if;
  select patient.* into v_patient
  from public.patients patient where patient.id = p_patient_id for update;
  if not found or v_patient.archived_at is not null
     or not private.can_edit_patient_demographics(p_patient_id) then
    raise exception using errcode = '42501', message = 'Patient access is not permitted';
  end if;
  update public.patients patient
  set full_name = v_name, phone = v_phone,
      birth_year = p_birth_year, gender = v_gender
  where patient.id = p_patient_id;
  return true;
end;
$$;

create or replace function public.set_patient_primary_therapist(
  p_patient_id uuid,
  p_therapist_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_patient public.patients%rowtype;
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Clinic-owner authentication is required';
  end if;
  select patient.* into v_patient
  from public.patients patient where patient.id = p_patient_id for update;
  if not found or v_patient.archived_at is not null
     or not private.is_owner_of(v_patient.clinic_id) then
    raise exception using errcode = '42501', message = 'Patient access is not permitted';
  end if;
  if p_therapist_id is not null and not exists (
    select 1
    from public.clinic_members membership
    join public.profiles profile on profile.id = membership.user_id
    where membership.clinic_id = v_patient.clinic_id
      and membership.user_id = p_therapist_id
      and membership.member_role = 'therapist'
      and profile.role in ('clinic_owner', 'therapist')
  ) then
    raise exception using errcode = '22023', message = 'Therapist is not active in this clinic';
  end if;
  delete from public.patient_therapists assignment
  where assignment.patient_id = p_patient_id;
  if p_therapist_id is not null then
    insert into public.patient_therapists (patient_id, therapist_id)
    values (p_patient_id, p_therapist_id);
  end if;
  return true;
end;
$$;

create or replace function public.start_patient_episode(
  p_patient_id uuid,
  p_title_fa text,
  p_weekly_target int,
  p_assigned_therapist_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_patient public.patients%rowtype;
  v_title text := btrim(p_title_fa);
  v_actor_is_owner boolean;
  v_episode_id uuid;
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Clinician authentication is required';
  end if;
  if char_length(v_title) not between 2 and 160
     or p_weekly_target not between 1 and 7 then
    raise exception using errcode = '22023', message = 'Episode details are invalid';
  end if;
  select patient.* into v_patient
  from public.patients patient where patient.id = p_patient_id for update;
  if not found or v_patient.archived_at is not null then
    raise exception using errcode = '42501', message = 'Patient access is not permitted';
  end if;
  v_actor_is_owner := private.is_owner_of(v_patient.clinic_id);
  if not v_actor_is_owner and not private.is_assigned_therapist(p_patient_id) then
    raise exception using errcode = '42501', message = 'Patient access is not permitted';
  end if;
  if exists (
    select 1 from public.care_episodes episode
    where episode.patient_id = p_patient_id and episode.status = 'active'
  ) then
    raise exception using errcode = '23514', message = 'Complete or pause the active episode first';
  end if;
  if not v_actor_is_owner and p_assigned_therapist_id is distinct from v_actor then
    raise exception using errcode = '42501', message = 'A therapist may assign an episode only to themself';
  end if;
  if p_assigned_therapist_id is not null and not exists (
    select 1
    from public.clinic_members membership
    join public.profiles profile on profile.id = membership.user_id
    where membership.clinic_id = v_patient.clinic_id
      and membership.user_id = p_assigned_therapist_id
      and membership.member_role = 'therapist'
      and profile.role in ('clinic_owner', 'therapist')
  ) then
    raise exception using errcode = '22023', message = 'Therapist is not active in this clinic';
  end if;

  if p_assigned_therapist_id is not null then
    delete from public.patient_therapists assignment
    where assignment.patient_id = p_patient_id;
    insert into public.patient_therapists (patient_id, therapist_id)
    values (p_patient_id, p_assigned_therapist_id);
  end if;
  insert into public.care_episodes (patient_id, title_fa, weekly_target)
  values (p_patient_id, v_title, p_weekly_target)
  returning id into v_episode_id;
  return v_episode_id;
end;
$$;

create or replace function public.transition_care_episode(
  p_episode_id uuid,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_episode public.care_episodes%rowtype;
  v_patient public.patients%rowtype;
  v_status text := lower(btrim(p_status));
begin
  if v_actor is null or private.is_platform_admin()
     or v_status not in ('active', 'paused', 'completed') then
    raise exception using errcode = '42501', message = 'Episode transition is not permitted';
  end if;
  select episode.* into v_episode
  from public.care_episodes episode where episode.id = p_episode_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'Episode access is not permitted';
  end if;
  select patient.* into v_patient
  from public.patients patient where patient.id = v_episode.patient_id for update;
  if not private.can_manage_clinical_record(v_episode.patient_id)
     or v_patient.archived_at is not null then
    raise exception using errcode = '42501', message = 'Episode access is not permitted';
  end if;
  if v_episode.status = 'completed' and v_status <> 'completed' then
    raise exception using errcode = '23514', message = 'A completed episode cannot be reopened; start a new episode';
  end if;
  if v_status = 'active' and exists (
    select 1 from public.care_episodes other_episode
    where other_episode.patient_id = v_episode.patient_id
      and other_episode.id <> v_episode.id
      and other_episode.status = 'active'
  ) then
    raise exception using errcode = '23514', message = 'Another active episode already exists';
  end if;
  if v_episode.status = v_status then
    return true;
  end if;

  update public.care_episodes episode
  set status = v_status,
      ended_at = case when v_status = 'completed' then current_date else null end
  where episode.id = p_episode_id;

  if v_status in ('paused', 'completed') then
    update public.exercise_prescriptions prescription
    set status = 'revoked', revoked_by = v_actor, revoked_at = clock_timestamp()
    where prescription.episode_id = p_episode_id
      and prescription.status in ('published', 'suspended');
  end if;
  if v_status = 'completed' then
    update public.treatment_plans plan
    set status = 'superseded',
        superseded_by = v_actor,
        superseded_at = clock_timestamp(),
        supersede_reason = 'Care episode completed'
    where plan.episode_id = p_episode_id and plan.status = 'approved';
  end if;
  return true;
end;
$$;

create or replace function public.archive_patient_record(
  p_patient_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_patient public.patients%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
  v_grant record;
begin
  if v_actor is null or private.is_platform_admin()
     or v_reason is null or char_length(v_reason) not between 3 and 1000 then
    raise exception using errcode = '42501', message = 'Patient archive is not permitted';
  end if;
  select patient.* into v_patient
  from public.patients patient where patient.id = p_patient_id for update;
  if not found or not private.is_owner_of(v_patient.clinic_id) then
    raise exception using errcode = '42501', message = 'Patient access is not permitted';
  end if;
  if v_patient.archived_at is not null then
    return true;
  end if;
  if exists (
    select 1 from public.care_episodes episode
    where episode.patient_id = p_patient_id and episode.status = 'active'
  ) or exists (
    select 1 from public.clinical_alerts alert
    where alert.patient_id = p_patient_id
      and alert.status in ('open', 'acknowledged')
  ) then
    raise exception using errcode = '23514', message = 'Close active care and unresolved alerts before archive';
  end if;

  for v_grant in
    update public.patient_users access_grant
    set revoked_at = clock_timestamp(), revoked_by = v_actor,
        revocation_reason = 'Patient record archived: ' || v_reason
    where access_grant.patient_id = p_patient_id
      and access_grant.revoked_at is null
    returning access_grant.user_id, access_grant.relationship
  loop
    insert into public.patient_access_events (
      patient_id, user_id, event_type, relationship, actor_id, reason
    ) values (
      p_patient_id, v_grant.user_id, 'revoked', v_grant.relationship,
      v_actor, 'Patient record archived: ' || v_reason
    );
  end loop;
  delete from public.patient_therapists assignment
  where assignment.patient_id = p_patient_id;
  update public.exercise_prescriptions prescription
  set status = 'revoked', revoked_by = v_actor, revoked_at = clock_timestamp()
  where prescription.patient_id = p_patient_id
    and prescription.status in ('published', 'suspended');
  update public.patients patient
  set archived_at = clock_timestamp(), archived_by = v_actor,
      archive_reason = v_reason
  where patient.id = p_patient_id;
  return true;
end;
$$;

-- Direct browser writes could otherwise forge lifecycle actors/timestamps.
revoke insert, update, delete, truncate on table public.patients
  from authenticated, service_role;
revoke insert, update, delete, truncate on table public.patient_users
  from authenticated, service_role;
revoke insert, update, delete, truncate on table public.patient_therapists
  from authenticated, service_role;
revoke insert, update, delete, truncate on table public.care_episodes
  from authenticated, service_role;

do $$
declare
  v_signature regprocedure;
begin
  foreach v_signature in array array[
    'public.reserve_patient_invitation(uuid,text)'::regprocedure,
    'public.link_patient_account_by_email(uuid,text,text,timestamp with time zone,boolean)'::regprocedure,
    'public.revoke_patient_account_link(uuid,uuid,text)'::regprocedure,
    'public.list_patient_account_links(uuid[])'::regprocedure,
    'public.update_patient_record(uuid,text,text,integer,text)'::regprocedure,
    'public.set_patient_primary_therapist(uuid,uuid)'::regprocedure,
    'public.start_patient_episode(uuid,text,integer,uuid)'::regprocedure,
    'public.transition_care_episode(uuid,text)'::regprocedure,
    'public.archive_patient_record(uuid,text)'::regprocedure
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_signature);
    execute format('grant execute on function %s to authenticated', v_signature);
  end loop;
end $$;

drop trigger if exists audit_row_change on public.patient_access_events;
create trigger audit_row_change
after insert on public.patient_access_events
for each row execute function private.write_audit_log();

comment on table public.patient_users is
  'Current, consent-attested and optionally expiring portal access grants. Direct mutation is disabled.';
comment on table public.patient_access_events is
  'Append-only authorization/revocation history for patient portal access.';
comment on function public.transition_care_episode(uuid, text) is
  'Audited episode lifecycle transition; pausing/completing revokes actionable prescriptions atomically.';

commit;

update public.schema_migrations
set status = 'applied', applied_at = clock_timestamp()
where version = '015' and status = 'applying';

-- ════════════════════════════════════════════════════════════════
-- 016_exercise_catalog_and_date_validation.sql
-- ════════════════════════════════════════════════════════════════
insert into public.schema_migrations (version, filename, checksum, status)
values ('016', '016_exercise_catalog_and_date_validation.sql', '34bba9871218401ff0f6ff18f5fb5cfb7c700e98cf0bd513ba3cd33cfc573056', 'applying');

-- Versioned patient-facing exercise snapshots and real calendar validation.
-- Run after 015_patient_onboarding_and_episode_lifecycle.sql.

begin;

-- --------------------------------------------------------------------------
-- 1) Only reviewed patient-ready exercises can enter a prescription. Each
--    prescription item retains the exact content shown at publication time.
-- --------------------------------------------------------------------------

create or replace function private.is_valid_patient_exercise_content(p_value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_value) = 'object'
    and p_value ?& array[
      'name', 'purpose', 'howTo', 'commonMistakes', 'whenToStop'
    ]
    and (select count(*) = 5 from jsonb_object_keys(p_value))
    and char_length(btrim(p_value ->> 'name')) between 2 and 300
    and char_length(btrim(p_value ->> 'purpose')) between 3 and 2000
    and private.is_bounded_text_array(p_value -> 'howTo', 1, 20, 2000)
    and private.is_bounded_text_array(
      p_value -> 'commonMistakes', 1, 20, 1000
    )
    and char_length(btrim(p_value ->> 'whenToStop')) between 3 and 2000
    and pg_column_size(p_value) <= 32768,
    false
  );
$$;

create table if not exists public.exercise_catalog_versions (
  exercise_id text not null,
  version integer not null check (version between 1 and 10000),
  patient_content jsonb not null,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  active boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  primary key (exercise_id, version),
  check (exercise_id ~ '^[a-z0-9][a-z0-9_-]{1,99}$'),
  check (private.is_valid_patient_exercise_content(patient_content))
);

create unique index if not exists exercise_catalog_one_active_idx
  on public.exercise_catalog_versions (exercise_id) where active;

insert into public.exercise_catalog_versions (
  exercise_id, version, patient_content, content_hash, active
)
select source.exercise_id, 1, source.patient_content,
       encode(extensions.digest(source.patient_content::text, 'sha256'), 'hex'),
       true
from (values
  ('ex_quad_sets', jsonb_build_object(
    'name', 'انقباض عضله چهارسر (کوآد ست)',
    'purpose', 'فعال‌سازی عضله جلوی ران بعد از جراحی زانو',
    'howTo', jsonb_build_array(
      'بنشینید یا دراز بکشید و پا را صاف کنید؛ یک حوله لوله‌شده زیر زانو بگذارید.',
      'پشت زانو را به آرامی به حوله فشار دهید.',
      'عضله جلوی ران را سفت کنید و ۵ ثانیه نگه دارید.',
      'شل کنید و تکرار کنید.'
    ),
    'commonMistakes', jsonb_build_array(
      'حبس کردن نفس', 'سفت‌نکردن کامل عضله', 'بلندکردن کل پا در روزهای اول'
    ),
    'whenToStop', 'اگر درد تیز در محل جراحی حس کردید (بیشتر از دردِ معمول) توقف کنید.'
  )),
  ('ex_ankle_pumps', jsonb_build_object(
    'name', 'پمپ مچ پا',
    'purpose', 'بهبود گردش خون و کاهش ورم بعد از جراحی',
    'howTo', jsonb_build_array(
      'دراز بکشید یا بنشینید و پاها را روی سطحی تکیه دهید.',
      'پنجه پا را به سمت جلو بکشید، بعد به سمت خودتان بالا بیاورید.',
      'با ریتم آرام و پیوسته در دامنه بدون درد حرکت دهید.'
    ),
    'commonMistakes', jsonb_build_array(
      'خیلی آهسته انجام‌دادن', 'فراموش‌کردن تکرار منظم در طول روز'
    ),
    'whenToStop', 'اگر درد یا ورم جدید در ساق پا دیدید حتماً به فیزیوتراپیست اطلاع دهید.'
  )),
  ('ex_heel_slides', jsonb_build_object(
    'name', 'سُر دادن پاشنه (هیل اسلاید)',
    'purpose', 'بازگرداندن خم‌شدن زانو بعد از تعویض مفصل',
    'howTo', jsonb_build_array(
      'به پشت دراز بکشید و یک حوله یا بند دور کف پا بیندازید.',
      'پاشنه را به آرامی به سمت باسن سُر دهید تا زانو خم شود.',
      'با کمک بند، تا حد کشش راحت جلو بروید و کمی نگه دارید.',
      'به آرامی به حالت اول برگردید.'
    ),
    'commonMistakes', jsonb_build_array(
      'فشار زیاد تا حد درد شدید', 'چرخاندن زانو به داخل یا بیرون', 'حبس نفس'
    ),
    'whenToStop', 'اگر درد تیز یا حس گیر کردن مفصل داشتید توقف کنید.'
  )),
  ('ex_glute_bridge', jsonb_build_object(
    'name', 'پل باسن',
    'purpose', 'تقویت باسن و زنجیره پشتی بدن و کاهش فشار روی کمر',
    'howTo', jsonb_build_array(
      'به پشت دراز بکشید، زانوها خم و کف پاها روی زمین.',
      'عضلات باسن را سفت کنید و لگن را بالا بیاورید تا بدن در یک خط صاف قرار گیرد.',
      'بالای حرکت یک لحظه مکث کنید، بعد آرام پایین بیایید.'
    ),
    'commonMistakes', jsonb_build_array(
      'قوس بیش از حد کمر', 'فشار با پنجه پا به‌جای پاشنه', 'استفاده فقط از پشت ران'
    ),
    'whenToStop', 'اگر درد کمر هنگام حرکت بیشتر شد توقف کنید.'
  )),
  ('ex_bird_dog', jsonb_build_object(
    'name', 'پرنده-سگ (برد داگ)',
    'purpose', 'تقویت ثبات تنه و کنترل کمر و لگن',
    'howTo', jsonb_build_array(
      'روی چهار دست و پا قرار بگیرید و کمر را در حالت طبیعی نگه دارید.',
      'دست و پای مخالف را همزمان و آهسته صاف کنید.',
      'لگن را تراز نگه دارید و نچرخید.',
      'با کنترل برگردید و سمت دیگر را انجام دهید.'
    ),
    'commonMistakes', jsonb_build_array(
      'قوس‌دادن کمر', 'عجله در حرکت', 'چرخیدن لگن'
    ),
    'whenToStop', 'اگر درد یا گزگز به پا انتشار پیدا کرد توقف کنید.'
  )),
  ('ex_curl_up', jsonb_build_object(
    'name', 'کرل-آپ اصلاح‌شده',
    'purpose', 'تقویت استقامت عضلات شکم بدون فشار به کمر',
    'howTo', jsonb_build_array(
      'به پشت دراز بکشید؛ یک زانو خم و پای دیگر صاف باشد.',
      'دست‌ها را زیر گودی کمر بگذارید.',
      'سر و شانه‌ها را چند سانتی‌متر از زمین بلند کنید.',
      'کمی نگه دارید و با کنترل پایین بیایید.'
    ),
    'commonMistakes', jsonb_build_array(
      'صاف‌کردن گودی کمر', 'کشیدن گردن', 'حبس نفس'
    ),
    'whenToStop', 'اگر درد یا گزگز به پا انتشار پیدا کرد توقف کنید.'
  )),
  ('ex_glute_med_sidelying', jsonb_build_object(
    'name', 'بالا آوردن پا از پهلو',
    'purpose', 'تقویت عضله کنار باسن برای ثبات لگن',
    'howTo', jsonb_build_array(
      'به پهلو دراز بکشید؛ پاها روی هم و کمی عقب‌تر از بدن.',
      'پای بالایی را صاف نگه دارید و پنجه رو به جلو باشد.',
      'پا را به سمت سقف بالا ببرید بدون اینکه بدن به عقب بچرخد.',
      'آهسته پایین بیاورید.'
    ),
    'commonMistakes', jsonb_build_array(
      'چرخیدن لگن به عقب', 'استفاده از عجله و ضربه', 'بالا بردن با پنجه چرخیده'
    ),
    'whenToStop', 'با درد تیز در کنار باسن توقف کنید.'
  )),
  ('ex_wall_sit', jsonb_build_object(
    'name', 'اسکوات کنار دیوار (وال سیت)',
    'purpose', 'تقویت عضله جلوی ران بدون فشار زیاد به مفصل زانو',
    'howTo', jsonb_build_array(
      'پشت به دیوار بایستید و به آن تکیه دهید.',
      'به آرامی پایین بیایید تا زانوها کمی خم شوند.',
      'در همین حالت بمانید؛ زانوها بالای پاها باشند.',
      'به آرامی بالا بیایید.'
    ),
    'commonMistakes', jsonb_build_array(
      'جمع‌شدن زانوها به داخل', 'پایین‌رفتن بیش از حد در ابتدا', 'حبس نفس'
    ),
    'whenToStop', 'با درد تیز جلوی زانو توقف کنید.'
  ))
) as source(exercise_id, patient_content)
on conflict (exercise_id, version) do update
set patient_content = excluded.patient_content,
    content_hash = excluded.content_hash,
    active = excluded.active;

alter table public.exercise_catalog_versions enable row level security;
revoke all on table public.exercise_catalog_versions
  from public, anon, authenticated, service_role;

alter table public.prescription_items
  add column if not exists exercise_version integer,
  add column if not exists content_snapshot jsonb;

do $$
begin
  if exists (
    select 1
    from public.prescription_items item
    left join public.exercise_catalog_versions catalog
      on catalog.exercise_id = item.exercise_id and catalog.active
    where catalog.exercise_id is null
  ) then
    raise exception using
      errcode = '23503',
      message = 'Remediate legacy prescription items that are absent from the reviewed exercise catalog';
  end if;
end $$;

update public.prescription_items item
set exercise_version = catalog.version,
    content_snapshot = catalog.patient_content
from public.exercise_catalog_versions catalog
where catalog.exercise_id = item.exercise_id
  and catalog.active
  and (item.exercise_version is null or item.content_snapshot is null);

alter table public.prescription_items
  alter column exercise_version set not null,
  alter column content_snapshot set not null;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.prescription_items'::regclass
      and conname = 'prescription_items_catalog_fkey'
  ) then
    alter table public.prescription_items
      add constraint prescription_items_catalog_fkey
      foreign key (exercise_id, exercise_version)
      references public.exercise_catalog_versions (exercise_id, version)
      on delete restrict not valid;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.prescription_items'::regclass
      and conname = 'prescription_items_snapshot_shape_check'
  ) then
    alter table public.prescription_items
      add constraint prescription_items_snapshot_shape_check check (
        jsonb_typeof(content_snapshot) = 'object'
        and content_snapshot ?& array[
          'name', 'purpose', 'howTo', 'commonMistakes', 'whenToStop'
        ]
        and pg_column_size(content_snapshot) <= 32768
      ) not valid;
  end if;
end $$;

alter table public.prescription_items
  validate constraint prescription_items_catalog_fkey;
alter table public.prescription_items
  validate constraint prescription_items_snapshot_shape_check;

create or replace function private.stamp_prescription_item_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_catalog public.exercise_catalog_versions%rowtype;
begin
  select catalog.* into v_catalog
  from public.exercise_catalog_versions catalog
  where catalog.exercise_id = new.exercise_id and catalog.active
  for share;
  if not found then
    raise exception using
      errcode = '22023',
      message = 'Exercise is not in the active patient-ready catalog';
  end if;
  new.exercise_version := v_catalog.version;
  new.content_snapshot := v_catalog.patient_content;
  return new;
end;
$$;

revoke all on function private.stamp_prescription_item_snapshot()
  from public, anon, authenticated, service_role;
drop trigger if exists prescription_items_stamp_catalog
  on public.prescription_items;
create trigger prescription_items_stamp_catalog
before insert or update of exercise_id on public.prescription_items
for each row execute function private.stamp_prescription_item_snapshot();

-- --------------------------------------------------------------------------
-- 2) YYYY-MM-DD shape is not calendar validation. Rebuild the planner input
--    constraint with a parser that rejects impossible dates.
-- --------------------------------------------------------------------------

create or replace function private.is_iso_calendar_date(p_value text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_date date;
begin
  if p_value is null or p_value !~ '^\d{4}-\d{2}-\d{2}$' then
    return false;
  end if;
  v_date := p_value::date;
  return to_char(v_date, 'YYYY-MM-DD') = p_value;
exception when others then
  return false;
end;
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
      select 1 from jsonb_object_keys(p_value) key
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
        and private.is_iso_calendar_date(p_value #>> '{postOpDetails,surgeryDate}')
        and char_length(btrim(p_value #>> '{postOpDetails,precautions}')) between 1 and 4000
        and char_length(btrim(p_value #>> '{postOpDetails,weightBearingStatus}')) between 1 and 1000
        and p_value #> '{postOpDetails,protocolConfirmed}' = 'true'::jsonb
      )
    ),
    false
  );
$$;

alter table public.treatment_plans
  drop constraint if exists treatment_plans_input_shape_check;
alter table public.treatment_plans
  add constraint treatment_plans_input_shape_check
  check (private.is_valid_treatment_plan_input(planner_input)) not valid;
alter table public.treatment_plans
  validate constraint treatment_plans_input_shape_check;

revoke all on function private.is_iso_calendar_date(text)
  from public, anon, authenticated, service_role;
revoke all on function private.is_valid_patient_exercise_content(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.is_valid_treatment_plan_input(jsonb)
  from public, anon, authenticated, service_role;

comment on table public.exercise_catalog_versions is
  'Reviewed versioned patient-facing exercise content; prescriptions retain immutable snapshots.';
comment on column public.prescription_items.content_snapshot is
  'Exact reviewed instructions associated with the prescribed exercise version.';

commit;

update public.schema_migrations
set status = 'applied', applied_at = clock_timestamp()
where version = '016' and status = 'applying';

-- ════════════════════════════════════════════════════════════════
-- 017_ticket_workflow_and_escalation.sql
-- ════════════════════════════════════════════════════════════════
insert into public.schema_migrations (version, filename, checksum, status)
values ('017', '017_ticket_workflow_and_escalation.sql', 'a4256583068056642e7f6b4bfd87db93f660c673f7224e67d3156c40c7e0fbfc', 'applying');

-- Attributed ticket acknowledgement/closure, patient thread replies, and
-- operational escalation for server-triaged urgent patient messages.
-- Run after 016_exercise_catalog_and_date_validation.sql.

begin;

alter table public.tickets
  add column if not exists priority text not null default 'routine',
  add column if not exists acknowledged_by uuid
    references public.profiles (id) on delete restrict,
  add column if not exists acknowledged_at timestamptz,
  add column if not exists closed_by uuid
    references public.profiles (id) on delete restrict,
  add column if not exists closed_at timestamptz,
  add column if not exists closure_note text,
  add column if not exists last_patient_activity_at timestamptz,
  add column if not exists last_clinician_activity_at timestamptz;

alter table public.ticket_replies
  add column if not exists triage_priority text not null default 'routine';

update public.tickets ticket
set last_patient_activity_at = greatest(
      ticket.created_at,
      coalesce((
        select max(reply.created_at)
        from public.ticket_replies reply
        where reply.ticket_id = ticket.id and reply.sender = 'patient'
      ), ticket.created_at)
    ),
    last_clinician_activity_at = case
      when ticket.status = 'answered' then
        coalesce((
          select max(reply.created_at)
          from public.ticket_replies reply
          where reply.ticket_id = ticket.id and reply.sender = 'therapist'
        ), ticket.created_at)
      else (
        select max(reply.created_at)
        from public.ticket_replies reply
        where reply.ticket_id = ticket.id and reply.sender = 'therapist'
      )
    end
where ticket.last_patient_activity_at is null
   or (ticket.status = 'answered' and ticket.last_clinician_activity_at is null);

alter table public.tickets
  alter column last_patient_activity_at set default clock_timestamp(),
  alter column last_patient_activity_at set not null;

do $$
declare
  item record;
begin
  for item in
    select constraint_row.conname
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.tickets'::regclass
      and constraint_row.contype = 'c'
      and (
        pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%status%open%answered%'
        or constraint_row.conname in (
          'tickets_status_v2_check',
          'tickets_priority_v2_check',
          'tickets_workflow_state_v2_check'
        )
      )
  loop
    execute format(
      'alter table public.tickets drop constraint %I', item.conname
    );
  end loop;
end $$;

alter table public.tickets
  add constraint tickets_status_v2_check
    check (status in ('open', 'acknowledged', 'answered', 'closed')) not valid,
  add constraint tickets_priority_v2_check
    check (priority in ('routine', 'urgent', 'emergency')) not valid,
  add constraint tickets_workflow_state_v2_check check (
    char_length(coalesce(closure_note, '')) <= 2000
    and (
      (acknowledged_by is null and acknowledged_at is null)
      or (acknowledged_by is not null and acknowledged_at is not null)
    )
    and (
      (closed_by is null and closed_at is null and closure_note is null)
      or (
        closed_by is not null and closed_at is not null
        and char_length(btrim(closure_note)) between 3 and 2000
      )
    )
    and (
      (status = 'open'
        and acknowledged_by is null and acknowledged_at is null
        and closed_by is null and closed_at is null and closure_note is null)
      or
      (status = 'acknowledged'
        and acknowledged_by is not null and acknowledged_at is not null
        and closed_by is null and closed_at is null and closure_note is null)
      or
      (status = 'answered'
        and last_clinician_activity_at is not null
        and closed_by is null and closed_at is null and closure_note is null)
      or
      (status = 'closed'
        and closed_by is not null and closed_at is not null
        and char_length(btrim(closure_note)) between 3 and 2000)
    )
  ) not valid;

alter table public.ticket_replies
  drop constraint if exists ticket_replies_triage_priority_check;
alter table public.ticket_replies
  add constraint ticket_replies_triage_priority_check
    check (triage_priority in ('routine', 'urgent', 'emergency')) not valid;

alter table public.tickets validate constraint tickets_status_v2_check;
alter table public.tickets validate constraint tickets_priority_v2_check;
alter table public.tickets validate constraint tickets_workflow_state_v2_check;
alter table public.ticket_replies
  validate constraint ticket_replies_triage_priority_check;

create index if not exists tickets_work_queue_idx
  on public.tickets (status, priority, last_patient_activity_at desc, id);
create index if not exists tickets_creator_rate_limit_idx
  on public.tickets (created_by, created_at desc);

-- Extend the metadata-only alert queue. Patient free text remains in the
-- protected ticket tables and is never copied into clinical_alerts.
alter table public.clinical_alerts
  drop constraint if exists clinical_alerts_alert_type_check,
  drop constraint if exists clinical_alerts_source_table_check,
  drop constraint if exists clinical_alerts_alert_type_v2_check,
  drop constraint if exists clinical_alerts_source_table_v2_check;
alter table public.clinical_alerts
  add constraint clinical_alerts_alert_type_v2_check
    check (alert_type in ('high-pain', 'ticket-urgent', 'ticket-emergency'))
    not valid,
  add constraint clinical_alerts_source_table_v2_check
    check (source_table in ('patient_daily_logs', 'tickets', 'ticket_replies'))
    not valid;
alter table public.clinical_alerts
  validate constraint clinical_alerts_alert_type_v2_check;
alter table public.clinical_alerts
  validate constraint clinical_alerts_source_table_v2_check;

create or replace function private.ticket_priority_rank(p_priority text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_priority
    when 'routine' then 0
    when 'urgent' then 1
    when 'emergency' then 2
    else -1
  end;
$$;

revoke all on function private.ticket_priority_rank(text)
  from public, anon, authenticated, service_role;

-- Convert server-triaged ticket activity into an idempotent alert and pause
-- the currently actionable exercise prescription until clinician review.
create or replace function private.create_ticket_clinical_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.tickets%rowtype;
  v_priority text;
  v_source_table text;
  v_source_id uuid;
  v_source_time timestamptz;
  v_reported_by uuid;
  v_clinic_id uuid;
  v_case_id uuid;
  v_prescription public.exercise_prescriptions%rowtype;
  v_alert_id uuid;
begin
  if tg_table_name = 'tickets' then
    v_ticket := new;
    v_priority := new.priority;
    v_source_table := 'tickets';
    v_source_id := new.id;
    v_source_time := new.created_at;
    v_reported_by := new.created_by;
  else
    if new.sender <> 'patient' then
      return new;
    end if;
    select ticket.* into v_ticket
    from public.tickets ticket
    where ticket.id = new.ticket_id
    for update;
    if not found then
      raise exception using errcode = '23503', message = 'Ticket is unavailable';
    end if;
    v_priority := new.triage_priority;
    v_source_table := 'ticket_replies';
    v_source_id := new.id;
    v_source_time := new.created_at;
    v_reported_by := new.sender_user_id;
  end if;

  if v_priority not in ('urgent', 'emergency') then
    return new;
  end if;

  select patient.clinic_id into v_clinic_id
  from public.patients patient
  where patient.id = v_ticket.patient_id;
  if not found or v_ticket.episode_id is null then
    raise exception using errcode = '23503', message = 'Ticket patient context is unavailable';
  end if;

  select prescription.* into v_prescription
  from public.exercise_prescriptions prescription
  where prescription.episode_id = v_ticket.episode_id
    and prescription.status in ('published', 'suspended')
  order by
    case prescription.status when 'published' then 0 else 1 end,
    prescription.published_at desc
  limit 1
  for update;

  if found then
    v_case_id := v_prescription.case_id;
  else
    select patient_case.id into v_case_id
    from public.cases patient_case
    where patient_case.episode_id = v_ticket.episode_id
    order by patient_case.created_at desc, patient_case.id desc
    limit 1;
  end if;

  insert into public.clinical_alerts (
    clinic_id, patient_id, episode_id, case_id, prescription_id,
    alert_type, severity, source_table, source_id, source_recorded_at,
    reported_by
  ) values (
    v_clinic_id, v_ticket.patient_id, v_ticket.episode_id, v_case_id,
    case when v_prescription.id is null then null else v_prescription.id end,
    case v_priority
      when 'emergency' then 'ticket-emergency'
      else 'ticket-urgent'
    end,
    v_priority, v_source_table, v_source_id, v_source_time, v_reported_by
  )
  on conflict (alert_type, source_table, source_id) do nothing
  returning id into v_alert_id;

  if v_alert_id is not null and v_prescription.status = 'published' then
    update public.exercise_prescriptions prescription
    set status = 'suspended',
        suspended_by = coalesce(v_reported_by, v_prescription.published_by),
        suspended_at = clock_timestamp(),
        suspension_alert_id = v_alert_id
    where prescription.id = v_prescription.id
      and prescription.status = 'published';
  end if;
  return new;
end;
$$;

revoke all on function private.create_ticket_clinical_alert()
  from public, anon, authenticated, service_role;
drop trigger if exists tickets_create_clinical_alert on public.tickets;
create trigger tickets_create_clinical_alert
after insert on public.tickets
for each row execute function private.create_ticket_clinical_alert();
drop trigger if exists ticket_replies_create_clinical_alert
  on public.ticket_replies;
create trigger ticket_replies_create_clinical_alert
after insert on public.ticket_replies
for each row execute function private.create_ticket_clinical_alert();

-- Patient ticket creation is server-authenticated and rate-limited. Priority
-- is supplied by the same-origin API after multilingual safety detection.
create or replace function public.create_patient_ticket(
  p_patient_id uuid,
  p_episode_id uuid,
  p_subject text,
  p_message text,
  p_exercise_id text default null,
  p_priority text default 'routine'
)
returns table (
  ticket_id uuid,
  created_at timestamptz,
  status text,
  priority text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_ticket public.tickets%rowtype;
  v_subject text := btrim(coalesce(p_subject, ''));
  v_message text := btrim(coalesce(p_message, ''));
  v_exercise text := nullif(btrim(coalesce(p_exercise_id, '')), '');
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Patient authentication is required';
  end if;
  if char_length(v_subject) not between 1 and 200
     or char_length(v_message) not between 1 and 10000
     or p_priority not in ('routine', 'urgent', 'emergency')
     or (v_exercise is not null and v_exercise !~ '^[a-z0-9][a-z0-9_-]{1,99}$') then
    raise exception using errcode = '22023', message = 'Ticket content is invalid';
  end if;
  if not private.is_linked_patient(p_patient_id)
     or not private.is_active_episode_for_patient(p_episode_id, p_patient_id) then
    raise exception using errcode = '42501', message = 'Active patient access is required';
  end if;
  if v_exercise is not null and not exists (
    select 1
    from public.exercise_prescriptions prescription
    join public.prescription_items item
      on item.prescription_id = prescription.id
    where prescription.patient_id = p_patient_id
      and prescription.episode_id = p_episode_id
      and prescription.status = 'published'
      and prescription.start_date <= current_date
      and (prescription.end_date is null or prescription.end_date >= current_date)
      and item.exercise_id = v_exercise
  ) then
    raise exception using errcode = '22023', message = 'Exercise is not in the current prescription';
  end if;
  if (
    select count(*)
    from public.tickets recent
    where recent.created_by = v_actor
      and recent.created_at >= clock_timestamp() - interval '1 hour'
  ) >= 10 then
    raise exception using errcode = '54000', message = 'Ticket rate limit exceeded';
  end if;

  insert into public.tickets (
    patient_id, episode_id, exercise_id, subject, message, status, priority,
    created_by, last_patient_activity_at
  ) values (
    p_patient_id, p_episode_id, v_exercise, v_subject, v_message, 'open',
    p_priority, v_actor, clock_timestamp()
  ) returning * into v_ticket;

  return query select
    v_ticket.id, v_ticket.created_at, v_ticket.status, v_ticket.priority;
end;
$$;

create or replace function public.reply_to_patient_ticket(
  p_ticket_id uuid,
  p_content text,
  p_priority text default 'routine'
)
returns table (
  reply_id uuid,
  ticket_id uuid,
  sender text,
  sender_user_id uuid,
  content text,
  created_at timestamptz,
  ticket_status text,
  ticket_priority text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_ticket public.tickets%rowtype;
  v_reply public.ticket_replies%rowtype;
  v_content text := btrim(coalesce(p_content, ''));
  v_priority text;
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Patient authentication is required';
  end if;
  if char_length(v_content) not between 1 and 10000
     or p_priority not in ('routine', 'urgent', 'emergency') then
    raise exception using errcode = '22023', message = 'Reply content is invalid';
  end if;
  select ticket.* into v_ticket
  from public.tickets ticket
  where ticket.id = p_ticket_id
  for update;
  if not found
     or not private.is_linked_patient(v_ticket.patient_id)
     or v_ticket.episode_id is null
     or not private.is_active_episode_for_patient(
       v_ticket.episode_id, v_ticket.patient_id
     ) then
    raise exception using errcode = '42501', message = 'Active ticket access is required';
  end if;
  if v_ticket.status = 'closed' then
    raise exception using errcode = '23514', message = 'Closed ticket cannot be reopened by reply';
  end if;

  v_priority := case
    when private.ticket_priority_rank(p_priority)
         > private.ticket_priority_rank(v_ticket.priority) then p_priority
    else v_ticket.priority
  end;
  insert into public.ticket_replies (
    ticket_id, sender, sender_user_id, content, triage_priority
  ) values (
    v_ticket.id, 'patient', v_actor, v_content, p_priority
  ) returning * into v_reply;

  update public.tickets ticket
  set status = 'open',
      priority = v_priority,
      acknowledged_by = null,
      acknowledged_at = null,
      last_patient_activity_at = v_reply.created_at
  where ticket.id = v_ticket.id;

  return query select
    v_reply.id, v_reply.ticket_id, v_reply.sender, v_reply.sender_user_id,
    v_reply.content, v_reply.created_at, 'open'::text, v_priority;
end;
$$;

create or replace function public.acknowledge_ticket(p_ticket_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_ticket public.tickets%rowtype;
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Clinician authentication is required';
  end if;
  select ticket.* into v_ticket
  from public.tickets ticket
  where ticket.id = p_ticket_id
  for update;
  if not found or not private.can_manage_clinical_record(v_ticket.patient_id) then
    raise exception using errcode = '42501', message = 'Ticket access is not permitted';
  end if;
  if v_ticket.status = 'closed' then
    raise exception using errcode = '23514', message = 'Closed ticket cannot be acknowledged';
  end if;
  if v_ticket.status = 'open' then
    update public.tickets ticket
    set status = 'acknowledged',
        acknowledged_by = v_actor,
        acknowledged_at = clock_timestamp()
    where ticket.id = v_ticket.id;
  end if;
  return true;
end;
$$;

-- Clinician replies remain atomic with workflow state and actor attribution.
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
  v_ticket public.tickets%rowtype;
  v_reply public.ticket_replies%rowtype;
  v_content text := btrim(coalesce(p_content, ''));
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Clinician authentication is required';
  end if;
  if char_length(v_content) not between 1 and 10000 then
    raise exception using errcode = '22023', message = 'Reply content is invalid';
  end if;
  select ticket.* into v_ticket
  from public.tickets ticket
  where ticket.id = p_ticket_id
  for update;
  if not found or not private.can_manage_clinical_record(v_ticket.patient_id) then
    raise exception using errcode = '42501', message = 'Ticket access is not permitted';
  end if;
  if v_ticket.status = 'closed' then
    raise exception using errcode = '23514', message = 'Closed ticket cannot receive replies';
  end if;

  insert into public.ticket_replies (
    ticket_id, sender, sender_user_id, content, triage_priority
  ) values (
    v_ticket.id, 'therapist', v_actor, v_content, 'routine'
  ) returning * into v_reply;

  update public.tickets ticket
  set status = 'answered',
      acknowledged_by = coalesce(ticket.acknowledged_by, v_actor),
      acknowledged_at = coalesce(ticket.acknowledged_at, v_reply.created_at),
      last_clinician_activity_at = v_reply.created_at
  where ticket.id = v_ticket.id;

  return query select
    v_reply.id, v_reply.ticket_id, v_reply.sender, v_reply.sender_user_id,
    v_reply.content, v_reply.created_at, 'answered'::text;
end;
$$;

create or replace function public.close_ticket(
  p_ticket_id uuid,
  p_closure_note text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_ticket public.tickets%rowtype;
  v_note text := btrim(coalesce(p_closure_note, ''));
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Clinician authentication is required';
  end if;
  if char_length(v_note) not between 3 and 2000 then
    raise exception using errcode = '22023', message = 'Closure note is required';
  end if;
  select ticket.* into v_ticket
  from public.tickets ticket
  where ticket.id = p_ticket_id
  for update;
  if not found or not private.can_manage_clinical_record(v_ticket.patient_id) then
    raise exception using errcode = '42501', message = 'Ticket access is not permitted';
  end if;
  if v_ticket.status = 'closed' then
    return true;
  end if;
  if v_ticket.status <> 'answered' then
    raise exception using errcode = '23514', message = 'Reply before closing the ticket';
  end if;
  if exists (
    select 1
    from public.clinical_alerts alert
    where alert.status in ('open', 'acknowledged')
      and (
        (alert.source_table = 'tickets' and alert.source_id = v_ticket.id)
        or (
          alert.source_table = 'ticket_replies'
          and exists (
            select 1 from public.ticket_replies reply
            where reply.ticket_id = v_ticket.id and reply.id = alert.source_id
          )
        )
      )
  ) then
    raise exception using errcode = '23514', message = 'Resolve ticket clinical alerts before closure';
  end if;

  update public.tickets ticket
  set status = 'closed',
      closed_by = v_actor,
      closed_at = clock_timestamp(),
      closure_note = v_note
  where ticket.id = v_ticket.id;
  return true;
end;
$$;

-- The service role can add only an idempotent automated acknowledgement via
-- this narrow function; it no longer has direct ticket-reply mutation.
create or replace function public.attach_ticket_auto_ack(
  p_ticket_id uuid,
  p_expected_creator uuid,
  p_content text
)
returns table (
  reply_id uuid,
  content text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reply public.ticket_replies%rowtype;
  v_content text := btrim(coalesce(p_content, ''));
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service authentication is required';
  end if;
  if char_length(v_content) not between 1 and 10000 then
    raise exception using errcode = '22023', message = 'Acknowledgement content is invalid';
  end if;
  perform 1 from public.tickets ticket
  where ticket.id = p_ticket_id and ticket.created_by = p_expected_creator
  for key share;
  if not found then
    raise exception using errcode = '42501', message = 'Ticket creator mismatch';
  end if;

  select reply.* into v_reply
  from public.ticket_replies reply
  where reply.ticket_id = p_ticket_id and reply.sender = 'ai';
  if not found then
    begin
      insert into public.ticket_replies (
        ticket_id, sender, sender_user_id, content, triage_priority
      ) values (
        p_ticket_id, 'ai', null, v_content, 'routine'
      ) returning * into v_reply;
    exception when unique_violation then
      select reply.* into v_reply
      from public.ticket_replies reply
      where reply.ticket_id = p_ticket_id and reply.sender = 'ai';
    end;
  end if;
  return query select v_reply.id, v_reply.content, v_reply.created_at;
end;
$$;

drop policy if exists "tickets insert" on public.tickets;
drop policy if exists "replies insert" on public.ticket_replies;
revoke insert, update, delete, truncate on table public.tickets
  from authenticated, service_role;
revoke insert, update, delete, truncate on table public.ticket_replies
  from authenticated, service_role;

revoke all on function public.create_patient_ticket(
  uuid, uuid, text, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.reply_to_patient_ticket(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.acknowledge_ticket(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.reply_to_ticket(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.close_ticket(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.attach_ticket_auto_ack(uuid, uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function public.create_patient_ticket(
  uuid, uuid, text, text, text, text
) to authenticated;
grant execute on function public.reply_to_patient_ticket(uuid, text, text)
  to authenticated;
grant execute on function public.acknowledge_ticket(uuid) to authenticated;
grant execute on function public.reply_to_ticket(uuid, text) to authenticated;
grant execute on function public.close_ticket(uuid, text) to authenticated;
grant execute on function public.attach_ticket_auto_ack(uuid, uuid, text)
  to service_role;

comment on function public.create_patient_ticket(
  uuid, uuid, text, text, text, text
) is
  'Creates a rate-limited active-episode patient ticket with server-classified priority.';
comment on function public.reply_to_patient_ticket(uuid, text, text) is
  'Adds an attributed patient reply, reopens the ticket, and preserves the highest triage priority.';
comment on function public.close_ticket(uuid, text) is
  'Closes an answered ticket only after every related clinical alert is resolved.';

commit;

update public.schema_migrations
set status = 'applied', applied_at = clock_timestamp()
where version = '017' and status = 'applying';

-- ════════════════════════════════════════════════════════════════
-- 018_clinical_documentation_and_outcomes.sql
-- ════════════════════════════════════════════════════════════════
insert into public.schema_migrations (version, filename, checksum, status)
values ('018', '018_clinical_documentation_and_outcomes.sql', 'f28382586eb8572c64c9209ddb8fd2a2e52bb3797a40396cc9b00e2eff4b6ec7', 'applying');

-- Append-only clinician session notes and versioned outcome measurements.
-- Run after 017_ticket_workflow_and_escalation.sql.

begin;

create table if not exists public.outcome_measure_catalog_versions (
  instrument_key text not null,
  version integer not null check (version between 1 and 1000),
  display_name text not null,
  score_min numeric(10,2) not null,
  score_max numeric(10,2) not null,
  unit text not null,
  direction text not null check (direction in ('higher-better', 'higher-worse')),
  active boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  primary key (instrument_key, version),
  check (instrument_key ~ '^[a-z0-9][a-z0-9_-]{1,99}$'),
  check (char_length(btrim(display_name)) between 2 and 200),
  check (score_min < score_max),
  check (char_length(btrim(unit)) between 1 and 40)
);
create unique index if not exists outcome_measure_catalog_one_active_idx
  on public.outcome_measure_catalog_versions (instrument_key) where active;

insert into public.outcome_measure_catalog_versions (
  instrument_key, version, display_name, score_min, score_max, unit,
  direction, active
) values
  ('nrs_pain', 1, 'Numeric Pain Rating Scale (NPRS/NRS)', 0, 10, '0–10', 'higher-worse', true),
  ('lefs', 1, 'Lower Extremity Functional Scale (LEFS)', 0, 80, '0–80', 'higher-better', true),
  ('odi', 1, 'Oswestry Disability Index (ODI)', 0, 100, '%', 'higher-worse', true),
  ('ndi', 1, 'Neck Disability Index (NDI)', 0, 50, '0–50', 'higher-worse', true),
  ('quickdash', 1, 'QuickDASH', 0, 100, '0–100', 'higher-worse', true),
  ('psfs', 1, 'Patient-Specific Functional Scale (PSFS)', 0, 10, '0–10', 'higher-better', true)
on conflict (instrument_key, version) do update
set display_name = excluded.display_name,
    score_min = excluded.score_min,
    score_max = excluded.score_max,
    unit = excluded.unit,
    direction = excluded.direction,
    active = excluded.active;

alter table public.outcome_measure_catalog_versions enable row level security;
revoke all on table public.outcome_measure_catalog_versions
  from public, anon, authenticated, service_role;
grant select on table public.outcome_measure_catalog_versions to authenticated;
drop policy if exists "authenticated outcome catalog read"
  on public.outcome_measure_catalog_versions;
create policy "authenticated outcome catalog read"
  on public.outcome_measure_catalog_versions for select to authenticated
  using (active);

create table if not exists public.clinical_session_notes (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  episode_id uuid not null references public.care_episodes (id) on delete restrict,
  case_id uuid references public.cases (id) on delete restrict,
  occurred_at timestamptz not null,
  subjective text not null default '',
  objective text not null default '',
  interventions text not null default '',
  response text not null default '',
  plan text not null default '',
  authored_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  supersedes_id uuid references public.clinical_session_notes (id) on delete restrict,
  correction_reason text,
  check (
    char_length(subjective) <= 10000
    and char_length(objective) <= 10000
    and char_length(interventions) <= 10000
    and char_length(response) <= 10000
    and char_length(plan) <= 10000
    and (
      char_length(btrim(subjective)) > 0
      or char_length(btrim(objective)) > 0
      or char_length(btrim(interventions)) > 0
      or char_length(btrim(response)) > 0
      or char_length(btrim(plan)) > 0
    )
  ),
  check (
    (supersedes_id is null and correction_reason is null)
    or (
      supersedes_id is not null
      and char_length(btrim(correction_reason)) between 3 and 1000
    )
  )
);
create unique index if not exists clinical_session_notes_one_correction_idx
  on public.clinical_session_notes (supersedes_id)
  where supersedes_id is not null;
create index if not exists clinical_session_notes_episode_time_idx
  on public.clinical_session_notes (episode_id, occurred_at desc, created_at desc);

create table if not exists public.outcome_measurements_v2 (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  episode_id uuid not null references public.care_episodes (id) on delete restrict,
  case_id uuid references public.cases (id) on delete restrict,
  instrument_key text not null,
  instrument_version integer not null,
  instrument_name_snapshot text not null,
  score numeric(10,2) not null,
  score_min_snapshot numeric(10,2) not null,
  score_max_snapshot numeric(10,2) not null,
  unit_snapshot text not null,
  direction_snapshot text not null,
  measured_at date not null,
  notes text,
  authored_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  supersedes_id uuid references public.outcome_measurements_v2 (id) on delete restrict,
  correction_reason text,
  foreign key (instrument_key, instrument_version)
    references public.outcome_measure_catalog_versions (instrument_key, version)
    on delete restrict,
  check (score between score_min_snapshot and score_max_snapshot),
  check (direction_snapshot in ('higher-better', 'higher-worse')),
  check (char_length(coalesce(notes, '')) <= 5000),
  check (
    (supersedes_id is null and correction_reason is null)
    or (
      supersedes_id is not null
      and char_length(btrim(correction_reason)) between 3 and 1000
    )
  )
);
create unique index if not exists outcome_measurements_v2_one_correction_idx
  on public.outcome_measurements_v2 (supersedes_id)
  where supersedes_id is not null;
create index if not exists outcome_measurements_v2_episode_time_idx
  on public.outcome_measurements_v2 (
    episode_id, instrument_key, measured_at desc, created_at desc
  );

alter table public.clinical_session_notes enable row level security;
alter table public.outcome_measurements_v2 enable row level security;
revoke all on table public.clinical_session_notes
  from public, anon, authenticated, service_role;
revoke all on table public.outcome_measurements_v2
  from public, anon, authenticated, service_role;
grant select on table public.clinical_session_notes to authenticated;
grant select on table public.outcome_measurements_v2 to authenticated;

drop policy if exists "clinical session notes clinician read"
  on public.clinical_session_notes;
create policy "clinical session notes clinician read"
  on public.clinical_session_notes for select to authenticated
  using (private.can_manage_clinical_record(patient_id));
drop policy if exists "outcome measurements clinician read"
  on public.outcome_measurements_v2;
create policy "outcome measurements clinician read"
  on public.outcome_measurements_v2 for select to authenticated
  using (private.can_manage_clinical_record(patient_id));

create or replace function private.reject_clinical_documentation_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'Signed clinical documentation is append-only; create a correction';
end;
$$;
revoke all on function private.reject_clinical_documentation_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists clinical_session_notes_immutable
  on public.clinical_session_notes;
create trigger clinical_session_notes_immutable
before update or delete on public.clinical_session_notes
for each row execute function private.reject_clinical_documentation_mutation();
drop trigger if exists outcome_measurements_v2_immutable
  on public.outcome_measurements_v2;
create trigger outcome_measurements_v2_immutable
before update or delete on public.outcome_measurements_v2
for each row execute function private.reject_clinical_documentation_mutation();

drop trigger if exists audit_row_change on public.clinical_session_notes;
create trigger audit_row_change
after insert on public.clinical_session_notes
for each row execute function private.write_audit_log();
drop trigger if exists audit_row_change on public.outcome_measurements_v2;
create trigger audit_row_change
after insert on public.outcome_measurements_v2
for each row execute function private.write_audit_log();

create or replace function private.load_documentation_context(
  p_episode_id uuid,
  p_case_id uuid,
  out clinic_id uuid,
  out patient_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinic_id uuid;
  v_patient_id uuid;
begin
  select patient.clinic_id, episode.patient_id
    into v_clinic_id, v_patient_id
  from public.care_episodes episode
  join public.patients patient on patient.id = episode.patient_id
  where episode.id = p_episode_id
  for key share of episode, patient;
  if not found or not private.can_manage_clinical_record(v_patient_id) then
    raise exception using errcode = '42501', message = 'Episode access is not permitted';
  end if;
  if p_case_id is not null and not exists (
    select 1 from public.cases patient_case
    where patient_case.id = p_case_id
      and patient_case.patient_id = v_patient_id
      and patient_case.episode_id = p_episode_id
      and patient_case.clinic_id = v_clinic_id
  ) then
    raise exception using errcode = '23514', message = 'Case does not belong to this episode';
  end if;
  clinic_id := v_clinic_id;
  patient_id := v_patient_id;
end;
$$;
revoke all on function private.load_documentation_context(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.append_clinical_session_note(
  p_episode_id uuid,
  p_case_id uuid,
  p_occurred_at timestamptz,
  p_subjective text,
  p_objective text,
  p_interventions text,
  p_response text,
  p_plan text,
  p_supersedes_id uuid default null,
  p_correction_reason text default null
)
returns table (
  note_id uuid,
  authored_by uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_clinic_id uuid;
  v_patient_id uuid;
  v_original public.clinical_session_notes%rowtype;
  v_note public.clinical_session_notes%rowtype;
  v_reason text := nullif(btrim(coalesce(p_correction_reason, '')), '');
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Clinician authentication is required';
  end if;
  if p_occurred_at is null
     or p_occurred_at < '2000-01-01'::timestamptz
     or p_occurred_at > clock_timestamp() + interval '1 day'
     or greatest(
       char_length(coalesce(p_subjective, '')),
       char_length(coalesce(p_objective, '')),
       char_length(coalesce(p_interventions, '')),
       char_length(coalesce(p_response, '')),
       char_length(coalesce(p_plan, ''))
     ) > 10000
     or concat(
       btrim(coalesce(p_subjective, '')),
       btrim(coalesce(p_objective, '')),
       btrim(coalesce(p_interventions, '')),
       btrim(coalesce(p_response, '')),
       btrim(coalesce(p_plan, ''))
     ) = ''
     or (p_supersedes_id is null and v_reason is not null)
     or (p_supersedes_id is not null and char_length(coalesce(v_reason, '')) not between 3 and 1000) then
    raise exception using errcode = '22023', message = 'Session note content is invalid';
  end if;

  select context.clinic_id, context.patient_id
    into v_clinic_id, v_patient_id
  from private.load_documentation_context(p_episode_id, p_case_id) context;

  if p_supersedes_id is not null then
    select original.* into v_original
    from public.clinical_session_notes original
    where original.id = p_supersedes_id
    for key share;
    if not found
       or v_original.episode_id <> p_episode_id
       or exists (
         select 1 from public.clinical_session_notes correction
         where correction.supersedes_id = p_supersedes_id
       ) then
      raise exception using errcode = '23514', message = 'Session note cannot be corrected';
    end if;
  end if;

  insert into public.clinical_session_notes (
    clinic_id, patient_id, episode_id, case_id, occurred_at,
    subjective, objective, interventions, response, plan,
    authored_by, supersedes_id, correction_reason
  ) values (
    v_clinic_id, v_patient_id, p_episode_id, p_case_id, p_occurred_at,
    btrim(coalesce(p_subjective, '')), btrim(coalesce(p_objective, '')),
    btrim(coalesce(p_interventions, '')), btrim(coalesce(p_response, '')),
    btrim(coalesce(p_plan, '')), v_actor, p_supersedes_id, v_reason
  ) returning * into v_note;
  return query select v_note.id, v_note.authored_by, v_note.created_at;
end;
$$;

create or replace function public.record_outcome_measurement_v2(
  p_episode_id uuid,
  p_case_id uuid,
  p_instrument_key text,
  p_score numeric,
  p_measured_at date,
  p_notes text default null,
  p_supersedes_id uuid default null,
  p_correction_reason text default null
)
returns table (
  measurement_id uuid,
  authored_by uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_clinic_id uuid;
  v_patient_id uuid;
  v_catalog public.outcome_measure_catalog_versions%rowtype;
  v_original public.outcome_measurements_v2%rowtype;
  v_measurement public.outcome_measurements_v2%rowtype;
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_reason text := nullif(btrim(coalesce(p_correction_reason, '')), '');
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Clinician authentication is required';
  end if;
  if p_instrument_key is null
     or p_score is null
     or p_measured_at is null
     or p_measured_at < '2000-01-01'::date
     or p_measured_at > current_date + 1
     or char_length(coalesce(v_notes, '')) > 5000
     or (p_supersedes_id is null and v_reason is not null)
     or (p_supersedes_id is not null and char_length(coalesce(v_reason, '')) not between 3 and 1000) then
    raise exception using errcode = '22023', message = 'Outcome measurement is invalid';
  end if;

  select context.clinic_id, context.patient_id
    into v_clinic_id, v_patient_id
  from private.load_documentation_context(p_episode_id, p_case_id) context;

  if p_supersedes_id is not null then
    select original.* into v_original
    from public.outcome_measurements_v2 original
    where original.id = p_supersedes_id
    for key share;
    if not found
       or v_original.episode_id <> p_episode_id
       or v_original.instrument_key <> p_instrument_key
       or exists (
         select 1 from public.outcome_measurements_v2 correction
         where correction.supersedes_id = p_supersedes_id
       ) then
      raise exception using errcode = '23514', message = 'Outcome measurement cannot be corrected';
    end if;
    select catalog.* into v_catalog
    from public.outcome_measure_catalog_versions catalog
    where catalog.instrument_key = v_original.instrument_key
      and catalog.version = v_original.instrument_version;
  else
    select catalog.* into v_catalog
    from public.outcome_measure_catalog_versions catalog
    where catalog.instrument_key = p_instrument_key and catalog.active
    for key share;
  end if;
  if not found or p_score < v_catalog.score_min or p_score > v_catalog.score_max then
    raise exception using errcode = '22023', message = 'Outcome score is outside the reviewed instrument range';
  end if;

  insert into public.outcome_measurements_v2 (
    clinic_id, patient_id, episode_id, case_id,
    instrument_key, instrument_version, instrument_name_snapshot,
    score, score_min_snapshot, score_max_snapshot, unit_snapshot,
    direction_snapshot, measured_at, notes, authored_by,
    supersedes_id, correction_reason
  ) values (
    v_clinic_id, v_patient_id, p_episode_id, p_case_id,
    v_catalog.instrument_key, v_catalog.version, v_catalog.display_name,
    p_score, v_catalog.score_min, v_catalog.score_max, v_catalog.unit,
    v_catalog.direction, p_measured_at, v_notes, v_actor,
    p_supersedes_id, v_reason
  ) returning * into v_measurement;
  return query select
    v_measurement.id, v_measurement.authored_by, v_measurement.created_at;
end;
$$;

revoke all on function public.append_clinical_session_note(
  uuid, uuid, timestamptz, text, text, text, text, text, uuid, text
) from public, anon, authenticated, service_role;
revoke all on function public.record_outcome_measurement_v2(
  uuid, uuid, text, numeric, date, text, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.append_clinical_session_note(
  uuid, uuid, timestamptz, text, text, text, text, text, uuid, text
) to authenticated;
grant execute on function public.record_outcome_measurement_v2(
  uuid, uuid, text, numeric, date, text, uuid, text
) to authenticated;

-- Retire the mutable legacy documentation paths. Historical rows remain
-- readable to currently authorized clinicians but cannot be changed further.
drop policy if exists "sessions manage" on public.sessions;
drop policy if exists "measurements write" on public.clinical_measurements;
revoke insert, update, delete, truncate on table public.sessions
  from authenticated, service_role;
revoke insert, update, delete, truncate on table public.clinical_measurements
  from authenticated, service_role;
revoke insert, update, delete, truncate on table public.clinical_session_notes
  from authenticated, service_role;
revoke insert, update, delete, truncate on table public.outcome_measurements_v2
  from authenticated, service_role;

comment on table public.clinical_session_notes is
  'Append-only signed session documentation; corrections are new rows linked by supersedes_id.';
comment on table public.outcome_measurements_v2 is
  'Append-only scored outcomes with immutable catalog-version snapshots and attributed corrections.';
comment on table public.sessions is
  'Legacy read-only session rows; new signed documentation uses clinical_session_notes.';
comment on table public.clinical_measurements is
  'Legacy read-only measurement rows; new outcomes use outcome_measurements_v2.';

commit;

update public.schema_migrations
set status = 'applied', applied_at = clock_timestamp()
where version = '018' and status = 'applying';

-- ════════════════════════════════════════════════════════════════
-- 019_notification_outbox.sql
-- ════════════════════════════════════════════════════════════════
insert into public.schema_migrations (version, filename, checksum, status)
values ('019', '019_notification_outbox.sql', 'b85cdf0a553f640450b3aa5ff2724ffae32a300ea1d50c58396604717c728aa0', 'applying');

-- Durable, metadata-minimized delivery outbox for urgent clinical alerts.
-- Run after 018_clinical_documentation_and_outcomes.sql.

begin;

create or replace function private.is_valid_notification_payload(p_value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_value) = 'object'
    and p_value ?& array[
      'schemaVersion', 'event', 'alertId', 'clinicId', 'patientId',
      'severity', 'alertType', 'createdAt'
    ]
    and (select count(*) = 8 from jsonb_object_keys(p_value))
    and p_value ->> 'event' = 'clinical-alert.created'
    and p_value ->> 'severity' in ('urgent', 'emergency')
    and pg_column_size(p_value) <= 4096,
    false
  );
$$;
revoke all on function private.is_valid_notification_payload(jsonb)
  from public, anon, authenticated, service_role;

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  alert_id uuid not null references public.clinical_alerts (id) on delete restrict,
  channel text not null default 'webhook' check (channel = 'webhook'),
  payload jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'delivered', 'dead-letter')),
  attempts smallint not null default 0 check (attempts between 0 and 8),
  next_attempt_at timestamptz not null default clock_timestamp(),
  locked_at timestamptz,
  delivered_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default clock_timestamp(),
  check (event_key ~ '^clinical-alert:[0-9a-f-]{36}:created$'),
  check (private.is_valid_notification_payload(payload)),
  check (last_error_code is null or last_error_code ~ '^[a-z0-9_-]{1,80}$'),
  check (
    (status = 'pending' and locked_at is null and delivered_at is null)
    or (status = 'processing' and locked_at is not null and delivered_at is null)
    or (status = 'delivered' and locked_at is null and delivered_at is not null)
    or (status = 'dead-letter' and locked_at is null and delivered_at is null)
  )
);
create index if not exists notification_outbox_claim_idx
  on public.notification_outbox (next_attempt_at, created_at, id)
  where status = 'pending';
create index if not exists notification_outbox_alert_idx
  on public.notification_outbox (alert_id);

create table if not exists public.notification_delivery_attempts (
  id bigint generated always as identity primary key,
  notification_id uuid not null
    references public.notification_outbox (id) on delete restrict,
  attempted_at timestamptz not null default clock_timestamp(),
  success boolean not null,
  error_code text,
  response_status smallint,
  duration_ms integer,
  check (error_code is null or error_code ~ '^[a-z0-9_-]{1,80}$'),
  check (response_status is null or response_status between 100 and 599),
  check (duration_ms is null or duration_ms between 0 and 120000),
  check ((success and error_code is null) or not success)
);
create index if not exists notification_delivery_attempts_parent_idx
  on public.notification_delivery_attempts (notification_id, attempted_at desc);

alter table public.notification_outbox enable row level security;
alter table public.notification_delivery_attempts enable row level security;
revoke all on table public.notification_outbox
  from public, anon, authenticated, service_role;
revoke all on table public.notification_delivery_attempts
  from public, anon, authenticated, service_role;
revoke all on sequence public.notification_delivery_attempts_id_seq
  from public, anon, authenticated, service_role;

create or replace function private.reject_notification_attempt_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'Notification attempts are append-only';
end;
$$;
revoke all on function private.reject_notification_attempt_mutation()
  from public, anon, authenticated, service_role;
drop trigger if exists notification_delivery_attempts_immutable
  on public.notification_delivery_attempts;
create trigger notification_delivery_attempts_immutable
before update or delete on public.notification_delivery_attempts
for each row execute function private.reject_notification_attempt_mutation();

create or replace function private.enqueue_clinical_alert_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notification_outbox (
    event_key, clinic_id, patient_id, alert_id, payload
  ) values (
    'clinical-alert:' || new.id::text || ':created',
    new.clinic_id,
    new.patient_id,
    new.id,
    jsonb_build_object(
      'schemaVersion', 1,
      'event', 'clinical-alert.created',
      'alertId', new.id,
      'clinicId', new.clinic_id,
      'patientId', new.patient_id,
      'severity', new.severity,
      'alertType', new.alert_type,
      'createdAt', new.created_at
    )
  ) on conflict (event_key) do nothing;
  return new;
end;
$$;
revoke all on function private.enqueue_clinical_alert_notification()
  from public, anon, authenticated, service_role;
drop trigger if exists clinical_alert_enqueue_notification
  on public.clinical_alerts;
create trigger clinical_alert_enqueue_notification
after insert on public.clinical_alerts
for each row execute function private.enqueue_clinical_alert_notification();

-- Existing unresolved alerts are queued once when the migration is adopted.
insert into public.notification_outbox (
  event_key, clinic_id, patient_id, alert_id, payload, created_at
)
select
  'clinical-alert:' || alert.id::text || ':created',
  alert.clinic_id,
  alert.patient_id,
  alert.id,
  jsonb_build_object(
    'schemaVersion', 1,
    'event', 'clinical-alert.created',
    'alertId', alert.id,
    'clinicId', alert.clinic_id,
    'patientId', alert.patient_id,
    'severity', alert.severity,
    'alertType', alert.alert_type,
    'createdAt', alert.created_at
  ),
  alert.created_at
from public.clinical_alerts alert
where alert.status in ('open', 'acknowledged')
on conflict (event_key) do nothing;

create or replace function public.claim_notification_batch(
  p_limit integer default 20
)
returns table (
  notification_id uuid,
  event_key text,
  payload jsonb,
  attempt_number integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service authentication is required';
  end if;
  if p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'Notification batch size is invalid';
  end if;

  -- A crashed worker lease becomes a failed attempt and is retried or moved
  -- to dead-letter without losing the durable event.
  with expired as (
    update public.notification_outbox notification
    set attempts = least(8, notification.attempts + 1),
        status = case
          when notification.attempts + 1 >= 8 then 'dead-letter'
          else 'pending'
        end,
        locked_at = null,
        next_attempt_at = case
          when notification.attempts + 1 >= 8 then notification.next_attempt_at
          else clock_timestamp() + interval '5 minutes'
        end,
        last_error_code = 'worker_lease_expired'
    where notification.status = 'processing'
      and notification.locked_at < clock_timestamp() - interval '10 minutes'
    returning notification.id
  )
  insert into public.notification_delivery_attempts (
    notification_id, success, error_code
  )
  select expired.id, false, 'worker_lease_expired'
  from expired;

  return query
  with candidates as (
    select notification.id
    from public.notification_outbox notification
    where notification.status = 'pending'
      and notification.next_attempt_at <= clock_timestamp()
    order by
      case notification.payload ->> 'severity'
        when 'emergency' then 0 else 1
      end,
      notification.created_at,
      notification.id
    limit p_limit
    for update skip locked
  ), claimed as (
    update public.notification_outbox notification
    set status = 'processing', locked_at = clock_timestamp()
    from candidates
    where notification.id = candidates.id
    returning notification.*
  )
  select claimed.id, claimed.event_key, claimed.payload,
         (claimed.attempts + 1)::integer
  from claimed
  order by claimed.created_at, claimed.id;
end;
$$;

create or replace function public.complete_notification_delivery(
  p_notification_id uuid,
  p_success boolean,
  p_error_code text default null,
  p_response_status integer default null,
  p_duration_ms integer default null,
  p_retry_after_seconds integer default 60
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_notification public.notification_outbox%rowtype;
  v_error text := nullif(btrim(coalesce(p_error_code, '')), '');
  v_attempts integer;
  v_status text;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service authentication is required';
  end if;
  if p_notification_id is null
     or p_success is null
     or (v_error is not null and v_error !~ '^[a-z0-9_-]{1,80}$')
     or (p_response_status is not null and p_response_status not between 100 and 599)
     or (p_duration_ms is not null and p_duration_ms not between 0 and 120000)
     or p_retry_after_seconds not between 30 and 3600 then
    raise exception using errcode = '22023', message = 'Notification completion is invalid';
  end if;
  if p_success and v_error is not null then
    raise exception using errcode = '22023', message = 'Successful delivery cannot have an error code';
  end if;

  select notification.* into v_notification
  from public.notification_outbox notification
  where notification.id = p_notification_id
  for update;
  if not found or v_notification.status <> 'processing' then
    raise exception using errcode = '23514', message = 'Notification is not held by a worker';
  end if;

  insert into public.notification_delivery_attempts (
    notification_id, success, error_code, response_status, duration_ms
  ) values (
    v_notification.id, p_success, v_error, p_response_status, p_duration_ms
  );

  if p_success then
    update public.notification_outbox notification
    set status = 'delivered', locked_at = null,
        delivered_at = clock_timestamp(), last_error_code = null
    where notification.id = v_notification.id;
    return 'delivered';
  end if;

  v_attempts := v_notification.attempts + 1;
  v_status := case when v_attempts >= 8 then 'dead-letter' else 'pending' end;
  update public.notification_outbox notification
  set attempts = v_attempts,
      status = v_status,
      locked_at = null,
      next_attempt_at = case
        when v_status = 'dead-letter' then notification.next_attempt_at
        else clock_timestamp() + make_interval(secs => p_retry_after_seconds)
      end,
      last_error_code = coalesce(v_error, 'delivery_failed')
  where notification.id = v_notification.id;
  return v_status;
end;
$$;

create or replace function public.get_notification_delivery_health()
returns table (
  pending_count bigint,
  processing_count bigint,
  dead_letter_count bigint,
  oldest_pending_seconds bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service authentication is required';
  end if;

  return query
  select
    count(*) filter (where notification.status = 'pending'),
    count(*) filter (where notification.status = 'processing'),
    count(*) filter (where notification.status = 'dead-letter'),
    coalesce(
      greatest(
        0,
        extract(epoch from (
          clock_timestamp() - min(notification.created_at)
            filter (where notification.status = 'pending')
        ))::bigint
      ),
      0
    )
  from public.notification_outbox notification;
end;
$$;

revoke all on function public.claim_notification_batch(integer)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_notification_delivery(
  uuid, boolean, text, integer, integer, integer
) from public, anon, authenticated, service_role;
revoke all on function public.get_notification_delivery_health()
  from public, anon, authenticated, service_role;
grant execute on function public.claim_notification_batch(integer)
  to service_role;
grant execute on function public.complete_notification_delivery(
  uuid, boolean, text, integer, integer, integer
) to service_role;
grant execute on function public.get_notification_delivery_health()
  to service_role;

comment on table public.notification_outbox is
  'Durable metadata-only clinical alert outbox. No patient free text or name is copied into delivery payloads.';
comment on function public.claim_notification_batch(integer) is
  'Service-only SKIP LOCKED lease for bounded notification delivery batches.';
comment on function public.get_notification_delivery_health() is
  'Service-only aggregate queue health without patient identifiers or payloads.';

commit;

update public.schema_migrations
set status = 'applied', applied_at = clock_timestamp()
where version = '019' and status = 'applying';

-- ════════════════════════════════════════════════════════════════
-- 020_case_assessment_versioning.sql
-- ════════════════════════════════════════════════════════════════
insert into public.schema_migrations (version, filename, checksum, status)
values ('020', '020_case_assessment_versioning.sql', 'c4d0030ef03444a7ed6f456223c26e09393998ad95a87d3f4212d4e3754f3097', 'applying');

-- Append-only, clinician-attributed intake assessment history.
-- Run after 019_notification_outbox.sql.

begin;

-- The browser submits one exact, bounded snapshot. Keeping validation in a
-- private helper makes the RPC fail closed when fields are omitted, renamed,
-- mistyped, or added by an incompatible client.
create or replace function private.is_valid_case_assessment_payload(
  p_value jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_age numeric;
  v_pain numeric;
begin
  if p_value is null
     or jsonb_typeof(p_value) <> 'object'
     or pg_column_size(p_value) > 100000
     or not p_value ?& array[
       'name', 'age', 'gender', 'region', 'main_complaint',
       'pain_location', 'pain_intensity', 'duration', 'mechanism',
       'aggravating', 'easing', 'medical_history', 'surgical_history',
       'imaging', 'medications', 'functional_limitations', 'patient_goal'
     ]
     or (select count(*) from jsonb_object_keys(p_value)) <> 17
     or jsonb_typeof(p_value -> 'name') <> 'string'
     or jsonb_typeof(p_value -> 'age') not in ('number', 'null')
     or jsonb_typeof(p_value -> 'gender') not in ('string', 'null')
     or jsonb_typeof(p_value -> 'region') <> 'string'
     or jsonb_typeof(p_value -> 'main_complaint') <> 'string'
     or jsonb_typeof(p_value -> 'pain_location') <> 'string'
     or jsonb_typeof(p_value -> 'pain_intensity') <> 'number'
     or jsonb_typeof(p_value -> 'duration') <> 'string'
     or jsonb_typeof(p_value -> 'mechanism') <> 'string'
     or jsonb_typeof(p_value -> 'aggravating') <> 'string'
     or jsonb_typeof(p_value -> 'easing') <> 'string'
     or jsonb_typeof(p_value -> 'medical_history') <> 'string'
     or jsonb_typeof(p_value -> 'surgical_history') <> 'string'
     or jsonb_typeof(p_value -> 'imaging') <> 'string'
     or jsonb_typeof(p_value -> 'medications') <> 'string'
     or jsonb_typeof(p_value -> 'functional_limitations') <> 'string'
     or jsonb_typeof(p_value -> 'patient_goal') <> 'string' then
    return false;
  end if;

  begin
    v_age := (p_value ->> 'age')::numeric;
    v_pain := (p_value ->> 'pain_intensity')::numeric;
  exception when others then
    return false;
  end;

  return
    char_length(btrim(p_value ->> 'name')) between 1 and 200
    and (
      v_age is null
      or (v_age between 0 and 120 and v_age = trunc(v_age))
    )
    and (
      p_value ->> 'gender' is null
      or p_value ->> 'gender' in ('male', 'female', 'other')
    )
    and p_value ->> 'region' in (
      'neck', 'shoulder', 'low-back', 'hip', 'knee', 'ankle-foot',
      'post-op', 'neuro', 'sports'
    )
    and char_length(btrim(p_value ->> 'main_complaint')) between 1 and 10000
    and v_pain between 0 and 10
    and v_pain = trunc(v_pain)
    and char_length(p_value ->> 'pain_location') <= 2000
    and char_length(p_value ->> 'duration') <= 500
    and char_length(p_value ->> 'mechanism') <= 5000
    and char_length(p_value ->> 'aggravating') <= 5000
    and char_length(p_value ->> 'easing') <= 5000
    and char_length(p_value ->> 'medical_history') <= 20000
    and char_length(p_value ->> 'surgical_history') <= 20000
    and char_length(p_value ->> 'imaging') <= 20000
    and char_length(p_value ->> 'medications') <= 10000
    and char_length(p_value ->> 'functional_limitations') <= 10000
    and char_length(p_value ->> 'patient_goal') <= 5000;
end;
$$;
revoke all on function private.is_valid_case_assessment_payload(jsonb)
  from public, anon, authenticated, service_role;

create table if not exists public.case_assessment_versions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete restrict,
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  patient_id uuid references public.patients (id) on delete restrict,
  episode_id uuid references public.care_episodes (id) on delete restrict,
  version integer not null check (version between 1 and 1000000),
  change_type text not null
    check (change_type in ('initial', 'correction', 'reassessment')),
  assessed_at timestamptz not null,
  name text not null,
  age integer,
  gender text,
  region text,
  main_complaint text not null,
  pain_location text,
  pain_intensity integer not null,
  duration text,
  mechanism text,
  aggravating text,
  easing text,
  medical_history text,
  surgical_history text,
  imaging text,
  medications text,
  functional_limitations text,
  patient_goal text,
  authored_by uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  supersedes_id uuid
    references public.case_assessment_versions (id) on delete restrict,
  change_reason text,
  source text not null default 'clinician'
    check (source in ('clinician', 'legacy-import')),
  unique (case_id, version),
  check (
    (
      version = 1
      and change_type = 'initial'
      and supersedes_id is null
      and change_reason is null
    )
    or (
      version > 1
      and change_type in ('correction', 'reassessment')
      and supersedes_id is not null
      and change_reason is not null
      and char_length(btrim(change_reason)) between 3 and 1000
    )
  ),
  check (source = 'clinician' or change_type = 'initial'),
  -- Historical rows are preserved exactly even if they predate validation.
  -- Every post-migration clinician write must satisfy the strict shape below.
  check (
    source = 'legacy-import'
    or (
      patient_id is not null
      and episode_id is not null
      and authored_by is not null
      and assessed_at >= '2000-01-01'::timestamptz
      and assessed_at <= created_at + interval '1 day'
      and char_length(btrim(name)) between 1 and 200
      and (age is null or age between 0 and 120)
      and (gender is null or gender in ('male', 'female', 'other'))
      and region is not null
      and region in (
        'neck', 'shoulder', 'low-back', 'hip', 'knee', 'ankle-foot',
        'post-op', 'neuro', 'sports'
      )
      and char_length(btrim(main_complaint)) between 1 and 10000
      and pain_intensity between 0 and 10
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
    )
  )
);

create unique index if not exists case_assessment_versions_one_successor_idx
  on public.case_assessment_versions (supersedes_id)
  where supersedes_id is not null;
create index if not exists case_assessment_versions_case_current_idx
  on public.case_assessment_versions (case_id, version desc);
create index if not exists case_assessment_versions_episode_time_idx
  on public.case_assessment_versions (episode_id, assessed_at desc)
  where episode_id is not null;

alter table public.case_assessment_versions enable row level security;
revoke all on table public.case_assessment_versions
  from public, anon, authenticated, service_role;
grant select on table public.case_assessment_versions to authenticated;

drop policy if exists "case assessment history clinician read"
  on public.case_assessment_versions;
create policy "case assessment history clinician read"
  on public.case_assessment_versions for select to authenticated
  using (
    patient_id is not null
    and private.can_manage_clinical_record(patient_id)
  );

create or replace function private.reject_case_assessment_history_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'Signed case assessment history is append-only; add a revision';
end;
$$;
revoke all on function private.reject_case_assessment_history_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists case_assessment_versions_immutable
  on public.case_assessment_versions;
create trigger case_assessment_versions_immutable
before update or delete on public.case_assessment_versions
for each row execute function private.reject_case_assessment_history_mutation();
drop trigger if exists case_assessment_versions_no_truncate
  on public.case_assessment_versions;
create trigger case_assessment_versions_no_truncate
before truncate on public.case_assessment_versions
for each statement execute function private.reject_case_assessment_history_mutation();

-- Validate tenant identity and a single linear history even for trusted SQL.
create or replace function private.validate_case_assessment_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.cases%rowtype;
  v_parent public.case_assessment_versions%rowtype;
begin
  select patient_case.* into v_case
  from public.cases patient_case
  where patient_case.id = new.case_id
  for key share;
  if not found
     or new.clinic_id is distinct from v_case.clinic_id
     or new.patient_id is distinct from v_case.patient_id
     or new.episode_id is distinct from v_case.episode_id then
    raise exception using
      errcode = '23514', message = 'Assessment identity does not match its case';
  end if;

  if row(
       new.name, new.age, new.gender, new.region, new.main_complaint,
       new.pain_location, new.pain_intensity, new.duration, new.mechanism,
       new.aggravating, new.easing, new.medical_history,
       new.surgical_history, new.imaging, new.medications,
       new.functional_limitations, new.patient_goal
     ) is distinct from row(
       v_case.name, v_case.age, v_case.gender, v_case.region,
       v_case.main_complaint, v_case.pain_location, v_case.pain_intensity,
       v_case.duration, v_case.mechanism, v_case.aggravating, v_case.easing,
       v_case.medical_history, v_case.surgical_history, v_case.imaging,
       v_case.medications, v_case.functional_limitations, v_case.patient_goal
     ) then
    raise exception using
      errcode = '23514', message = 'Assessment snapshot does not match the case projection';
  end if;

  if new.version = 1 then
    if exists (
      select 1 from public.case_assessment_versions assessment
      where assessment.case_id = new.case_id
    ) then
      raise exception using
        errcode = '23514', message = 'Initial assessment version already exists';
    end if;
  else
    select parent.* into v_parent
    from public.case_assessment_versions parent
    where parent.id = new.supersedes_id
    for key share;
    if not found
       or v_parent.case_id <> new.case_id
       or new.version <> v_parent.version + 1
       or exists (
         select 1 from public.case_assessment_versions successor
         where successor.supersedes_id = v_parent.id
       ) then
      raise exception using
        errcode = '23514', message = 'Assessment revision chain is invalid';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.validate_case_assessment_version()
  from public, anon, authenticated, service_role;
drop trigger if exists case_assessment_versions_validate_chain
  on public.case_assessment_versions;
create trigger case_assessment_versions_validate_chain
before insert on public.case_assessment_versions
for each row execute function private.validate_case_assessment_version();

drop trigger if exists audit_row_change on public.case_assessment_versions;
create trigger audit_row_change
after insert on public.case_assessment_versions
for each row execute function private.write_audit_log();

-- Preserve a faithful initial snapshot for every case that existed before the
-- migration. Null actors/links remain explicit instead of being fabricated.
insert into public.case_assessment_versions (
  case_id, clinic_id, patient_id, episode_id, version, change_type,
  assessed_at, name, age, gender, region, main_complaint, pain_location,
  pain_intensity, duration, mechanism, aggravating, easing, medical_history,
  surgical_history, imaging, medications, functional_limitations,
  patient_goal, authored_by, created_at, source
)
select
  patient_case.id, patient_case.clinic_id, patient_case.patient_id,
  patient_case.episode_id, 1, 'initial', patient_case.created_at,
  patient_case.name, patient_case.age, patient_case.gender,
  patient_case.region, patient_case.main_complaint,
  patient_case.pain_location, patient_case.pain_intensity,
  patient_case.duration, patient_case.mechanism, patient_case.aggravating,
  patient_case.easing, patient_case.medical_history,
  patient_case.surgical_history, patient_case.imaging,
  patient_case.medications, patient_case.functional_limitations,
  patient_case.patient_goal, patient_case.created_by,
  patient_case.created_at, 'legacy-import'
from public.cases patient_case
where not exists (
  select 1 from public.case_assessment_versions assessment
  where assessment.case_id = patient_case.id
);

-- New case inserts create their initial signed version in the same transaction.
create or replace function private.capture_initial_case_assessment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.case_assessment_versions (
    case_id, clinic_id, patient_id, episode_id, version, change_type,
    assessed_at, name, age, gender, region, main_complaint, pain_location,
    pain_intensity, duration, mechanism, aggravating, easing, medical_history,
    surgical_history, imaging, medications, functional_limitations,
    patient_goal, authored_by, source
  ) values (
    new.id, new.clinic_id, new.patient_id, new.episode_id, 1, 'initial',
    new.created_at, new.name, new.age, new.gender, new.region,
    new.main_complaint, new.pain_location, new.pain_intensity,
    new.duration, new.mechanism, new.aggravating, new.easing,
    new.medical_history, new.surgical_history, new.imaging,
    new.medications, new.functional_limitations, new.patient_goal,
    new.created_by,
    case
      when auth.uid() is not null and new.created_by = auth.uid()
        then 'clinician'
      else 'legacy-import'
    end
  );
  return new;
end;
$$;
revoke all on function private.capture_initial_case_assessment()
  from public, anon, authenticated, service_role;
drop trigger if exists cases_capture_initial_assessment on public.cases;
create trigger cases_capture_initial_assessment
after insert on public.cases
for each row execute function private.capture_initial_case_assessment();

-- The projection may only be updated from the attributed revision workflow.
create or replace function private.enforce_case_assessment_projection()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_rpc_owner text;
begin
  select pg_catalog.pg_get_userbyid(proc.proowner)
    into v_rpc_owner
  from pg_catalog.pg_proc proc
  where proc.oid =
    'public.record_case_assessment_revision(uuid,uuid,text,text,timestamptz,jsonb)'::regprocedure;
  if current_user::text is distinct from v_rpc_owner then
    raise exception using
      errcode = '42501',
      message = 'Use record_case_assessment_revision to change an assessment';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_case_assessment_projection()
  from public, anon, authenticated, service_role;

create or replace function public.record_case_assessment_revision(
  p_case_id uuid,
  p_supersedes_id uuid,
  p_change_type text,
  p_change_reason text,
  p_assessed_at timestamptz,
  p_assessment jsonb
)
returns table (
  assessment_version_id uuid,
  assessment_version integer,
  authored_by uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_case public.cases%rowtype;
  v_current public.case_assessment_versions%rowtype;
  v_new public.case_assessment_versions%rowtype;
  v_payload record;
  v_reason text := nullif(btrim(coalesce(p_change_reason, '')), '');
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using
      errcode = '42501', message = 'Clinician authentication is required';
  end if;
  if p_case_id is null
     or p_supersedes_id is null
     or p_change_type is null
     or p_change_type not in ('correction', 'reassessment')
     or char_length(coalesce(v_reason, '')) not between 3 and 1000
     or p_assessed_at is null
     or p_assessed_at < '2000-01-01'::timestamptz
     or p_assessed_at > clock_timestamp() + interval '1 day'
     or not private.is_valid_case_assessment_payload(p_assessment) then
    raise exception using
      errcode = '22023', message = 'Assessment revision input is invalid';
  end if;

  select * into v_payload
  from jsonb_to_record(p_assessment) as payload(
    name text, age integer, gender text, region text,
    main_complaint text, pain_location text, pain_intensity integer,
    duration text, mechanism text, aggravating text, easing text,
    medical_history text, surgical_history text, imaging text,
    medications text, functional_limitations text, patient_goal text
  );

  select patient_case.* into v_case
  from public.cases patient_case
  where patient_case.id = p_case_id
  for update;
  if not found
     or v_case.patient_id is null
     or v_case.episode_id is null
     or not private.clinician_can_access_ai_case(
       v_actor, v_case.id, v_case.clinic_id
     ) then
    raise exception using
      errcode = '42501', message = 'Case access is not permitted';
  end if;

  select assessment.* into v_current
  from public.case_assessment_versions assessment
  where assessment.case_id = v_case.id
  order by assessment.version desc
  limit 1
  for update;
  if not found or v_current.id <> p_supersedes_id then
    raise exception using
      errcode = '23514',
      message = 'Assessment changed after it was loaded; refresh before revising';
  end if;

  if row(
       v_case.name, v_case.age, v_case.gender, v_case.region,
       v_case.main_complaint, v_case.pain_location, v_case.pain_intensity,
       v_case.duration, v_case.mechanism, v_case.aggravating, v_case.easing,
       v_case.medical_history, v_case.surgical_history, v_case.imaging,
       v_case.medications, v_case.functional_limitations, v_case.patient_goal
     ) is distinct from row(
       v_current.name, v_current.age, v_current.gender, v_current.region,
       v_current.main_complaint, v_current.pain_location,
       v_current.pain_intensity, v_current.duration, v_current.mechanism,
       v_current.aggravating, v_current.easing, v_current.medical_history,
       v_current.surgical_history, v_current.imaging,
       v_current.medications, v_current.functional_limitations,
       v_current.patient_goal
     ) then
    raise exception using
      errcode = '55000',
      message = 'Case projection is inconsistent with signed assessment history';
  end if;

  if p_change_type = 'correction' then
    if p_assessed_at is distinct from v_current.assessed_at then
      raise exception using
        errcode = '22023',
        message = 'A correction must retain the original assessment time';
    end if;
    if row(
         btrim(v_payload.name), v_payload.age, v_payload.gender,
         v_payload.region, btrim(v_payload.main_complaint),
         btrim(v_payload.pain_location), v_payload.pain_intensity,
         btrim(v_payload.duration), btrim(v_payload.mechanism),
         btrim(v_payload.aggravating), btrim(v_payload.easing),
         btrim(v_payload.medical_history), btrim(v_payload.surgical_history),
         btrim(v_payload.imaging), btrim(v_payload.medications),
         btrim(v_payload.functional_limitations),
         btrim(v_payload.patient_goal)
       ) is not distinct from row(
         v_current.name, v_current.age, v_current.gender, v_current.region,
         v_current.main_complaint, v_current.pain_location,
         v_current.pain_intensity, v_current.duration, v_current.mechanism,
         v_current.aggravating, v_current.easing, v_current.medical_history,
         v_current.surgical_history, v_current.imaging,
         v_current.medications, v_current.functional_limitations,
         v_current.patient_goal
       ) then
      raise exception using
        errcode = '22023', message = 'A correction must change assessment content';
    end if;
  elsif p_assessed_at < v_current.assessed_at then
    raise exception using
      errcode = '22023',
      message = 'A reassessment cannot predate the current assessment';
  end if;

  update public.cases patient_case
  set name = btrim(v_payload.name),
      age = v_payload.age,
      gender = v_payload.gender,
      region = v_payload.region,
      main_complaint = btrim(v_payload.main_complaint),
      pain_location = btrim(v_payload.pain_location),
      pain_intensity = v_payload.pain_intensity,
      duration = btrim(v_payload.duration),
      mechanism = btrim(v_payload.mechanism),
      aggravating = btrim(v_payload.aggravating),
      easing = btrim(v_payload.easing),
      medical_history = btrim(v_payload.medical_history),
      surgical_history = btrim(v_payload.surgical_history),
      imaging = btrim(v_payload.imaging),
      medications = btrim(v_payload.medications),
      functional_limitations = btrim(v_payload.functional_limitations),
      patient_goal = btrim(v_payload.patient_goal)
  where patient_case.id = v_case.id
  returning patient_case.* into v_case;

  insert into public.case_assessment_versions (
    case_id, clinic_id, patient_id, episode_id, version, change_type,
    assessed_at, name, age, gender, region, main_complaint, pain_location,
    pain_intensity, duration, mechanism, aggravating, easing, medical_history,
    surgical_history, imaging, medications, functional_limitations,
    patient_goal, authored_by, supersedes_id, change_reason, source
  ) values (
    v_case.id, v_case.clinic_id, v_case.patient_id, v_case.episode_id,
    v_current.version + 1, p_change_type, p_assessed_at,
    v_case.name, v_case.age, v_case.gender, v_case.region,
    v_case.main_complaint, v_case.pain_location, v_case.pain_intensity,
    v_case.duration, v_case.mechanism, v_case.aggravating, v_case.easing,
    v_case.medical_history, v_case.surgical_history, v_case.imaging,
    v_case.medications, v_case.functional_limitations, v_case.patient_goal,
    v_actor, v_current.id, v_reason, 'clinician'
  ) returning * into v_new;

  return query select v_new.id, v_new.version, v_new.authored_by, v_new.created_at;
end;
$$;

revoke all on function public.record_case_assessment_revision(
  uuid, uuid, text, text, timestamptz, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.record_case_assessment_revision(
  uuid, uuid, text, text, timestamptz, jsonb
) to authenticated;

drop trigger if exists cases_assessment_projection_rpc_only on public.cases;
create trigger cases_assessment_projection_rpc_only
before update of name, age, gender, region, main_complaint, pain_location,
  pain_intensity, duration, mechanism, aggravating, easing, medical_history,
  surgical_history, imaging, medications, functional_limitations, patient_goal
on public.cases
for each row execute function private.enforce_case_assessment_projection();

-- There are no remaining supported direct UPDATE or DELETE operations on a
-- clinical intake. Safety and assessment changes use their attributed RPCs.
drop policy if exists "cases update" on public.cases;
drop policy if exists "cases delete" on public.cases;
revoke update, delete, truncate on table public.cases
  from public, anon, authenticated, service_role;
revoke insert, update, delete, truncate
  on table public.case_assessment_versions
  from public, anon, authenticated, service_role;

comment on table public.case_assessment_versions is
  'Append-only signed intake snapshots. Corrections and reassessments form one linear, attributed version chain.';
comment on table public.cases is
  'Current case projection. Assessment and safety changes are RPC-only; signed assessment history is authoritative.';
comment on function public.record_case_assessment_revision(
  uuid, uuid, text, text, timestamptz, jsonb
) is
  'Authenticated owner/assigned-therapist workflow for a stale-write-safe correction or reassessment.';

commit;

update public.schema_migrations
set status = 'applied', applied_at = clock_timestamp()
where version = '020' and status = 'applying';

-- ════════════════════════════════════════════════════════════════
-- 021_structured_exercise_adherence.sql
-- ════════════════════════════════════════════════════════════════
insert into public.schema_migrations (version, filename, checksum, status)
values ('021', '021_structured_exercise_adherence.sql', '5831daa2386bc5abd2b128987d8ad4e227f03307c4b1d04338687f9a67c40449', 'applying');

-- Per-exercise adherence events.  A daily aggregate cannot establish which
-- exercise was attempted, so patient reporting is recorded as immutable,
-- schedule-aware events and only accepted through the server-side RPC.
-- Run after 020_case_assessment_versioning.sql.

begin;

create or replace function private.is_valid_scheduled_weekdays(p_days smallint[])
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(
    cardinality(p_days) between 1 and 7
    and p_days <@ array[0,1,2,3,4,5,6]::smallint[]
    and cardinality(p_days) = cardinality(array(select distinct day from unnest(p_days) as day)),
    false
  );
$$;
revoke all on function private.is_valid_scheduled_weekdays(smallint[]) from public, anon, authenticated, service_role;

alter table public.exercise_prescriptions
  add column if not exists schedule_timezone text;
alter table public.exercise_prescriptions
  drop constraint if exists exercise_prescriptions_schedule_timezone_check,
  add constraint exercise_prescriptions_schedule_timezone_check
    check (
      schedule_timezone is null
      or schedule_timezone ~ '^[A-Za-z][A-Za-z0-9_+/-]{0,63}$'
    ) not valid;
alter table public.exercise_prescriptions
  validate constraint exercise_prescriptions_schedule_timezone_check;

alter table public.prescription_items
  add column if not exists scheduled_weekdays smallint[],
  add column if not exists target_sets smallint,
  add column if not exists target_reps smallint,
  add column if not exists target_duration_seconds integer;
alter table public.prescription_items
  drop constraint if exists prescription_items_scheduled_weekdays_check,
  drop constraint if exists prescription_items_targets_check,
  add constraint prescription_items_scheduled_weekdays_check
    check (
      scheduled_weekdays is null
      or (
        private.is_valid_scheduled_weekdays(scheduled_weekdays)
      )
    ) not valid,
  add constraint prescription_items_targets_check
    check (
      (target_sets is null or target_sets between 1 and 50)
      and (target_reps is null or target_reps between 1 and 1000)
      and (target_duration_seconds is null or target_duration_seconds between 5 and 21600)
      and num_nonnulls(target_sets, target_reps, target_duration_seconds) <= 2
    ) not valid;
alter table public.prescription_items
  validate constraint prescription_items_scheduled_weekdays_check;
alter table public.prescription_items
  validate constraint prescription_items_targets_check;

create table if not exists public.patient_exercise_completion_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  episode_id uuid not null references public.care_episodes (id) on delete restrict,
  prescription_id uuid not null references public.exercise_prescriptions (id) on delete restrict,
  prescription_item_id uuid not null references public.prescription_items (id) on delete restrict,
  local_date date not null,
  timezone_snapshot text not null,
  status text not null check (status in ('complete', 'partial', 'not_done')),
  completed_sets smallint,
  completed_reps smallint,
  completed_duration_seconds integer,
  pain_level smallint not null check (pain_level between 0 and 10),
  non_completion_reason text,
  recorded_by uuid not null references public.profiles (id) on delete restrict,
  client_submission_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  supersedes_id uuid references public.patient_exercise_completion_events (id) on delete restrict,
  correction_reason text,
  unique (recorded_by, client_submission_id),
  check (timezone_snapshot ~ '^[A-Za-z][A-Za-z0-9_+/-]{0,63}$'),
  check (completed_sets is null or completed_sets between 0 and 50),
  check (completed_reps is null or completed_reps between 0 and 1000),
  check (completed_duration_seconds is null or completed_duration_seconds between 0 and 21600),
  check (
    (status = 'complete' and non_completion_reason is null)
    or (status in ('partial', 'not_done') and char_length(btrim(coalesce(non_completion_reason, ''))) between 3 and 500)
  ),
  check (
    (supersedes_id is null and correction_reason is null)
    or (supersedes_id is not null and char_length(btrim(coalesce(correction_reason, ''))) between 3 and 500)
  )
);
create index if not exists patient_exercise_completion_events_patient_day_idx
  on public.patient_exercise_completion_events (patient_id, local_date desc, created_at desc);
create index if not exists patient_exercise_completion_events_item_day_idx
  on public.patient_exercise_completion_events (prescription_item_id, local_date desc, created_at desc);

alter table public.patient_exercise_completion_events enable row level security;
revoke all on table public.patient_exercise_completion_events from public, anon, authenticated, service_role;
grant select on table public.patient_exercise_completion_events to authenticated;
drop policy if exists "exercise adherence scoped read" on public.patient_exercise_completion_events;
create policy "exercise adherence scoped read"
  on public.patient_exercise_completion_events for select to authenticated
  using (
    private.is_linked_patient(patient_id)
    or private.can_manage_clinical_record(patient_id)
  );

create or replace function private.reject_exercise_completion_event_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '55000', message = 'Exercise completion events are append-only';
end;
$$;
revoke all on function private.reject_exercise_completion_event_mutation() from public, anon, authenticated, service_role;
drop trigger if exists patient_exercise_completion_events_immutable on public.patient_exercise_completion_events;
create trigger patient_exercise_completion_events_immutable
before update or delete or truncate on public.patient_exercise_completion_events
for each statement execute function private.reject_exercise_completion_event_mutation();

-- This RPC is deliberately service-role only. The route authenticates the
-- browser session and passes its immutable auth user id; the function checks
-- the patient-link and derives the local calendar date from the prescription.
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
  v_item public.prescription_items%rowtype;
  v_prescription public.exercise_prescriptions%rowtype;
  v_local_date date;
  v_event_id uuid;
  v_alert_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service authentication is required';
  end if;
  if p_actor_id is null or p_patient_id is null or p_episode_id is null
     or p_prescription_item_id is null or p_client_submission_id is null
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
  if v_profile_role <> 'patient' or exists (
    select 1 from public.clinic_members where user_id = p_actor_id
  ) or not exists (
    select 1 from public.patient_users access_grant
    where access_grant.patient_id = p_patient_id and access_grant.user_id = p_actor_id
      and access_grant.revoked_at is null
      and (access_grant.expires_at is null or access_grant.expires_at > clock_timestamp())
  ) then
    raise exception using errcode = '42501', message = 'Patient access is not permitted';
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
     or extract(dow from v_local_date)::smallint <> any(v_item.scheduled_weekdays) then
    raise exception using errcode = '23514', message = 'Exercise is not scheduled for the current local date';
  end if;

  select event.id into v_event_id
  from public.patient_exercise_completion_events event
  where event.recorded_by = p_actor_id and event.client_submission_id = p_client_submission_id;
  if found then
    return query select v_event_id, v_local_date, v_prescription.status, false;
    return;
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

-- Alert metadata stays free of exercise notes, as required by the outbox.
alter table public.clinical_alerts
  drop constraint if exists clinical_alerts_source_table_v2_check,
  drop constraint if exists clinical_alerts_source_table_v3_check;
alter table public.clinical_alerts
  add constraint clinical_alerts_source_table_v3_check
    check (source_table in ('patient_daily_logs', 'exercise_completion_events', 'tickets', 'ticket_replies')) not valid;
alter table public.clinical_alerts
  validate constraint clinical_alerts_source_table_v3_check;

commit;

update public.schema_migrations
set status = 'applied', applied_at = clock_timestamp()
where version = '021' and status = 'applying';

-- ════════════════════════════════════════════════════════════════
-- 022_adherence_retry_hardening.sql
-- ════════════════════════════════════════════════════════════════
insert into public.schema_migrations (version, filename, checksum, status)
values ('022', '022_adherence_retry_hardening.sql', 'bcb0287b49850bc9d7ad82e8df17ae5455f58606a79799988a675a8675f56d8a', 'applying');

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

update public.schema_migrations
set status = 'applied', applied_at = clock_timestamp()
where version = '022' and status = 'applying';

-- ════════════════════════════════════════════════════════════════
-- 023_prescription_schedule.sql
-- ════════════════════════════════════════════════════════════════
insert into public.schema_migrations (version, filename, checksum, status)
values ('023', '023_prescription_schedule.sql', '959fa06999e41750c8ff959ea3a6165ac1bde49621db025a812f2d80c50ee034', 'applying');

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

update public.schema_migrations
set status = 'applied', applied_at = clock_timestamp()
where version = '023' and status = 'applying';

-- ════════════════════════════════════════════════════════════════
-- 024_structured_progress_guard.sql
-- ════════════════════════════════════════════════════════════════
insert into public.schema_migrations (version, filename, checksum, status)
values ('024', '024_structured_progress_guard.sql', 'fa652100e4bc5c0df30ab323ca89052919f8bf5f919888063d3aa37a1d887040', 'applying');

-- Structured prescriptions must not also accept the legacy daily aggregate.
begin;
create or replace function private.guard_structured_progress()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.exercise_prescriptions prescription
    where prescription.episode_id = new.episode_id
      and prescription.status in ('published', 'suspended')
      and prescription.schedule_timezone is not null
  ) then
    raise exception using errcode = '23514',
      message = 'Record individual exercise events for structured prescriptions';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_structured_progress() from public, anon, authenticated, service_role;
drop trigger if exists guard_structured_progress on public.patient_daily_logs;
create trigger guard_structured_progress before insert or update on public.patient_daily_logs
for each row execute function private.guard_structured_progress();
commit;

update public.schema_migrations
set status = 'applied', applied_at = clock_timestamp()
where version = '024' and status = 'applying';

-- ════════════════════════════════════════════════════════════════
-- 025_exercise_measurement_targets.sql
-- ════════════════════════════════════════════════════════════════
insert into public.schema_migrations (version, filename, checksum, status)
values ('025', '025_exercise_measurement_targets.sql', '6d752aaa80c46b276b7fcaeddfdfec63f04a4ad067e81e0e03788d1a98821e44', 'applying');

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

update public.schema_migrations
set status = 'applied', applied_at = clock_timestamp()
where version = '025' and status = 'applying';

-- ════════════════════════════════════════════════════════════════
-- 026_auth_email_type_fix.sql
-- ════════════════════════════════════════════════════════════════
insert into public.schema_migrations (version, filename, checksum, status)
values ('026', '026_auth_email_type_fix.sql', 'f0211f8042a596ef5144875794d9eacf58c4baf6050231e439ae6cb25922fd58', 'applying');

-- PhysioAI — Migration 026: auth.users.email type fix (run after 025).
--
-- On hosted Supabase, auth.users.email is varchar(255), not text. The
-- RETURNS TABLE of list_patient_account_links declares `email text`, so
-- PL/pgSQL rejected every call with 42804 ("structure of query does not
-- match function result type") as soon as a clinic had one patient —
-- the Patient Registry could not load. CI did not see it because its
-- stand-in auth.users declared email as text. Cast explicitly.
-- CREATE OR REPLACE keeps the existing owner and grants.

begin;

create or replace function public.list_patient_account_links(p_patient_ids uuid[])
returns table (
  patient_id uuid,
  user_id uuid,
  full_name text,
  email text,
  relationship text,
  authorized_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or private.is_platform_admin()
     or p_patient_ids is null
     or cardinality(p_patient_ids) not between 1 and 100 then
    raise exception using errcode = '42501', message = 'Patient-link access is not permitted';
  end if;
  if exists (
    select 1
    from unnest(p_patient_ids) requested(patient_id)
    left join public.patients patient on patient.id = requested.patient_id
    where patient.id is null or not private.can_manage_clinical_record(patient.id)
  ) then
    raise exception using errcode = '42501', message = 'Patient-link access is not permitted';
  end if;

  return query
  select grant_row.patient_id,
         grant_row.user_id,
         profile.full_name,
         case when private.is_owner_of(patient.clinic_id) then auth_user.email::text else null end,
         grant_row.relationship,
         grant_row.authorized_at,
         grant_row.expires_at,
         grant_row.revoked_at
  from public.patient_users grant_row
  join public.patients patient on patient.id = grant_row.patient_id
  join public.profiles profile on profile.id = grant_row.user_id
  join auth.users auth_user on auth_user.id = grant_row.user_id
  where grant_row.patient_id = any(p_patient_ids)
  order by grant_row.patient_id, grant_row.revoked_at nulls first, grant_row.authorized_at desc
  limit 500;
end;
$$;

commit;

update public.schema_migrations
set status = 'applied', applied_at = clock_timestamp()
where version = '026' and status = 'applying';

-- ════════════════════════════════════════════════════════════════
-- 027_patient_prescription_visibility.sql
-- ════════════════════════════════════════════════════════════════
insert into public.schema_migrations (version, filename, checksum, status)
values ('027', '027_patient_prescription_visibility.sql', '19b43e8e2a90c6469d2fdf7d6b0bb660740af884619598ca3f81f1345a67662c', 'applying');

-- PhysioAI — Migration 027: patients can see their published prescription
-- (run after 026).
--
-- The patient branch of "prescriptions scoped read" / "prescription items
-- scoped read" (migration 013) requires the linked case to have a clear
-- safety screen via `exists (select … from public.cases …)`. That subquery
-- runs under the PATIENT's RLS, and patients may never read clinician
-- cases — so it was always empty and no patient ever saw a published
-- programme. CI only asserted the negative case (no prescription after an
-- urgent re-screen), so the bug was invisible there.
--
-- Fix: move the identical patient-visibility rule into a SECURITY DEFINER
-- helper that reads the case itself, and use it from both policies. The
-- conditions are unchanged: published, linked patient, active episode,
-- inside the start/end dates, case screened clear with no red flags.

begin;

create or replace function private.is_patient_visible_prescription(
  p_prescription_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.exercise_prescriptions prescription
    join public.cases patient_case on patient_case.id = prescription.case_id
    where prescription.id = p_prescription_id
      and prescription.status = 'published'
      and private.is_linked_patient(prescription.patient_id)
      and private.is_active_episode_for_patient(
        prescription.episode_id, prescription.patient_id
      )
      and prescription.start_date <= current_date
      and (prescription.end_date is null or prescription.end_date >= current_date)
      and patient_case.safety_screened_at is not null
      and patient_case.safety_disposition = 'clear'
      and cardinality(patient_case.red_flag_ids) = 0
  );
$$;

revoke all on function private.is_patient_visible_prescription(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.is_patient_visible_prescription(uuid)
  to authenticated;

drop policy if exists "prescriptions scoped read"
  on public.exercise_prescriptions;
create policy "prescriptions scoped read"
  on public.exercise_prescriptions for select to authenticated
  using (
    private.can_manage_clinical_record(patient_id)
    or private.is_patient_visible_prescription(id)
  );

drop policy if exists "prescription items scoped read"
  on public.prescription_items;
create policy "prescription items scoped read"
  on public.prescription_items for select to authenticated
  using (
    exists (
      select 1
      from public.exercise_prescriptions prescription
      where prescription.id = prescription_items.prescription_id
        and (
          private.can_manage_clinical_record(prescription.patient_id)
          or private.is_patient_visible_prescription(prescription.id)
        )
    )
  );

commit;

update public.schema_migrations
set status = 'applied', applied_at = clock_timestamp()
where version = '027' and status = 'applying';

-- ════════════════════════════════════════════════════════════════
-- 028_patient_phone_accounts.sql
-- ════════════════════════════════════════════════════════════════
insert into public.schema_migrations (version, filename, checksum, status)
values ('028', '028_patient_phone_accounts.sql', '3a364eec6172d7ea49560bc4f7aa2966bf5519a461394e7e8d4cc4fa37289fd6', 'applying');

-- PhysioAI — Migration 028: patient portal accounts by mobile number
-- (run after 027).
--
-- The patient portal signs in with a mobile number + SMS one-time code
-- (Supabase phone auth, OTP delivered by the Send SMS hook). Clinic owners
-- therefore link portal accounts by phone:
--
-- 1) link_patient_account_by_phone — identical checks to the email version
--    (owner of the patient's clinic, consent attested, patient-only account,
--    one "self" patient per account, bounded delegate expiry); only the
--    account lookup matches auth.users.phone (E.164 digits, no '+').
-- 2) list_patient_account_phones returns the sign-in phone of each linked
--    account (owners only; same access checks as list_patient_account_links).
--    A separate function keeps list_patient_account_links' return type
--    unchanged, so replaying migrations 015/026 stays idempotent.

begin;

create or replace function public.link_patient_account_by_phone(
  p_patient_id uuid,
  p_phone text,
  p_relationship text,
  p_expires_at timestamptz default null,
  p_authority_attested boolean default false
)
returns table (account_found boolean, link_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_patient public.patients%rowtype;
  -- E.164 digits without '+', the form Supabase Auth stores (98912…).
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_relationship text := lower(btrim(p_relationship));
  v_user_id uuid;
  v_changed boolean := false;
  v_row_count integer := 0;
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Clinic-owner authentication is required';
  end if;
  if not coalesce(p_authority_attested, false) then
    raise exception using errcode = '22023', message = 'Patient consent or legal authority must be attested';
  end if;
  if v_phone !~ '^[1-9][0-9]{7,14}$' then
    raise exception using errcode = '22023', message = 'A valid international mobile number is required';
  end if;
  if v_relationship not in ('self', 'parent', 'guardian', 'caregiver') then
    raise exception using errcode = '22023', message = 'Relationship is not supported';
  end if;
  if p_expires_at is not null and p_expires_at <= clock_timestamp() then
    raise exception using errcode = '22023', message = 'Access expiry must be in the future';
  end if;
  if v_relationship <> 'self' and (
    p_expires_at is null or p_expires_at > clock_timestamp() + interval '366 days'
  ) then
    raise exception using errcode = '22023', message = 'Delegate access must expire within 366 days';
  end if;

  select patient.* into v_patient
  from public.patients patient
  where patient.id = p_patient_id
  for update;
  if not found or v_patient.archived_at is not null
     or not private.is_owner_of(v_patient.clinic_id) then
    raise exception using errcode = '42501', message = 'Patient access is not permitted';
  end if;

  select auth_user.id into v_user_id
  from auth.users auth_user
  where regexp_replace(coalesce(auth_user.phone, ''), '[^0-9]', '', 'g') = v_phone
  order by auth_user.created_at
  limit 1;
  if v_user_id is null then
    return query select false, 'account-not-found'::text;
    return;
  end if;

  if not exists (
    select 1 from public.profiles profile
    where profile.id = v_user_id and profile.role = 'patient'
  ) or exists (
    select 1 from public.clinic_members membership
    where membership.user_id = v_user_id
  ) then
    raise exception using errcode = '23514', message = 'Only a patient-only account may receive portal access';
  end if;

  if v_relationship = 'self' and exists (
    select 1 from public.patient_users existing
    where existing.user_id = v_user_id
      and existing.patient_id <> p_patient_id
      and existing.relationship = 'self'
      and existing.revoked_at is null
      and (existing.expires_at is null or existing.expires_at > clock_timestamp())
  ) then
    raise exception using errcode = '23514', message = 'This account already represents another patient';
  end if;

  insert into public.patient_users (
    patient_id, user_id, relationship, authorized_at, authorized_by,
    expires_at, revoked_at, revoked_by, revocation_reason
  ) values (
    p_patient_id, v_user_id, v_relationship, clock_timestamp(), v_actor,
    p_expires_at, null, null, null
  )
  on conflict (patient_id, user_id) do update
  set relationship = excluded.relationship,
      authorized_at = excluded.authorized_at,
      authorized_by = excluded.authorized_by,
      expires_at = excluded.expires_at,
      revoked_at = null,
      revoked_by = null,
      revocation_reason = null
  where patient_users.revoked_at is not null
     or patient_users.relationship is distinct from excluded.relationship
     or patient_users.expires_at is distinct from excluded.expires_at;
  get diagnostics v_row_count = row_count;
  v_changed := v_row_count > 0;

  if v_changed then
    insert into public.patient_access_events (
      patient_id, user_id, event_type, relationship,
      actor_id, expires_at, reason
    ) values (
      p_patient_id, v_user_id, 'authorized', v_relationship,
      v_actor, p_expires_at, 'Consent or legal authority attested by clinic owner'
    );
  end if;

  return query select true, case when v_changed then 'linked' else 'already-linked' end;
end;
$$;

create or replace function public.list_patient_account_phones(p_patient_ids uuid[])
returns table (
  patient_id uuid,
  user_id uuid,
  phone text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or private.is_platform_admin()
     or p_patient_ids is null
     or cardinality(p_patient_ids) not between 1 and 100 then
    raise exception using errcode = '42501', message = 'Patient-link access is not permitted';
  end if;
  if exists (
    select 1
    from unnest(p_patient_ids) requested(patient_id)
    left join public.patients patient on patient.id = requested.patient_id
    where patient.id is null or not private.can_manage_clinical_record(patient.id)
  ) then
    raise exception using errcode = '42501', message = 'Patient-link access is not permitted';
  end if;

  return query
  select grant_row.patient_id,
         grant_row.user_id,
         case when private.is_owner_of(patient.clinic_id) then auth_user.phone::text else null end
  from public.patient_users grant_row
  join public.patients patient on patient.id = grant_row.patient_id
  join public.profiles profile on profile.id = grant_row.user_id
  join auth.users auth_user on auth_user.id = grant_row.user_id
  where grant_row.patient_id = any(p_patient_ids)
  order by grant_row.patient_id, grant_row.revoked_at nulls first, grant_row.authorized_at desc
  limit 500;
end;
$$;

do $$
declare
  v_signature regprocedure;
begin
  foreach v_signature in array array[
    'public.link_patient_account_by_phone(uuid,text,text,timestamp with time zone,boolean)'::regprocedure,
    'public.list_patient_account_phones(uuid[])'::regprocedure
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_signature);
    execute format('grant execute on function %s to authenticated', v_signature);
  end loop;
end $$;

commit;

update public.schema_migrations
set status = 'applied', applied_at = clock_timestamp()
where version = '028' and status = 'applying';

select count(*) || ' migrations applied' as result
from public.schema_migrations where status = 'applied';
