-- PhysioAI — behaviour tests for migration 004
-- Run in the Supabase SQL editor AFTER 001 → 002 → 003 → 004, on a test
-- project. Every scenario prints PASS via NOTICE or aborts with FAIL.
-- All test rows are removed at the end.
--
-- Unlike rls_tests.sql this file creates its own auth users, so there is
-- nothing to paste in — just run it.
--
-- Note on structure: ids live in `t004` (granted to `authenticated`) and
-- are read from there inside each role-switched block. Looking an id up
-- directly would run under the switched role with RLS already applied,
-- which silently yields NULL and makes the test assert nothing.

drop table if exists t004;
create table t004 (name text primary key, id uuid not null);
grant select on t004 to authenticated;

do $$
declare
  owner_a   uuid := gen_random_uuid();
  ther_a    uuid := gen_random_uuid();
  ther_b    uuid := gen_random_uuid();  -- same clinic, never assigned
  staff_a   uuid := gen_random_uuid();
  owner_b   uuid := gen_random_uuid();  -- a DIFFERENT clinic
  pat_user  uuid := gen_random_uuid();
  clinic_a  uuid := gen_random_uuid();
  clinic_b  uuid := gen_random_uuid();
  patient_a uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values
    (owner_a,  'test-owner-a@physioai.test'),
    (ther_a,   'test-therapist-a@physioai.test'),
    (ther_b,   'test-therapist-b@physioai.test'),
    (staff_a,  'test-staff-a@physioai.test'),
    (owner_b,  'test-owner-b@physioai.test'),
    (pat_user, 'test-patient@physioai.test');

  insert into t004 (name, id) values
    ('owner_a', owner_a), ('ther_a', ther_a), ('ther_b', ther_b),
    ('staff_a', staff_a), ('owner_b', owner_b), ('pat_user', pat_user),
    ('clinic_a', clinic_a), ('clinic_b', clinic_b), ('patient_a', patient_a);

  -- 001's trigger creates the profile; 004 should have carried the email.
  if (select email from profiles where id = pat_user)
       is distinct from 'test-patient@physioai.test' then
    raise exception 'FAIL 0: handle_new_user did not populate profiles.email';
  end if;
  raise notice 'PASS 0: profiles.email is populated at sign-up';

  update profiles set role = 'clinic_owner' where id in (owner_a, owner_b);
  update profiles set role = 'therapist'    where id in (ther_a, ther_b);
  update profiles set role = 'clinic_staff' where id = staff_a;
  update profiles set role = 'patient'      where id = pat_user;

  insert into clinics (id, name) values
    (clinic_a, 'TEST 004 Clinic A'), (clinic_b, 'TEST 004 Clinic B');
  insert into clinic_members (clinic_id, user_id, member_role) values
    (clinic_a, owner_a, 'clinic_owner'),
    (clinic_a, ther_a,  'therapist'),
    (clinic_a, ther_b,  'therapist'),
    (clinic_a, staff_a, 'clinic_staff'),
    (clinic_b, owner_b, 'clinic_owner');
  insert into patients (id, clinic_id, full_name)
    values (patient_a, clinic_a, 'TEST 004 Patient');

  -- ── 1: email tracks a later change in auth.users ──────────────
  update auth.users set email = 'test-moved@physioai.test' where id = pat_user;
  if (select email from profiles where id = pat_user)
       is distinct from 'test-moved@physioai.test' then
    raise exception 'FAIL 1: profiles.email did not follow auth.users';
  end if;
  update auth.users set email = 'test-patient@physioai.test' where id = pat_user;
  raise notice 'PASS 1: profiles.email tracks auth.users';
end $$;

-- ── 2: profile visibility stops at the clinic boundary ───────────
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from t004 where name='ther_a'),
                    'role','authenticated')::text, true);
set local role authenticated;
do $$
begin
  if not exists (select 1 from profiles where email = 'test-owner-a@physioai.test') then
    raise exception 'FAIL 2a: therapist cannot see a clinic colleague';
  end if;
  if exists (select 1 from profiles where email = 'test-owner-b@physioai.test') then
    raise exception 'FAIL 2b: therapist can see a profile from another clinic';
  end if;
  if not exists (select 1 from profiles where email = 'test-patient@physioai.test')
     is not true then
    null;  -- patient is not linked yet, so not required to be visible
  end if;
  raise notice 'PASS 2: profile visibility stops at the clinic boundary';
end $$;
rollback;

-- ── 3: linking refused for a plain therapist ─────────────────────
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from t004 where name='ther_a'),
                    'role','authenticated')::text, true);
set local role authenticated;
do $$
declare pat uuid := (select id from t004 where name='patient_a');
begin
  begin
    perform public.link_patient_account(pat, 'test-patient@physioai.test');
    raise exception 'FAIL 3a: a plain therapist linked a patient account';
  exception when others then
    if sqlerrm not like '%owner or clinic staff%' then raise; end if;
  end;
  raise notice 'PASS 3a: linking refused for a plain therapist';
end $$;
rollback;

-- ── 4: staff can link — idempotent and case-insensitive ──────────
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from t004 where name='staff_a'),
                    'role','authenticated')::text, true);
set local role authenticated;
do $$
declare
  pat    uuid := (select id from t004 where name='patient_a');
  linked uuid;
begin
  linked := public.link_patient_account(pat, 'TEST-Patient@PhysioAI.test');
  if linked is null then raise exception 'FAIL 4a: link returned null'; end if;
  if not exists (select 1 from patient_users where patient_id = pat and user_id = linked) then
    raise exception 'FAIL 4b: patient_users row was not created';
  end if;
  perform public.link_patient_account(pat, 'test-patient@physioai.test');
  begin
    perform public.link_patient_account(pat, 'nobody@physioai.test');
    raise exception 'FAIL 4c: linking a non-existent account succeeded';
  exception when others then
    if sqlerrm not like '%No account exists%' then raise; end if;
  end;
  raise notice 'PASS 4: staff can link, idempotently, case-insensitively';
end $$;
rollback;

-- ── 5: linking stops at the clinic boundary ──────────────────────
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from t004 where name='owner_b'),
                    'role','authenticated')::text, true);
set local role authenticated;
do $$
declare pat uuid := (select id from t004 where name='patient_a');
begin
  begin
    perform public.link_patient_account(pat, 'test-patient@physioai.test');
    raise exception 'FAIL 5: an owner of another clinic linked our patient';
  exception when others then
    if sqlerrm not like '%owner or clinic staff%' then raise; end if;
  end;
  raise notice 'PASS 5: linking stops at the clinic boundary';
end $$;
rollback;

-- ── 6: therapist self-assignment, and only self ──────────────────
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from t004 where name='ther_a'),
                    'role','authenticated')::text, true);
set local role authenticated;
do $$
declare
  pat  uuid := (select id from t004 where name='patient_a');
  me   uuid := (select id from t004 where name='ther_a');
  them uuid := (select id from t004 where name='ther_b');
begin
  insert into patient_therapists (patient_id, therapist_id) values (pat, me);
  raise notice 'PASS 6a: therapist assigned themselves';

  begin
    insert into patient_therapists (patient_id, therapist_id) values (pat, them);
    raise exception 'FAIL 6b: therapist assigned a DIFFERENT therapist';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'PASS 6b: therapist cannot assign anyone else';

  insert into care_episodes (patient_id, title_fa) values (pat, 'TEST 004 episode');
  raise notice 'PASS 6c: once assigned, the clinical record opens up';
end $$;
rollback;

-- ── 7: self-assignment requires clinic membership ────────────────
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from t004 where name='owner_b'),
                    'role','authenticated')::text, true);
set local role authenticated;
do $$
declare
  pat uuid := (select id from t004 where name='patient_a');
  me  uuid := (select id from t004 where name='owner_b');
begin
  begin
    insert into patient_therapists (patient_id, therapist_id) values (pat, me);
    raise exception 'FAIL 7: an outsider self-assigned to our patient';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'PASS 7: self-assignment requires clinic membership';
end $$;
rollback;

-- ── 8: 003's assignment requirement is untouched ─────────────────
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from t004 where name='ther_b'),
                    'role','authenticated')::text, true);
set local role authenticated;
do $$
declare pat uuid := (select id from t004 where name='patient_a');
begin
  begin
    insert into care_episodes (patient_id, title_fa) values (pat, 'TEST 004 illegal');
    raise exception 'FAIL 8: an unassigned therapist opened a care episode';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'PASS 8: an unassigned therapist still cannot write the record';
end $$;
rollback;

-- ── 9: one program row per exercise per episode ──────────────────
do $$
declare
  pat uuid := (select id from t004 where name='patient_a');
  ep  uuid;
begin
  insert into care_episodes (patient_id, title_fa)
    values (pat, 'TEST 004 dup check') returning id into ep;
  insert into episode_program (episode_id, exercise_id, dosage_fa)
    values (ep, 'ex_quad_sets', 'a');
  begin
    insert into episode_program (episode_id, exercise_id, dosage_fa)
      values (ep, 'ex_quad_sets', 'b');
    raise exception 'FAIL 9: duplicate prescription was accepted';
  exception when unique_violation then null;
  end;
  raise notice 'PASS 9: duplicate prescriptions are rejected';
end $$;

-- ── Cleanup ──────────────────────────────────────────────────────
delete from patients where full_name = 'TEST 004 Patient';
delete from clinics where name in ('TEST 004 Clinic A', 'TEST 004 Clinic B');
delete from auth.users where email like '%@physioai.test';
drop table t004;

select 'Migration 004 tests finished — check the Logs/Notices panel.' as result;
