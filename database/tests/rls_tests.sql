-- PhysioAI — RLS isolation test script
-- Run in the Supabase SQL editor AFTER migrations 001 → 002 → 003.
--
-- HOW TO USE
-- 1) In Authentication → Users create SIX users (any emails) and paste
--    their UUIDs below in the test_ids inserts.
-- 2) Run the whole file. Every scenario prints PASS via NOTICE
--    (open the "Results/Logs" panel) or aborts with FAIL.
-- 3) Everything is cleaned up at the end (test rows + test_ids), and the
--    six auth users can then be deleted from the dashboard.
--
-- ⚠ Run on a test/empty project or accept that the six profiles get
--    test roles assigned during the run.

-- ═══ Setup (runs as postgres, bypasses RLS) ═════════════════════
drop table if exists test_ids;
create table test_ids (name text primary key, id uuid not null);
grant select on test_ids to authenticated;

insert into test_ids (name, id) values
  ('owner_a',     '00000000-0000-0000-0000-000000000000'),  -- ← replace
  ('owner_b',     '00000000-0000-0000-0000-000000000000'),  -- ← replace
  ('therapist_a', '00000000-0000-0000-0000-000000000000'),  -- ← replace
  ('therapist_a2','00000000-0000-0000-0000-000000000000'),  -- ← replace (2nd therapist, NOT assigned)
  ('staff_a',     '00000000-0000-0000-0000-000000000000'),  -- ← replace
  ('patient_a',   '00000000-0000-0000-0000-000000000000');  -- ← replace

do $$
begin
  if exists (select 1 from test_ids where id = '00000000-0000-0000-0000-000000000000') then
    raise exception 'Fill in the six real user UUIDs in test_ids first.';
  end if;
end $$;

-- Roles + two clinics + memberships + one patient per clinic
update profiles set role = 'clinic_owner' where id in
  ((select id from test_ids where name='owner_a'), (select id from test_ids where name='owner_b'));
update profiles set role = 'therapist' where id in
  ((select id from test_ids where name='therapist_a'), (select id from test_ids where name='therapist_a2'));
update profiles set role = 'clinic_staff' where id = (select id from test_ids where name='staff_a');
update profiles set role = 'patient' where id = (select id from test_ids where name='patient_a');

insert into clinics (id, name) values
  ('c1111111-1111-4111-8111-111111111111', 'TEST Clinic A'),
  ('c2222222-2222-4222-8222-222222222222', 'TEST Clinic B')
on conflict (id) do nothing;

insert into clinic_members (clinic_id, user_id, member_role) values
  ('c1111111-1111-4111-8111-111111111111', (select id from test_ids where name='owner_a'), 'clinic_owner'),
  ('c2222222-2222-4222-8222-222222222222', (select id from test_ids where name='owner_b'), 'clinic_owner'),
  ('c1111111-1111-4111-8111-111111111111', (select id from test_ids where name='therapist_a'), 'therapist'),
  ('c1111111-1111-4111-8111-111111111111', (select id from test_ids where name='therapist_a2'), 'therapist'),
  ('c1111111-1111-4111-8111-111111111111', (select id from test_ids where name='staff_a'), 'clinic_staff')
on conflict do nothing;

insert into patients (id, clinic_id, full_name) values
  ('d1111111-1111-4111-8111-111111111111', 'c1111111-1111-4111-8111-111111111111', 'TEST Patient A'),
  ('d2222222-2222-4222-8222-222222222222', 'c2222222-2222-4222-8222-222222222222', 'TEST Patient B')
on conflict (id) do nothing;

insert into patient_users (patient_id, user_id) values
  ('d1111111-1111-4111-8111-111111111111', (select id from test_ids where name='patient_a'))
on conflict do nothing;

insert into patient_therapists (patient_id, therapist_id) values
  ('d1111111-1111-4111-8111-111111111111', (select id from test_ids where name='therapist_a'))
on conflict do nothing;

insert into care_episodes (id, patient_id, title_fa) values
  ('e1111111-1111-4111-8111-111111111111', 'd1111111-1111-4111-8111-111111111111', 'TEST Episode A')
on conflict (id) do nothing;

insert into tickets (id, patient_id, subject, message) values
  ('f1111111-1111-4111-8111-111111111111', 'd1111111-1111-4111-8111-111111111111', 'TEST ticket', 'msg')
on conflict (id) do nothing;

-- ═══ Scenario 1: clinic isolation (owner B ↛ patient A) ═════════
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from test_ids where name='owner_b'), 'role', 'authenticated')::text, true);
do $$
begin
  if exists (select 1 from patients where id = 'd1111111-1111-4111-8111-111111111111') then
    raise exception 'FAIL 1: owner B can see a clinic A patient';
  end if;
  if not exists (select 1 from patients where id = 'd2222222-2222-4222-8222-222222222222') then
    raise exception 'FAIL 1b: owner B cannot see their own patient';
  end if;
  raise notice 'PASS 1: clinic isolation holds';
end $$;
rollback;

-- ═══ Scenario 2: unassigned therapist cannot touch clinical record ═
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from test_ids where name='therapist_a2'), 'role', 'authenticated')::text, true);
do $$
begin
  -- may VIEW (same clinic) …
  if not exists (select 1 from patients where id = 'd1111111-1111-4111-8111-111111111111') then
    raise exception 'FAIL 2a: clinic therapist cannot even view clinic patient';
  end if;
  -- … but must NOT edit the clinical record (not assigned)
  begin
    insert into care_episodes (patient_id, title_fa)
      values ('d1111111-1111-4111-8111-111111111111', 'TEST illegal episode');
    raise exception 'FAIL 2b: unassigned therapist created an episode';
  exception when sqlstate '42501' then
    raise notice 'PASS 2: unassigned therapist blocked from clinical record';
  end;
end $$;
rollback;

-- ═══ Scenario 3: assigned therapist CAN manage clinical record ══
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from test_ids where name='therapist_a'), 'role', 'authenticated')::text, true);
do $$
begin
  insert into care_episodes (patient_id, title_fa)
    values ('d1111111-1111-4111-8111-111111111111', 'TEST episode by assigned therapist');
  raise notice 'PASS 3: assigned therapist can manage clinical record';
end $$;
rollback;

-- ═══ Scenario 4: clinic_staff blocked from clinical, allowed admin ═
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from test_ids where name='staff_a'), 'role', 'authenticated')::text, true);
do $$
begin
  begin
    insert into care_episodes (patient_id, title_fa)
      values ('d1111111-1111-4111-8111-111111111111', 'TEST illegal staff episode');
    raise exception 'FAIL 4a: staff created a clinical episode';
  exception when sqlstate '42501' then null;
  end;
  begin
    insert into clinical_measurements (episode_id, therapist_id, kind, value)
      values ('e1111111-1111-4111-8111-111111111111',
              (select id from test_ids where name='staff_a'), 'ROM', '{"deg":90}');
    raise exception 'FAIL 4b: staff wrote a clinical measurement';
  exception when sqlstate '42501' then null;
  end;
  -- administrative work is allowed:
  update patients set phone = '021000000'
    where id = 'd1111111-1111-4111-8111-111111111111';
  insert into appointments (clinic_id, patient_id, starts_at)
    values ('c1111111-1111-4111-8111-111111111111',
            'd1111111-1111-4111-8111-111111111111', now() + interval '1 day');
  raise notice 'PASS 4: staff = admin-only access (no clinical writes)';
end $$;
rollback;

-- ═══ Scenario 5: patient sees only self; cannot spoof replies ═══
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from test_ids where name='patient_a'), 'role', 'authenticated')::text, true);
do $$
declare my_id uuid := (select id from test_ids where name='patient_a');
begin
  if exists (select 1 from patients where id = 'd2222222-2222-4222-8222-222222222222') then
    raise exception 'FAIL 5a: patient can see another clinic patient';
  end if;
  if not exists (select 1 from patients where id = 'd1111111-1111-4111-8111-111111111111') then
    raise exception 'FAIL 5b: patient cannot see own record';
  end if;
  -- own daily log: allowed
  insert into patient_daily_logs (episode_id, date, pain_level, completed)
    values ('e1111111-1111-4111-8111-111111111111', current_date, 3, true);
  -- clinical measurement: forbidden
  begin
    insert into clinical_measurements (episode_id, therapist_id, kind, value)
      values ('e1111111-1111-4111-8111-111111111111', my_id, 'ROM', '{"deg":90}');
    raise exception 'FAIL 5c: patient wrote a clinical measurement';
  exception when sqlstate '42501' then null;
  end;
  -- reply as patient: allowed
  insert into ticket_replies (ticket_id, sender, sender_user_id, content)
    values ('f1111111-1111-4111-8111-111111111111', 'patient', my_id, 'TEST patient reply');
  -- reply as therapist: forbidden
  begin
    insert into ticket_replies (ticket_id, sender, sender_user_id, content)
      values ('f1111111-1111-4111-8111-111111111111', 'therapist', my_id, 'spoof');
    raise exception 'FAIL 5d: patient inserted a therapist reply';
  exception when sqlstate '42501' then null;
  end;
  -- reply as ai: forbidden
  begin
    insert into ticket_replies (ticket_id, sender, sender_user_id, content)
      values ('f1111111-1111-4111-8111-111111111111', 'ai', my_id, 'spoof');
    raise exception 'FAIL 5e: patient inserted an AI reply';
  exception when sqlstate '42501' then null;
  end;
  -- spoofing sender_user_id: forbidden
  begin
    insert into ticket_replies (ticket_id, sender, sender_user_id, content)
      values ('f1111111-1111-4111-8111-111111111111', 'patient',
              (select id from test_ids where name='owner_a'), 'spoof');
    raise exception 'FAIL 5f: patient spoofed sender_user_id';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'PASS 5: patient scope + reply hardening hold';
end $$;
rollback;

-- ═══ Scenario 6: role escalation blocked ════════════════════════
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from test_ids where name='patient_a'), 'role', 'authenticated')::text, true);
do $$
begin
  begin
    update profiles set role = 'platform_admin'
      where id = (select id from test_ids where name='patient_a');
    raise exception 'FAIL 6: user escalated their own role';
  exception when others then
    if sqlerrm like '%platform admin%' or sqlstate = '42501' then
      raise notice 'PASS 6: role escalation blocked';
    else
      raise;
    end if;
  end;
end $$;
rollback;

-- ═══ Scenario 7: bootstrap runs once, and never for end users ═══
do $$
begin
  -- An admin already exists in a bootstrapped project, so the function
  -- must refuse. (On a fresh project it succeeds exactly once instead.)
  begin
    perform public.bootstrap_platform_admin((select id from test_ids where name='patient_a'));
    if exists (select 1 from profiles p where p.role = 'platform_admin'
               and p.id <> (select id from test_ids where name='patient_a')) then
      raise exception 'FAIL 7a: bootstrap ran while an admin already exists';
    end if;
    raise notice 'PASS 7a: bootstrap succeeded on a fresh project (first run)';
  exception when others then
    if sqlerrm like '%already exists%' then
      raise notice 'PASS 7a: bootstrap refused (admin already exists)';
    else raise;
    end if;
  end;
end $$;

begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from test_ids where name='owner_a'), 'role', 'authenticated')::text, true);
do $$
begin
  begin
    perform public.bootstrap_platform_admin((select id from test_ids where name='owner_a'));
    raise exception 'FAIL 7b: an authenticated user executed bootstrap';
  exception when sqlstate '42501' then
    raise notice 'PASS 7b: bootstrap not executable by end users';
  end;
end $$;
rollback;

-- ═══ Cleanup ════════════════════════════════════════════════════
delete from tickets where id = 'f1111111-1111-4111-8111-111111111111';
delete from care_episodes where id = 'e1111111-1111-4111-8111-111111111111';
delete from patients where id in
  ('d1111111-1111-4111-8111-111111111111', 'd2222222-2222-4222-8222-222222222222');
delete from clinic_members where clinic_id in
  ('c1111111-1111-4111-8111-111111111111', 'c2222222-2222-4222-8222-222222222222');
delete from clinics where id in
  ('c1111111-1111-4111-8111-111111111111', 'c2222222-2222-4222-8222-222222222222');
drop table test_ids;

select 'RLS tests finished — check the Logs/Notices panel for PASS lines.' as result;
