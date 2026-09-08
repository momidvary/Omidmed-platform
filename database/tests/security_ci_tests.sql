-- Automated RLS and tenant-integrity regression suite.
-- Run only in a disposable database after migrations 001 -> 020.

\set ON_ERROR_STOP on

begin;

insert into auth.users (id, raw_user_meta_data) values
  ('10000000-0000-4000-8000-000000000001', '{"full_name":"Owner A"}'),
  ('10000000-0000-4000-8000-000000000002', '{"full_name":"Platform Admin"}'),
  ('10000000-0000-4000-8000-000000000003', '{"full_name":"Assigned Therapist"}'),
  ('10000000-0000-4000-8000-000000000004', '{"full_name":"Unassigned Therapist"}'),
  ('10000000-0000-4000-8000-000000000005', '{"full_name":"Clinic Staff"}'),
  ('10000000-0000-4000-8000-000000000006', '{"full_name":"Patient Login"}'),
  ('10000000-0000-4000-8000-000000000007', '{"full_name":"Owner B"}'),
  ('10000000-0000-4000-8000-000000000008', '{"full_name":"Guardian Login"}');

update auth.users set email = case id
  when '10000000-0000-4000-8000-000000000006' then 'patient@example.test'
  when '10000000-0000-4000-8000-000000000008' then 'guardian@example.test'
  else null
end;

update public.profiles set role = 'clinic_owner'
where id in (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000007'
);
update public.profiles set role = 'platform_admin'
where id = '10000000-0000-4000-8000-000000000002';
update public.profiles set role = 'therapist'
where id in (
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004'
);
update public.profiles set role = 'clinic_staff'
where id = '10000000-0000-4000-8000-000000000005';
update public.profiles set role = 'patient'
where id = '10000000-0000-4000-8000-000000000006';

insert into public.clinics (id, name) values
  ('20000000-0000-4000-8000-000000000001', 'CI Clinic A'),
  ('20000000-0000-4000-8000-000000000002', 'CI Clinic B');

insert into public.clinic_members (clinic_id, user_id, member_role) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'clinic_owner'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000007', 'clinic_owner'),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'therapist'),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'therapist'),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000005', 'clinic_staff');

insert into public.patients (id, clinic_id, full_name, created_by) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'CI Patient A', '10000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'CI Patient B', '10000000-0000-4000-8000-000000000007');

insert into public.patient_therapists (patient_id, therapist_id) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003');
insert into public.patient_users (patient_id, user_id) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000006');

insert into public.care_episodes (id, patient_id, title_fa) values
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'CI Episode A'),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'CI Episode B');

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
insert into public.cases (
  id, clinic_id, patient_id, episode_id, created_by,
  name, region, main_complaint, pain_intensity
) values (
  '50000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000003',
  'CI Case A', 'knee', 'CI complaint', 4
);
select set_config('request.jwt.claims', '{}', true);

-- Migration 012 requires current clear safety before an AI reservation. Use
-- the real authenticated reviewer path so the safety actor/time are stamped by
-- the database trigger instead of being forged by test setup.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select * from public.record_case_safety_screen(
  '50000000-0000-4000-8000-000000000001', '{}'::text[], null, null
);
do $$
begin
  begin
    update public.cases
    set safety_notes = 'Direct safety mutation must fail'
    where id = '50000000-0000-4000-8000-000000000001';
    raise exception 'FAIL: direct case safety update bypassed the RPC';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.record_case_safety_screen(
      '50000000-0000-4000-8000-000000000001',
      array['unknown-client-flag'], null, 'Unsafe client supplied action'
    );
    raise exception 'FAIL: unknown safety flag was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.record_case_safety_screen(
      '50000000-0000-4000-8000-000000000001',
      array['rf_severe_pain'], null, null
    );
    raise exception 'FAIL: safety concern without action was accepted';
  exception when invalid_parameter_value then null;
  end;
end $$;
reset role;

select set_config('request.jwt.claims', '{}', true);
insert into public.tickets (
  id, patient_id, episode_id, subject, message, created_by
) values (
  '60000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'CI ticket', 'CI patient message',
  '10000000-0000-4000-8000-000000000006'
);

-- Migration 017: the service role has one narrow, idempotent auto-ack path
-- and no direct mutation privilege on the conversation tables.
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select * from public.attach_ticket_auto_ack(
  '60000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000006',
  'Automated acknowledgement; clinician review is not confirmed.'
);
select * from public.attach_ticket_auto_ack(
  '60000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000006',
  'A raced duplicate must return the existing acknowledgement.'
);
do $$
begin
  if (select count(*) from public.ticket_replies
      where ticket_id = '60000000-0000-4000-8000-000000000001'
        and sender = 'ai') <> 1 then
    raise exception 'FAIL: automated ticket acknowledgement was not idempotent';
  end if;
  begin
    insert into public.ticket_replies (
      ticket_id, sender, sender_user_id, content
    ) values (
      '60000000-0000-4000-8000-000000000001', 'ai', null,
      'Forbidden direct service mutation'
    );
    raise exception 'FAIL: service role directly mutated ticket replies';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

insert into public.ai_generation_audits (
  id, request_id, clinic_id, case_id, requested_by, provider, model,
  prompt_version, input_hash, context_snapshot, output, status, completed_at
) values (
  '70000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000003',
  'openai', 'ci-model', 'ci-prompt', repeat('a', 64),
  '{"question":"clinical context"}', '{"answer":"draft"}', 'generated', now()
);

-- Supabase grants anon broad table privileges and relies on RLS. Prove that
-- the absence of anon policies still blocks both PHI reads and writes.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  begin
    if exists (select 1 from public.patients)
       or exists (select 1 from public.cases)
       or exists (select 1 from public.tickets) then
      raise exception 'FAIL: anon read protected clinical rows';
    end if;
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.patients (clinic_id, full_name) values (
      '20000000-0000-4000-8000-000000000001', 'Anonymous patient'
    );
    raise exception 'FAIL: anon inserted a patient';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.record_case_safety_screen(
      '50000000-0000-4000-8000-000000000001', '{}'::text[], null, null
    );
    raise exception 'FAIL: anon executed a clinical workflow RPC';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Authenticated clients cannot reserve or mutate service-owned AI audits.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.reserve_ai_generation(
      '81000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'ci-model', 'ci-prompt-v2', repeat('b', 64),
      '{"question":"bounded context"}', 5, 40, 500
    );
    raise exception 'FAIL: authenticated client executed AI reservation RPC';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- The service-only reservation is idempotent and enforces quotas atomically.
set local role service_role;
do $$
declare
  v_row record;
  v_review record;
  v_audit_id uuid;
begin
  select * into v_row
  from public.reserve_ai_generation(
    '81000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'ci-model', 'ci-prompt-v2', repeat('b', 64),
    '{"question":"bounded context"}', 5, 40, 500
  );
  if v_row.reservation_outcome <> 'reserved'
     or v_row.audit_status <> 'pending' then
    raise exception 'FAIL: first AI request was not reserved';
  end if;
  v_audit_id := v_row.audit_id;

  select * into v_row
  from public.reserve_ai_generation(
    '81000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'ci-model', 'ci-prompt-v2', repeat('b', 64),
    '{"question":"bounded context"}', 5, 40, 500
  );
  if v_row.reservation_outcome <> 'existing'
     or v_row.audit_id <> v_audit_id
     or v_row.audit_status <> 'pending' then
    raise exception 'FAIL: AI idempotency replay created another reservation';
  end if;

  select * into v_row
  from public.reserve_ai_generation(
    '81000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'ci-model', 'ci-prompt-v2', repeat('c', 64),
    '{"question":"changed context"}', 5, 40, 500
  );
  if v_row.reservation_outcome <> 'conflict' then
    raise exception 'FAIL: reused AI request id did not conflict';
  end if;

  select * into v_row
  from public.reserve_ai_generation(
    '81000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'ci-model', 'ci-prompt-v2', repeat('d', 64),
    '{"question":"minute quota"}', 1, 40, 500
  );
  if v_row.reservation_outcome <> 'minute_limit' then
    raise exception 'FAIL: per-minute AI quota was bypassed';
  end if;

  select * into v_row
  from public.reserve_ai_generation(
    '81000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'ci-model', 'ci-prompt-v2', repeat('e', 64),
    '{"question":"user daily quota"}', 20, 1, 500
  );
  if v_row.reservation_outcome <> 'user_daily_limit' then
    raise exception 'FAIL: per-user daily AI quota was bypassed';
  end if;

  select * into v_row
  from public.reserve_ai_generation(
    '81000000-0000-4000-8000-000000000004',
    '20000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'ci-model', 'ci-prompt-v2', repeat('f', 64),
    '{"question":"clinic daily quota"}', 20, 100, 2
  );
  if v_row.reservation_outcome <> 'clinic_daily_limit' then
    raise exception 'FAIL: per-clinic daily AI quota was bypassed';
  end if;

  select * into v_row
  from public.complete_ai_generation(
    v_audit_id,
    '10000000-0000-4000-8000-000000000001',
    'generated', 'ci-model', 'response-ci-1',
    '{"answer":"bounded reviewed draft"}',
    '{"input_tokens":10,"output_tokens":12}', null
  );
  if v_row.audit_status <> 'generated'
     or v_row.audit_output is null then
    raise exception 'FAIL: AI reservation did not complete atomically';
  end if;

  select * into v_row
  from public.reserve_ai_generation(
    '81000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'ci-model', 'ci-prompt-v2', repeat('b', 64),
    '{"question":"bounded context"}', 5, 40, 500
  );
  if v_row.reservation_outcome <> 'existing'
     or v_row.audit_status <> 'generated'
     or v_row.audit_id <> v_audit_id then
    raise exception 'FAIL: completed AI replay was not idempotent';
  end if;

  select * into v_review
  from public.record_ai_generation_review(
    v_audit_id,
    '10000000-0000-4000-8000-000000000001',
    'accepted', null, 'CI clinician review'
  );
  if v_review.review_outcome <> 'created'
     or v_review.review_decision <> 'accepted' then
    raise exception 'FAIL: generated AI review was not recorded';
  end if;

  select * into v_review
  from public.record_ai_generation_review(
    v_audit_id,
    '10000000-0000-4000-8000-000000000001',
    'rejected', null, 'Conflicting replay must not overwrite'
  );
  if v_review.review_outcome <> 'existing'
     or v_review.review_decision <> 'accepted' then
    raise exception 'FAIL: AI review replay overwrote the first decision';
  end if;

  if (
    select count(*)
    from public.ai_generation_audits
    where requested_by = '10000000-0000-4000-8000-000000000001'
  ) <> 1 then
    raise exception 'FAIL: AI reservation generated duplicate audit rows';
  end if;

  begin
    update public.ai_generation_audits
    set error_code = 'forged'
    where id = v_audit_id;
    raise exception 'FAIL: service role bypassed AI completion RPC';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.ai_generation_reviews (
      audit_id, reviewer_id, decision
    ) values (
      v_audit_id,
      '10000000-0000-4000-8000-000000000001',
      'rejected'
    );
    raise exception 'FAIL: service role bypassed AI review RPC';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.record_ai_generation_review(
      v_audit_id,
      '10000000-0000-4000-8000-000000000002',
      'accepted', null, null
    );
    raise exception 'FAIL: platform admin reviewed clinical AI output';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.reserve_ai_generation(
      '81000000-0000-4000-8000-000000000005',
      '20000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
      'ci-model', 'ci-prompt-v2', repeat('9', 64),
      '{"question":"platform support"}', 5, 40, 500
    );
    raise exception 'FAIL: platform admin reserved clinical AI access';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- A request reserved while clear must discard its provider output if the case
-- becomes unsafe before completion. The already-generated audit must likewise
-- become unreviewable while the safety state is urgent.
set local role service_role;
do $$
declare
  v_row record;
begin
  select * into v_row
  from public.reserve_ai_generation(
    '81000000-0000-4000-8000-000000000006',
    '20000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'ci-model', 'ci-prompt-v2', repeat('8', 64),
    '{"question":"race safety check"}', 20, 40, 500
  );
  if v_row.reservation_outcome <> 'reserved'
     or v_row.audit_status <> 'pending'
     or v_row.audit_id is null then
    raise exception 'FAIL: safety-race AI request was not reserved while clear';
  end if;
  perform set_config(
    'physioai_ci.pending_ai_audit_id', v_row.audit_id::text, true
  );
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select * from public.record_case_safety_screen(
  '50000000-0000-4000-8000-000000000001',
  array['rf_severe_pain'], null, 'Urgent medical assessment arranged'
);
reset role;

set local role service_role;
do $$
declare
  v_row record;
begin
  select * into v_row
  from public.complete_ai_generation(
    current_setting('physioai_ci.pending_ai_audit_id')::uuid,
    '10000000-0000-4000-8000-000000000001',
    'generated', 'ci-model', 'response-ci-race',
    '{"answer":"must be discarded"}',
    '{"input_tokens":8,"output_tokens":9}', null
  );
  if v_row.audit_status <> 'refused'
     or v_row.audit_output is not null
     or v_row.audit_error_code <> 'authorization_or_safety_changed' then
    raise exception 'FAIL: unsafe pending AI completion retained generated output';
  end if;

  begin
    perform public.record_ai_generation_review(
      '70000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000003',
      'accepted', null, 'Must be rejected while case is urgent'
    );
    raise exception 'FAIL: unsafe AI generation was reviewed';
  exception when check_violation then null;
  end;
end $$;
reset role;

-- Restore clear safety for the remaining treatment workflow tests.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select * from public.record_case_safety_screen(
  '50000000-0000-4000-8000-000000000001', '{}'::text[], null, null
);
reset role;

-- Revoking either current assignment or clinic membership must independently
-- remove direct RLS access to the requester's historical PHI-bearing AI audit.
delete from public.patient_therapists
where patient_id = '30000000-0000-4000-8000-000000000001'
  and therapist_id = '10000000-0000-4000-8000-000000000003';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
do $$
begin
  if exists (
    select 1
    from public.ai_generation_audits
    where requested_by = '10000000-0000-4000-8000-000000000003'
  ) then
    raise exception 'FAIL: revoked therapist retained AI audit PHI access';
  end if;
end $$;
reset role;

insert into public.patient_therapists (patient_id, therapist_id) values (
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000003'
);
delete from public.clinic_members
where clinic_id = '20000000-0000-4000-8000-000000000001'
  and user_id = '10000000-0000-4000-8000-000000000003';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
do $$
begin
  if exists (
    select 1
    from public.ai_generation_audits
    where requested_by = '10000000-0000-4000-8000-000000000003'
  ) then
    raise exception 'FAIL: therapist without clinic membership retained AI audit PHI access';
  end if;
end $$;
reset role;

-- Restore clinic access so subsequent existing tests retain their intended
-- setup. The outer transaction still rolls every probe back at the end.
insert into public.clinic_members (clinic_id, user_id, member_role) values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000003',
  'therapist'
);

-- clinic_staff: no direct PHI and no self-link escalation.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.patients)
     or exists (select 1 from public.cases)
     or exists (select 1 from public.tickets)
     or exists (select 1 from public.care_episodes) then
    raise exception 'FAIL: clinic_staff read PHI';
  end if;
  begin
    insert into public.patient_users (patient_id, user_id) values (
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000005'
    );
    raise exception 'FAIL: clinic_staff self-linked to a patient';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- platform_admin: no PHI, no clinic membership, and no self-demotion path.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.patients)
     or exists (select 1 from public.patient_users)
     or exists (select 1 from public.patient_therapists)
     or exists (select 1 from public.care_episodes)
     or exists (select 1 from public.cases)
     or exists (select 1 from public.tickets)
     or exists (select 1 from public.ticket_replies)
     or exists (select 1 from public.ai_generation_audits) then
    raise exception 'FAIL: platform_admin received implicit PHI access';
  end if;
  begin
    update public.profiles
    set role = 'clinic_owner'
    where id = '10000000-0000-4000-8000-000000000002';
    raise exception 'FAIL: platform_admin changed their own global role';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.clinic_members (clinic_id, user_id, member_role) values (
      '20000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000002',
      'clinic_owner'
    );
    raise exception 'FAIL: platform_admin acquired clinic membership';
  exception when check_violation then null;
  end;
  if exists (
    select 1 from public.clinic_members
    where user_id = '10000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'FAIL: rejected platform_admin membership persisted';
  end if;
  begin
    perform public.create_patient_episode(
      '20000000-0000-4000-8000-000000000002', 'Forbidden patient', null,
      null, null, 'Forbidden episode', 5, null
    );
    raise exception 'FAIL: platform_admin created a patient';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Assigned therapist sees their patient/case; unassigned peer does not.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
do $$
declare
  v_plan_one uuid;
  v_plan_two uuid;
  v_blocked_plan uuid;
  v_prescription_one uuid;
  v_prescription_two uuid;
  v_blocked_prescription uuid;
  v_alert_id uuid;
  v_log_id uuid;
  v_plan_input jsonb := '{
    "region":"knee",
    "stage":"subacute",
    "painSeverity":4,
    "irritability":"moderate",
    "mainImpairment":"quadriceps weakness",
    "patientGoal":"return to stairs",
    "safetyConfirmed":true
  }'::jsonb;
  v_plan_output jsonb := '{
    "manualTherapy":[],
    "exerciseTherapy":["Graded functional exercise"],
    "mobility":["Assess and address relevant mobility"],
    "strengthening":["Progress task-specific strength"],
    "motorControl":[],
    "balance":[],
    "education":["Explain symptom-guided progression"],
    "homeProgram":["Clinician-reviewed home activity"],
    "frequency":"weekly review",
    "progression":["Progress only after reassessment"]
  }'::jsonb;
begin
  if (select count(*) from public.patients) <> 1
     or (select count(*) from public.cases) <> 1 then
    raise exception 'FAIL: assigned therapist cannot see assigned workflow';
  end if;
  if (select count(*) from public.ai_generation_audits) <> 1 then
    raise exception 'FAIL: AI audit requester cannot read their audit';
  end if;

  perform public.record_case_safety_screen(
    '50000000-0000-4000-8000-000000000001', '{}'::text[], null, null
  );

  begin
    perform public.save_treatment_plan_draft(
      '50000000-0000-4000-8000-000000000001',
      v_plan_input,
      '{"frequency":"unbounded client payload"}'::jsonb
    );
    raise exception 'FAIL: malformed treatment-plan output was stored';
  exception when check_violation then null;
  end;

  begin
    perform public.save_treatment_plan_draft(
      '50000000-0000-4000-8000-000000000001',
      v_plan_input || jsonb_build_object(
        'stage', 'post-op',
        'postOpDetails', jsonb_build_object(
          'procedure', 'CI procedure',
          'surgeryDate', '2026-02-31',
          'precautions', 'CI precautions',
          'weightBearingStatus', 'WBAT',
          'protocolConfirmed', true
        )
      ),
      v_plan_output
    );
    raise exception 'FAIL: impossible post-op calendar date was stored';
  exception when check_violation then null;
  end;

  select plan_id into v_plan_one
  from public.save_treatment_plan_draft(
    '50000000-0000-4000-8000-000000000001',
    v_plan_input,
    v_plan_output
  );
  perform public.review_treatment_plan(v_plan_one, 'approved', 'CI sign-off');

  select plan_id into v_plan_two
  from public.save_treatment_plan_draft(
    '50000000-0000-4000-8000-000000000001',
    v_plan_input || '{"stage":"chronic"}'::jsonb,
    v_plan_output || '{"frequency":"fortnightly review"}'::jsonb
  );
  perform public.review_treatment_plan(v_plan_two, 'approved', 'Updated plan');
  perform set_config('physioai_ci.approved_plan_id', v_plan_two::text, true);

  if (select count(*) from public.treatment_plans where status = 'approved') <> 1
     or not exists (
       select 1 from public.treatment_plans
       where id = v_plan_one and status = 'superseded'
         and reviewed_by = '10000000-0000-4000-8000-000000000003'
         and review_note = 'CI sign-off'
         and superseded_by = '10000000-0000-4000-8000-000000000003'
         and superseded_at >= reviewed_at
     ) then
    raise exception 'FAIL: plan supersede lost the original sign-off metadata';
  end if;

  begin
    perform public.save_prescription_draft(
      v_plan_two, current_date, current_date + 30,
      'Follow the documented precautions',
      'Stop and contact the clinic if symptoms worsen',
      current_date + 14,
      '[{"exerciseId":"ex_unreviewed_client_value","dosageFa":"3 sets x 10 reps","daysPerWeek":5}]'::jsonb
    );
    raise exception 'FAIL: unreviewed exercise ID entered a prescription';
  exception when invalid_parameter_value then null;
  end;

  select prescription_id into v_prescription_one
  from public.save_prescription_draft(
    v_plan_two, current_date, current_date + 30,
    'Follow the documented precautions',
    'Stop and contact the clinic if symptoms worsen',
    current_date + 14,
    '[{"exerciseId":"ex_quad_sets","dosageFa":"3 sets x 10 reps","daysPerWeek":5}]'::jsonb
  );
  perform public.publish_prescription(v_prescription_one);
  if not exists (
    select 1
    from public.prescription_items item
    where item.prescription_id = v_prescription_one
      and item.exercise_id = 'ex_quad_sets'
      and item.exercise_version = 1
      and item.content_snapshot ->> 'name' = 'انقباض عضله چهارسر (کوآد ست)'
  ) then
    raise exception 'FAIL: prescription did not retain the reviewed exercise snapshot';
  end if;

  select prescription_id into v_prescription_two
  from public.save_prescription_draft(
    v_plan_two, current_date, current_date + 45,
    'Use symptom-guided loading only',
    'Stop for new neurological or systemic symptoms',
    current_date + 14,
    '[{"exerciseId":"ex_heel_slides","dosageFa":"2 sets x 8 reps","daysPerWeek":4}]'::jsonb
  );
  perform public.publish_prescription(v_prescription_two);
  if (select count(*) from public.exercise_prescriptions where status = 'published') <> 1
     or not exists (
       select 1 from public.exercise_prescriptions
       where id = v_prescription_one and status = 'revoked'
     ) then
    raise exception 'FAIL: publishing a new prescription did not revoke the old version';
  end if;

  insert into public.patient_daily_logs (
    episode_id, date, pain_level, completed
  ) values (
    '40000000-0000-4000-8000-000000000001', current_date, 8, true
  ) returning id into v_log_id;
  select alert.id into v_alert_id
  from public.clinical_alerts alert
  where alert.source_table = 'patient_daily_logs'
    and alert.source_id = v_log_id;
  if v_alert_id is null
     or not exists (
       select 1 from public.exercise_prescriptions
       where id = v_prescription_two
         and status = 'suspended'
         and suspension_alert_id = v_alert_id
     ) then
    raise exception 'FAIL: high pain did not atomically alert and suspend';
  end if;
  update public.patient_daily_logs set pain_level = 9 where id = v_log_id;
  if (select count(*) from public.clinical_alerts
      where source_table = 'patient_daily_logs' and source_id = v_log_id) <> 1 then
    raise exception 'FAIL: high-pain alert was not idempotent';
  end if;

  perform public.acknowledge_clinical_alert(v_alert_id);
  if not exists (
    select 1 from public.clinical_alerts
    where id = v_alert_id
      and status = 'acknowledged'
      and acknowledged_by = '10000000-0000-4000-8000-000000000003'
      and acknowledged_at is not null
  ) then
    raise exception 'FAIL: clinical alert acknowledgement was not attributed';
  end if;
  begin
    perform public.resolve_clinical_alert(
      v_alert_id, 'Reviewed before repeat screening', true
    );
    raise exception 'FAIL: prescription resumed without a newer clear screen';
  exception when check_violation then null;
  end;

  perform public.record_case_safety_screen(
    '50000000-0000-4000-8000-000000000001', '{}'::text[],
    'Repeat assessment after high-pain report', null
  );
  perform public.resolve_clinical_alert(
    v_alert_id, 'Repeat screen clear; graded program may resume', true
  );
  if not exists (
       select 1 from public.clinical_alerts
       where id = v_alert_id
         and status = 'resolved'
         and resolved_by = '10000000-0000-4000-8000-000000000003'
     )
     or not exists (
       select 1 from public.exercise_prescriptions
       where id = v_prescription_two
         and status = 'published'
         and suspended_at is null
         and suspension_alert_id is null
     ) then
    raise exception 'FAIL: reviewed alert did not resume atomically';
  end if;

  select prescription_id into v_blocked_prescription
  from public.save_prescription_draft(
    v_plan_two, current_date, null,
    'Maintain documented precautions',
    'Stop and seek review if red flags emerge',
    current_date + 7,
    '[{"exerciseId":"ex_ankle_pumps","dosageFa":"10 repetitions","daysPerWeek":7}]'::jsonb
  );

  select plan_id into v_blocked_plan
  from public.save_treatment_plan_draft(
    '50000000-0000-4000-8000-000000000001',
    v_plan_input || '{"stage":"acute"}'::jsonb,
    v_plan_output || '{"frequency":"reassess before progression"}'::jsonb
  );
  perform public.record_case_safety_screen(
    '50000000-0000-4000-8000-000000000001',
    array['rf_severe_pain'], null, 'Urgent medical assessment arranged'
  );
  if exists (
       select 1 from public.exercise_prescriptions
       where episode_id = '40000000-0000-4000-8000-000000000001'
         and status = 'published'
     )
     or exists (
       select 1 from public.treatment_plans
       where episode_id = '40000000-0000-4000-8000-000000000001'
         and status = 'approved'
     ) then
    raise exception 'FAIL: urgent re-screen did not invalidate active artifacts';
  end if;
  if (select count(*) from public.case_safety_screens
      where case_id = '50000000-0000-4000-8000-000000000001') < 4 then
    raise exception 'FAIL: append-only safety history is incomplete';
  end if;
  begin
    perform public.review_treatment_plan(v_blocked_plan, 'approved', null);
    raise exception 'FAIL: plan approval ignored the changed safety screen';
  exception when check_violation then null;
  end;
  begin
    perform public.publish_prescription(v_blocked_prescription);
    raise exception 'FAIL: prescription publish ignored the changed safety screen';
  exception when check_violation then null;
  end;
  perform public.review_treatment_plan(v_blocked_plan, 'rejected', 'Safety changed');

  begin
    update public.treatment_plans
    set status = 'approved'
    where id = v_blocked_plan;
    raise exception 'FAIL: clinician bypassed the review RPC';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Platform support cannot see signed plan content after it exists.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.treatment_plans) then
    raise exception 'FAIL: platform_admin read treatment-plan PHI';
  end if;
  if exists (select 1 from public.exercise_prescriptions)
     or exists (select 1 from public.prescription_items) then
    raise exception 'FAIL: platform_admin read prescription PHI';
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.patients)
     or exists (select 1 from public.cases)
     or exists (select 1 from public.tickets)
     or exists (select 1 from public.clinical_alerts) then
    raise exception 'FAIL: unassigned therapist read another therapist patient';
  end if;
  begin
    insert into public.cases (
      clinic_id, patient_id, episode_id, name, main_complaint, pain_intensity
    ) values (
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      'Forbidden case', 'test', 2
    );
    raise exception 'FAIL: unassigned therapist created a linked case';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.reply_to_ticket(
      '60000000-0000-4000-8000-000000000001', 'Forbidden reply'
    );
    raise exception 'FAIL: unassigned therapist replied to ticket';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_treatment_plan_draft(
      '50000000-0000-4000-8000-000000000001',
      '{}'::jsonb,
      '{}'::jsonb
    );
    raise exception 'FAIL: unassigned therapist saved a plan';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_prescription_draft(
      current_setting('physioai_ci.approved_plan_id')::uuid, current_date, null,
      'forbidden precautions', 'forbidden stop rules', current_date + 7,
      '[{"exerciseId":"ex_quad_sets","dosageFa":"10 repetitions","daysPerWeek":5}]'::jsonb
    );
    raise exception 'FAIL: unassigned therapist saved a prescription';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- The assigned therapist acknowledgement and reply RPCs derive authorship and
-- transition the workflow atomically.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select public.acknowledge_ticket(
  '60000000-0000-4000-8000-000000000001'
);
do $$
begin
  if not exists (
    select 1 from public.tickets
    where id = '60000000-0000-4000-8000-000000000001'
      and status = 'acknowledged'
      and acknowledged_by = '10000000-0000-4000-8000-000000000003'
      and acknowledged_at is not null
  ) then
    raise exception 'FAIL: ticket acknowledgement was not attributed';
  end if;
end $$;
select public.reply_to_ticket(
  '60000000-0000-4000-8000-000000000001', 'Reviewed clinician reply'
);
do $$
begin
  if not exists (
    select 1 from public.ticket_replies
    where ticket_id = '60000000-0000-4000-8000-000000000001'
      and sender = 'therapist'
      and sender_user_id = '10000000-0000-4000-8000-000000000003'
  ) then
    raise exception 'FAIL: reply RPC did not derive clinician authorship';
  end if;
  if not exists (
    select 1 from public.tickets
    where id = '60000000-0000-4000-8000-000000000001'
      and status = 'answered'
      and last_clinician_activity_at is not null
  ) then
    raise exception 'FAIL: reply RPC did not update status atomically';
  end if;
end $$;
reset role;

-- A patient can continue an active thread only through the attributed RPC.
-- Server-classified urgent text reopens it and creates a metadata-only alert.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
do $$
declare
  v_reply record;
  v_created record;
begin
  select * into v_reply from public.reply_to_patient_ticket(
    '60000000-0000-4000-8000-000000000001',
    'New urgent symptom reported by the patient', 'urgent'
  );
  if v_reply.sender <> 'patient'
     or v_reply.sender_user_id <> '10000000-0000-4000-8000-000000000006'
     or v_reply.ticket_status <> 'open'
     or v_reply.ticket_priority <> 'urgent'
     or not exists (
       select 1 from public.tickets
       where id = '60000000-0000-4000-8000-000000000001'
         and status = 'open' and priority = 'urgent'
         and acknowledged_by is null and acknowledged_at is null
     ) then
    raise exception
      'FAIL: patient reply did not reopen and escalate the ticket (sender %, actor %, status %, priority %, ticket %)',
      v_reply.sender, v_reply.sender_user_id, v_reply.ticket_status,
      v_reply.ticket_priority,
      exists (
        select 1 from public.tickets
        where id = '60000000-0000-4000-8000-000000000001'
          and status = 'open' and priority = 'urgent'
          and acknowledged_by is null and acknowledged_at is null
      );
  end if;

  begin
    insert into public.ticket_replies (
      ticket_id, sender, sender_user_id, content
    ) values (
      '60000000-0000-4000-8000-000000000001', 'patient',
      '10000000-0000-4000-8000-000000000006', 'Direct reply must fail'
    );
    raise exception 'FAIL: patient bypassed the reply RPC';
  exception when insufficient_privilege then null;
  end;

  -- Roll this successful creation back inside a subtransaction so downstream
  -- row-count assertions retain their original fixture.
  begin
    select * into v_created from public.create_patient_ticket(
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      'New bounded ticket', 'Created through the patient workflow RPC',
      null, 'routine'
    );
    if v_created.status <> 'open' or v_created.priority <> 'routine' then
      raise exception 'FAIL: patient ticket creation returned invalid state';
    end if;
    raise sqlstate 'PT001' using message = 'rollback successful creation fixture';
  exception when sqlstate 'PT001' then null;
  end;
end $$;
reset role;

-- An alert-backed ticket cannot close until the alert is explicitly resolved.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select public.reply_to_ticket(
  '60000000-0000-4000-8000-000000000001', 'Urgent update reviewed'
);
do $$
declare
  v_alert_id uuid;
begin
  select alert.id into v_alert_id
  from public.clinical_alerts alert
  where alert.source_table = 'ticket_replies'
    and alert.alert_type = 'ticket-urgent'
  order by alert.created_at desc limit 1;
  if v_alert_id is null or not exists (
    select 1 from public.clinical_alerts alert
    where alert.id = v_alert_id and alert.severity = 'urgent'
      and alert.status = 'open'
  ) then
    raise exception 'FAIL: urgent patient reply did not create a clinical alert';
  end if;
  begin
    perform public.close_ticket(
      '60000000-0000-4000-8000-000000000001', 'Reviewed and closed'
    );
    raise exception 'FAIL: ticket closed with an unresolved clinical alert';
  exception when check_violation then null;
  end;
  perform public.acknowledge_clinical_alert(v_alert_id);
  perform public.resolve_clinical_alert(
    v_alert_id, 'Patient contacted and escalation documented', false
  );
  perform public.close_ticket(
    '60000000-0000-4000-8000-000000000001',
    'Patient contacted and follow-up documented'
  );
  if not exists (
    select 1 from public.tickets
    where id = '60000000-0000-4000-8000-000000000001'
      and status = 'closed'
      and closed_by = '10000000-0000-4000-8000-000000000003'
      and closed_at is not null
      and closure_note = 'Patient contacted and follow-up documented'
  ) then
    raise exception 'FAIL: ticket closure was not attributed';
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.reply_to_patient_ticket(
      '60000000-0000-4000-8000-000000000001',
      'Attempt to reopen closed ticket', 'routine'
    );
    raise exception 'FAIL: patient reopened a closed ticket';
  exception when check_violation then null;
  end;
  begin
    perform public.attach_ticket_auto_ack(
      '60000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000006', 'Forbidden caller'
    );
    raise exception 'FAIL: patient invoked service-only auto acknowledgement';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Migration 018: session notes and outcome scores are attributed, append-only,
-- catalog-bounded, and corrected by adding a linked signed version.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
do $$
declare
  v_note_one uuid;
  v_note_two uuid;
  v_measurement uuid;
begin
  select note_id into v_note_one
  from public.append_clinical_session_note(
    '40000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    clock_timestamp(), 'Symptoms improving', 'ROM assessed',
    'Graded exercise completed', 'Tolerated without worsening',
    'Continue and reassess', null, null
  );
  select note_id into v_note_two
  from public.append_clinical_session_note(
    '40000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    clock_timestamp(), 'Symptoms improving', 'ROM reassessed',
    'Graded exercise completed', 'Tolerated without worsening',
    'Continue and reassess', v_note_one, 'Corrected objective wording'
  );
  if not exists (
    select 1 from public.clinical_session_notes note
    where note.id = v_note_two
      and note.authored_by = '10000000-0000-4000-8000-000000000003'
      and note.supersedes_id = v_note_one
      and note.correction_reason = 'Corrected objective wording'
  ) then
    raise exception 'FAIL: signed session correction was not attributed';
  end if;
  begin
    perform public.append_clinical_session_note(
      '40000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      clock_timestamp(), '', 'Second correction', '', '', '',
      v_note_one, 'Conflicting second correction'
    );
    raise exception 'FAIL: one signed note accepted two correction branches';
  exception when check_violation then null;
  end;
  begin
    update public.clinical_session_notes
    set objective = 'Forbidden rewrite' where id = v_note_two;
    raise exception 'FAIL: signed session note was directly updated';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.record_outcome_measurement_v2(
      '40000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      'lefs', 81, current_date, null, null, null
    );
    raise exception 'FAIL: out-of-range reviewed outcome score was accepted';
  exception when invalid_parameter_value then null;
  end;
  select measurement_id into v_measurement
  from public.record_outcome_measurement_v2(
    '40000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    'lefs', 52, current_date, 'CI baseline', null, null
  );
  if not exists (
    select 1 from public.outcome_measurements_v2 measurement
    where measurement.id = v_measurement
      and measurement.instrument_version = 1
      and measurement.instrument_name_snapshot = 'Lower Extremity Functional Scale (LEFS)'
      and measurement.score = 52
      and measurement.score_min_snapshot = 0
      and measurement.score_max_snapshot = 80
      and measurement.authored_by = '10000000-0000-4000-8000-000000000003'
  ) then
    raise exception 'FAIL: outcome version/range/author snapshot was not retained';
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.clinical_session_notes)
     or exists (select 1 from public.outcome_measurements_v2) then
    raise exception 'FAIL: unassigned therapist read signed documentation';
  end if;
  begin
    perform public.append_clinical_session_note(
      '40000000-0000-4000-8000-000000000001', null,
      clock_timestamp(), 'Forbidden', '', '', '', '', null, null
    );
    raise exception 'FAIL: unassigned therapist signed a session note';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Migration 020: intake assessments are immutable snapshots. A correction or
-- reassessment must name the current parent, retain a complete validated
-- snapshot, and is attributed by the database to the authenticated clinician.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
do $$
declare
  v_initial public.case_assessment_versions%rowtype;
  v_correction_id uuid;
  v_reassessment_id uuid;
  v_payload jsonb := jsonb_build_object(
    'name', 'CI Case A',
    'age', null,
    'gender', null,
    'region', 'knee',
    'main_complaint', 'CI complaint corrected',
    'pain_location', '',
    'pain_intensity', 4,
    'duration', '',
    'mechanism', '',
    'aggravating', '',
    'easing', '',
    'medical_history', '',
    'surgical_history', '',
    'imaging', '',
    'medications', '',
    'functional_limitations', '',
    'patient_goal', ''
  );
begin
  select assessment.* into strict v_initial
  from public.case_assessment_versions assessment
  where assessment.case_id = '50000000-0000-4000-8000-000000000001'
    and assessment.version = 1;
  if v_initial.change_type <> 'initial'
     or v_initial.source <> 'clinician'
     or v_initial.authored_by <>
       '10000000-0000-4000-8000-000000000003'
     or v_initial.main_complaint <> 'CI complaint' then
    raise exception 'FAIL: initial assessment snapshot was not captured faithfully';
  end if;

  select assessment_version_id into v_correction_id
  from public.record_case_assessment_revision(
    '50000000-0000-4000-8000-000000000001', v_initial.id,
    'correction', 'Corrected the documented complaint wording',
    v_initial.assessed_at, v_payload
  );
  if not exists (
       select 1 from public.case_assessment_versions assessment
       where assessment.id = v_correction_id
         and assessment.version = 2
         and assessment.change_type = 'correction'
         and assessment.supersedes_id = v_initial.id
         and assessment.authored_by =
           '10000000-0000-4000-8000-000000000003'
         and assessment.change_reason =
           'Corrected the documented complaint wording'
     )
     or not exists (
       select 1 from public.cases patient_case
       where patient_case.id = '50000000-0000-4000-8000-000000000001'
         and patient_case.main_complaint = 'CI complaint corrected'
     )
     or v_initial.main_complaint <> 'CI complaint' then
    raise exception 'FAIL: assessment correction or current projection is incomplete';
  end if;

  begin
    perform public.record_case_assessment_revision(
      '50000000-0000-4000-8000-000000000001', v_initial.id,
      'correction', 'Conflicting correction from a stale screen',
      v_initial.assessed_at,
      jsonb_set(v_payload, '{main_complaint}', '"stale rewrite"'::jsonb)
    );
    raise exception 'FAIL: stale assessment parent created a history branch';
  exception when check_violation then null;
  end;

  begin
    perform public.record_case_assessment_revision(
      '50000000-0000-4000-8000-000000000001', v_correction_id,
      'reassessment', 'Invalid reassessment pain score', clock_timestamp(),
      jsonb_set(v_payload, '{pain_intensity}', '11'::jsonb)
    );
    raise exception 'FAIL: invalid assessment payload was accepted';
  exception when invalid_parameter_value then null;
  end;

  v_payload := jsonb_set(
    v_payload, '{patient_goal}', '"Return to stairs without limitation"'::jsonb
  );
  select assessment_version_id into v_reassessment_id
  from public.record_case_assessment_revision(
    '50000000-0000-4000-8000-000000000001', v_correction_id,
    'reassessment', 'Documented findings from scheduled reassessment',
    clock_timestamp(), v_payload
  );
  if not exists (
    select 1 from public.case_assessment_versions assessment
    where assessment.id = v_reassessment_id
      and assessment.version = 3
      and assessment.change_type = 'reassessment'
      and assessment.supersedes_id = v_correction_id
      and assessment.patient_goal = 'Return to stairs without limitation'
  ) then
    raise exception 'FAIL: reassessment version was not appended';
  end if;
  perform set_config(
    'physioai_ci.assessment_current_id', v_reassessment_id::text, true
  );

  begin
    update public.cases
    set main_complaint = 'Forbidden direct rewrite'
    where id = '50000000-0000-4000-8000-000000000001';
    raise exception 'FAIL: direct case assessment rewrite was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.case_assessment_versions
    set main_complaint = 'Forbidden history rewrite'
    where id = v_reassessment_id;
    raise exception 'FAIL: signed assessment history was mutable';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$
begin
  if (select count(*) from public.case_assessment_versions assessment
      where assessment.case_id = '50000000-0000-4000-8000-000000000001') <> 3
     or not exists (
       select 1 from public.audit_log audit
       where audit.table_name = 'case_assessment_versions'
         and audit.row_id = current_setting(
           'physioai_ci.assessment_current_id'
         )
         and audit.action = 'INSERT'
     ) then
    raise exception 'FAIL: assessment history or append audit is incomplete';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
do $$
declare
  v_payload jsonb := jsonb_build_object(
    'name', 'CI Case A', 'age', null, 'gender', null, 'region', 'knee',
    'main_complaint', 'Forbidden', 'pain_location', '',
    'pain_intensity', 4, 'duration', '', 'mechanism', '',
    'aggravating', '', 'easing', '', 'medical_history', '',
    'surgical_history', '', 'imaging', '', 'medications', '',
    'functional_limitations', '', 'patient_goal', ''
  );
begin
  if exists (select 1 from public.case_assessment_versions) then
    raise exception 'FAIL: unassigned therapist read assessment history';
  end if;
  begin
    perform public.record_case_assessment_revision(
      '50000000-0000-4000-8000-000000000001',
      current_setting('physioai_ci.assessment_current_id')::uuid,
      'reassessment', 'Forbidden unassigned reassessment',
      clock_timestamp(), v_payload
    );
    raise exception 'FAIL: unassigned therapist revised an assessment';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Owner A cannot forge an episode from Clinic B into a Clinic A case.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
begin
  begin
    insert into public.cases (
      clinic_id, patient_id, episode_id, name, main_complaint, pain_intensity
    ) values (
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000002',
      'Cross tenant case', 'test', 2
    );
    raise exception 'FAIL: cross-tenant episode linkage succeeded';
  exception when check_violation then null;
  end;
  begin
    insert into public.cases (
      clinic_id, name, main_complaint, pain_intensity
    ) values (
      '20000000-0000-4000-8000-000000000001', 'Detached case', 'test', 2
    );
    raise exception 'FAIL: detached case succeeded after migration 006';
  exception when check_violation then null;
  end;
  begin
    update public.cases
    set episode_id = '40000000-0000-4000-8000-000000000002'
    where id = '50000000-0000-4000-8000-000000000001';
    raise exception 'FAIL: established case episode was rewritten';
  exception when insufficient_privilege or check_violation then null;
  end;
end $$;
reset role;

-- Patient sees only their own patient/ticket conversation, never clinician case.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.patients) <> 1
     or (select count(*) from public.tickets) <> 1 then
    raise exception 'FAIL: linked patient cannot read their own portal data';
  end if;
  if exists (select 1 from public.cases) then
    raise exception 'FAIL: patient read clinician intake cases';
  end if;
  if exists (select 1 from public.clinical_session_notes)
     or exists (select 1 from public.outcome_measurements_v2)
     or exists (select 1 from public.case_assessment_versions) then
    raise exception 'FAIL: patient read internal signed documentation';
  end if;
  if exists (select 1 from public.exercise_prescriptions)
     or exists (select 1 from public.prescription_items) then
    raise exception 'FAIL: patient retained a prescription after urgent safety re-screen';
  end if;
  if exists (select 1 from public.case_safety_screens)
     or exists (select 1 from public.clinical_measurements)
     or exists (select 1 from public.sessions)
     or exists (select 1 from public.clinical_alerts) then
    raise exception 'FAIL: patient read clinician-only clinical history';
  end if;
  begin
    perform therapist_note_fa from public.care_episodes limit 1;
    raise exception 'FAIL: patient read internal therapist notes';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.episode_program limit 1;
    raise exception 'FAIL: patient retained legacy program access';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.patient_daily_logs (
      episode_id, date, pain_level, completed
    ) values (
      '40000000-0000-4000-8000-000000000001', current_date + 1, 5, true
    );
    raise exception 'FAIL: patient logged progress without a current safe prescription';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.tickets (
      patient_id, episode_id, subject, message, created_by
    ) values (
      '30000000-0000-4000-8000-000000000001', null,
      'Detached ticket', 'Must require an active episode',
      '10000000-0000-4000-8000-000000000006'
    );
    raise exception 'FAIL: patient created a ticket without an active episode';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Migration 015: patient onboarding and episode lifecycle are RPC-only,
-- tenant-scoped, consent-attested, and immediately revocable.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
declare
  v_created record;
  v_link record;
begin
  select * into v_created
  from public.create_patient_episode(
    '20000000-0000-4000-8000-000000000001',
    'Lifecycle Patient', '+989121234567', 1990, 'female',
    'Lifecycle Episode', 5,
    '10000000-0000-4000-8000-000000000003'
  );
  perform set_config('physioai_ci.lifecycle_patient_id', v_created.patient_id::text, true);
  perform set_config('physioai_ci.lifecycle_episode_id', v_created.episode_id::text, true);

  begin
    insert into public.patient_therapists (patient_id, therapist_id)
    values (v_created.patient_id, '10000000-0000-4000-8000-000000000004');
    raise exception 'FAIL: owner bypassed assignment RPC with direct DML';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.care_episodes set status = 'paused'
    where id = v_created.episode_id;
    raise exception 'FAIL: owner bypassed episode lifecycle RPC with direct DML';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.archive_patient_record(v_created.patient_id, 'Active care archive test');
    raise exception 'FAIL: active patient record was archived';
  exception when check_violation then null;
  end;

  perform public.update_patient_record(
    v_created.patient_id, 'Lifecycle Patient Updated',
    '+989121234568', 1991, 'female'
  );
  perform public.set_patient_primary_therapist(
    v_created.patient_id, '10000000-0000-4000-8000-000000000004'
  );
  if not exists (
    select 1 from public.patient_therapists assignment
    where assignment.patient_id = v_created.patient_id
      and assignment.therapist_id = '10000000-0000-4000-8000-000000000004'
  ) or exists (
    select 1 from public.patient_therapists assignment
    where assignment.patient_id = v_created.patient_id
      and assignment.therapist_id = '10000000-0000-4000-8000-000000000003'
  ) then
    raise exception 'FAIL: primary therapist replacement was not atomic';
  end if;

  begin
    perform public.link_patient_account_by_email(
      v_created.patient_id, 'guardian@example.test', 'guardian',
      null, true
    );
    raise exception 'FAIL: delegate account was linked without expiry';
  exception when invalid_parameter_value then null;
  end;
  perform public.reserve_patient_invitation(
    v_created.patient_id, 'guardian@example.test'
  );
  begin
    perform public.reserve_patient_invitation(
      v_created.patient_id, 'guardian@example.test'
    );
    raise exception 'FAIL: duplicate invitation bypassed rate limit';
  exception when raise_exception then null;
  end;
  select * into v_link
  from public.link_patient_account_by_email(
    v_created.patient_id, 'guardian@example.test', 'guardian',
    clock_timestamp() + interval '30 days', true
  );
  if not v_link.account_found or v_link.link_status <> 'linked' then
    raise exception 'FAIL: consent-attested guardian account was not linked';
  end if;
end $$;
reset role;

-- A removed therapist has no lifecycle access after atomic reassignment.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.transition_care_episode(
      current_setting('physioai_ci.lifecycle_episode_id')::uuid, 'paused'
    );
    raise exception 'FAIL: removed therapist changed the care episode';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- The assigned therapist can pause/resume/complete and start the next course.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
do $$
declare
  v_new_episode uuid;
begin
  perform public.transition_care_episode(
    current_setting('physioai_ci.lifecycle_episode_id')::uuid, 'paused'
  );
  perform public.transition_care_episode(
    current_setting('physioai_ci.lifecycle_episode_id')::uuid, 'active'
  );
  perform public.transition_care_episode(
    current_setting('physioai_ci.lifecycle_episode_id')::uuid, 'completed'
  );
  begin
    perform public.transition_care_episode(
      current_setting('physioai_ci.lifecycle_episode_id')::uuid, 'active'
    );
    raise exception 'FAIL: completed episode was reopened';
  exception when check_violation then null;
  end;
  begin
    perform public.start_patient_episode(
      current_setting('physioai_ci.lifecycle_patient_id')::uuid,
      'Impossible weekly target', 8,
      '10000000-0000-4000-8000-000000000004'
    );
    raise exception 'FAIL: impossible weekly target was accepted';
  exception when invalid_parameter_value then null;
  end;
  v_new_episode := public.start_patient_episode(
    current_setting('physioai_ci.lifecycle_patient_id')::uuid,
    'Second Care Episode', 4,
    '10000000-0000-4000-8000-000000000004'
  );
  perform set_config('physioai_ci.lifecycle_episode_2_id', v_new_episode::text, true);
end $$;
reset role;

-- The delegate sees only the linked record while the grant is current.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000008","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.patients) <> 1
     or not exists (
       select 1 from public.patients patient
       where patient.id = current_setting('physioai_ci.lifecycle_patient_id')::uuid
     ) then
    raise exception 'FAIL: guardian did not receive exactly the linked patient';
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
begin
  if not public.revoke_patient_account_link(
    current_setting('physioai_ci.lifecycle_patient_id')::uuid,
    '10000000-0000-4000-8000-000000000008',
    'Consent withdrawn in CI test'
  ) then
    raise exception 'FAIL: active guardian grant was not revoked';
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000008","role":"authenticated"}', true);
do $$
begin
  if exists (
    select 1 from public.patients patient
    where patient.id = current_setting('physioai_ci.lifecycle_patient_id')::uuid
  ) then
    raise exception 'FAIL: revoked guardian retained patient access';
  end if;
end $$;
reset role;

-- Complete then archive: history remains, assignment and portal grants do not.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select public.transition_care_episode(
  current_setting('physioai_ci.lifecycle_episode_2_id')::uuid, 'completed'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
begin
  perform public.archive_patient_record(
    current_setting('physioai_ci.lifecycle_patient_id')::uuid,
    'Treatment closed in CI test'
  );
  if not exists (
    select 1 from public.patients patient
    where patient.id = current_setting('physioai_ci.lifecycle_patient_id')::uuid
      and patient.archived_at is not null
  ) or exists (
    select 1 from public.patient_therapists assignment
    where assignment.patient_id = current_setting('physioai_ci.lifecycle_patient_id')::uuid
  ) then
    raise exception 'FAIL: archive did not retain/close the patient correctly';
  end if;
end $$;
reset role;

do $$
begin
  if (
    select count(*) from public.patient_access_events event
    where event.patient_id = current_setting('physioai_ci.lifecycle_patient_id')::uuid
      and event.event_type = 'authorized'
  ) <> 1 or (
    select count(*) from public.patient_access_events event
    where event.patient_id = current_setting('physioai_ci.lifecycle_patient_id')::uuid
      and event.event_type = 'revoked'
  ) <> 1 then
    raise exception 'FAIL: patient portal authorization history is incomplete';
  end if;
end $$;

-- Migration 019: urgent alerts enter a metadata-minimized durable outbox.
-- Only the service worker can lease/complete deliveries; delivery failures
-- are retained for retry and eventually move to dead-letter.
insert into public.clinical_alerts (
  clinic_id, patient_id, episode_id, case_id, alert_type, severity,
  source_table, source_id, source_recorded_at, reported_by
) values (
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  'ticket-emergency', 'emergency', 'tickets',
  '60000000-0000-4000-8000-000000000001', clock_timestamp(),
  '10000000-0000-4000-8000-000000000006'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.claim_notification_batch(1);
    raise exception 'FAIL: authenticated clinician claimed notification work';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.get_notification_delivery_health();
    raise exception 'FAIL: authenticated clinician read delivery health';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  v_success record;
  v_retry record;
  v_lease record;
  v_health record;
  v_result text;
begin
  select * into v_health from public.get_notification_delivery_health();
  if v_health.pending_count < 3
     or v_health.processing_count <> 0
     or v_health.dead_letter_count <> 0 then
    raise exception 'FAIL: aggregate notification health is invalid';
  end if;
  select * into v_success from public.claim_notification_batch(1);
  if v_success.notification_id is null
     or jsonb_typeof(v_success.payload) <> 'object'
     or (select count(*) from jsonb_object_keys(v_success.payload)) <> 8
     or not v_success.payload ?& array[
       'schemaVersion', 'event', 'alertId', 'clinicId', 'patientId',
       'severity', 'alertType', 'createdAt'
     ]
     or v_success.payload ?| array[
       'name', 'fullName', 'message', 'content', 'subject', 'notes',
       'phone', 'email', 'nationalId'
     ] then
    raise exception 'FAIL: notification payload was absent or contained unbounded PHI';
  end if;
  v_result := public.complete_notification_delivery(
    v_success.notification_id, true, null, 204, 25, 60
  );
  if v_result <> 'delivered' then
    raise exception 'FAIL: successful notification was not marked delivered';
  end if;
  perform set_config(
    'physioai_ci.notification_success_id',
    v_success.notification_id::text,
    true
  );

  select * into v_retry from public.claim_notification_batch(1);
  if v_retry.notification_id is null then
    raise exception 'FAIL: notification retry fixture was not queued';
  end if;
  v_result := public.complete_notification_delivery(
    v_retry.notification_id, false, 'webhook_http_error', 503, 40, 30
  );
  if v_result <> 'pending' then
    raise exception 'FAIL: first notification failure was not retained for retry';
  end if;
  perform set_config(
    'physioai_ci.notification_retry_id',
    v_retry.notification_id::text,
    true
  );

  -- Leave one leased row incomplete to exercise crash recovery.
  select * into v_lease from public.claim_notification_batch(1);
  if v_lease.notification_id is null then
    raise exception 'FAIL: notification lease-expiry fixture was not queued';
  end if;
  perform set_config(
    'physioai_ci.notification_lease_id',
    v_lease.notification_id::text,
    true
  );

  begin
    perform 1 from public.notification_outbox limit 1;
    raise exception 'FAIL: service role directly read the notification outbox';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$
begin
  if not exists (
       select 1 from public.notification_outbox notification
       where notification.id = current_setting(
         'physioai_ci.notification_success_id'
       )::uuid
         and notification.status = 'delivered'
         and notification.delivered_at is not null
         and notification.attempts = 0
     )
     or not exists (
       select 1 from public.notification_delivery_attempts attempt
       where attempt.notification_id = current_setting(
         'physioai_ci.notification_success_id'
       )::uuid
         and attempt.success
         and attempt.response_status = 204
     ) then
    raise exception 'FAIL: successful notification delivery audit is incomplete';
  end if;
  if not exists (
       select 1 from public.notification_outbox notification
       where notification.id = current_setting(
         'physioai_ci.notification_retry_id'
       )::uuid
         and notification.status = 'pending'
         and notification.attempts = 1
         and notification.next_attempt_at > clock_timestamp()
         and notification.last_error_code = 'webhook_http_error'
     ) then
    raise exception 'FAIL: failed notification did not retain bounded retry state';
  end if;

  update public.notification_outbox notification
  set locked_at = clock_timestamp() - interval '11 minutes'
  where notification.id = current_setting(
    'physioai_ci.notification_lease_id'
  )::uuid;
end $$;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.claim_notification_batch(1);
reset role;

do $$
begin
  if not exists (
       select 1 from public.notification_outbox notification
       where notification.id = current_setting(
         'physioai_ci.notification_lease_id'
       )::uuid
         and notification.status = 'pending'
         and notification.attempts = 1
         and notification.last_error_code = 'worker_lease_expired'
     )
     or not exists (
       select 1 from public.notification_delivery_attempts attempt
       where attempt.notification_id = current_setting(
         'physioai_ci.notification_lease_id'
       )::uuid
         and not attempt.success
         and attempt.error_code = 'worker_lease_expired'
     ) then
    raise exception 'FAIL: expired notification lease was not audited for retry';
  end if;

  -- Move the fixture to its final permitted attempt without waiting in CI.
  update public.notification_outbox notification
  set attempts = 7, next_attempt_at = clock_timestamp() - interval '1 second'
  where notification.id = current_setting(
    'physioai_ci.notification_retry_id'
  )::uuid;
  update public.notification_outbox notification
  set next_attempt_at = clock_timestamp() + interval '1 day'
  where notification.status = 'pending'
    and notification.id <> current_setting(
      'physioai_ci.notification_retry_id'
    )::uuid;
end $$;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  v_claim record;
  v_health record;
  v_result text;
begin
  select * into v_claim from public.claim_notification_batch(1);
  if v_claim.notification_id <> current_setting(
       'physioai_ci.notification_retry_id'
     )::uuid
     or v_claim.attempt_number <> 8 then
    raise exception 'FAIL: final notification retry was not leased correctly';
  end if;
  v_result := public.complete_notification_delivery(
    v_claim.notification_id, false, 'webhook_timeout', null, 10000, 30
  );
  if v_result <> 'dead-letter' then
    raise exception 'FAIL: exhausted notification did not enter dead-letter';
  end if;
  select * into v_health from public.get_notification_delivery_health();
  if v_health.dead_letter_count < 1 then
    raise exception 'FAIL: delivery health omitted dead-letter work';
  end if;
end $$;
reset role;

do $$
begin
  if not exists (
       select 1 from public.notification_outbox notification
       where notification.id = current_setting(
         'physioai_ci.notification_retry_id'
       )::uuid
         and notification.status = 'dead-letter'
         and notification.attempts = 8
         and notification.last_error_code = 'webhook_timeout'
     )
     or (
       select count(*) from public.notification_delivery_attempts attempt
       where attempt.notification_id = current_setting(
         'physioai_ci.notification_retry_id'
       )::uuid
     ) <> 2 then
    raise exception 'FAIL: dead-letter state or delivery-attempt audit is incomplete';
  end if;
end $$;

do $$
begin
  if has_table_privilege(
       'authenticated', 'public.cases', 'UPDATE,DELETE,TRUNCATE'
     )
     or has_table_privilege(
       'authenticated', 'public.case_assessment_versions', 'INSERT,UPDATE,DELETE,TRUNCATE'
     )
     or has_table_privilege(
       'service_role', 'public.treatment_plans', 'INSERT,UPDATE,DELETE,TRUNCATE'
     )
     or has_table_privilege(
       'service_role', 'public.exercise_prescriptions', 'INSERT,UPDATE,DELETE,TRUNCATE'
     )
     or has_table_privilege(
       'service_role', 'public.prescription_items', 'INSERT,UPDATE,DELETE,TRUNCATE'
     )
     or has_table_privilege(
       'service_role', 'public.clinical_alerts', 'INSERT,UPDATE,DELETE,TRUNCATE'
     )
     or has_table_privilege(
       'service_role', 'public.tickets', 'INSERT,UPDATE,DELETE,TRUNCATE'
     )
     or has_table_privilege(
       'service_role', 'public.ticket_replies', 'INSERT,UPDATE,DELETE,TRUNCATE'
     )
     or has_table_privilege(
       'service_role', 'public.clinical_session_notes', 'INSERT,UPDATE,DELETE,TRUNCATE'
     )
     or has_table_privilege(
       'service_role', 'public.outcome_measurements_v2', 'INSERT,UPDATE,DELETE,TRUNCATE'
     )
     or has_table_privilege(
       'service_role', 'public.sessions', 'INSERT,UPDATE,DELETE,TRUNCATE'
     )
     or has_table_privilege(
       'service_role', 'public.clinical_measurements', 'INSERT,UPDATE,DELETE,TRUNCATE'
     )
     or has_table_privilege(
       'service_role', 'public.notification_outbox', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'
     )
     or has_table_privilege(
       'service_role', 'public.notification_delivery_attempts', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'
     )
     or has_table_privilege(
       'service_role', 'public.case_assessment_versions', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'
     )
     or has_table_privilege(
       'service_role', 'public.cases', 'UPDATE,DELETE,TRUNCATE'
     ) then
    raise exception 'FAIL: service_role retained direct clinical workflow mutation';
  end if;
end $$;

rollback;

select 'PASS: automated security and tenant regression suite' as result;
