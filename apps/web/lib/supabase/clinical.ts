import { getSupabase } from "./client";
import { reportSaveStatus, trackedWrite } from "./db";
import type { MetricTemplate } from "@/lib/data/clinicalTemplates";

/*
 * Data layer for the clinical module (Supabase mode only — these pages
 * require the database; there is no localStorage fallback). RLS scopes
 * everything: forged clinic_id/therapist_id values are rejected by the
 * database, not just by this code.
 */

export interface PatientRow {
  id: string;
  clinic_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone_e164: string | null;
  date_of_birth: string | null;
  gender: string | null;
  national_id: string | null;
  preferred_language: string;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  general_notes: string | null;
  status: string;
  created_at: string;
  care_episodes?: EpisodeRow[];
  /** Flattened from patient_clinical_background (014). clinic_staff has
   *  no read access to these — they arrive as null for staff. */
  medical_history?: string | null;
  surgical_history?: string | null;
  medications?: string | null;
  allergies?: string | null;
}

export interface ClinicalBackgroundInput {
  medical_history?: string | null;
  surgical_history?: string | null;
  medications?: string | null;
  allergies?: string | null;
}

export interface EpisodeRow {
  id: string;
  clinic_id: string;
  patient_id: string;
  title: string | null;
  referral_diagnosis: string | null;
  therapist_diagnosis: string | null;
  body_region: string | null;
  side: string | null;
  injury_date: string | null;
  surgery_date: string | null;
  referring_physician: string | null;
  primary_therapist_id: string | null;
  planned_session_count: number | null;
  short_term_goals: string | null;
  long_term_goals: string | null;
  precautions: string | null;
  status: string;
  discharge_date: string | null;
  discharge_reason: string | null;
  reopen_note: string | null;
  created_at: string;
  sessions?: SessionRow[];
}

export interface SessionRow {
  id: string;
  care_episode_id: string;
  patient_id: string;
  session_number: number | null;
  session_date: string | null;
  status: string;
  therapist_id: string | null;
  subjective_report: string | null;
  pain_at_rest: number | null;
  pain_during_activity: number | null;
  night_pain: boolean | null;
  medication_changes: string | null;
  functional_complaints: string | null;
  exercise_adherence: string | null;
  objective_findings: string | null;
  interventions: string | null;
  patient_response: string | null;
  adverse_reactions: string | null;
  home_exercise_updates: string | null;
  next_session_plan: string | null;
  patient_visible_summary: string | null;
  therapist_private_notes: string | null;
  finalised_at: string | null;
  created_at: string;
}

export interface AssessmentRow {
  id: string;
  care_episode_id: string;
  patient_id: string;
  clinic_id: string;
  kind: string;
  template_key: string;
  subjective: Record<string, unknown>;
  safety: Record<string, unknown>;
  objective: Record<string, unknown>;
  clinical_summary: Record<string, unknown>;
  planned_reassessment_date: string | null;
  status: string;
  finalised_at: string | null;
}

export interface MetricDefRow {
  id: string;
  clinic_id: string;
  name_key: string;
  custom_name: string | null;
  data_type: string;
  unit: string | null;
  minimum_value: number | null;
  maximum_value: number | null;
  direction: string;
  target_value: number | null;
  patient_visible: boolean;
}

export interface MeasurementRow {
  id: string;
  care_episode_id: string;
  metric_definition_id: string | null;
  numeric_value: number | null;
  categorical_value: string | null;
  boolean_value: boolean | null;
  text_value: string | null;
  unit: string | null;
  measured_at: string;
  note: string | null;
}

function db() {
  return getSupabase();
}

/* ── Patients ──────────────────────────────────────────────────── */

export async function listPatients(): Promise<PatientRow[] | null> {
  const client = db();
  if (!client) return null;
  const { data, error } = await client
    .from("patients")
    .select(
      `*, care_episodes ( id, status, planned_session_count, primary_therapist_id,
          sessions ( id, status, session_date ) )`
    )
    .order("created_at", { ascending: false });
  if (error) {
    reportSaveStatus("offline");
    return null;
  }
  reportSaveStatus("connected");
  return data as PatientRow[];
}

/** Duplicate phones within a clinic require an explicit confirmation. */
export async function findDuplicatePhone(
  clinicId: string,
  phoneE164: string
): Promise<PatientRow[] | null> {
  const client = db();
  if (!client) return null;
  const { data } = await client
    .from("patients")
    .select("id, first_name, last_name, full_name, status")
    .eq("clinic_id", clinicId)
    .eq("phone_e164", phoneE164);
  return (data as PatientRow[]) ?? [];
}

export async function createPatient(
  input: Partial<PatientRow> & { clinic_id: string; created_by: string },
  clinical?: ClinicalBackgroundInput
): Promise<{ id: string } | null> {
  const client = db();
  if (!client) return null;
  let created: { id: string } | null = null;
  const ok = await trackedWrite(async () => {
    const { data, error } = await client
      .from("patients")
      .insert(input)
      .select("id")
      .single();
    if (error || !data) return false;
    created = data as { id: string };
    // Clinical background lives in its own table (014) with stricter
    // RLS: clinic_staff cannot write it (the form hides these fields
    // for staff, and the database enforces it regardless).
    const hasClinical =
      clinical && Object.values(clinical).some((v) => v && String(v).trim());
    if (hasClinical) {
      const { error: bgError } = await client
        .from("patient_clinical_background")
        .insert({
          patient_id: created.id,
          clinic_id: input.clinic_id,
          ...clinical,
        });
      if (bgError) return false;
    }
    return true;
  });
  return ok ? created : null;
}

export async function updatePatient(
  id: string,
  patch: Partial<PatientRow>
): Promise<boolean> {
  const client = db();
  if (!client) return false;
  return trackedWrite(async () => {
    const { error } = await client.from("patients").update(patch).eq("id", id);
    return !error;
  });
}

export async function getPatient(id: string): Promise<PatientRow | null> {
  const client = db();
  if (!client) return null;
  const { data, error } = await client
    .from("patients")
    .select(
      `*, care_episodes ( *, sessions ( id, status, session_date, session_number ) ),
       patient_clinical_background ( medical_history, surgical_history, medications, allergies )`
    )
    .eq("id", id)
    .maybeSingle();
  if (error) {
    reportSaveStatus("offline");
    return null;
  }
  if (!data) return null;
  // Flatten the clinical background (null for clinic_staff: RLS hides it).
  const row = data as PatientRow & {
    patient_clinical_background?: ClinicalBackgroundInput | ClinicalBackgroundInput[] | null;
  };
  const bg = Array.isArray(row.patient_clinical_background)
    ? row.patient_clinical_background[0]
    : row.patient_clinical_background;
  return {
    ...row,
    medical_history: bg?.medical_history ?? null,
    surgical_history: bg?.surgical_history ?? null,
    medications: bg?.medications ?? null,
    allergies: bg?.allergies ?? null,
  };
}

/* ── Episodes ──────────────────────────────────────────────────── */

export async function createEpisode(
  input: Partial<EpisodeRow> & {
    clinic_id: string;
    patient_id: string;
    title: string;
    created_by: string;
  }
): Promise<{ id: string } | null> {
  const client = db();
  if (!client) return null;
  let created: { id: string } | null = null;
  const ok = await trackedWrite(async () => {
    const { data, error } = await client
      .from("care_episodes")
      // title_fa mirrors title for backward compatibility with 001.
      .insert({ ...input, title_fa: input.title })
      .select("id")
      .single();
    if (error || !data) return false;
    created = data as { id: string };
    return true;
  });
  return ok ? created : null;
}

export async function updateEpisode(
  id: string,
  patch: Partial<EpisodeRow>
): Promise<boolean> {
  const client = db();
  if (!client) return false;
  return trackedWrite(async () => {
    const { error } = await client
      .from("care_episodes")
      .update(patch)
      .eq("id", id);
    return !error;
  });
}

export async function getEpisode(id: string): Promise<
  | {
      episode: EpisodeRow;
      sessions: SessionRow[];
      assessments: AssessmentRow[];
      measurements: MeasurementRow[];
      metricDefs: MetricDefRow[];
    }
  | null
> {
  const client = db();
  if (!client) return null;
  const { data: episode, error } = await client
    .from("care_episodes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !episode) {
    if (error) reportSaveStatus("offline");
    return null;
  }
  const [sessions, assessments, measurements, defs] = await Promise.all([
    client
      .from("sessions")
      .select("*")
      .eq("care_episode_id", id)
      .order("session_number", { ascending: true }),
    client.from("assessments").select("*").eq("care_episode_id", id),
    client
      .from("clinical_measurements")
      .select("*")
      .eq("care_episode_id", id)
      .order("measured_at", { ascending: true }),
    client
      .from("progress_metric_definitions")
      .select("*")
      .eq("clinic_id", (episode as EpisodeRow).clinic_id),
  ]);
  return {
    episode: episode as EpisodeRow,
    sessions: (sessions.data as SessionRow[]) ?? [],
    assessments: (assessments.data as AssessmentRow[]) ?? [],
    measurements: (measurements.data as MeasurementRow[]) ?? [],
    metricDefs: (defs.data as MetricDefRow[]) ?? [],
  };
}

/* ── Assessments ───────────────────────────────────────────────── */

export async function saveAssessment(
  input: Partial<AssessmentRow> & {
    clinic_id: string;
    patient_id: string;
    care_episode_id: string;
  },
  id?: string
): Promise<{ id: string } | null> {
  const client = db();
  if (!client) return null;
  let saved: { id: string } | null = id ? { id } : null;
  const ok = await trackedWrite(async () => {
    if (id) {
      const { error } = await client
        .from("assessments")
        .update(input)
        .eq("id", id);
      return !error;
    }
    const { data, error } = await client
      .from("assessments")
      .insert(input)
      .select("id")
      .single();
    if (error || !data) return false;
    saved = data as { id: string };
    return true;
  });
  return ok ? saved : null;
}

/* ── Sessions ──────────────────────────────────────────────────── */

export async function saveSession(
  input: Partial<SessionRow> & {
    clinic_id?: string;
    patient_id?: string;
    care_episode_id?: string;
  },
  id?: string
): Promise<{ id: string } | null> {
  const client = db();
  if (!client) return null;
  let saved: { id: string } | null = id ? { id } : null;
  const ok = await trackedWrite(async () => {
    if (id) {
      const { error } = await client.from("sessions").update(input).eq("id", id);
      return !error;
    }
    const { data, error } = await client
      .from("sessions")
      .insert(input)
      .select("id")
      .single();
    if (error || !data) return false;
    saved = data as { id: string };
    return true;
  });
  return ok ? saved : null;
}

/* ── Metrics & measurements ────────────────────────────────────── */

/** Ensure clinic-level metric definitions exist for the given templates
 *  (idempotent by (clinic_id, name_key)). Returns all clinic defs. */
export async function ensureMetricDefs(
  clinicId: string,
  createdBy: string,
  templates: MetricTemplate[],
  locale: string
): Promise<MetricDefRow[] | null> {
  const client = db();
  if (!client) return null;
  const rows = templates.map((t) => ({
    clinic_id: clinicId,
    name_key: t.nameKey,
    custom_name: t.label[(locale as "en") ?? "en"] ?? t.label.en,
    data_type: t.dataType,
    unit: t.unit,
    minimum_value: t.min ?? null,
    maximum_value: t.max ?? null,
    direction: t.direction,
    patient_visible: t.patientVisible ?? false,
    created_by: createdBy,
  }));
  const ok = await trackedWrite(async () => {
    const { error } = await client
      .from("progress_metric_definitions")
      .upsert(rows, { onConflict: "clinic_id,name_key", ignoreDuplicates: true });
    return !error;
  });
  if (!ok) return null;
  const { data } = await client
    .from("progress_metric_definitions")
    .select("*")
    .eq("clinic_id", clinicId);
  return (data as MetricDefRow[]) ?? [];
}

export async function addMeasurement(input: {
  clinic_id: string;
  patient_id: string;
  care_episode_id: string;
  session_id?: string | null;
  metric_definition_id: string;
  numeric_value?: number | null;
  categorical_value?: string | null;
  boolean_value?: boolean | null;
  text_value?: string | null;
  unit?: string | null;
  measured_at?: string;
  therapist_id: string;
  note?: string | null;
  created_by: string;
}): Promise<boolean> {
  const client = db();
  if (!client) return false;
  return trackedWrite(async () => {
    const { error } = await client.from("clinical_measurements").insert(input);
    return !error;
  });
}
