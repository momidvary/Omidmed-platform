-- PhysioAI — Migration 004: Phone-OTP support (run AFTER 001 → 002 → 003)
--
-- 1) Unique, normalized phone on profiles (identity = phone via Supabase
--    Auth; profiles.phone is a synced copy for display/lookups)
-- 2) audit_logs table (service-role writes only; platform_admin reads)
-- 3) Phone-based bootstrap helper for the first platform_admin

-- ── profiles.phone: unique when present ─────────────────────────
create unique index if not exists profiles_phone_unique
  on profiles (phone) where phone is not null and phone <> '';

-- Sync auth phone into the profile on user creation (E.164 with '+').
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when new.phone is null or new.phone = '' then null
         else '+' || replace(new.phone, '+', '') end
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- ── audit_logs ──────────────────────────────────────────────────
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles (id),
  action text not null,          -- e.g. 'clinic_owner.created', 'member.invited',
                                 -- 'patient.linked', 'phone.changed', 'phone.recovered'
  target_user_id uuid,
  clinic_id uuid,
  patient_id uuid,
  detail jsonb,                  -- masked phones only — never full numbers/OTP
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_actor on audit_logs (actor_id);
alter table audit_logs enable row level security;

-- No insert/update/delete policies: only the service role (server route
-- handlers) writes audit logs. platform_admins may read them.
create policy "audit read" on audit_logs for select
  using (public.is_platform_admin());

-- ── Phone-based bootstrap ───────────────────────────────────────
-- Wraps bootstrap_platform_admin(uuid): looks up the auth user by phone
-- (accepts +98…, 98…, 0098…, 09… — digits normalized in SQL) and grants
-- the first admin role. Same guarantees: refuses when an admin exists;
-- not executable by anon/authenticated.
create or replace function public.bootstrap_platform_admin_by_phone(target_phone text)
returns text language plpgsql security definer set search_path = public as $$
declare
  digits text;
  uid uuid;
begin
  digits := regexp_replace(target_phone, '\D', '', 'g');  -- keep digits only
  if digits like '00%' then digits := substr(digits, 3); end if;
  if digits like '0%'  then digits := '98' || substr(digits, 2); end if;

  select id into uid from auth.users
    where replace(phone, '+', '') = digits
    limit 1;
  if uid is null then
    raise exception 'No auth user found for that phone. Create it first (Authentication → Users → phone).';
  end if;
  return public.bootstrap_platform_admin(uid);
end $$;

revoke all on function public.bootstrap_platform_admin_by_phone(text) from public;
revoke all on function public.bootstrap_platform_admin_by_phone(text) from anon;
revoke all on function public.bootstrap_platform_admin_by_phone(text) from authenticated;
