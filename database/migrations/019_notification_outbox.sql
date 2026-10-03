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
