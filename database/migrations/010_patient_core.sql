-- PhysioAI — Migration 010: patient core (run AFTER 001 → 002 → 003)
-- Extends the patients table non-destructively, adds shared updated_at
-- plumbing and the clinical audit_logs table. Safe to re-run
-- (if-not-exists guards) but intended for one sequential run.
-- NOTE: numbering jumps to 010 to leave 004-009 for the phone-OTP branch.

-- ── Shared updated_at trigger ───────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ── patients: full demographic/administrative record ────────────
alter table patients
  add column if not exists first_name text not null default '',
  add column if not exists last_name text not null default '',
  add column if not exists date_of_birth date,
  add column if not exists preferred_language text not null default 'fa'
    check (preferred_language in ('fa', 'en', 'ar')),
  add column if not exists address text,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text,
  add column if not exists medical_history text,
  add column if not exists surgical_history text,
  add column if not exists medications text,
  add column if not exists allergies text,
  add column if not exists general_notes text,
  add column if not exists status text not null default 'active'
    check (status in ('active', 'inactive', 'completed', 'archived')),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references profiles (id),
  add column if not exists archived_at timestamptz;

-- Canonical E.164 phone column (rename the loose "phone").
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_name = 'patients' and column_name = 'phone')
     and not exists (select 1 from information_schema.columns
             where table_name = 'patients' and column_name = 'phone_e164') then
    alter table patients rename column phone to phone_e164;
  end if;
end $$;

-- Backfill split names from the legacy full_name.
update patients set last_name = full_name
  where last_name = '' and full_name is not null and full_name <> '';

-- Keep full_name in sync so older code keeps working.
create or replace function public.sync_patient_full_name()
returns trigger language plpgsql as $$
begin
  if coalesce(new.first_name, '') <> '' or coalesce(new.last_name, '') <> '' then
    new.full_name := trim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, ''));
  end if;
  return new;
end $$;

drop trigger if exists patients_full_name on patients;
create trigger patients_full_name
  before insert or update on patients
  for each row execute function public.sync_patient_full_name();

drop trigger if exists patients_touch on patients;
create trigger patients_touch
  before update on patients
  for each row execute function public.touch_updated_at();

-- Duplicate phones inside one clinic are ALLOWED (families share numbers,
-- spec 3.11 — never auto-merge) but must be detectable for the explicit
-- warning flow (spec 3.10):
create index if not exists patients_clinic_phone
  on patients (clinic_id, phone_e164) where phone_e164 is not null;

-- ── audit_logs (clinical shape; column-adds keep it merge-safe with
--    the phone-OTP branch's audit table) ──────────────────────────
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table audit_logs
  add column if not exists actor_user_id uuid,
  add column if not exists clinic_id uuid,
  add column if not exists patient_id uuid,
  add column if not exists care_episode_id uuid,
  add column if not exists action text,
  add column if not exists entity_type text,
  add column if not exists entity_id uuid,
  add column if not exists safe_metadata jsonb;

create index if not exists audit_logs_patient on audit_logs (patient_id);
create index if not exists audit_logs_clinic_created on audit_logs (clinic_id, created_at desc);
alter table audit_logs enable row level security;

-- Generic audit writer usable from triggers (security definer so RLS on
-- audit_logs never blocks it; audit rows cannot be forged directly
-- because the table has no insert policy for users).
create or replace function public.write_audit(
  p_action text, p_entity_type text, p_entity_id uuid,
  p_clinic uuid, p_patient uuid, p_episode uuid, p_meta jsonb
) returns void language sql security definer set search_path = public as $$
  insert into audit_logs
    (actor_user_id, action, entity_type, entity_id, clinic_id, patient_id, care_episode_id, safe_metadata)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, p_clinic, p_patient, p_episode, p_meta);
$$;

-- Patient audit trigger: create / update / archive.
create or replace function public.audit_patients()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit('patient.created', 'patient', new.id,
      new.clinic_id, new.id, null, null);
  elsif tg_op = 'UPDATE' then
    if new.status = 'archived' and old.status <> 'archived' then
      perform public.write_audit('patient.archived', 'patient', new.id,
        new.clinic_id, new.id, null, null);
    else
      perform public.write_audit('patient.updated', 'patient', new.id,
        new.clinic_id, new.id, null, null);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists patients_audit on patients;
create trigger patients_audit
  after insert or update on patients
  for each row execute function public.audit_patients();

-- Soft delete: archiving sets status+archived_at; hard DELETE stays
-- owner/admin-only (RLS from 003) and is discouraged in the app.
