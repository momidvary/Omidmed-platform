import { getSupabase } from "./client";
import type {
  PatientCase,
  Patient,
  ProgressEntry,
  Ticket,
} from "@/lib/types";

/*
 * Data-access layer: maps between the app's camelCase types and the
 * snake_case tables in database/schema.sql. Every function is a no-op
 * (returns null/false) when Supabase is not configured or unreachable,
 * so the app degrades gracefully to local mode.
 */

/**
 * Cap slow/unreachable DB reads so the UI can fall back to local mode
 * quickly instead of waiting out fetch retries.
 */
function withTimeout<T>(promise: PromiseLike<T>, ms = 4000): Promise<T | null> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/* ── Patients (portal) ─────────────────────────────────────────── */

export async function fetchPatientByNationalId(
  nationalId: string
): Promise<Patient | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const result = await withTimeout(
      supabase
      .from("patients")
      .select(
        `id, national_id, name_fa, age, condition_fa, therapist_note_fa, weekly_target,
         patient_program ( exercise_id, dosage_fa, days_per_week ),
         patient_progress ( date, pain_level, completed ),
         tickets ( id, exercise_id, subject, message, status, created_at,
                   ticket_replies ( id, sender, content, created_at ) )`
      )
        .eq("national_id", nationalId)
        .maybeSingle()
    );
    if (!result) return null;
    const { data: p, error } = result;
    if (error || !p) return null;

    return {
      id: p.id,
      nationalId: p.national_id,
      nameFa: p.name_fa,
      age: p.age ?? 0,
      conditionFa: p.condition_fa ?? "",
      therapistNoteFa: p.therapist_note_fa ?? "",
      weeklyTarget: p.weekly_target,
      program: (p.patient_program ?? []).map((row: Record<string, unknown>) => ({
        exerciseId: row.exercise_id as string,
        dosageFa: row.dosage_fa as string,
        daysPerWeek: row.days_per_week as number,
      })),
      progress: (p.patient_progress ?? [])
        .map((row: Record<string, unknown>) => ({
          date: row.date as string,
          painLevel: row.pain_level as number,
          completed: row.completed as boolean,
        }))
        .sort((a: ProgressEntry, b: ProgressEntry) =>
          a.date.localeCompare(b.date)
        ),
      tickets: (p.tickets ?? [])
        .map((row: Record<string, unknown>) => ({
          id: row.id as string,
          createdAt: row.created_at as string,
          exerciseId: (row.exercise_id as string) ?? null,
          subject: row.subject as string,
          message: row.message as string,
          status: row.status as Ticket["status"],
          replies: ((row.ticket_replies as Record<string, unknown>[]) ?? [])
            .map((r) => ({
              id: r.id as string,
              from: r.sender as "ai" | "therapist",
              content: r.content as string,
              createdAt: r.created_at as string,
            }))
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        }))
        .sort((a: Ticket, b: Ticket) => b.createdAt.localeCompare(a.createdAt)),
    };
  } catch {
    return null;
  }
}

export async function upsertProgress(
  patientId: string,
  entry: ProgressEntry
): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const { error } = await supabase.from("patient_progress").upsert(
      {
        patient_id: patientId,
        date: entry.date,
        pain_level: entry.painLevel,
        completed: entry.completed,
      },
      { onConflict: "patient_id,date" }
    );
    return !error;
  } catch {
    return false;
  }
}

export async function insertTicket(
  patientId: string,
  ticket: Ticket
): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const { error } = await supabase.from("tickets").insert({
      id: ticket.id,
      patient_id: patientId,
      exercise_id: ticket.exerciseId,
      subject: ticket.subject,
      message: ticket.message,
      status: ticket.status,
      created_at: ticket.createdAt,
    });
    if (error) return false;
    if (ticket.replies.length > 0) {
      await supabase.from("ticket_replies").insert(
        ticket.replies.map((r) => ({
          id: r.id,
          ticket_id: ticket.id,
          sender: r.from,
          content: r.content,
          created_at: r.createdAt,
        }))
      );
    }
    return true;
  } catch {
    return false;
  }
}

/* ── Clinician cases ───────────────────────────────────────────── */

export async function fetchCases(): Promise<PatientCase[] | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const result = await withTimeout(
      supabase
        .from("cases")
        .select("*")
        .order("created_at", { ascending: false })
    );
    if (!result) return null;
    const { data, error } = result;
    if (error || !data) return null;
    return data.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      name: row.name,
      age: row.age,
      gender: row.gender,
      mainComplaint: row.main_complaint,
      painLocation: row.pain_location ?? "",
      painIntensity: row.pain_intensity,
      duration: row.duration ?? "",
      mechanism: row.mechanism ?? "",
      aggravating: row.aggravating ?? "",
      easing: row.easing ?? "",
      medicalHistory: row.medical_history ?? "",
      surgicalHistory: row.surgical_history ?? "",
      imaging: row.imaging ?? "",
      medications: row.medications ?? "",
      functionalLimitations: row.functional_limitations ?? "",
      patientGoal: row.patient_goal ?? "",
      region: row.region ?? undefined,
    }));
  } catch {
    return null;
  }
}

export async function insertCase(c: PatientCase): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const { error } = await supabase.from("cases").insert({
      id: c.id,
      created_at: c.createdAt,
      name: c.name,
      age: c.age,
      gender: c.gender,
      region: c.region ?? null,
      main_complaint: c.mainComplaint,
      pain_location: c.painLocation,
      pain_intensity: c.painIntensity,
      duration: c.duration,
      mechanism: c.mechanism,
      aggravating: c.aggravating,
      easing: c.easing,
      medical_history: c.medicalHistory,
      surgical_history: c.surgicalHistory,
      imaging: c.imaging,
      medications: c.medications,
      functional_limitations: c.functionalLimitations,
      patient_goal: c.patientGoal,
    });
    return !error;
  } catch {
    return false;
  }
}
