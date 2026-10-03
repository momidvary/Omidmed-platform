-- PhysioAI — Migration 028: patient portal accounts by mobile number
-- (run after 027).
--
-- The patient portal signs in with a mobile number + SMS one-time code
-- (Supabase phone auth, OTP delivered by the Send SMS hook). Clinic owners
-- therefore link portal accounts by phone:
--
-- 1) link_patient_account_by_phone — identical checks to the email version
--    (owner of the patient's clinic, consent attested, patient-only account,
--    one "self" patient per account, bounded delegate expiry); only the
--    account lookup matches auth.users.phone (E.164 digits, no '+').
-- 2) list_patient_account_links also returns the account phone (owners
--    only), so the registry can show phone-based accounts. The return type
--    changes, so the function is dropped and re-created with the same grants.

begin;

create or replace function public.link_patient_account_by_phone(
  p_patient_id uuid,
  p_phone text,
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
  -- E.164 digits without '+', the form Supabase Auth stores (98912…).
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
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
  if v_phone !~ '^[1-9][0-9]{7,14}$' then
    raise exception using errcode = '22023', message = 'A valid international mobile number is required';
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
  where regexp_replace(coalesce(auth_user.phone, ''), '[^0-9]', '', 'g') = v_phone
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

drop function if exists public.list_patient_account_links(uuid[]);

create function public.list_patient_account_links(p_patient_ids uuid[])
returns table (
  patient_id uuid,
  user_id uuid,
  full_name text,
  email text,
  phone text,
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
         case when private.is_owner_of(patient.clinic_id) then auth_user.phone::text else null end,
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

do $$
declare
  v_signature regprocedure;
begin
  foreach v_signature in array array[
    'public.link_patient_account_by_phone(uuid,text,text,timestamp with time zone,boolean)'::regprocedure,
    'public.list_patient_account_links(uuid[])'::regprocedure
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_signature);
    execute format('grant execute on function %s to authenticated', v_signature);
  end loop;
end $$;

commit;
