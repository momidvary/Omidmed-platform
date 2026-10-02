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
