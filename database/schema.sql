-- PhysioAI Assistant — Supabase schema
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- It creates the tables the app will sync to once persistence is wired up.

-- Patients (portal users; national_id is the mock login key for now)
create table if not exists patients (
  id uuid primary key default gen_random_uuid(),
  national_id text unique not null,
  name_fa text not null,
  age int,
  condition_fa text,
  therapist_note_fa text,
  weekly_target int not null default 5,
  created_at timestamptz not null default now()
);

-- Prescribed exercise program per patient
create table if not exists patient_program (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  exercise_id text not null,
  dosage_fa text not null,
  days_per_week int not null default 5
);

-- Daily progress log
create table if not exists patient_progress (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  date date not null,
  pain_level int not null check (pain_level between 0 and 10),
  completed boolean not null default true,
  unique (patient_id, date)
);

-- Support tickets + replies
create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  exercise_id text,
  subject text not null,
  message text not null,
  status text not null default 'open' check (status in ('open', 'answered')),
  created_at timestamptz not null default now()
);

create table if not exists ticket_replies (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  sender text not null check (sender in ('ai', 'therapist')),
  content text not null,
  created_at timestamptz not null default now()
);

-- Clinician patient cases (intake records)
create table if not exists cases (
  id uuid primary key default gen_random_uuid(),
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

-- Row Level Security: enable on every table. The anon key can then only
-- do what policies allow. Tighten these before production (real auth).
alter table patients enable row level security;
alter table patient_program enable row level security;
alter table patient_progress enable row level security;
alter table tickets enable row level security;
alter table ticket_replies enable row level security;
alter table cases enable row level security;

-- MVP demo policies (anon read/write). Replace with per-user policies
-- once Supabase Auth is added.
create policy "mvp anon read" on patients for select using (true);
create policy "mvp anon read program" on patient_program for select using (true);
create policy "mvp anon rw progress" on patient_progress for all using (true) with check (true);
create policy "mvp anon rw tickets" on tickets for all using (true) with check (true);
create policy "mvp anon rw replies" on ticket_replies for all using (true) with check (true);
create policy "mvp anon rw cases" on cases for all using (true) with check (true);
