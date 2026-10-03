-- GENERATED FILE — do not edit. Rebuild with:
--   node database/scripts/build-sql-editor-bundle.mjs
--
-- Upgrade for projects installed from the SQL Editor bundle: applies
-- 026_auth_email_type_fix.sql once and records it in public.schema_migrations
-- (same checksum as migrate.mjs). Paste the whole file and press Run.

do $preflight$
declare
  v_previous text;
  v_this text;
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception using errcode = '55000',
      message = 'No migration ledger. Install with 02_all_migrations.sql instead.';
  end if;
  execute $q$select status from public.schema_migrations where version = '025'$q$ into v_previous;
  execute $q$select status from public.schema_migrations where version = '026'$q$ into v_this;
  if v_this = 'applied' then
    raise exception using errcode = '55000',
      message = 'Already applied: 026_auth_email_type_fix.sql. Nothing to do.';
  end if;
  if v_this is not null then
    raise exception using errcode = '55000',
      message = 'A previous run of 026_auth_email_type_fix.sql stopped part-way. Ask for help before retrying.';
  end if;
  if v_previous is distinct from 'applied' then
    raise exception using errcode = '55000',
      message = 'Apply 025_exercise_measurement_targets.sql first.';
  end if;
end
$preflight$;

insert into public.schema_migrations (version, filename, checksum, status)
values ('026', '026_auth_email_type_fix.sql', 'f0211f8042a596ef5144875794d9eacf58c4baf6050231e439ae6cb25922fd58', 'applying');

-- PhysioAI — Migration 026: auth.users.email type fix (run after 025).
--
-- On hosted Supabase, auth.users.email is varchar(255), not text. The
-- RETURNS TABLE of list_patient_account_links declares `email text`, so
-- PL/pgSQL rejected every call with 42804 ("structure of query does not
-- match function result type") as soon as a clinic had one patient —
-- the Patient Registry could not load. CI did not see it because its
-- stand-in auth.users declared email as text. Cast explicitly.
-- CREATE OR REPLACE keeps the existing owner and grants.

begin;

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
         case when private.is_owner_of(patient.clinic_id) then auth_user.email::text else null end,
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

commit;

update public.schema_migrations
set status = 'applied', applied_at = clock_timestamp()
where version = '026' and status = 'applying';

select '026_auth_email_type_fix.sql applied' as result;
