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
