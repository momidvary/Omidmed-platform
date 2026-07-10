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

-- ── Demo seed data ──────────────────────────────────────────────
-- Two portal patients (login: 1234567890 / 0987654321) + programs +
-- two weeks of progress + one answered ticket + one clinician case.

insert into patients (id, national_id, name_fa, age, condition_fa, therapist_note_fa, weekly_target) values
  ('11111111-1111-4111-8111-111111111111', '1234567890', 'رضا کریمی', 68,
   'توان‌بخشی بعد از تعویض مفصل زانوی چپ (هفته چهارم)',
   'روند بهبود خوب است. تمرکز این هفته: افزایش خم‌شدن زانو و راه‌رفتن با کمترین کمک واکر.', 6),
  ('22222222-2222-4222-8222-222222222222', '0987654321', 'سارا احمدی', 42,
   'کمردرد مکانیکی مزمن با انتشار به باسن راست',
   'هدف این ماه: بازگشت به کار نشسته بدون درد و شروع پیاده‌روی منظم ۲۰ دقیقه‌ای.', 5)
on conflict (national_id) do nothing;

insert into patient_program (patient_id, exercise_id, dosage_fa, days_per_week) values
  ('11111111-1111-4111-8111-111111111111', 'ex_quad_sets', '۳ ست × ۱۰ تکرار — هر روز', 7),
  ('11111111-1111-4111-8111-111111111111', 'ex_ankle_pumps', '۱۵ تکرار — هر ساعت در بیداری', 7),
  ('11111111-1111-4111-8111-111111111111', 'ex_heel_slides', '۲ ست × ۱۰ تکرار — روزی دو بار', 7),
  ('11111111-1111-4111-8111-111111111111', 'ex_wall_sit', '۳ نگه‌داشتن ۲۰ ثانیه‌ای — یک روز در میان', 3),
  ('22222222-2222-4222-8222-222222222222', 'ex_curl_up', '۳ ست × ۸ تکرار — ۵ روز در هفته', 5),
  ('22222222-2222-4222-8222-222222222222', 'ex_bird_dog', '۳ ست × ۸ تکرار هر سمت — ۵ روز در هفته', 5),
  ('22222222-2222-4222-8222-222222222222', 'ex_glute_bridge', '۳ ست × ۱۲ تکرار — ۵ روز در هفته', 5),
  ('22222222-2222-4222-8222-222222222222', 'ex_glute_med_sidelying', '۲ ست × ۱۲ تکرار هر سمت — ۳ روز در هفته', 3);

insert into patient_progress (patient_id, date, pain_level, completed)
select '11111111-1111-4111-8111-111111111111', current_date - offs, pain, done from (values
  (13, 7, true), (12, 7, true), (11, 6, false), (10, 6, true),
  (9, 6, true), (8, 5, true), (7, 5, false), (6, 5, true),
  (5, 4, true), (4, 4, true), (3, 4, true), (2, 3, false), (1, 3, true)
) as t(offs, pain, done)
on conflict (patient_id, date) do nothing;

insert into patient_progress (patient_id, date, pain_level, completed)
select '22222222-2222-4222-8222-222222222222', current_date - offs, pain, done from (values
  (13, 6, true), (12, 5, true), (11, 5, true), (10, 6, false),
  (9, 5, true), (8, 4, true), (7, 4, true), (6, 4, false),
  (5, 3, true), (4, 3, true), (3, 3, true), (2, 2, true), (1, 2, true)
) as t(offs, pain, done)
on conflict (patient_id, date) do nothing;

insert into tickets (id, patient_id, exercise_id, subject, message, status, created_at) values
  ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111',
   'ex_heel_slides', 'کشش پشت زانو',
   'موقع سُر دادن پاشنه، پشت زانوم کشش نسبتاً زیادی حس می‌کنم. طبیعیه؟',
   'answered', now() - interval '3 days')
on conflict (id) do nothing;

insert into ticket_replies (ticket_id, sender, content, created_at) values
  ('33333333-3333-4333-8333-333333333333', 'therapist',
   'سلام رضا جان. کشش ملایم پشت زانو در این مرحله طبیعی است، به شرطی که بعد از تمرین ظرف چند دقیقه آرام شود. اگر دردِ تیز یا ورم بیشتر شد، دامنه را کمتر کنید و به من خبر دهید.',
   now() - interval '2 days');

insert into cases (name, age, gender, region, main_complaint, pain_location, pain_intensity,
                   duration, mechanism, aggravating, easing, functional_limitations, patient_goal) values
  ('Sara Ahmadi', 42, 'female', 'low-back',
   'Persistent low back pain radiating to the right buttock',
   'Lower back, right side', 6, '8 weeks',
   'Gradual onset after prolonged desk work',
   'Sitting > 30 min, forward bending', 'Walking, lying supine',
   'Difficulty sitting at work, cannot lift child',
   'Return to pain-free desk work and light exercise');
