-- PhysioAI — RLS tests for the patient/clinical module (migrations 010-013).
-- Run AFTER 001→002→003→010→011→012→013→014 in the Supabase SQL editor.
-- Same usage as rls_tests.sql: create SIX auth users, paste their UUIDs,
-- run the file, read PASS lines in the Logs panel. Cleans up after itself.

drop table if exists test_ids;
create table test_ids (name text primary key, id uuid not null);
grant select on test_ids to authenticated;

insert into test_ids (name, id) values
  ('owner_a',     '00000000-0000-0000-0000-000000000000'),  -- ← replace
  ('owner_b',     '00000000-0000-0000-0000-000000000000'),  -- ← replace
  ('therapist_a', '00000000-0000-0000-0000-000000000000'),  -- ← replace (assigned)
  ('therapist_a2','00000000-0000-0000-0000-000000000000'),  -- ← replace (NOT assigned)
  ('staff_a',     '00000000-0000-0000-0000-000000000000'),  -- ← replace
  ('patient_a',   '00000000-0000-0000-0000-000000000000');  -- ← replace

do $$ begin
  if exists (select 1 from test_ids where id = '00000000-0000-0000-0000-000000000000') then
    raise exception 'Fill in the six real user UUIDs first.';
  end if;
end $$;

-- Setup (as postgres, bypasses RLS)
update profiles set role='clinic_owner' where id in ((select id from test_ids where name='owner_a'),(select id from test_ids where name='owner_b'));
update profiles set role='therapist' where id in ((select id from test_ids where name='therapist_a'),(select id from test_ids where name='therapist_a2'));
update profiles set role='clinic_staff' where id=(select id from test_ids where name='staff_a');
update profiles set role='patient' where id=(select id from test_ids where name='patient_a');

insert into clinics (id, name) values
  ('c1111111-1111-4111-8111-111111111111','TEST Clinic A'),
  ('c2222222-2222-4222-8222-222222222222','TEST Clinic B')
on conflict (id) do nothing;

insert into clinic_members (clinic_id, user_id, member_role) values
  ('c1111111-1111-4111-8111-111111111111',(select id from test_ids where name='owner_a'),'clinic_owner'),
  ('c2222222-2222-4222-8222-222222222222',(select id from test_ids where name='owner_b'),'clinic_owner'),
  ('c1111111-1111-4111-8111-111111111111',(select id from test_ids where name='therapist_a'),'therapist'),
  ('c1111111-1111-4111-8111-111111111111',(select id from test_ids where name='therapist_a2'),'therapist'),
  ('c1111111-1111-4111-8111-111111111111',(select id from test_ids where name='staff_a'),'clinic_staff')
on conflict do nothing;

insert into patients (id, clinic_id, first_name, last_name) values
  ('d1111111-1111-4111-8111-111111111111','c1111111-1111-4111-8111-111111111111','TEST','Patient A'),
  ('d2222222-2222-4222-8222-222222222222','c2222222-2222-4222-8222-222222222222','TEST','Patient B')
on conflict (id) do nothing;

insert into patient_users (patient_id, user_id) values
  ('d1111111-1111-4111-8111-111111111111',(select id from test_ids where name='patient_a'))
on conflict do nothing;
insert into patient_therapists (patient_id, therapist_id) values
  ('d1111111-1111-4111-8111-111111111111',(select id from test_ids where name='therapist_a'))
on conflict do nothing;

insert into care_episodes (id, clinic_id, patient_id, title_fa, title, planned_session_count, status) values
  ('e1111111-1111-4111-8111-111111111111','c1111111-1111-4111-8111-111111111111',
   'd1111111-1111-4111-8111-111111111111','TEST Episode','TEST Episode',10,'active')
on conflict (id) do nothing;

insert into progress_metric_definitions (id, clinic_id, name_key, data_type, unit, direction, patient_visible) values
  ('a1111111-1111-4111-8111-111111111111','c1111111-1111-4111-8111-111111111111','knee_flexion_rom','numeric','deg','higher_is_better', true),
  ('a2222222-2222-4222-8222-222222222222','c1111111-1111-4111-8111-111111111111','private_metric','numeric','deg','higher_is_better', false)
on conflict (id) do nothing;

-- One completed session (with a private note) + two measurements.
insert into sessions (id, clinic_id, patient_id, care_episode_id, session_date, status,
                      therapist_id, patient_visible_summary, therapist_private_notes)
values ('b1111111-1111-4111-8111-111111111111','c1111111-1111-4111-8111-111111111111',
        'd1111111-1111-4111-8111-111111111111','e1111111-1111-4111-8111-111111111111',
        current_date, 'completed', (select id from test_ids where name='therapist_a'),
        'TEST visible summary', 'TEST PRIVATE NOTE')
on conflict (id) do nothing;

insert into clinical_measurements (id, clinic_id, patient_id, care_episode_id,
        metric_definition_id, numeric_value, unit, therapist_id)
values
  ('f1111111-1111-4111-8111-11111111111a','c1111111-1111-4111-8111-111111111111',
   'd1111111-1111-4111-8111-111111111111','e1111111-1111-4111-8111-111111111111',
   'a1111111-1111-4111-8111-111111111111', 90, 'deg', (select id from test_ids where name='therapist_a')),
  ('f1111111-1111-4111-8111-11111111111b','c1111111-1111-4111-8111-111111111111',
   'd1111111-1111-4111-8111-111111111111','e1111111-1111-4111-8111-111111111111',
   'a2222222-2222-4222-8222-222222222222', 45, 'deg', (select id from test_ids where name='therapist_a'))
on conflict (id) do nothing;


-- 014 test fixtures: clinical background, an assessment, a second
-- episode + session (for cross-episode checks), and a clinic-B metric.
insert into patient_clinical_background (patient_id, clinic_id, medical_history, medications)
values ('d1111111-1111-4111-8111-111111111111','c1111111-1111-4111-8111-111111111111',
        'TEST history','TEST meds')
on conflict (patient_id) do nothing;

insert into assessments (id, clinic_id, patient_id, care_episode_id)
values ('ac111111-1111-4111-8111-111111111111','c1111111-1111-4111-8111-111111111111',
        'd1111111-1111-4111-8111-111111111111','e1111111-1111-4111-8111-111111111111')
on conflict (id) do nothing;

insert into care_episodes (id, clinic_id, patient_id, title_fa, title, status) values
  ('e3333333-3333-4333-8333-333333333333','c1111111-1111-4111-8111-111111111111',
   'd1111111-1111-4111-8111-111111111111','TEST Episode 2','TEST Episode 2','active')
on conflict (id) do nothing;

insert into sessions (id, clinic_id, patient_id, care_episode_id, session_date, status, therapist_id)
values ('b2222222-2222-4222-8222-222222222222','c1111111-1111-4111-8111-111111111111',
        'd1111111-1111-4111-8111-111111111111','e3333333-3333-4333-8333-333333333333',
        current_date, 'draft', (select id from test_ids where name='therapist_a'))
on conflict (id) do nothing;

insert into progress_metric_definitions (id, clinic_id, name_key, data_type, unit, direction) values
  ('a3333333-3333-4333-8333-333333333333','c2222222-2222-4222-8222-222222222222',
   'clinic_b_metric','numeric','deg','higher_is_better')
on conflict (id) do nothing;

-- ═══ 1: owner B sees nothing of clinic A ════════════════════════
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub',(select id from test_ids where name='owner_b'),'role','authenticated')::text, true);
do $$ begin
  if exists (select 1 from patients where id='d1111111-1111-4111-8111-111111111111')
     or exists (select 1 from sessions where id='b1111111-1111-4111-8111-111111111111')
     or exists (select 1 from clinical_measurements where care_episode_id='e1111111-1111-4111-8111-111111111111') then
    raise exception 'FAIL 1: cross-clinic leak';
  end if;
  raise notice 'PASS 1: cross-clinic isolation';
end $$;
rollback;

-- ═══ 2: staff_a — admin edits OK, clinical writes blocked ═══════
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub',(select id from test_ids where name='staff_a'),'role','authenticated')::text, true);
do $$ begin
  update patients set address='TEST addr' where id='d1111111-1111-4111-8111-111111111111';
  begin
    update sessions set interventions='hack' where id='b1111111-1111-4111-8111-111111111111';
    if exists (select 1 from sessions where id='b1111111-1111-4111-8111-111111111111' and interventions='hack') then
      raise exception 'FAIL 2a: staff edited a session';
    end if;
  exception when sqlstate '42501' then null; end;
  begin
    insert into clinical_measurements (clinic_id, patient_id, care_episode_id, metric_definition_id, numeric_value, therapist_id)
    values ('c1111111-1111-4111-8111-111111111111','d1111111-1111-4111-8111-111111111111',
            'e1111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111', 10,
            (select id from test_ids where name='staff_a'));
    raise exception 'FAIL 2b: staff wrote a measurement';
  exception when sqlstate '42501' then null; end;
  begin
    insert into assessments (clinic_id, patient_id, care_episode_id)
    values ('c1111111-1111-4111-8111-111111111111','d1111111-1111-4111-8111-111111111111','e1111111-1111-4111-8111-111111111111');
    raise exception 'FAIL 2c: staff created an assessment';
  exception when sqlstate '42501' then null; end;
  raise notice 'PASS 2: clinic_staff = administrative only';
end $$;
rollback;

-- ═══ 3: assigned therapist writes; unassigned blocked ═══════════
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub',(select id from test_ids where name='therapist_a'),'role','authenticated')::text, true);
do $$ begin
  insert into sessions (clinic_id, patient_id, care_episode_id, session_date, status, therapist_id)
  values ('c1111111-1111-4111-8111-111111111111','d1111111-1111-4111-8111-111111111111',
          'e1111111-1111-4111-8111-111111111111', current_date, 'draft',
          (select id from test_ids where name='therapist_a'));
  raise notice 'PASS 3a: assigned therapist creates sessions';
end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub',(select id from test_ids where name='therapist_a2'),'role','authenticated')::text, true);
do $$ begin
  begin
    insert into sessions (clinic_id, patient_id, care_episode_id, session_date, status, therapist_id)
    values ('c1111111-1111-4111-8111-111111111111','d1111111-1111-4111-8111-111111111111',
            'e1111111-1111-4111-8111-111111111111', current_date, 'draft',
            (select id from test_ids where name='therapist_a2'));
    raise exception 'FAIL 3b: unassigned therapist created a session';
  exception when sqlstate '42501' then null; end;
  raise notice 'PASS 3b: unassigned therapist blocked';
end $$;
rollback;

-- ═══ 4: patient scope — summaries yes, private notes never ══════
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub',(select id from test_ids where name='patient_a'),'role','authenticated')::text, true);
do $$ begin
  if exists (select 1 from sessions where id='b1111111-1111-4111-8111-111111111111') then
    raise exception 'FAIL 4a: patient read the raw sessions table';
  end if;
  if not exists (select 1 from patient_session_summaries
                 where id='b1111111-1111-4111-8111-111111111111'
                   and patient_visible_summary='TEST visible summary') then
    raise exception 'FAIL 4b: patient cannot read own visible summary';
  end if;
  if exists (select 1 from clinical_measurements where id='f1111111-1111-4111-8111-11111111111b') then
    raise exception 'FAIL 4c: patient read a non-visible measurement';
  end if;
  if not exists (select 1 from clinical_measurements where id='f1111111-1111-4111-8111-11111111111a') then
    raise exception 'FAIL 4d: patient cannot read a patient_visible measurement';
  end if;
  begin
    insert into clinical_measurements (clinic_id, patient_id, care_episode_id, metric_definition_id, numeric_value, therapist_id)
    values ('c1111111-1111-4111-8111-111111111111','d1111111-1111-4111-8111-111111111111',
            'e1111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111', 5,
            (select id from test_ids where name='patient_a'));
    raise exception 'FAIL 4e: patient wrote a clinical measurement';
  exception when sqlstate '42501' then null; end;
  if exists (select 1 from assessments where patient_id='d1111111-1111-4111-8111-111111111111') then
    raise exception 'FAIL 4f: patient read an assessment';
  end if;
  raise notice 'PASS 4: patient sees only permitted data';
end $$;
rollback;

-- ═══ 5: audit rows exist for the seeded writes ══════════════════
do $$ begin
  if not exists (select 1 from audit_logs where action='measurement.created'
                 and patient_id='d1111111-1111-4111-8111-111111111111') then
    raise exception 'FAIL 5: no audit rows recorded';
  end if;
  raise notice 'PASS 5: audit log rows recorded';
end $$;


-- ═══ 6 (014): write_audit is not directly executable ════════════
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub',(select id from test_ids where name='owner_a'),'role','authenticated')::text, true);
do $$ begin
  begin
    perform public.write_audit('hack','patient',null,null,null,null,null);
    raise exception 'FAIL 6: authenticated executed write_audit directly';
  exception when sqlstate '42501' then
    raise notice 'PASS 6: write_audit locked down';
  end;
end $$;
rollback;

-- ═══ 7 (014): staff cannot touch or read clinical background ════
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub',(select id from test_ids where name='staff_a'),'role','authenticated')::text, true);
do $$ begin
  if exists (select 1 from patient_clinical_background
             where patient_id='d1111111-1111-4111-8111-111111111111') then
    raise exception 'FAIL 7a: staff can read clinical background';
  end if;
  update patient_clinical_background set medications='hack'
    where patient_id='d1111111-1111-4111-8111-111111111111';
  if exists (select 1 from patient_clinical_background
             where patient_id='d1111111-1111-4111-8111-111111111111' and medications='hack') then
    raise exception 'FAIL 7b: staff edited medications';
  end if;
  -- staff cannot read raw sessions (private notes) but CAN use the admin view
  if exists (select 1 from sessions where id='b1111111-1111-4111-8111-111111111111') then
    raise exception 'FAIL 7c: staff read the raw sessions table';
  end if;
  if not exists (select 1 from session_admin_view where id='b1111111-1111-4111-8111-111111111111') then
    raise exception 'FAIL 7d: staff cannot use the admin session view';
  end if;
  raise notice 'PASS 7: staff column-level clinical isolation holds';
end $$;
rollback;

-- ═══ 8 (014): unassigned therapist cannot READ clinical records ═
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub',(select id from test_ids where name='therapist_a2'),'role','authenticated')::text, true);
do $$ begin
  if exists (select 1 from sessions where patient_id='d1111111-1111-4111-8111-111111111111') then
    raise exception 'FAIL 8a: unassigned therapist read sessions';
  end if;
  if exists (select 1 from assessments where patient_id='d1111111-1111-4111-8111-111111111111') then
    raise exception 'FAIL 8b: unassigned therapist read assessments';
  end if;
  raise notice 'PASS 8: clinical read requires assignment (or owner/admin)';
end $$;
rollback;

-- ═══ 9 (014): integrity triggers reject mismatches, fix spoofing ═
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub',(select id from test_ids where name='therapist_a'),'role','authenticated')::text, true);
do $$
declare sid uuid; cb uuid; pid uuid;
begin
  -- forged patient_id + created_by are corrected server-side
  insert into sessions (clinic_id, patient_id, care_episode_id, session_date, status, therapist_id, created_by)
  values ('c2222222-2222-4222-8222-222222222222',       -- forged clinic
          'd2222222-2222-4222-8222-222222222222',       -- forged patient
          'e1111111-1111-4111-8111-111111111111', current_date, 'draft',
          (select id from test_ids where name='therapist_a'),
          (select id from test_ids where name='owner_b'))  -- forged author
  returning id, created_by, patient_id into sid, cb, pid;
  if pid <> 'd1111111-1111-4111-8111-111111111111' then
    raise exception 'FAIL 9a: patient_id not corrected from episode';
  end if;
  if cb <> (select id from test_ids where name='therapist_a') then
    raise exception 'FAIL 9b: created_by not forced to auth.uid()';
  end if;
  -- measurement bound to a session from ANOTHER episode is rejected
  begin
    insert into clinical_measurements (clinic_id, patient_id, care_episode_id,
        session_id, metric_definition_id, numeric_value, unit, therapist_id)
    values ('c1111111-1111-4111-8111-111111111111','d1111111-1111-4111-8111-111111111111',
            'e1111111-1111-4111-8111-111111111111',
            'b2222222-2222-4222-8222-222222222222',   -- session of episode 2!
            'a1111111-1111-4111-8111-111111111111', 10, 'deg',
            (select id from test_ids where name='therapist_a'));
    raise exception 'FAIL 9c: cross-episode session accepted';
  exception when others then
    if sqlerrm not like '%does not belong%' then raise; end if;
  end;
  -- metric definition from another clinic is rejected
  begin
    insert into clinical_measurements (clinic_id, patient_id, care_episode_id,
        metric_definition_id, numeric_value, unit, therapist_id)
    values ('c1111111-1111-4111-8111-111111111111','d1111111-1111-4111-8111-111111111111',
            'e1111111-1111-4111-8111-111111111111',
            'a3333333-3333-4333-8333-333333333333', 10, 'deg',
            (select id from test_ids where name='therapist_a'));
    raise exception 'FAIL 9d: other-clinic metric definition accepted';
  exception when others then
    if sqlerrm not like '%another clinic%' then raise; end if;
  end;
  raise notice 'PASS 9: integrity triggers enforce consistency + authorship';
end $$;
rollback;

-- ═══ 10 (014): duplicate session number rejected ════════════════
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub',(select id from test_ids where name='therapist_a'),'role','authenticated')::text, true);
do $$
declare existing_no int;
begin
  select session_number into existing_no from sessions
    where id='b1111111-1111-4111-8111-111111111111';
  begin
    insert into sessions (clinic_id, patient_id, care_episode_id, session_number,
                          session_date, status, therapist_id)
    values ('c1111111-1111-4111-8111-111111111111','d1111111-1111-4111-8111-111111111111',
            'e1111111-1111-4111-8111-111111111111', existing_no, current_date, 'draft',
            (select id from test_ids where name='therapist_a'));
    raise exception 'FAIL 10: duplicate session_number accepted';
  exception when unique_violation then
    raise notice 'PASS 10: (care_episode_id, session_number) is unique';
  end;
end $$;
rollback;

-- ═══ Cleanup ════════════════════════════════════════════════════
delete from care_episodes where id in ('e1111111-1111-4111-8111-111111111111','e3333333-3333-4333-8333-333333333333');
delete from patients where id in ('d1111111-1111-4111-8111-111111111111','d2222222-2222-4222-8222-222222222222');
delete from progress_metric_definitions where id in ('a1111111-1111-4111-8111-111111111111','a2222222-2222-4222-8222-222222222222','a3333333-3333-4333-8333-333333333333');
delete from clinic_members where clinic_id in ('c1111111-1111-4111-8111-111111111111','c2222222-2222-4222-8222-222222222222');
delete from clinics where id in ('c1111111-1111-4111-8111-111111111111','c2222222-2222-4222-8222-222222222222');
delete from audit_logs where patient_id='d1111111-1111-4111-8111-111111111111';
drop table test_ids;
select 'Patient/clinical RLS tests finished — check Logs for PASS lines.' as result;
