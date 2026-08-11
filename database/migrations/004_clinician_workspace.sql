-- PhysioAI — Migration 004: support for the clinician workspace
-- Run AFTER 001 → 002 → 003. Safe to re-run (every statement is guarded).
--
-- Building the therapist panel surfaced three things the schema could not
-- express. Each is addressed as narrowly as possible:
--
--   1) A clinic had no way to find a patient's login. `profiles` carries no
--      email, and "own profile read" hides every other row — so staff could
--      not link an account, name a colleague, or attribute a reply.
--   2) A therapist who registers a patient could not then treat them:
--      `can_manage_clinical_record` needs an assignment, and only an owner
--      could create one. Every new patient required an owner round-trip.
--   3) Prescribing the same exercise twice created duplicate rows.
--
-- ════════════════════════════════════════════════════════════════
-- 1) profiles.email — kept in sync with auth.users
-- ════════════════════════════════════════════════════════════════
alter table profiles add column if not exists email text;

create unique index if not exists profiles_email_lower_idx
  on profiles (lower(email));

update profiles p
  set email = u.email
  from auth.users u
  where u.id = p.id and p.email is distinct from u.email;

-- Carry the email in at sign-up (extends the trigger from 001).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

-- …and keep it correct if the user later changes their address.
create or replace function public.sync_profile_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.sync_profile_email();

-- ════════════════════════════════════════════════════════════════
-- 2) Profile visibility inside a clinic
-- ════════════════════════════════════════════════════════════════
-- Colleagues in the same clinic, so staff pickers and reply attribution
-- can show a name instead of a uuid.
create or replace function public.shares_clinic_with(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from clinic_members mine
    join clinic_members theirs on theirs.clinic_id = mine.clinic_id
    where mine.user_id = auth.uid() and theirs.user_id = p_user
  );
$$;

-- Accounts linked to a patient of a clinic the caller belongs to, so the
-- patient detail page can show which login is attached to the record.
create or replace function public.is_login_of_my_patient(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from patient_users pu
    join patients pt on pt.id = pu.patient_id
    where pu.user_id = p_user and public.is_member_of(pt.clinic_id)
  );
$$;

drop policy if exists "own profile read" on profiles;
drop policy if exists "profile read" on profiles;
create policy "profile read" on profiles for select
  using (
    id = auth.uid()
    or public.is_platform_admin()
    or public.shares_clinic_with(id)
    or public.is_login_of_my_patient(id)
  );

-- Writing a profile stays exactly as it was: yourself, or an admin. The
-- role-change guard from 002/003 still applies on top.

-- ════════════════════════════════════════════════════════════════
-- 3) Linking a patient record to an existing account
-- ════════════════════════════════════════════════════════════════
-- Done through an RPC rather than a readable email index: this answers
-- "does THIS address have an account" for one address at a time, only for
-- staff of that patient's own clinic, instead of exposing a lookup table.
create or replace function public.link_patient_account(
  p_patient uuid,
  p_email text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid;
  v_user uuid;
begin
  v_clinic := public.patient_clinic(p_patient);
  if v_clinic is null then
    raise exception 'Patient not found';
  end if;

  if not (
    public.is_platform_admin()
    or public.is_owner_of(v_clinic)
    or public.is_staff_of(v_clinic)
  ) then
    raise exception 'Only a clinic owner or clinic staff can link patient accounts';
  end if;

  select id into v_user
    from profiles
    where lower(email) = lower(trim(p_email));

  if v_user is null then
    raise exception 'No account exists for %. Ask the patient to sign up at /patient first.', p_email;
  end if;

  insert into patient_users (patient_id, user_id)
    values (p_patient, v_user)
    on conflict do nothing;

  return v_user;
end $$;

revoke all on function public.link_patient_account(uuid, text) from public;
revoke all on function public.link_patient_account(uuid, text) from anon;
grant execute on function public.link_patient_account(uuid, text) to authenticated;

-- ════════════════════════════════════════════════════════════════
-- 4) Therapist self-assignment
-- ════════════════════════════════════════════════════════════════
-- DELIBERATE LOOSENING — read before keeping.
--
-- 003 reserved patient_therapists writes for owners. That makes the common
-- single-therapist clinic unusable: whoever registers a patient cannot open
-- their care episode. This policy lets a therapist attach ONLY THEMSELVES
-- (therapist_id = auth.uid()) and only to a patient in a clinic they are
-- already a member of — a scope where they can read the record regardless.
-- The assignment row is the audit trail of who took the patient on.
--
-- Owners keep exclusive rights to assign OTHER therapists, and to remove
-- assignments. To revert this, drop the policy: the UI degrades to
-- "ask an owner to assign you" and nothing else breaks.
drop policy if exists "therapist self assign" on patient_therapists;
create policy "therapist self assign" on patient_therapists for insert
  with check (
    therapist_id = auth.uid()
    and public.is_member_of(public.patient_clinic(patient_id))
  );

-- ════════════════════════════════════════════════════════════════
-- 5) One prescription row per exercise per episode
-- ════════════════════════════════════════════════════════════════
delete from episode_program a using episode_program b
  where a.ctid < b.ctid
    and a.episode_id = b.episode_id
    and a.exercise_id = b.exercise_id;

create unique index if not exists episode_program_unique_idx
  on episode_program (episode_id, exercise_id);

-- ════════════════════════════════════════════════════════════════
-- 6) Indexes for the workspace's list queries
-- ════════════════════════════════════════════════════════════════
create index if not exists tickets_status_idx on tickets (status, created_at desc);
create index if not exists ticket_replies_ticket_idx on ticket_replies (ticket_id);
create index if not exists episode_program_episode_idx on episode_program (episode_id);
