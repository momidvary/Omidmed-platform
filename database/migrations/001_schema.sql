-- PhysioAI — Migration 001: core schema (roles, clinics, patients, episodes)
-- Run FIRST in the Supabase SQL editor. Then run 002_rls.sql.
--
-- ⚠ This replaces the old demo schema: the previous demo tables (which
-- held only sample data and anon policies) are dropped.

-- ⚠ DESTRUCTIVE — READ BEFORE RUNNING
--
-- The drops below are `cascade` and include `patients`, `tickets` and
-- `cases`. On a project that already has this schema they would delete
-- every real patient record, so the guard aborts instead. It fires when
-- `profiles` exists, which only happens after this file has already run.
--
-- To reset a development project on purpose:
--   set physioai.allow_destructive_reset = 'yes';
-- in the same SQL editor tab, then run this file.
do $$ begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'profiles'
  ) and coalesce(
    current_setting('physioai.allow_destructive_reset', true), ''
  ) <> 'yes' then
    raise exception
      'Refusing to run 001: this project is already initialised and the drops below would delete all patient data. See the comment at the top of this file.';
  end if;
end $$;

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
