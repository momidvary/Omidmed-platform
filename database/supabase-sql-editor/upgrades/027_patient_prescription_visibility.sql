-- GENERATED FILE — do not edit. Rebuild with:
--   node database/scripts/build-sql-editor-bundle.mjs
--
-- Upgrade for projects installed from the SQL Editor bundle: applies
-- 027_patient_prescription_visibility.sql once and records it in public.schema_migrations
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
  execute $q$select status from public.schema_migrations where version = '026'$q$ into v_previous;
  execute $q$select status from public.schema_migrations where version = '027'$q$ into v_this;
  if v_this = 'applied' then
    raise exception using errcode = '55000',
      message = 'Already applied: 027_patient_prescription_visibility.sql. Nothing to do.';
  end if;
  if v_this is not null then
    raise exception using errcode = '55000',
      message = 'A previous run of 027_patient_prescription_visibility.sql stopped part-way. Ask for help before retrying.';
  end if;
  if v_previous is distinct from 'applied' then
    raise exception using errcode = '55000',
      message = 'Apply 026_auth_email_type_fix.sql first.';
  end if;
end
$preflight$;

insert into public.schema_migrations (version, filename, checksum, status)
values ('027', '027_patient_prescription_visibility.sql', '19b43e8e2a90c6469d2fdf7d6b0bb660740af884619598ca3f81f1345a67662c', 'applying');

-- PhysioAI — Migration 027: patients can see their published prescription
-- (run after 026).
--
-- The patient branch of "prescriptions scoped read" / "prescription items
-- scoped read" (migration 013) requires the linked case to have a clear
-- safety screen via `exists (select … from public.cases …)`. That subquery
-- runs under the PATIENT's RLS, and patients may never read clinician
-- cases — so it was always empty and no patient ever saw a published
-- programme. CI only asserted the negative case (no prescription after an
-- urgent re-screen), so the bug was invisible there.
--
-- Fix: move the identical patient-visibility rule into a SECURITY DEFINER
-- helper that reads the case itself, and use it from both policies. The
-- conditions are unchanged: published, linked patient, active episode,
-- inside the start/end dates, case screened clear with no red flags.

begin;

create or replace function private.is_patient_visible_prescription(
  p_prescription_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.exercise_prescriptions prescription
    join public.cases patient_case on patient_case.id = prescription.case_id
    where prescription.id = p_prescription_id
      and prescription.status = 'published'
      and private.is_linked_patient(prescription.patient_id)
      and private.is_active_episode_for_patient(
        prescription.episode_id, prescription.patient_id
      )
      and prescription.start_date <= current_date
      and (prescription.end_date is null or prescription.end_date >= current_date)
      and patient_case.safety_screened_at is not null
      and patient_case.safety_disposition = 'clear'
      and cardinality(patient_case.red_flag_ids) = 0
  );
$$;

revoke all on function private.is_patient_visible_prescription(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.is_patient_visible_prescription(uuid)
  to authenticated;

drop policy if exists "prescriptions scoped read"
  on public.exercise_prescriptions;
create policy "prescriptions scoped read"
  on public.exercise_prescriptions for select to authenticated
  using (
    private.can_manage_clinical_record(patient_id)
    or private.is_patient_visible_prescription(id)
  );

drop policy if exists "prescription items scoped read"
  on public.prescription_items;
create policy "prescription items scoped read"
  on public.prescription_items for select to authenticated
  using (
    exists (
      select 1
      from public.exercise_prescriptions prescription
      where prescription.id = prescription_items.prescription_id
        and (
          private.can_manage_clinical_record(prescription.patient_id)
          or private.is_patient_visible_prescription(prescription.id)
        )
    )
  );

commit;

update public.schema_migrations
set status = 'applied', applied_at = clock_timestamp()
where version = '027' and status = 'applying';

select '027_patient_prescription_visibility.sql applied' as result;
