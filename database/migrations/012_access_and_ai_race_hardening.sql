-- Follow-up access hardening and clinical-AI race protection.
-- Run after 011_treatment_plan_validation.sql.

begin;

-- Membership helpers must also respect the user's current global role. This
-- prevents stale/mismatched membership rows from silently restoring access.
create or replace function private.is_member_of(p_clinic uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clinic_members membership
    join public.profiles profile on profile.id = membership.user_id
    where membership.clinic_id = p_clinic
      and membership.user_id = auth.uid()
      and (
        (membership.member_role = 'clinic_owner' and profile.role = 'clinic_owner')
        or (
          membership.member_role = 'therapist'
          and profile.role in ('clinic_owner', 'therapist')
        )
        or (
          membership.member_role = 'clinic_staff'
          and profile.role = 'clinic_staff'
        )
      )
  );
$$;

create or replace function private.is_owner_of(p_clinic uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clinic_members membership
    join public.profiles profile on profile.id = membership.user_id
    where membership.clinic_id = p_clinic
      and membership.user_id = auth.uid()
      and membership.member_role = 'clinic_owner'
      and profile.role = 'clinic_owner'
  );
$$;

create or replace function private.is_staff_of(p_clinic uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clinic_members membership
    join public.profiles profile on profile.id = membership.user_id
    where membership.clinic_id = p_clinic
      and membership.user_id = auth.uid()
      and membership.member_role = 'clinic_staff'
      and profile.role = 'clinic_staff'
  );
$$;

create or replace function private.is_assigned_therapist(p_patient uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.patient_therapists assignment
    join public.patients patient on patient.id = assignment.patient_id
    join public.clinic_members membership
      on membership.clinic_id = patient.clinic_id
     and membership.user_id = assignment.therapist_id
     and membership.member_role = 'therapist'
    join public.profiles profile on profile.id = assignment.therapist_id
    where assignment.patient_id = p_patient
      and assignment.therapist_id = auth.uid()
      and profile.role in ('clinic_owner', 'therapist')
  );
$$;

create or replace function private.guard_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is not distinct from old.role then
    return new;
  end if;

  if auth.uid() is not null then
    if auth.uid() = old.id then
      raise exception using errcode = '42501', message = 'Users cannot change their own global role';
    end if;
    if not private.is_platform_admin() then
      raise exception using errcode = '42501', message = 'Only a platform admin can change roles';
    end if;
  end if;

  if (old.role = 'platform_admin' or new.role = 'platform_admin')
     and exists (
       select 1 from public.clinic_members membership
       where membership.user_id = old.id
     ) then
    raise exception using
      errcode = '23514',
      message = 'Remove every clinic membership before entering or leaving the platform_admin role';
  end if;
  return new;
end;
$$;

create or replace function private.reject_platform_admin_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.profiles profile
    where profile.id = new.user_id and profile.role = 'platform_admin'
  ) then
    raise exception using
      errcode = '23514',
      message = 'A platform administrator cannot also hold clinic membership';
  end if;
  return new;
end;
$$;

revoke all on function private.reject_platform_admin_membership() from public;

-- Do not silently carry a forbidden legacy overlap into the new policy. An
-- operator must explicitly remove the membership and rerun this migration.
do $$
begin
  if exists (
    select 1
    from public.clinic_members membership
    join public.profiles profile on profile.id = membership.user_id
    where profile.role = 'platform_admin'
  ) then
    raise exception using
      errcode = '23514',
      message = 'Remove platform administrator clinic memberships before applying migration 012';
  end if;
end;
$$;

drop trigger if exists clinic_members_reject_platform_admin
  on public.clinic_members;
create trigger clinic_members_reject_platform_admin
before insert or update of user_id on public.clinic_members
for each row execute function private.reject_platform_admin_membership();

-- Explicit-user authorization used by service-only AI operations. It mirrors
-- clinician case access without depending on the service role's auth.uid().
create or replace function private.clinician_can_access_ai_case(
  p_user_id uuid,
  p_case_id uuid,
  p_clinic_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.cases patient_case
    join public.profiles profile on profile.id = p_user_id
    join public.clinic_members membership
      on membership.clinic_id = patient_case.clinic_id
     and membership.user_id = p_user_id
    where patient_case.id = p_case_id
      and patient_case.clinic_id = p_clinic_id
      and profile.role in ('clinic_owner', 'therapist')
      and membership.member_role in ('clinic_owner', 'therapist')
      and (
        (
          profile.role = 'clinic_owner'
          and membership.member_role = 'clinic_owner'
        )
        or exists (
          select 1
          from public.patient_therapists assignment
          where assignment.patient_id = patient_case.patient_id
            and assignment.therapist_id = p_user_id
        )
      )
  );
$$;

create or replace function private.can_read_ai_audit(
  p_requested_by uuid,
  p_case_id uuid,
  p_clinic_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not private.is_platform_admin()
    and private.clinician_can_access_ai_case(
      auth.uid(), p_case_id, p_clinic_id
    )
    and (
      p_requested_by = auth.uid()
      or private.is_owner_of(p_clinic_id)
    );
$$;

drop policy if exists "ai audit requester or clinic owner read"
  on public.ai_generation_audits;
create policy "ai audit requester or clinic owner read"
  on public.ai_generation_audits for select to authenticated
  using (private.can_read_ai_audit(requested_by, case_id, clinic_id));

drop policy if exists "ai review visible with audit"
  on public.ai_generation_reviews;
create policy "ai review visible with audit"
  on public.ai_generation_reviews for select to authenticated
  using (
    exists (
      select 1
      from public.ai_generation_audits audit
      where audit.id = ai_generation_reviews.audit_id
        and private.can_read_ai_audit(
          audit.requested_by, audit.case_id, audit.clinic_id
        )
    )
  );

-- Recheck authorization and safety inside the reservation transaction and
-- again when the provider result returns. If either changed while the model
-- was running, convert the completion to a refused audit and discard output.
create or replace function private.guard_ai_generation_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.cases%rowtype;
  v_must_validate boolean := false;
  v_valid boolean := false;
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    v_must_validate := true;
  elsif tg_op = 'UPDATE'
        and old.status = 'pending'
        and new.status = 'generated' then
    v_must_validate := true;
  end if;
  if not v_must_validate then
    return new;
  end if;

  select patient_case.* into v_case
  from public.cases patient_case
  where patient_case.id = new.case_id
    and patient_case.clinic_id = new.clinic_id
  for share;

  v_valid := found
    and v_case.safety_screened_at is not null
    and v_case.safety_disposition = 'clear'
    and cardinality(v_case.red_flag_ids) = 0
    and private.clinician_can_access_ai_case(
      new.requested_by, new.case_id, new.clinic_id
    );

  if v_valid then
    return new;
  end if;
  if tg_op = 'INSERT' then
    raise exception using
      errcode = '23514',
      message = 'Current case safety and clinician access are required for AI reservation';
  end if;

  new.status := 'refused';
  new.output := null;
  new.error_code := 'authorization_or_safety_changed';
  new.completed_at := coalesce(new.completed_at, clock_timestamp());
  return new;
end;
$$;

revoke all on function private.guard_ai_generation_transition() from public;
drop trigger if exists ai_generation_guard_transition
  on public.ai_generation_audits;
create trigger ai_generation_guard_transition
before insert or update of status, output on public.ai_generation_audits
for each row execute function private.guard_ai_generation_transition();

create or replace function private.guard_ai_generation_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_audit public.ai_generation_audits%rowtype;
  v_case public.cases%rowtype;
begin
  select audit.* into v_audit
  from public.ai_generation_audits audit
  where audit.id = new.audit_id
  for share;
  if not found or v_audit.status <> 'generated' then
    raise exception using errcode = '23514', message = 'AI generation is not reviewable';
  end if;

  select patient_case.* into v_case
  from public.cases patient_case
  where patient_case.id = v_audit.case_id
    and patient_case.clinic_id = v_audit.clinic_id
  for share;
  if not found
     or v_case.safety_screened_at is null
     or v_case.safety_disposition <> 'clear'
     or cardinality(v_case.red_flag_ids) <> 0
     or not private.clinician_can_access_ai_case(
       new.reviewer_id, v_audit.case_id, v_audit.clinic_id
     )
     or not (
       new.reviewer_id = v_audit.requested_by
       or exists (
         select 1
         from public.profiles profile
         join public.clinic_members membership
           on membership.user_id = profile.id
          and membership.clinic_id = v_audit.clinic_id
         where profile.id = new.reviewer_id
           and profile.role = 'clinic_owner'
           and membership.member_role = 'clinic_owner'
       )
     ) then
    raise exception using
      errcode = '23514',
      message = 'Current case safety and clinician access are required for AI review';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_ai_generation_review() from public;
drop trigger if exists ai_generation_review_guard
  on public.ai_generation_reviews;
create trigger ai_generation_review_guard
before insert on public.ai_generation_reviews
for each row execute function private.guard_ai_generation_review();

revoke all on function private.clinician_can_access_ai_case(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.can_read_ai_audit(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
-- RLS policies execute as the querying role, so this one guarded helper must
-- remain executable by authenticated. It returns no row contents itself and
-- rechecks current case access before permitting the policy row.
grant execute on function private.can_read_ai_audit(uuid, uuid, uuid)
  to authenticated;

commit;
