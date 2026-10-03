-- Patient account onboarding, clinician assignment, and episode lifecycle.
-- Run after 014_clinical_alerts.sql.

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- --------------------------------------------------------------------------
-- 1) Retained patient records and time-bounded portal access grants
-- --------------------------------------------------------------------------

alter table public.patients
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid
    references public.profiles (id) on delete restrict,
  add column if not exists archive_reason text;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.patients'::regclass
      and conname = 'patients_archive_state_check'
  ) then
    alter table public.patients
      add constraint patients_archive_state_check check (
        (
          archived_at is null and archived_by is null and archive_reason is null
        )
        or
        (
          archived_at is not null and archived_by is not null
          and char_length(btrim(archive_reason)) between 3 and 1000
        )
      ) not valid;
  end if;
end $$;

alter table public.patient_users
  add column if not exists relationship text not null default 'self',
  add column if not exists authorized_at timestamptz not null default clock_timestamp(),
  add column if not exists authorized_by uuid
    references public.profiles (id) on delete restrict,
  add column if not exists expires_at timestamptz,
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid
    references public.profiles (id) on delete restrict,
  add column if not exists revocation_reason text;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.patient_users'::regclass
      and conname = 'patient_users_grant_state_check'
  ) then
    alter table public.patient_users
      add constraint patient_users_grant_state_check check (
        relationship in ('self', 'parent', 'guardian', 'caregiver')
        and (relationship = 'self' or expires_at is not null)
        and (expires_at is null or expires_at > authorized_at)
        and (
          (revoked_at is null and revoked_by is null and revocation_reason is null)
          or
          (
            revoked_at is not null and revoked_by is not null
            and revoked_at >= authorized_at
            and char_length(btrim(revocation_reason)) between 3 and 1000
          )
        )
      ) not valid;
  end if;
end $$;

create index if not exists patient_users_active_user_idx
  on public.patient_users (user_id, patient_id)
  where revoked_at is null;

create table if not exists public.patient_access_events (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete restrict,
  event_type text not null check (event_type in ('authorized', 'revoked')),
  relationship text not null
    check (relationship in ('self', 'parent', 'guardian', 'caregiver')),
  actor_id uuid not null references public.profiles (id) on delete restrict,
  expires_at timestamptz,
  reason text,
  created_at timestamptz not null default clock_timestamp(),
  check (reason is null or char_length(btrim(reason)) between 3 and 1000)
);

create index if not exists patient_access_events_patient_time_idx
  on public.patient_access_events (patient_id, created_at desc);

create table if not exists public.patient_invitation_attempts (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  requested_by uuid not null references public.profiles (id) on delete restrict,
  email_hash text not null check (char_length(email_hash) = 64),
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists patient_invitation_attempts_actor_time_idx
  on public.patient_invitation_attempts (requested_by, created_at desc);
create index if not exists patient_invitation_attempts_patient_time_idx
  on public.patient_invitation_attempts (patient_id, created_at desc);

alter table public.patient_access_events enable row level security;
alter table public.patient_invitation_attempts enable row level security;
revoke all on table public.patient_access_events
  from public, anon, authenticated, service_role;
revoke all on table public.patient_invitation_attempts
  from public, anon, authenticated, service_role;

create or replace function private.reject_patient_access_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'Patient access events are append-only';
end;
$$;

revoke all on function private.reject_patient_access_event_mutation()
  from public, anon, authenticated, service_role;
drop trigger if exists patient_access_events_immutable
  on public.patient_access_events;
create trigger patient_access_events_immutable
before update or delete or truncate on public.patient_access_events
for each statement execute function private.reject_patient_access_event_mutation();

-- An account link stops granting PHI access immediately when it is revoked,
-- expired, belongs to a non-patient profile, or the account joins clinic staff.
create or replace function private.is_linked_patient(p_patient uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.patient_users access_grant
    join public.profiles profile on profile.id = access_grant.user_id
    where access_grant.patient_id = p_patient
      and access_grant.user_id = auth.uid()
      and access_grant.revoked_at is null
      and (
        access_grant.expires_at is null
        or access_grant.expires_at > clock_timestamp()
      )
      and profile.role = 'patient'
      and not exists (
        select 1 from public.clinic_members membership
        where membership.user_id = access_grant.user_id
      )
  );
$$;

revoke all on function private.is_linked_patient(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.is_linked_patient(uuid) to authenticated;

drop policy if exists "patient_users read" on public.patient_users;
drop policy if exists "patient_users manage" on public.patient_users;
drop policy if exists "patient portal grant scoped read" on public.patient_users;
create policy "patient portal grant scoped read"
  on public.patient_users for select to authenticated
  using (
    private.is_owner_of(private.patient_clinic(patient_id))
    or private.is_assigned_therapist(patient_id)
    or (
      user_id = auth.uid()
      and revoked_at is null
      and (expires_at is null or expires_at > clock_timestamp())
    )
  );

revoke all on table public.patient_users
  from public, anon, authenticated, service_role;
grant select (
  patient_id, user_id, relationship, authorized_at, expires_at, revoked_at
) on table public.patient_users to authenticated;

-- --------------------------------------------------------------------------
-- 2) Portal-link workflows. Email lookup never runs in the browser and the
--    API receives only a bounded status, not another user's identity record.
-- --------------------------------------------------------------------------

create or replace function public.reserve_patient_invitation(
  p_patient_id uuid,
  p_email text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_patient public.patients%rowtype;
  v_email text := lower(btrim(p_email));
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Clinic-owner authentication is required';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
     or char_length(v_email) > 254 then
    raise exception using errcode = '22023', message = 'A valid email address is required';
  end if;

  select patient.* into v_patient
  from public.patients patient
  where patient.id = p_patient_id
  for update;
  if not found or v_patient.archived_at is not null
     or not private.is_owner_of(v_patient.clinic_id) then
    raise exception using errcode = '42501', message = 'Patient access is not permitted';
  end if;

  if (
    select count(*) from public.patient_invitation_attempts attempt
    where attempt.requested_by = v_actor
      and attempt.created_at > clock_timestamp() - interval '1 hour'
  ) >= 10 then
    raise exception using errcode = 'P0001', message = 'Invitation rate limit reached';
  end if;
  if exists (
    select 1 from public.patient_invitation_attempts attempt
    where attempt.patient_id = p_patient_id
      and attempt.email_hash = encode(extensions.digest(v_email, 'sha256'), 'hex')
      and attempt.created_at > clock_timestamp() - interval '10 minutes'
  ) then
    raise exception using errcode = 'P0001', message = 'Please wait before inviting this address again';
  end if;

  insert into public.patient_invitation_attempts (
    clinic_id, patient_id, requested_by, email_hash
  ) values (
    v_patient.clinic_id, p_patient_id, v_actor,
    encode(extensions.digest(v_email, 'sha256'), 'hex')
  );
  return true;
end;
$$;

create or replace function public.link_patient_account_by_email(
  p_patient_id uuid,
  p_email text,
  p_relationship text,
  p_expires_at timestamptz default null,
  p_authority_attested boolean default false
)
returns table (account_found boolean, link_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_patient public.patients%rowtype;
  v_email text := lower(btrim(p_email));
  v_relationship text := lower(btrim(p_relationship));
  v_user_id uuid;
  v_changed boolean := false;
  v_row_count integer := 0;
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Clinic-owner authentication is required';
  end if;
  if not coalesce(p_authority_attested, false) then
    raise exception using errcode = '22023', message = 'Patient consent or legal authority must be attested';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
     or char_length(v_email) > 254 then
    raise exception using errcode = '22023', message = 'A valid email address is required';
  end if;
  if v_relationship not in ('self', 'parent', 'guardian', 'caregiver') then
    raise exception using errcode = '22023', message = 'Relationship is not supported';
  end if;
  if p_expires_at is not null and p_expires_at <= clock_timestamp() then
    raise exception using errcode = '22023', message = 'Access expiry must be in the future';
  end if;
  if v_relationship <> 'self' and (
    p_expires_at is null or p_expires_at > clock_timestamp() + interval '366 days'
  ) then
    raise exception using errcode = '22023', message = 'Delegate access must expire within 366 days';
  end if;

  select patient.* into v_patient
  from public.patients patient
  where patient.id = p_patient_id
  for update;
  if not found or v_patient.archived_at is not null
     or not private.is_owner_of(v_patient.clinic_id) then
    raise exception using errcode = '42501', message = 'Patient access is not permitted';
  end if;

  select auth_user.id into v_user_id
  from auth.users auth_user
  where lower(auth_user.email) = v_email
  order by auth_user.created_at
  limit 1;
  if v_user_id is null then
    return query select false, 'account-not-found'::text;
    return;
  end if;

  if not exists (
    select 1 from public.profiles profile
    where profile.id = v_user_id and profile.role = 'patient'
  ) or exists (
    select 1 from public.clinic_members membership
    where membership.user_id = v_user_id
  ) then
    raise exception using errcode = '23514', message = 'Only a patient-only account may receive portal access';
  end if;

  if v_relationship = 'self' and exists (
    select 1 from public.patient_users existing
    where existing.user_id = v_user_id
      and existing.patient_id <> p_patient_id
      and existing.relationship = 'self'
      and existing.revoked_at is null
      and (existing.expires_at is null or existing.expires_at > clock_timestamp())
  ) then
    raise exception using errcode = '23514', message = 'This account already represents another patient';
  end if;

  insert into public.patient_users (
    patient_id, user_id, relationship, authorized_at, authorized_by,
    expires_at, revoked_at, revoked_by, revocation_reason
  ) values (
    p_patient_id, v_user_id, v_relationship, clock_timestamp(), v_actor,
    p_expires_at, null, null, null
  )
  on conflict (patient_id, user_id) do update
  set relationship = excluded.relationship,
      authorized_at = excluded.authorized_at,
      authorized_by = excluded.authorized_by,
      expires_at = excluded.expires_at,
      revoked_at = null,
      revoked_by = null,
      revocation_reason = null
  where patient_users.revoked_at is not null
     or patient_users.relationship is distinct from excluded.relationship
     or patient_users.expires_at is distinct from excluded.expires_at;
  get diagnostics v_row_count = row_count;
  v_changed := v_row_count > 0;

  if v_changed then
    insert into public.patient_access_events (
      patient_id, user_id, event_type, relationship,
      actor_id, expires_at, reason
    ) values (
      p_patient_id, v_user_id, 'authorized', v_relationship,
      v_actor, p_expires_at, 'Consent or legal authority attested by clinic owner'
    );
  end if;

  return query select true, case when v_changed then 'linked' else 'already-linked' end;
end;
$$;

create or replace function public.revoke_patient_account_link(
  p_patient_id uuid,
  p_user_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_reason text := nullif(btrim(p_reason), '');
  v_relationship text;
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Clinic-owner authentication is required';
  end if;
  if v_reason is null or char_length(v_reason) not between 3 and 1000 then
    raise exception using errcode = '22023', message = 'Revocation reason is required';
  end if;
  if not exists (
    select 1 from public.patients patient
    where patient.id = p_patient_id
      and private.is_owner_of(patient.clinic_id)
  ) then
    raise exception using errcode = '42501', message = 'Patient access is not permitted';
  end if;

  update public.patient_users access_grant
  set revoked_at = clock_timestamp(),
      revoked_by = v_actor,
      revocation_reason = v_reason
  where access_grant.patient_id = p_patient_id
    and access_grant.user_id = p_user_id
    and access_grant.revoked_at is null
  returning access_grant.relationship into v_relationship;
  if not found then
    return false;
  end if;

  insert into public.patient_access_events (
    patient_id, user_id, event_type, relationship, actor_id, reason
  ) values (
    p_patient_id, p_user_id, 'revoked', v_relationship, v_actor, v_reason
  );
  return true;
end;
$$;

create or replace function public.list_patient_account_links(p_patient_ids uuid[])
returns table (
  patient_id uuid,
  user_id uuid,
  full_name text,
  email text,
  relationship text,
  authorized_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or private.is_platform_admin()
     or p_patient_ids is null
     or cardinality(p_patient_ids) not between 1 and 100 then
    raise exception using errcode = '42501', message = 'Patient-link access is not permitted';
  end if;
  if exists (
    select 1
    from unnest(p_patient_ids) requested(patient_id)
    left join public.patients patient on patient.id = requested.patient_id
    where patient.id is null or not private.can_manage_clinical_record(patient.id)
  ) then
    raise exception using errcode = '42501', message = 'Patient-link access is not permitted';
  end if;

  return query
  select grant_row.patient_id,
         grant_row.user_id,
         profile.full_name,
         case when private.is_owner_of(patient.clinic_id) then auth_user.email else null end,
         grant_row.relationship,
         grant_row.authorized_at,
         grant_row.expires_at,
         grant_row.revoked_at
  from public.patient_users grant_row
  join public.patients patient on patient.id = grant_row.patient_id
  join public.profiles profile on profile.id = grant_row.user_id
  join auth.users auth_user on auth_user.id = grant_row.user_id
  where grant_row.patient_id = any(p_patient_ids)
  order by grant_row.patient_id, grant_row.revoked_at nulls first, grant_row.authorized_at desc
  limit 500;
end;
$$;

-- --------------------------------------------------------------------------
-- 3) Atomic patient, assignment, and episode lifecycle workflows
-- --------------------------------------------------------------------------

-- Daily progress has one row per date, so values above seven are impossible
-- to fulfill. Existing out-of-range rows must be corrected before migration.
alter table public.care_episodes
  drop constraint if exists care_episodes_values_check;
alter table public.care_episodes
  add constraint care_episodes_values_check check (
    char_length(btrim(title_fa)) between 1 and 500
    and (therapist_note_fa is null or char_length(therapist_note_fa) <= 20000)
    and weekly_target between 1 and 7
    and (ended_at is null or ended_at >= started_at)
  ) not valid;
alter table public.care_episodes
  validate constraint care_episodes_values_check;

create or replace function public.update_patient_record(
  p_patient_id uuid,
  p_full_name text,
  p_phone text,
  p_birth_year int,
  p_gender text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_patient public.patients%rowtype;
  v_name text := btrim(p_full_name);
  v_phone text := nullif(btrim(p_phone), '');
  v_gender text := case when p_gender is null then null else lower(btrim(p_gender)) end;
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Clinician authentication is required';
  end if;
  if char_length(v_name) not between 2 and 120
     or (v_phone is not null and char_length(v_phone) not between 7 and 16)
     or (p_birth_year is not null and p_birth_year not between 1900 and extract(year from current_date)::int)
     or (v_gender is not null and v_gender not in ('male', 'female', 'other')) then
    raise exception using errcode = '22023', message = 'Patient demographics are invalid';
  end if;
  select patient.* into v_patient
  from public.patients patient where patient.id = p_patient_id for update;
  if not found or v_patient.archived_at is not null
     or not private.can_edit_patient_demographics(p_patient_id) then
    raise exception using errcode = '42501', message = 'Patient access is not permitted';
  end if;
  update public.patients patient
  set full_name = v_name, phone = v_phone,
      birth_year = p_birth_year, gender = v_gender
  where patient.id = p_patient_id;
  return true;
end;
$$;

create or replace function public.set_patient_primary_therapist(
  p_patient_id uuid,
  p_therapist_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_patient public.patients%rowtype;
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Clinic-owner authentication is required';
  end if;
  select patient.* into v_patient
  from public.patients patient where patient.id = p_patient_id for update;
  if not found or v_patient.archived_at is not null
     or not private.is_owner_of(v_patient.clinic_id) then
    raise exception using errcode = '42501', message = 'Patient access is not permitted';
  end if;
  if p_therapist_id is not null and not exists (
    select 1
    from public.clinic_members membership
    join public.profiles profile on profile.id = membership.user_id
    where membership.clinic_id = v_patient.clinic_id
      and membership.user_id = p_therapist_id
      and membership.member_role = 'therapist'
      and profile.role in ('clinic_owner', 'therapist')
  ) then
    raise exception using errcode = '22023', message = 'Therapist is not active in this clinic';
  end if;
  delete from public.patient_therapists assignment
  where assignment.patient_id = p_patient_id;
  if p_therapist_id is not null then
    insert into public.patient_therapists (patient_id, therapist_id)
    values (p_patient_id, p_therapist_id);
  end if;
  return true;
end;
$$;

create or replace function public.start_patient_episode(
  p_patient_id uuid,
  p_title_fa text,
  p_weekly_target int,
  p_assigned_therapist_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_patient public.patients%rowtype;
  v_title text := btrim(p_title_fa);
  v_actor_is_owner boolean;
  v_episode_id uuid;
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Clinician authentication is required';
  end if;
  if char_length(v_title) not between 2 and 160
     or p_weekly_target not between 1 and 7 then
    raise exception using errcode = '22023', message = 'Episode details are invalid';
  end if;
  select patient.* into v_patient
  from public.patients patient where patient.id = p_patient_id for update;
  if not found or v_patient.archived_at is not null then
    raise exception using errcode = '42501', message = 'Patient access is not permitted';
  end if;
  v_actor_is_owner := private.is_owner_of(v_patient.clinic_id);
  if not v_actor_is_owner and not private.is_assigned_therapist(p_patient_id) then
    raise exception using errcode = '42501', message = 'Patient access is not permitted';
  end if;
  if exists (
    select 1 from public.care_episodes episode
    where episode.patient_id = p_patient_id and episode.status = 'active'
  ) then
    raise exception using errcode = '23514', message = 'Complete or pause the active episode first';
  end if;
  if not v_actor_is_owner and p_assigned_therapist_id is distinct from v_actor then
    raise exception using errcode = '42501', message = 'A therapist may assign an episode only to themself';
  end if;
  if p_assigned_therapist_id is not null and not exists (
    select 1
    from public.clinic_members membership
    join public.profiles profile on profile.id = membership.user_id
    where membership.clinic_id = v_patient.clinic_id
      and membership.user_id = p_assigned_therapist_id
      and membership.member_role = 'therapist'
      and profile.role in ('clinic_owner', 'therapist')
  ) then
    raise exception using errcode = '22023', message = 'Therapist is not active in this clinic';
  end if;

  if p_assigned_therapist_id is not null then
    delete from public.patient_therapists assignment
    where assignment.patient_id = p_patient_id;
    insert into public.patient_therapists (patient_id, therapist_id)
    values (p_patient_id, p_assigned_therapist_id);
  end if;
  insert into public.care_episodes (patient_id, title_fa, weekly_target)
  values (p_patient_id, v_title, p_weekly_target)
  returning id into v_episode_id;
  return v_episode_id;
end;
$$;

create or replace function public.transition_care_episode(
  p_episode_id uuid,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_episode public.care_episodes%rowtype;
  v_patient public.patients%rowtype;
  v_status text := lower(btrim(p_status));
begin
  if v_actor is null or private.is_platform_admin()
     or v_status not in ('active', 'paused', 'completed') then
    raise exception using errcode = '42501', message = 'Episode transition is not permitted';
  end if;
  select episode.* into v_episode
  from public.care_episodes episode where episode.id = p_episode_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'Episode access is not permitted';
  end if;
  select patient.* into v_patient
  from public.patients patient where patient.id = v_episode.patient_id for update;
  if not private.can_manage_clinical_record(v_episode.patient_id)
     or v_patient.archived_at is not null then
    raise exception using errcode = '42501', message = 'Episode access is not permitted';
  end if;
  if v_episode.status = 'completed' and v_status <> 'completed' then
    raise exception using errcode = '23514', message = 'A completed episode cannot be reopened; start a new episode';
  end if;
  if v_status = 'active' and exists (
    select 1 from public.care_episodes other_episode
    where other_episode.patient_id = v_episode.patient_id
      and other_episode.id <> v_episode.id
      and other_episode.status = 'active'
  ) then
    raise exception using errcode = '23514', message = 'Another active episode already exists';
  end if;
  if v_episode.status = v_status then
    return true;
  end if;

  update public.care_episodes episode
  set status = v_status,
      ended_at = case when v_status = 'completed' then current_date else null end
  where episode.id = p_episode_id;

  if v_status in ('paused', 'completed') then
    update public.exercise_prescriptions prescription
    set status = 'revoked', revoked_by = v_actor, revoked_at = clock_timestamp()
    where prescription.episode_id = p_episode_id
      and prescription.status in ('published', 'suspended');
  end if;
  if v_status = 'completed' then
    update public.treatment_plans plan
    set status = 'superseded',
        superseded_by = v_actor,
        superseded_at = clock_timestamp(),
        supersede_reason = 'Care episode completed'
    where plan.episode_id = p_episode_id and plan.status = 'approved';
  end if;
  return true;
end;
$$;

create or replace function public.archive_patient_record(
  p_patient_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_patient public.patients%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
  v_grant record;
begin
  if v_actor is null or private.is_platform_admin()
     or v_reason is null or char_length(v_reason) not between 3 and 1000 then
    raise exception using errcode = '42501', message = 'Patient archive is not permitted';
  end if;
  select patient.* into v_patient
  from public.patients patient where patient.id = p_patient_id for update;
  if not found or not private.is_owner_of(v_patient.clinic_id) then
    raise exception using errcode = '42501', message = 'Patient access is not permitted';
  end if;
  if v_patient.archived_at is not null then
    return true;
  end if;
  if exists (
    select 1 from public.care_episodes episode
    where episode.patient_id = p_patient_id and episode.status = 'active'
  ) or exists (
    select 1 from public.clinical_alerts alert
    where alert.patient_id = p_patient_id
      and alert.status in ('open', 'acknowledged')
  ) then
    raise exception using errcode = '23514', message = 'Close active care and unresolved alerts before archive';
  end if;

  for v_grant in
    update public.patient_users access_grant
    set revoked_at = clock_timestamp(), revoked_by = v_actor,
        revocation_reason = 'Patient record archived: ' || v_reason
    where access_grant.patient_id = p_patient_id
      and access_grant.revoked_at is null
    returning access_grant.user_id, access_grant.relationship
  loop
    insert into public.patient_access_events (
      patient_id, user_id, event_type, relationship, actor_id, reason
    ) values (
      p_patient_id, v_grant.user_id, 'revoked', v_grant.relationship,
      v_actor, 'Patient record archived: ' || v_reason
    );
  end loop;
  delete from public.patient_therapists assignment
  where assignment.patient_id = p_patient_id;
  update public.exercise_prescriptions prescription
  set status = 'revoked', revoked_by = v_actor, revoked_at = clock_timestamp()
  where prescription.patient_id = p_patient_id
    and prescription.status in ('published', 'suspended');
  update public.patients patient
  set archived_at = clock_timestamp(), archived_by = v_actor,
      archive_reason = v_reason
  where patient.id = p_patient_id;
  return true;
end;
$$;

-- Direct browser writes could otherwise forge lifecycle actors/timestamps.
revoke insert, update, delete, truncate on table public.patients
  from authenticated, service_role;
revoke insert, update, delete, truncate on table public.patient_users
  from authenticated, service_role;
revoke insert, update, delete, truncate on table public.patient_therapists
  from authenticated, service_role;
revoke insert, update, delete, truncate on table public.care_episodes
  from authenticated, service_role;

do $$
declare
  v_signature regprocedure;
begin
  foreach v_signature in array array[
    'public.reserve_patient_invitation(uuid,text)'::regprocedure,
    'public.link_patient_account_by_email(uuid,text,text,timestamp with time zone,boolean)'::regprocedure,
    'public.revoke_patient_account_link(uuid,uuid,text)'::regprocedure,
    'public.list_patient_account_links(uuid[])'::regprocedure,
    'public.update_patient_record(uuid,text,text,integer,text)'::regprocedure,
    'public.set_patient_primary_therapist(uuid,uuid)'::regprocedure,
    'public.start_patient_episode(uuid,text,integer,uuid)'::regprocedure,
    'public.transition_care_episode(uuid,text)'::regprocedure,
    'public.archive_patient_record(uuid,text)'::regprocedure
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_signature);
    execute format('grant execute on function %s to authenticated', v_signature);
  end loop;
end $$;

drop trigger if exists audit_row_change on public.patient_access_events;
create trigger audit_row_change
after insert on public.patient_access_events
for each row execute function private.write_audit_log();

comment on table public.patient_users is
  'Current, consent-attested and optionally expiring portal access grants. Direct mutation is disabled.';
comment on table public.patient_access_events is
  'Append-only authorization/revocation history for patient portal access.';
comment on function public.transition_care_episode(uuid, text) is
  'Audited episode lifecycle transition; pausing/completing revokes actionable prescriptions atomically.';

commit;
