-- PhysioAI — first clinic + clinic owner (SQL Editor), after 02_all_migrations.sql.
--
-- 1) Create the account first: Authentication → Users → Add user →
--    Create new user (tick "Auto Confirm User").
-- 2) Replace you@example.com below with that account's email, then Run.
--    Only the email is required. Safe to re-run.
--    Tip: do not type Persian/Arabic text between the quotes here — RTL
--    editing moves the quote marks and causes "syntax error at or near".
--    Leave the defaults; names can be changed later.
--
-- The owner is a clinician account (role clinic_owner) and can manage
-- patients, therapists and programmes. platform_admin is a separate,
-- optional support account: by design it cannot see patient data and
-- cannot belong to a clinic.

do $setup$
declare
  -- ▼▼▼ EDIT THE EMAIL ▼▼▼
  v_email       text := 'you@example.com';
  -- ▲▲▲ (optional below) ▲▲▲
  v_full_name   text := '';           -- empty = keep the name from sign-up
  v_clinic_name text := 'My Clinic';
  v_clinic_city text := null;
  v_user_id   uuid;
  v_clinic_id uuid;
begin
  select id into v_user_id
  from auth.users
  where lower(email) = lower(trim(v_email));
  if v_user_id is null then
    raise exception 'No user with email %. Create it in Authentication → Users first (and check the spelling).', v_email;
  end if;

  -- Accounts created before the migrations have no profile row yet.
  insert into public.profiles (id, full_name)
  select v_user_id,
         coalesce(nullif(trim(v_full_name), ''),
                  u.raw_user_meta_data ->> 'full_name', '')
  from auth.users u where u.id = v_user_id
  on conflict (id) do nothing;

  if exists (
    select 1 from public.profiles where id = v_user_id and role = 'platform_admin'
  ) then
    raise exception 'This account is platform_admin, which cannot belong to a clinic. Use a different account as clinic owner.';
  end if;

  update public.profiles
  set role = 'clinic_owner',
      full_name = coalesce(nullif(trim(v_full_name), ''), full_name)
  where id = v_user_id;

  select id into v_clinic_id from public.clinics where name = v_clinic_name limit 1;
  if v_clinic_id is null then
    insert into public.clinics (name, city)
    values (v_clinic_name, v_clinic_city)
    returning id into v_clinic_id;
  end if;

  insert into public.clinic_members (clinic_id, user_id, member_role)
  values (v_clinic_id, v_user_id, 'clinic_owner')
  on conflict (clinic_id, user_id) do update set member_role = 'clinic_owner';
end
$setup$;

-- Check: one row with role clinic_owner, your clinic, member_role clinic_owner.
select u.email, p.role, c.name as clinic, m.member_role
from auth.users u
join public.profiles p on p.id = u.id
left join public.clinic_members m on m.user_id = u.id
left join public.clinics c on c.id = m.clinic_id
order by u.created_at;
