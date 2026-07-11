-- PhysioAI — Migration 002: Row Level Security
-- Run AFTER 001_schema.sql. There are NO anon policies: every access
-- requires an authenticated user, and access is scoped by role,
-- clinic membership, therapist assignment, or patient linkage.

-- ── Helper functions (security definer to avoid RLS recursion) ──
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'platform_admin'
  );
$$;

create or replace function public.is_member_of(p_clinic uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from clinic_members
    where clinic_id = p_clinic and user_id = auth.uid()
  );
$$;

create or replace function public.is_owner_of(p_clinic uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from clinic_members
    where clinic_id = p_clinic and user_id = auth.uid()
      and member_role = 'clinic_owner'
  );
$$;

-- Staff-side access to a patient record: platform admin, a member of the
-- patient's clinic, or a therapist explicitly assigned to the patient.
create or replace function public.can_manage_patient(p_patient uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin()
    or exists (
      select 1 from patients p
      join clinic_members m on m.clinic_id = p.clinic_id
      where p.id = p_patient and m.user_id = auth.uid()
    )
    or exists (
      select 1 from patient_therapists pt
      where pt.patient_id = p_patient and pt.therapist_id = auth.uid()
    );
$$;

-- Any access to a patient record: staff-side access OR the linked patient.
create or replace function public.can_access_patient(p_patient uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_manage_patient(p_patient)
    or exists (
      select 1 from patient_users pu
      where pu.patient_id = p_patient and pu.user_id = auth.uid()
    );
$$;

create or replace function public.episode_patient(p_episode uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select patient_id from care_episodes where id = p_episode;
$$;

-- ── Enable RLS everywhere ───────────────────────────────────────
alter table profiles enable row level security;
alter table clinics enable row level security;
alter table clinic_members enable row level security;
alter table patients enable row level security;
alter table patient_users enable row level security;
alter table patient_therapists enable row level security;
alter table care_episodes enable row level security;
alter table episode_program enable row level security;
alter table progress enable row level security;
alter table sessions enable row level security;
alter table appointments enable row level security;
alter table exercises enable row level security;
alter table tickets enable row level security;
alter table ticket_replies enable row level security;
alter table cases enable row level security;

-- ── profiles ────────────────────────────────────────────────────
create policy "own profile read" on profiles for select
  using (id = auth.uid() or public.is_platform_admin());
create policy "own profile update" on profiles for update
  using (id = auth.uid() or public.is_platform_admin())
  with check (id = auth.uid() or public.is_platform_admin());

-- Role escalation guard: only a platform admin may change `role`.
create or replace function public.guard_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and not public.is_platform_admin() then
    raise exception 'Only a platform admin can change roles';
  end if;
  return new;
end $$;

drop trigger if exists profiles_role_guard on profiles;
create trigger profiles_role_guard
  before update on profiles
  for each row execute function public.guard_role_change();

-- ── clinics ─────────────────────────────────────────────────────
create policy "clinic read" on clinics for select
  using (public.is_platform_admin() or public.is_member_of(id));
create policy "clinic admin write" on clinics for all
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "clinic owner update" on clinics for update
  using (public.is_owner_of(id)) with check (public.is_owner_of(id));

-- ── clinic_members ──────────────────────────────────────────────
create policy "members read" on clinic_members for select
  using (public.is_platform_admin() or public.is_member_of(clinic_id));
create policy "members manage" on clinic_members for all
  using (public.is_platform_admin() or public.is_owner_of(clinic_id))
  with check (public.is_platform_admin() or public.is_owner_of(clinic_id));

-- ── patients ────────────────────────────────────────────────────
create policy "patient read" on patients for select
  using (public.can_access_patient(id));
create policy "patient insert" on patients for insert
  with check (public.is_platform_admin() or public.is_member_of(clinic_id));
create policy "patient update" on patients for update
  using (public.can_manage_patient(id)) with check (public.can_manage_patient(id));
create policy "patient delete" on patients for delete
  using (public.is_platform_admin() or public.is_owner_of(clinic_id));

-- ── patient_users / patient_therapists ──────────────────────────
create policy "patient_users read" on patient_users for select
  using (user_id = auth.uid() or public.can_manage_patient(patient_id));
create policy "patient_users manage" on patient_users for all
  using (public.can_manage_patient(patient_id))
  with check (public.can_manage_patient(patient_id));

create policy "patient_therapists read" on patient_therapists for select
  using (therapist_id = auth.uid() or public.can_manage_patient(patient_id));
create policy "patient_therapists manage" on patient_therapists for all
  using (public.can_manage_patient(patient_id))
  with check (public.can_manage_patient(patient_id));

-- ── care_episodes ───────────────────────────────────────────────
create policy "episodes read" on care_episodes for select
  using (public.can_access_patient(patient_id));
create policy "episodes manage" on care_episodes for all
  using (public.can_manage_patient(patient_id))
  with check (public.can_manage_patient(patient_id));

-- ── episode_program ─────────────────────────────────────────────
create policy "program read" on episode_program for select
  using (public.can_access_patient(public.episode_patient(episode_id)));
create policy "program manage" on episode_program for all
  using (public.can_manage_patient(public.episode_patient(episode_id)))
  with check (public.can_manage_patient(public.episode_patient(episode_id)));

-- ── progress (patients log their own; staff can correct) ────────
create policy "progress read" on progress for select
  using (public.can_access_patient(public.episode_patient(episode_id)));
create policy "progress write" on progress for all
  using (public.can_access_patient(public.episode_patient(episode_id)))
  with check (public.can_access_patient(public.episode_patient(episode_id)));

-- ── sessions ────────────────────────────────────────────────────
create policy "sessions read" on sessions for select
  using (public.can_access_patient(public.episode_patient(episode_id)));
create policy "sessions manage" on sessions for all
  using (public.can_manage_patient(public.episode_patient(episode_id)))
  with check (public.can_manage_patient(public.episode_patient(episode_id)));

-- ── appointments ────────────────────────────────────────────────
create policy "appointments read" on appointments for select
  using (public.can_access_patient(patient_id));
create policy "appointments manage" on appointments for all
  using (public.is_platform_admin() or public.is_member_of(clinic_id))
  with check (public.is_platform_admin() or public.is_member_of(clinic_id));

-- ── exercises (clinic custom library) ───────────────────────────
create policy "exercises read" on exercises for select
  using (public.is_platform_admin() or public.is_member_of(clinic_id));
create policy "exercises manage" on exercises for all
  using (public.is_platform_admin() or public.is_member_of(clinic_id))
  with check (public.is_platform_admin() or public.is_member_of(clinic_id));

-- ── tickets & replies ───────────────────────────────────────────
create policy "tickets read" on tickets for select
  using (public.can_access_patient(patient_id));
create policy "tickets insert" on tickets for insert
  with check (public.can_access_patient(patient_id));
create policy "tickets update" on tickets for update
  using (public.can_manage_patient(patient_id))
  with check (public.can_manage_patient(patient_id));

create policy "replies read" on ticket_replies for select
  using (exists (
    select 1 from tickets t
    where t.id = ticket_id and public.can_access_patient(t.patient_id)
  ));
create policy "replies insert" on ticket_replies for insert
  with check (exists (
    select 1 from tickets t
    where t.id = ticket_id and public.can_access_patient(t.patient_id)
  ));

-- ── cases (clinic-scoped intake records) ────────────────────────
create policy "cases read" on cases for select
  using (public.is_platform_admin() or public.is_member_of(clinic_id));
create policy "cases write" on cases for all
  using (public.is_platform_admin() or public.is_member_of(clinic_id))
  with check (public.is_platform_admin() or public.is_member_of(clinic_id));
