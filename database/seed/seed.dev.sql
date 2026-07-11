-- PhysioAI — DEVELOPMENT-ONLY seed data.
-- ⚠ Never run this on a production project. Run after both migrations.
--
-- Run order: 001_schema.sql → 002_rls.sql → 003_security_fixes.sql → this file.
-- It creates one demo clinic, two patients, care episodes, programs,
-- two weeks of progress, and one answered ticket. It does NOT create
-- auth users (create those in Dashboard → Authentication → Add user,
-- then link them — see docs/RAHNAMA-FA.md).

insert into clinics (id, name, city) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'کلینیک دمو امید', 'تهران')
on conflict (id) do nothing;

insert into patients (id, clinic_id, full_name, national_id, birth_year, gender) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'رضا کریمی', '1234567890', 1958, 'male'),
  ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'سارا احمدی', '0987654321', 1984, 'female')
on conflict (id) do nothing;

insert into care_episodes (id, patient_id, title_fa, therapist_note_fa, weekly_target) values
  ('eeeeeee1-1111-4111-8111-eeeeeeeeeee1', '11111111-1111-4111-8111-111111111111',
   'توان‌بخشی بعد از تعویض مفصل زانوی چپ (هفته چهارم)',
   'روند بهبود خوب است. تمرکز این هفته: افزایش خم‌شدن زانو و راه‌رفتن با کمترین کمک واکر.', 6),
  ('eeeeeee2-2222-4222-8222-eeeeeeeeeee2', '22222222-2222-4222-8222-222222222222',
   'کمردرد مکانیکی مزمن با انتشار به باسن راست',
   'هدف این ماه: بازگشت به کار نشسته بدون درد و شروع پیاده‌روی منظم ۲۰ دقیقه‌ای.', 5)
on conflict (id) do nothing;

insert into episode_program (episode_id, exercise_id, dosage_fa, days_per_week) values
  ('eeeeeee1-1111-4111-8111-eeeeeeeeeee1', 'ex_quad_sets', '۳ ست × ۱۰ تکرار — هر روز', 7),
  ('eeeeeee1-1111-4111-8111-eeeeeeeeeee1', 'ex_ankle_pumps', '۱۵ تکرار — هر ساعت در بیداری', 7),
  ('eeeeeee1-1111-4111-8111-eeeeeeeeeee1', 'ex_heel_slides', '۲ ست × ۱۰ تکرار — روزی دو بار', 7),
  ('eeeeeee1-1111-4111-8111-eeeeeeeeeee1', 'ex_wall_sit', '۳ نگه‌داشتن ۲۰ ثانیه‌ای — یک روز در میان', 3),
  ('eeeeeee2-2222-4222-8222-eeeeeeeeeee2', 'ex_curl_up', '۳ ست × ۸ تکرار — ۵ روز در هفته', 5),
  ('eeeeeee2-2222-4222-8222-eeeeeeeeeee2', 'ex_bird_dog', '۳ ست × ۸ تکرار هر سمت — ۵ روز در هفته', 5),
  ('eeeeeee2-2222-4222-8222-eeeeeeeeeee2', 'ex_glute_bridge', '۳ ست × ۱۲ تکرار — ۵ روز در هفته', 5),
  ('eeeeeee2-2222-4222-8222-eeeeeeeeeee2', 'ex_glute_med_sidelying', '۲ ست × ۱۲ تکرار هر سمت — ۳ روز در هفته', 3);

insert into patient_daily_logs (episode_id, date, pain_level, completed)
select 'eeeeeee1-1111-4111-8111-eeeeeeeeeee1', current_date - offs, pain, done from (values
  (13, 7, true), (12, 7, true), (11, 6, false), (10, 6, true),
  (9, 6, true), (8, 5, true), (7, 5, false), (6, 5, true),
  (5, 4, true), (4, 4, true), (3, 4, true), (2, 3, false), (1, 3, true)
) as t(offs, pain, done)
on conflict (episode_id, date) do nothing;

insert into patient_daily_logs (episode_id, date, pain_level, completed)
select 'eeeeeee2-2222-4222-8222-eeeeeeeeeee2', current_date - offs, pain, done from (values
  (13, 6, true), (12, 5, true), (11, 5, true), (10, 6, false),
  (9, 5, true), (8, 4, true), (7, 4, true), (6, 4, false),
  (5, 3, true), (4, 3, true), (3, 3, true), (2, 2, true), (1, 2, true)
) as t(offs, pain, done)
on conflict (episode_id, date) do nothing;

insert into tickets (id, patient_id, episode_id, exercise_id, subject, message, status, created_at) values
  ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111',
   'eeeeeee1-1111-4111-8111-eeeeeeeeeee1', 'ex_heel_slides', 'کشش پشت زانو',
   'موقع سُر دادن پاشنه، پشت زانوم کشش نسبتاً زیادی حس می‌کنم. طبیعیه؟',
   'answered', now() - interval '3 days')
on conflict (id) do nothing;

insert into ticket_replies (ticket_id, sender, content, created_at) values
  ('33333333-3333-4333-8333-333333333333', 'therapist',
   'سلام رضا جان. کشش ملایم پشت زانو در این مرحله طبیعی است، به شرطی که بعد از تمرین ظرف چند دقیقه آرام شود. اگر دردِ تیز یا ورم بیشتر شد، دامنه را کمتر کنید و به من خبر دهید.',
   now() - interval '2 days');

insert into cases (clinic_id, name, age, gender, region, main_complaint, pain_location,
                   pain_intensity, duration, mechanism, aggravating, easing,
                   functional_limitations, patient_goal) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Sara Ahmadi', 42, 'female', 'low-back',
   'Persistent low back pain radiating to the right buttock',
   'Lower back, right side', 6, '8 weeks',
   'Gradual onset after prolonged desk work',
   'Sitting > 30 min, forward bending', 'Walking, lying supine',
   'Difficulty sitting at work, cannot lift child',
   'Return to pain-free desk work and light exercise');

-- ── Linking templates (fill in the real user ids) ────────────────
-- After creating auth users in the dashboard, link them like this:
--
-- 1) Make a user the clinic owner:
-- update profiles set role = 'clinic_owner', full_name = 'دکتر ...' where id = '<USER-UUID>';
-- insert into clinic_members (clinic_id, user_id, member_role)
--   values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '<USER-UUID>', 'clinic_owner');
--
-- 2) Link a patient login to the رضا کریمی record:
-- insert into patient_users (patient_id, user_id)
--   values ('11111111-1111-4111-8111-111111111111', '<PATIENT-USER-UUID>');
