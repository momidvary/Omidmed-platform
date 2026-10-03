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
