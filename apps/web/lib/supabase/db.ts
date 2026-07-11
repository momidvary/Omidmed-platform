import { getSupabase } from "./client";
import type {
  PatientCase,
  Patient,
  ProgressEntry,
  Ticket,
} from "@/lib/types";

/*
 * Data-access layer for the authenticated schema (see database/migrations).
 * RLS scopes every query: staff see their clinic, patients see themselves.
 * Reads have a timeout; writes report to the save-status channel so the
 * UI can show Connected / Saving / Saved / Offline / Save failed.
 */

/* ── Save-status channel ───────────────────────────────────────── */

export type SaveStatus =
  | "connected"
  | "saving"
  | "saved"
  | "offline"
  | "save_failed";

const listeners = new Set<(s: SaveStatus) => void>();

export function subscribeSaveStatus(cb: (s: SaveStatus) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function report(status: SaveStatus) {
  listeners.forEach((cb) => cb(status));
}

/** Wrap a write: emits saving → saved / save_failed and returns success. */
async function trackedWrite(op: () => Promise<boolean>): Promise<boolean> {
  report("saving");
  try {
    const ok = await op();
    report(ok ? "saved" : "save_failed");
    return ok;
  } catch {
    report("save_failed");
    return false;
  }
}

function withTimeout<T>(promise: PromiseLike<T>, ms = 6000): Promise<T | null> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/* ── Patient portal (authenticated patient) ────────────────────── */

/**
 * Load the patient record linked to the signed-in user, with the most
 * recent active care episode and its program / progress / tickets.
 */
export async function fetchMyPatient(userId: string): Promise<Patient | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const linkResult = await withTimeout(
      supabase
        .from("patient_users")
        .select("patient_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle()
    );
    if (!linkResult) {
      report("offline");
      return null;
    }
    if (!linkResult.data) return null;
    const patientId = linkResult.data.patient_id as string;

    const result = await withTimeout(
      supabase
        .from("patients")
        .select(
          `id, full_name,
           care_episodes ( id, title_fa, therapist_note_fa, weekly_target, status, started_at,
             episode_program ( exercise_id, dosage_fa, days_per_week ),
             patient_daily_logs ( date, pain_level, completed ) ),
           tickets ( id, exercise_id, subject, message, status, created_at,
             ticket_replies ( id, sender, content, created_at ) )`
        )
        .eq("id", patientId)
        .maybeSingle()
    );
    if (!result) {
      report("offline");
      return null;
    }
    const p = result.data;
    if (!p) return null;

    type Row = Record<string, unknown>;
    const episodes = (p.care_episodes ?? []) as Row[];
    const active =
      episodes.find((e) => e.status === "active") ??
      episodes[episodes.length - 1];
    if (!active) return null;

    report("connected");
    return {
      id: p.id,
      episodeId: active.id as string,
      nationalId: "",
      nameFa: p.full_name,
      age: 0,
      conditionFa: (active.title_fa as string) ?? "",
      therapistNoteFa: (active.therapist_note_fa as string) ?? "",
      weeklyTarget: (active.weekly_target as number) ?? 5,
      program: ((active.episode_program as Row[]) ?? []).map((row) => ({
        exerciseId: row.exercise_id as string,
        dosageFa: row.dosage_fa as string,
        daysPerWeek: row.days_per_week as number,
      })),
      progress: ((active.patient_daily_logs as Row[]) ?? [])
        .map((row) => ({
          date: row.date as string,
          painLevel: row.pain_level as number,
          completed: row.completed as boolean,
        }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      tickets: ((p.tickets as Row[]) ?? [])
        .map((row) => ({
          id: row.id as string,
          createdAt: row.created_at as string,
          exerciseId: (row.exercise_id as string) ?? null,
          subject: row.subject as string,
          message: row.message as string,
          status: row.status as Ticket["status"],
          replies: ((row.ticket_replies as Row[]) ?? [])
            .map((r) => ({
              id: r.id as string,
              from: r.sender as "ai" | "therapist",
              content: r.content as string,
              createdAt: r.created_at as string,
            }))
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
  } catch {
    report("offline");
    return null;
  }
}

export function upsertProgress(
  episodeId: string,
  entry: ProgressEntry
): Promise<boolean> {
  return trackedWrite(async () => {
    const supabase = getSupabase();
    if (!supabase) return false;
    const { error } = await supabase.from("patient_daily_logs").upsert(
      {
        episode_id: episodeId,
        date: entry.date,
        pain_level: entry.painLevel,
        completed: entry.completed,
      },
      { onConflict: "episode_id,date" }
    );
    return !error;
  });
}

export function insertTicket(
  patientId: string,
  episodeId: string | null,
  ticket: Ticket,
  createdBy: string | null
): Promise<boolean> {
  return trackedWrite(async () => {
    const supabase = getSupabase();
    if (!supabase) return false;
    const { error } = await supabase.from("tickets").insert({
      id: ticket.id,
      patient_id: patientId,
      episode_id: episodeId,
      exercise_id: ticket.exerciseId,
      subject: ticket.subject,
      message: ticket.message,
      status: ticket.status,
      created_by: createdBy,
      created_at: ticket.createdAt,
    });
    // Replies are NOT inserted from the browser: RLS forbids sender='ai'
    // for clients. The AI auto-reply is created by the server route
    // /api/tickets/ai-reply using the service key.
    return !error;
  });
}

/**
 * Ask the server to attach the AI triage reply to a ticket. Returns the
 * created reply, or null when the server AI key isn't configured.
 */
export async function requestAiReply(
  ticketId: string,
  message: string
): Promise<{ id: string; content: string; createdAt: string } | null> {
  try {
    const res = await fetch("/api/tickets/ai-reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId, message }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      reply?: { id: string; content: string; createdAt: string };
    };
    return json.reply ?? null;
  } catch {
    return null;
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
    if (!result) {
      report("offline");
      return null;
    }
    const { data, error } = result;
    if (error || !data) return null;
    report("connected");
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
    report("offline");
    return null;
  }
}

export function insertCase(
  c: PatientCase,
  clinicId: string,
  createdBy: string
): Promise<boolean> {
  return trackedWrite(async () => {
    const supabase = getSupabase();
    if (!supabase) return false;
    const { error } = await supabase.from("cases").insert({
      id: c.id,
      clinic_id: clinicId,
      created_by: createdBy,
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
  });
}
