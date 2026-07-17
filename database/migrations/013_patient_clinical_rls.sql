-- PhysioAI — Migration 013: RLS for the clinical module. Run AFTER 012.
-- No anon policies. Authorization only via auth.uid() + profiles +
-- clinic_members + patient_users + patient_therapists (browser-sent
-- clinic_id/therapist_id are never trusted).

-- Staff-side view of a patient (excludes the linked patient account):
create or replace function public.staff_can_view_patient(p_patient uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin()
    or public.is_member_of(public.patient_clinic(p_patient))
    or public.is_assigned_therapist(p_patient);
$$;

-- ── audit_logs: platform_admin + clinic owner (own clinic) read ──
drop policy if exists "audit read" on audit_logs;
create policy "audit read" on audit_logs for select
  using (public.is_platform_admin()
         or (clinic_id is not null and public.is_owner_of(clinic_id)));
-- (no insert/update/delete policies: rows are written only by the
--  security-definer write_audit() trigger path)

-- ── assessments: clinical record. Staff may READ (essential info),
--    only owner/assigned therapist/admin may WRITE. Patients have NO
--    access (confidential therapist content lives here). ─────────
drop policy if exists "assessments read" on assessments;
create policy "assessments read" on assessments for select
  using (public.staff_can_view_patient(patient_id));
drop policy if exists "assessments write" on assessments;
create policy "assessments write" on assessments for all
  using (public.can_manage_clinical_record(patient_id))
  with check (
    public.can_manage_clinical_record(patient_id)
    and (created_by is null or created_by = auth.uid() or public.is_platform_admin()
         or public.is_owner_of(clinic_id))
  );

-- ── sessions: patients must NOT read the base table any more (it now
--    carries therapist_private_notes). Staff read; clinical managers
--    write; a dedicated view exposes the patient-safe subset. ─────
drop policy if exists "sessions read" on sessions;
create policy "sessions read" on sessions for select
  using (public.staff_can_view_patient(patient_id));
drop policy if exists "sessions manage" on sessions;
create policy "sessions manage" on sessions for all
  using (public.can_manage_clinical_record(patient_id))
  with check (
    public.can_manage_clinical_record(patient_id)
    and (therapist_id is null or therapist_id = auth.uid()
         or public.is_platform_admin()
         or public.is_owner_of(clinic_id))
  );

-- Patient-safe session summaries (owner bypasses RLS; the WHERE clause
-- is the security boundary — only the linked patient's own rows).
create or replace view patient_session_summaries as
  select s.id, s.care_episode_id, s.patient_id, s.session_number,
         s.session_date, s.status, s.patient_visible_summary
  from sessions s
  where public.is_linked_patient(s.patient_id)
    and s.status = 'completed';
grant select on patient_session_summaries to authenticated;

-- ── progress_metric_definitions: clinic staff read; clinical roles
--    manage. Patients read only patient-visible definitions of their
--    own clinic (needed to label their charts later). ─────────────
drop policy if exists "metric defs read" on progress_metric_definitions;
create policy "metric defs read" on progress_metric_definitions for select
  using (
    public.is_platform_admin()
    or public.is_member_of(clinic_id)
    or (patient_visible and exists (
      select 1 from patient_users pu
      join patients p on p.id = pu.patient_id
      where pu.user_id = auth.uid() and p.clinic_id = progress_metric_definitions.clinic_id
    ))
  );
drop policy if exists "metric defs manage" on progress_metric_definitions;
create policy "metric defs manage" on progress_metric_definitions for all
  using (public.is_platform_admin()
         or (public.is_member_of(clinic_id) and not public.is_staff_of(clinic_id)))
  with check (public.is_platform_admin()
              or (public.is_member_of(clinic_id) and not public.is_staff_of(clinic_id)));

-- ── clinical_measurements: replace 003's policies with the richer
--    model — patients read ONLY patient_visible metrics of their own
--    episodes; staff (clinic_staff) read but never write. ─────────
drop policy if exists "measurements read" on clinical_measurements;
create policy "measurements read" on clinical_measurements for select
  using (
    public.staff_can_view_patient(patient_id)
    or (
      public.is_linked_patient(patient_id)
      and exists (
        select 1 from progress_metric_definitions d
        where d.id = clinical_measurements.metric_definition_id
          and d.patient_visible
      )
    )
  );
drop policy if exists "measurements write" on clinical_measurements;
create policy "measurements write" on clinical_measurements for all
  using (public.can_manage_clinical_record(patient_id))
  with check (
    public.can_manage_clinical_record(patient_id)
    and (therapist_id = auth.uid() or public.is_platform_admin()
         or public.is_owner_of(clinic_id))
  );
