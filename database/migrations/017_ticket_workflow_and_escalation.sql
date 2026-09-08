-- Attributed ticket acknowledgement/closure, patient thread replies, and
-- operational escalation for server-triaged urgent patient messages.
-- Run after 016_exercise_catalog_and_date_validation.sql.

begin;

alter table public.tickets
  add column if not exists priority text not null default 'routine',
  add column if not exists acknowledged_by uuid
    references public.profiles (id) on delete restrict,
  add column if not exists acknowledged_at timestamptz,
  add column if not exists closed_by uuid
    references public.profiles (id) on delete restrict,
  add column if not exists closed_at timestamptz,
  add column if not exists closure_note text,
  add column if not exists last_patient_activity_at timestamptz,
  add column if not exists last_clinician_activity_at timestamptz;

alter table public.ticket_replies
  add column if not exists triage_priority text not null default 'routine';

update public.tickets ticket
set last_patient_activity_at = greatest(
      ticket.created_at,
      coalesce((
        select max(reply.created_at)
        from public.ticket_replies reply
        where reply.ticket_id = ticket.id and reply.sender = 'patient'
      ), ticket.created_at)
    ),
    last_clinician_activity_at = case
      when ticket.status = 'answered' then
        coalesce((
          select max(reply.created_at)
          from public.ticket_replies reply
          where reply.ticket_id = ticket.id and reply.sender = 'therapist'
        ), ticket.created_at)
      else (
        select max(reply.created_at)
        from public.ticket_replies reply
        where reply.ticket_id = ticket.id and reply.sender = 'therapist'
      )
    end
where ticket.last_patient_activity_at is null
   or (ticket.status = 'answered' and ticket.last_clinician_activity_at is null);

alter table public.tickets
  alter column last_patient_activity_at set default clock_timestamp(),
  alter column last_patient_activity_at set not null;

do $$
declare
  item record;
begin
  for item in
    select constraint_row.conname
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.tickets'::regclass
      and constraint_row.contype = 'c'
      and (
        pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%status%open%answered%'
        or constraint_row.conname in (
          'tickets_status_v2_check',
          'tickets_priority_v2_check',
          'tickets_workflow_state_v2_check'
        )
      )
  loop
    execute format(
      'alter table public.tickets drop constraint %I', item.conname
    );
  end loop;
end $$;

alter table public.tickets
  add constraint tickets_status_v2_check
    check (status in ('open', 'acknowledged', 'answered', 'closed')) not valid,
  add constraint tickets_priority_v2_check
    check (priority in ('routine', 'urgent', 'emergency')) not valid,
  add constraint tickets_workflow_state_v2_check check (
    char_length(coalesce(closure_note, '')) <= 2000
    and (
      (acknowledged_by is null and acknowledged_at is null)
      or (acknowledged_by is not null and acknowledged_at is not null)
    )
    and (
      (closed_by is null and closed_at is null and closure_note is null)
      or (
        closed_by is not null and closed_at is not null
        and char_length(btrim(closure_note)) between 3 and 2000
      )
    )
    and (
      (status = 'open'
        and acknowledged_by is null and acknowledged_at is null
        and closed_by is null and closed_at is null and closure_note is null)
      or
      (status = 'acknowledged'
        and acknowledged_by is not null and acknowledged_at is not null
        and closed_by is null and closed_at is null and closure_note is null)
      or
      (status = 'answered'
        and last_clinician_activity_at is not null
        and closed_by is null and closed_at is null and closure_note is null)
      or
      (status = 'closed'
        and closed_by is not null and closed_at is not null
        and char_length(btrim(closure_note)) between 3 and 2000)
    )
  ) not valid;

alter table public.ticket_replies
  drop constraint if exists ticket_replies_triage_priority_check;
alter table public.ticket_replies
  add constraint ticket_replies_triage_priority_check
    check (triage_priority in ('routine', 'urgent', 'emergency')) not valid;

alter table public.tickets validate constraint tickets_status_v2_check;
alter table public.tickets validate constraint tickets_priority_v2_check;
alter table public.tickets validate constraint tickets_workflow_state_v2_check;
alter table public.ticket_replies
  validate constraint ticket_replies_triage_priority_check;

create index if not exists tickets_work_queue_idx
  on public.tickets (status, priority, last_patient_activity_at desc, id);
create index if not exists tickets_creator_rate_limit_idx
  on public.tickets (created_by, created_at desc);

-- Extend the metadata-only alert queue. Patient free text remains in the
-- protected ticket tables and is never copied into clinical_alerts.
alter table public.clinical_alerts
  drop constraint if exists clinical_alerts_alert_type_check,
  drop constraint if exists clinical_alerts_source_table_check,
  drop constraint if exists clinical_alerts_alert_type_v2_check,
  drop constraint if exists clinical_alerts_source_table_v2_check;
alter table public.clinical_alerts
  add constraint clinical_alerts_alert_type_v2_check
    check (alert_type in ('high-pain', 'ticket-urgent', 'ticket-emergency'))
    not valid,
  add constraint clinical_alerts_source_table_v2_check
    check (source_table in ('patient_daily_logs', 'tickets', 'ticket_replies'))
    not valid;
alter table public.clinical_alerts
  validate constraint clinical_alerts_alert_type_v2_check;
alter table public.clinical_alerts
  validate constraint clinical_alerts_source_table_v2_check;

create or replace function private.ticket_priority_rank(p_priority text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_priority
    when 'routine' then 0
    when 'urgent' then 1
    when 'emergency' then 2
    else -1
  end;
$$;

revoke all on function private.ticket_priority_rank(text)
  from public, anon, authenticated, service_role;

-- Convert server-triaged ticket activity into an idempotent alert and pause
-- the currently actionable exercise prescription until clinician review.
create or replace function private.create_ticket_clinical_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.tickets%rowtype;
  v_priority text;
  v_source_table text;
  v_source_id uuid;
  v_source_time timestamptz;
  v_reported_by uuid;
  v_clinic_id uuid;
  v_case_id uuid;
  v_prescription public.exercise_prescriptions%rowtype;
  v_alert_id uuid;
begin
  if tg_table_name = 'tickets' then
    v_ticket := new;
    v_priority := new.priority;
    v_source_table := 'tickets';
    v_source_id := new.id;
    v_source_time := new.created_at;
    v_reported_by := new.created_by;
  else
    if new.sender <> 'patient' then
      return new;
    end if;
    select ticket.* into v_ticket
    from public.tickets ticket
    where ticket.id = new.ticket_id
    for update;
    if not found then
      raise exception using errcode = '23503', message = 'Ticket is unavailable';
    end if;
    v_priority := new.triage_priority;
    v_source_table := 'ticket_replies';
    v_source_id := new.id;
    v_source_time := new.created_at;
    v_reported_by := new.sender_user_id;
  end if;

  if v_priority not in ('urgent', 'emergency') then
    return new;
  end if;

  select patient.clinic_id into v_clinic_id
  from public.patients patient
  where patient.id = v_ticket.patient_id;
  if not found or v_ticket.episode_id is null then
    raise exception using errcode = '23503', message = 'Ticket patient context is unavailable';
  end if;

  select prescription.* into v_prescription
  from public.exercise_prescriptions prescription
  where prescription.episode_id = v_ticket.episode_id
    and prescription.status in ('published', 'suspended')
  order by
    case prescription.status when 'published' then 0 else 1 end,
    prescription.published_at desc
  limit 1
  for update;

  if found then
    v_case_id := v_prescription.case_id;
  else
    select patient_case.id into v_case_id
    from public.cases patient_case
    where patient_case.episode_id = v_ticket.episode_id
    order by patient_case.created_at desc, patient_case.id desc
    limit 1;
  end if;

  insert into public.clinical_alerts (
    clinic_id, patient_id, episode_id, case_id, prescription_id,
    alert_type, severity, source_table, source_id, source_recorded_at,
    reported_by
  ) values (
    v_clinic_id, v_ticket.patient_id, v_ticket.episode_id, v_case_id,
    case when v_prescription.id is null then null else v_prescription.id end,
    case v_priority
      when 'emergency' then 'ticket-emergency'
      else 'ticket-urgent'
    end,
    v_priority, v_source_table, v_source_id, v_source_time, v_reported_by
  )
  on conflict (alert_type, source_table, source_id) do nothing
  returning id into v_alert_id;

  if v_alert_id is not null and v_prescription.status = 'published' then
    update public.exercise_prescriptions prescription
    set status = 'suspended',
        suspended_by = coalesce(v_reported_by, v_prescription.published_by),
        suspended_at = clock_timestamp(),
        suspension_alert_id = v_alert_id
    where prescription.id = v_prescription.id
      and prescription.status = 'published';
  end if;
  return new;
end;
$$;

revoke all on function private.create_ticket_clinical_alert()
  from public, anon, authenticated, service_role;
drop trigger if exists tickets_create_clinical_alert on public.tickets;
create trigger tickets_create_clinical_alert
after insert on public.tickets
for each row execute function private.create_ticket_clinical_alert();
drop trigger if exists ticket_replies_create_clinical_alert
  on public.ticket_replies;
create trigger ticket_replies_create_clinical_alert
after insert on public.ticket_replies
for each row execute function private.create_ticket_clinical_alert();

-- Patient ticket creation is server-authenticated and rate-limited. Priority
-- is supplied by the same-origin API after multilingual safety detection.
create or replace function public.create_patient_ticket(
  p_patient_id uuid,
  p_episode_id uuid,
  p_subject text,
  p_message text,
  p_exercise_id text default null,
  p_priority text default 'routine'
)
returns table (
  ticket_id uuid,
  created_at timestamptz,
  status text,
  priority text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_ticket public.tickets%rowtype;
  v_subject text := btrim(coalesce(p_subject, ''));
  v_message text := btrim(coalesce(p_message, ''));
  v_exercise text := nullif(btrim(coalesce(p_exercise_id, '')), '');
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Patient authentication is required';
  end if;
  if char_length(v_subject) not between 1 and 200
     or char_length(v_message) not between 1 and 10000
     or p_priority not in ('routine', 'urgent', 'emergency')
     or (v_exercise is not null and v_exercise !~ '^[a-z0-9][a-z0-9_-]{1,99}$') then
    raise exception using errcode = '22023', message = 'Ticket content is invalid';
  end if;
  if not private.is_linked_patient(p_patient_id)
     or not private.is_active_episode_for_patient(p_episode_id, p_patient_id) then
    raise exception using errcode = '42501', message = 'Active patient access is required';
  end if;
  if v_exercise is not null and not exists (
    select 1
    from public.exercise_prescriptions prescription
    join public.prescription_items item
      on item.prescription_id = prescription.id
    where prescription.patient_id = p_patient_id
      and prescription.episode_id = p_episode_id
      and prescription.status = 'published'
      and prescription.start_date <= current_date
      and (prescription.end_date is null or prescription.end_date >= current_date)
      and item.exercise_id = v_exercise
  ) then
    raise exception using errcode = '22023', message = 'Exercise is not in the current prescription';
  end if;
  if (
    select count(*)
    from public.tickets recent
    where recent.created_by = v_actor
      and recent.created_at >= clock_timestamp() - interval '1 hour'
  ) >= 10 then
    raise exception using errcode = '54000', message = 'Ticket rate limit exceeded';
  end if;

  insert into public.tickets (
    patient_id, episode_id, exercise_id, subject, message, status, priority,
    created_by, last_patient_activity_at
  ) values (
    p_patient_id, p_episode_id, v_exercise, v_subject, v_message, 'open',
    p_priority, v_actor, clock_timestamp()
  ) returning * into v_ticket;

  return query select
    v_ticket.id, v_ticket.created_at, v_ticket.status, v_ticket.priority;
end;
$$;

create or replace function public.reply_to_patient_ticket(
  p_ticket_id uuid,
  p_content text,
  p_priority text default 'routine'
)
returns table (
  reply_id uuid,
  ticket_id uuid,
  sender text,
  sender_user_id uuid,
  content text,
  created_at timestamptz,
  ticket_status text,
  ticket_priority text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_ticket public.tickets%rowtype;
  v_reply public.ticket_replies%rowtype;
  v_content text := btrim(coalesce(p_content, ''));
  v_priority text;
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Patient authentication is required';
  end if;
  if char_length(v_content) not between 1 and 10000
     or p_priority not in ('routine', 'urgent', 'emergency') then
    raise exception using errcode = '22023', message = 'Reply content is invalid';
  end if;
  select ticket.* into v_ticket
  from public.tickets ticket
  where ticket.id = p_ticket_id
  for update;
  if not found
     or not private.is_linked_patient(v_ticket.patient_id)
     or v_ticket.episode_id is null
     or not private.is_active_episode_for_patient(
       v_ticket.episode_id, v_ticket.patient_id
     ) then
    raise exception using errcode = '42501', message = 'Active ticket access is required';
  end if;
  if v_ticket.status = 'closed' then
    raise exception using errcode = '23514', message = 'Closed ticket cannot be reopened by reply';
  end if;

  v_priority := case
    when private.ticket_priority_rank(p_priority)
         > private.ticket_priority_rank(v_ticket.priority) then p_priority
    else v_ticket.priority
  end;
  insert into public.ticket_replies (
    ticket_id, sender, sender_user_id, content, triage_priority
  ) values (
    v_ticket.id, 'patient', v_actor, v_content, p_priority
  ) returning * into v_reply;

  update public.tickets ticket
  set status = 'open',
      priority = v_priority,
      acknowledged_by = null,
      acknowledged_at = null,
      last_patient_activity_at = v_reply.created_at
  where ticket.id = v_ticket.id;

  return query select
    v_reply.id, v_reply.ticket_id, v_reply.sender, v_reply.sender_user_id,
    v_reply.content, v_reply.created_at, 'open'::text, v_priority;
end;
$$;

create or replace function public.acknowledge_ticket(p_ticket_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_ticket public.tickets%rowtype;
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Clinician authentication is required';
  end if;
  select ticket.* into v_ticket
  from public.tickets ticket
  where ticket.id = p_ticket_id
  for update;
  if not found or not private.can_manage_clinical_record(v_ticket.patient_id) then
    raise exception using errcode = '42501', message = 'Ticket access is not permitted';
  end if;
  if v_ticket.status = 'closed' then
    raise exception using errcode = '23514', message = 'Closed ticket cannot be acknowledged';
  end if;
  if v_ticket.status = 'open' then
    update public.tickets ticket
    set status = 'acknowledged',
        acknowledged_by = v_actor,
        acknowledged_at = clock_timestamp()
    where ticket.id = v_ticket.id;
  end if;
  return true;
end;
$$;

-- Clinician replies remain atomic with workflow state and actor attribution.
create or replace function public.reply_to_ticket(
  p_ticket_id uuid,
  p_content text
)
returns table (
  reply_id uuid,
  ticket_id uuid,
  sender text,
  sender_user_id uuid,
  content text,
  created_at timestamptz,
  ticket_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_ticket public.tickets%rowtype;
  v_reply public.ticket_replies%rowtype;
  v_content text := btrim(coalesce(p_content, ''));
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Clinician authentication is required';
  end if;
  if char_length(v_content) not between 1 and 10000 then
    raise exception using errcode = '22023', message = 'Reply content is invalid';
  end if;
  select ticket.* into v_ticket
  from public.tickets ticket
  where ticket.id = p_ticket_id
  for update;
  if not found or not private.can_manage_clinical_record(v_ticket.patient_id) then
    raise exception using errcode = '42501', message = 'Ticket access is not permitted';
  end if;
  if v_ticket.status = 'closed' then
    raise exception using errcode = '23514', message = 'Closed ticket cannot receive replies';
  end if;

  insert into public.ticket_replies (
    ticket_id, sender, sender_user_id, content, triage_priority
  ) values (
    v_ticket.id, 'therapist', v_actor, v_content, 'routine'
  ) returning * into v_reply;

  update public.tickets ticket
  set status = 'answered',
      acknowledged_by = coalesce(ticket.acknowledged_by, v_actor),
      acknowledged_at = coalesce(ticket.acknowledged_at, v_reply.created_at),
      last_clinician_activity_at = v_reply.created_at
  where ticket.id = v_ticket.id;

  return query select
    v_reply.id, v_reply.ticket_id, v_reply.sender, v_reply.sender_user_id,
    v_reply.content, v_reply.created_at, 'answered'::text;
end;
$$;

create or replace function public.close_ticket(
  p_ticket_id uuid,
  p_closure_note text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_ticket public.tickets%rowtype;
  v_note text := btrim(coalesce(p_closure_note, ''));
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Clinician authentication is required';
  end if;
  if char_length(v_note) not between 3 and 2000 then
    raise exception using errcode = '22023', message = 'Closure note is required';
  end if;
  select ticket.* into v_ticket
  from public.tickets ticket
  where ticket.id = p_ticket_id
  for update;
  if not found or not private.can_manage_clinical_record(v_ticket.patient_id) then
    raise exception using errcode = '42501', message = 'Ticket access is not permitted';
  end if;
  if v_ticket.status = 'closed' then
    return true;
  end if;
  if v_ticket.status <> 'answered' then
    raise exception using errcode = '23514', message = 'Reply before closing the ticket';
  end if;
  if exists (
    select 1
    from public.clinical_alerts alert
    where alert.status in ('open', 'acknowledged')
      and (
        (alert.source_table = 'tickets' and alert.source_id = v_ticket.id)
        or (
          alert.source_table = 'ticket_replies'
          and exists (
            select 1 from public.ticket_replies reply
            where reply.ticket_id = v_ticket.id and reply.id = alert.source_id
          )
        )
      )
  ) then
    raise exception using errcode = '23514', message = 'Resolve ticket clinical alerts before closure';
  end if;

  update public.tickets ticket
  set status = 'closed',
      closed_by = v_actor,
      closed_at = clock_timestamp(),
      closure_note = v_note
  where ticket.id = v_ticket.id;
  return true;
end;
$$;

-- The service role can add only an idempotent automated acknowledgement via
-- this narrow function; it no longer has direct ticket-reply mutation.
create or replace function public.attach_ticket_auto_ack(
  p_ticket_id uuid,
  p_expected_creator uuid,
  p_content text
)
returns table (
  reply_id uuid,
  content text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reply public.ticket_replies%rowtype;
  v_content text := btrim(coalesce(p_content, ''));
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service authentication is required';
  end if;
  if char_length(v_content) not between 1 and 10000 then
    raise exception using errcode = '22023', message = 'Acknowledgement content is invalid';
  end if;
  perform 1 from public.tickets ticket
  where ticket.id = p_ticket_id and ticket.created_by = p_expected_creator
  for key share;
  if not found then
    raise exception using errcode = '42501', message = 'Ticket creator mismatch';
  end if;

  select reply.* into v_reply
  from public.ticket_replies reply
  where reply.ticket_id = p_ticket_id and reply.sender = 'ai';
  if not found then
    begin
      insert into public.ticket_replies (
        ticket_id, sender, sender_user_id, content, triage_priority
      ) values (
        p_ticket_id, 'ai', null, v_content, 'routine'
      ) returning * into v_reply;
    exception when unique_violation then
      select reply.* into v_reply
      from public.ticket_replies reply
      where reply.ticket_id = p_ticket_id and reply.sender = 'ai';
    end;
  end if;
  return query select v_reply.id, v_reply.content, v_reply.created_at;
end;
$$;

drop policy if exists "tickets insert" on public.tickets;
drop policy if exists "replies insert" on public.ticket_replies;
revoke insert, update, delete, truncate on table public.tickets
  from authenticated, service_role;
revoke insert, update, delete, truncate on table public.ticket_replies
  from authenticated, service_role;

revoke all on function public.create_patient_ticket(
  uuid, uuid, text, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.reply_to_patient_ticket(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.acknowledge_ticket(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.reply_to_ticket(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.close_ticket(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.attach_ticket_auto_ack(uuid, uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function public.create_patient_ticket(
  uuid, uuid, text, text, text, text
) to authenticated;
grant execute on function public.reply_to_patient_ticket(uuid, text, text)
  to authenticated;
grant execute on function public.acknowledge_ticket(uuid) to authenticated;
grant execute on function public.reply_to_ticket(uuid, text) to authenticated;
grant execute on function public.close_ticket(uuid, text) to authenticated;
grant execute on function public.attach_ticket_auto_ack(uuid, uuid, text)
  to service_role;

comment on function public.create_patient_ticket(
  uuid, uuid, text, text, text, text
) is
  'Creates a rate-limited active-episode patient ticket with server-classified priority.';
comment on function public.reply_to_patient_ticket(uuid, text, text) is
  'Adds an attributed patient reply, reopens the ticket, and preserves the highest triage priority.';
comment on function public.close_ticket(uuid, text) is
  'Closes an answered ticket only after every related clinical alert is resolved.';

commit;
