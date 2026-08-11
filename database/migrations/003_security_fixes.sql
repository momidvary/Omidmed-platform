-- PhysioAI — Migration 003: security fixes (run AFTER 001 and 002)
--
-- 1) Safe one-time bootstrap of the first platform_admin
-- 2) Granular access functions replacing the catch-all can_manage_patient
-- 3) ticket_replies sender hardening (+ sender_user_id, no client 'ai')
-- 4) Split patient self-reports (patient_daily_logs) from
--    therapist-recorded clinical_measurements
-- 5) created_by / therapist_id anti-spoofing checks

-- ════════════════════════════════════════════════════════════════
-- 1) Bootstrap the first platform_admin
-- ════════════════════════════════════════════════════════════════
-- The role-change guard (002) blocks non-admins from changing roles,
-- which also blocks creating the FIRST admin. Fix the guard to allow
-- administrative contexts (SQL editor / service role have no JWT →
-- auth.uid() is null; RLS already blocks anon/authenticated writes
-- they don't own, so this opens nothing to end users):

create or replace function public.guard_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_platform_admin() then
    raise exception 'Only a platform admin can change roles';
  end if;
  return new;
end $$;

-- One-time bootstrap function. Only runs while NO platform_admin exists,
-- and is NOT executable by anon/authenticated — only the SQL editor
-- (postgres) or the service role can call it.
create or replace function public.bootstrap_platform_admin(target_user uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from profiles where role = 'platform_admin') then
    raise exception 'Bootstrap refused: a platform_admin already exists';
  end if;
  if not exists (select 1 from profiles where id = target_user) then
    raise exception 'No profile found for user %. Create the user first (Authentication → Users).', target_user;
  end if;
  update profiles set role = 'platform_admin' where id = target_user;
  return 'platform_admin bootstrapped for ' || target_user;
end $$;

revoke all on function public.bootstrap_platform_admin(uuid) from public;
revoke all on function public.bootstrap_platform_admin(uuid) from anon;
revoke all on function public.bootstrap_platform_admin(uuid) from authenticated;

-- ════════════════════════════════════════════════════════════════
-- 2) Granular access functions
-- ════════════════════════════════════════════════════════════════
create or replace function public.patient_clinic(p_patient uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select clinic_id from patients where id = p_patient;
$$;

create or replace function public.is_linked_patient(p_patient uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from patient_users
    where patient_id = p_patient and user_id = auth.uid()
  );
$$;

create or replace function public.is_assigned_therapist(p_patient uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from patient_therapists
    where patient_id = p_patient and therapist_id = auth.uid()
  );
$$;

create or replace function public.is_staff_of(p_clinic uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from clinic_members
    where clinic_id = p_clinic and user_id = auth.uid()
      and member_role = 'clinic_staff'
  );
$$;

-- View a patient: admin, any member of the patient's clinic, an assigned
-- therapist, or the linked patient themself.
create or replace function public.can_view_patient(p_patient uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin()
    or public.is_member_of(public.patient_clinic(p_patient))
    or public.is_assigned_therapist(p_patient)
    or public.is_linked_patient(p_patient);
$$;

-- Edit administrative/demographic patient data: admin, clinic owner,
-- clinic staff, or an assigned therapist.
create or replace function public.can_edit_patient_demographics(p_patient uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin()
    or public.is_owner_of(public.patient_clinic(p_patient))
    or public.is_staff_of(public.patient_clinic(p_patient))
    or public.is_assigned_therapist(p_patient);
$$;

-- Manage the clinical record (episodes, programs, sessions, measurements,
-- assessments): admin, clinic owner, or the ASSIGNED therapist only.
-- clinic_staff is deliberately excluded.
create or replace function public.can_manage_clinical_record(p_patient uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin()
    or public.is_owner_of(public.patient_clinic(p_patient))
    or public.is_assigned_therapist(p_patient);
$$;

-- Appointments are administrative: any clinic member.
create or replace function public.can_manage_appointment(p_clinic uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or public.is_member_of(p_clinic);
$$;

create or replace function public.ticket_patient(p_ticket uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select patient_id from tickets where id = p_ticket;
$$;

-- ════════════════════════════════════════════════════════════════
-- 3) Split patient self-reports from clinical measurements
-- ════════════════════════════════════════════════════════════════
-- Guarded so the file can be re-run: an unguarded rename aborts the whole
-- script on the second pass and leaves everything below it unapplied.
do $$ begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'progress'
  ) then
    alter table progress rename to patient_daily_logs;
  end if;
end $$;

create table if not exists clinical_measurements (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references care_episodes (id) on delete cascade,
  therapist_id uuid not null references profiles (id),
  measured_at date not null default current_date,
  kind text not null,            -- e.g. 'ROM', 'strength', 'functional_test'
  value jsonb not null,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists clinical_measurements_episode_idx
  on clinical_measurements (episode_id);
alter table clinical_measurements enable row level security;

-- ════════════════════════════════════════════════════════════════
-- 4) ticket_replies hardening
-- ════════════════════════════════════════════════════════════════
alter table ticket_replies
  add column if not exists sender_user_id uuid references profiles (id);

-- ════════════════════════════════════════════════════════════════
-- 5) Replace the coarse policies with granular ones
-- ════════════════════════════════════════════════════════════════

-- patients
drop policy if exists "patient read" on patients;
drop policy if exists "patient insert" on patients;
drop policy if exists "patient update" on patients;
drop policy if exists "patient delete" on patients;
create policy "patient read" on patients for select
  using (public.can_view_patient(id));
drop policy if exists "patient insert" on patients;
create policy "patient insert" on patients for insert
  with check (public.is_platform_admin() or public.is_member_of(clinic_id));
drop policy if exists "patient update" on patients;
create policy "patient update" on patients for update
  using (public.can_edit_patient_demographics(id))
  with check (public.can_edit_patient_demographics(id));
drop policy if exists "patient delete" on patients;
create policy "patient delete" on patients for delete
  using (public.is_platform_admin() or public.is_owner_of(clinic_id));

-- patient_users / patient_therapists: linking is owner/admin work
drop policy if exists "patient_users read" on patient_users;
drop policy if exists "patient_users manage" on patient_users;
create policy "patient_users read" on patient_users for select
  using (user_id = auth.uid() or public.can_view_patient(patient_id));
drop policy if exists "patient_users manage" on patient_users;
create policy "patient_users manage" on patient_users for all
  using (public.is_platform_admin() or public.is_owner_of(public.patient_clinic(patient_id))
         or public.is_staff_of(public.patient_clinic(patient_id)))
  with check (public.is_platform_admin() or public.is_owner_of(public.patient_clinic(patient_id))
              or public.is_staff_of(public.patient_clinic(patient_id)));

drop policy if exists "patient_therapists read" on patient_therapists;
drop policy if exists "patient_therapists manage" on patient_therapists;
create policy "patient_therapists read" on patient_therapists for select
  using (therapist_id = auth.uid() or public.can_view_patient(patient_id));
drop policy if exists "patient_therapists manage" on patient_therapists;
create policy "patient_therapists manage" on patient_therapists for all
  using (public.is_platform_admin() or public.is_owner_of(public.patient_clinic(patient_id)))
  with check (public.is_platform_admin() or public.is_owner_of(public.patient_clinic(patient_id)));

-- care_episodes / episode_program: clinical record
drop policy if exists "episodes read" on care_episodes;
drop policy if exists "episodes manage" on care_episodes;
create policy "episodes read" on care_episodes for select
  using (public.can_view_patient(patient_id));
drop policy if exists "episodes manage" on care_episodes;
create policy "episodes manage" on care_episodes for all
  using (public.can_manage_clinical_record(patient_id))
  with check (public.can_manage_clinical_record(patient_id));

drop policy if exists "program read" on episode_program;
drop policy if exists "program manage" on episode_program;
create policy "program read" on episode_program for select
  using (public.can_view_patient(public.episode_patient(episode_id)));
drop policy if exists "program manage" on episode_program;
create policy "program manage" on episode_program for all
  using (public.can_manage_clinical_record(public.episode_patient(episode_id)))
  with check (public.can_manage_clinical_record(public.episode_patient(episode_id)));

-- patient_daily_logs: the linked patient writes their OWN logs;
-- clinical managers may also correct them. Staff cannot.
drop policy if exists "progress read" on patient_daily_logs;
drop policy if exists "progress write" on patient_daily_logs;
drop policy if exists "daily logs read" on patient_daily_logs;
create policy "daily logs read" on patient_daily_logs for select
  using (public.can_view_patient(public.episode_patient(episode_id)));
drop policy if exists "daily logs write" on patient_daily_logs;
create policy "daily logs write" on patient_daily_logs for all
  using (public.is_linked_patient(public.episode_patient(episode_id))
         or public.can_manage_clinical_record(public.episode_patient(episode_id)))
  with check (public.is_linked_patient(public.episode_patient(episode_id))
              or public.can_manage_clinical_record(public.episode_patient(episode_id)));

-- clinical_measurements: therapists/owners only; patients read-only.
-- therapist_id cannot be spoofed: non-admins must record as themselves.
drop policy if exists "measurements read" on clinical_measurements;
create policy "measurements read" on clinical_measurements for select
  using (public.can_view_patient(public.episode_patient(episode_id)));
drop policy if exists "measurements write" on clinical_measurements;
create policy "measurements write" on clinical_measurements for all
  using (public.can_manage_clinical_record(public.episode_patient(episode_id)))
  with check (
    public.can_manage_clinical_record(public.episode_patient(episode_id))
    and (therapist_id = auth.uid() or public.is_platform_admin())
  );

-- sessions: clinical record; therapist_id anti-spoofing
drop policy if exists "sessions read" on sessions;
drop policy if exists "sessions manage" on sessions;
create policy "sessions read" on sessions for select
  using (public.can_view_patient(public.episode_patient(episode_id)));
drop policy if exists "sessions manage" on sessions;
create policy "sessions manage" on sessions for all
  using (public.can_manage_clinical_record(public.episode_patient(episode_id)))
  with check (
    public.can_manage_clinical_record(public.episode_patient(episode_id))
    and (therapist_id is null or therapist_id = auth.uid() or public.is_platform_admin()
         or public.is_owner_of(public.patient_clinic(public.episode_patient(episode_id))))
  );

-- appointments: administrative
drop policy if exists "appointments read" on appointments;
drop policy if exists "appointments manage" on appointments;
create policy "appointments read" on appointments for select
  using (public.can_view_patient(patient_id));
drop policy if exists "appointments manage" on appointments;
create policy "appointments manage" on appointments for all
  using (public.can_manage_appointment(clinic_id))
  with check (public.can_manage_appointment(clinic_id));

-- tickets: created_by must be the real author
drop policy if exists "tickets read" on tickets;
drop policy if exists "tickets insert" on tickets;
drop policy if exists "tickets update" on tickets;
create policy "tickets read" on tickets for select
  using (public.can_view_patient(patient_id));
drop policy if exists "tickets insert" on tickets;
create policy "tickets insert" on tickets for insert
  with check (public.can_view_patient(patient_id) and created_by = auth.uid());
drop policy if exists "tickets update" on tickets;
create policy "tickets update" on tickets for update
  using (public.can_manage_clinical_record(patient_id))
  with check (public.can_manage_clinical_record(patient_id));

-- ticket_replies:
--   patient  → only sender='patient', as themself
--   owner / assigned therapist → only sender='therapist', as themself
--   sender='ai' is NEVER writable from the client; only the service role
--   (server route handler) bypasses RLS to insert it.
drop policy if exists "replies read" on ticket_replies;
drop policy if exists "replies insert" on ticket_replies;
create policy "replies read" on ticket_replies for select
  using (public.can_view_patient(public.ticket_patient(ticket_id)));
drop policy if exists "replies insert" on ticket_replies;
create policy "replies insert" on ticket_replies for insert
  with check (
    sender_user_id = auth.uid()
    and (
      (sender = 'patient'
        and public.is_linked_patient(public.ticket_patient(ticket_id)))
      or
      (sender = 'therapist'
        and public.can_manage_clinical_record(public.ticket_patient(ticket_id)))
    )
  );

-- cases: clinical intake records — staff may read, not write
drop policy if exists "cases read" on cases;
drop policy if exists "cases write" on cases;
create policy "cases read" on cases for select
  using (public.is_platform_admin() or public.is_member_of(clinic_id));
drop policy if exists "cases insert" on cases;
create policy "cases insert" on cases for insert
  with check (
    (public.is_platform_admin() or (public.is_member_of(clinic_id) and not public.is_staff_of(clinic_id)))
    and created_by = auth.uid()
  );
drop policy if exists "cases update" on cases;
create policy "cases update" on cases for update
  using (public.is_platform_admin() or (public.is_member_of(clinic_id) and not public.is_staff_of(clinic_id)))
  with check (public.is_platform_admin() or (public.is_member_of(clinic_id) and not public.is_staff_of(clinic_id)));
drop policy if exists "cases delete" on cases;
create policy "cases delete" on cases for delete
  using (public.is_platform_admin() or public.is_owner_of(clinic_id));

-- The old catch-all functions remain for backward compatibility of any
-- external tooling, but no policy uses can_manage_patient any more.
