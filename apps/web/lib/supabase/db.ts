import { getSupabase } from "./client";
import type {
  CareEpisode,
  ClinicMember,
  ClinicTicket,
  PatientCase,
  Patient,
  PatientListItem,
  PatientRecord,
  PrescribedExercise,
  ProgressEntry,
  Ticket,
  TicketReply,
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
 *
 * Only the ticket id is sent: the server reads the message from the
 * stored row, so the reply can never be generated from text the client
 * made up. Safe to call twice — the route returns the existing reply.
 */
export async function requestAiReply(
  ticketId: string
): Promise<{ id: string; content: string; createdAt: string } | null> {
  try {
    const res = await fetch("/api/tickets/ai-reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId }),
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

/* ── Clinician workspace ───────────────────────────────────────── */

type Row = Record<string, unknown>;

/** Supabase returns an embedded to-one relation as an object or a 1-array. */
function one<T>(v: T | T[] | null | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}

/**
 * Every write below returns a message on failure instead of a bare false.
 * A rejection here is usually RLS, and "Save failed" tells the user
 * nothing they can act on.
 */
export type WriteResult = { ok: true } | { ok: false; message: string };

const ok: WriteResult = { ok: true };
const fail = (message: string): WriteResult => ({ ok: false, message });

async function write(
  op: () => Promise<{ error: { message: string } | null }>
): Promise<WriteResult> {
  report("saving");
  try {
    const { error } = await op();
    report(error ? "save_failed" : "saved");
    return error ? fail(humanise(error.message)) : ok;
  } catch (e) {
    report("save_failed");
    return fail(e instanceof Error ? humanise(e.message) : "Unexpected error.");
  }
}

/** Turn Postgres/PostgREST noise into something a clinician can act on. */
function humanise(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("row-level security") || m.includes("violates row-level")) {
    return "You do not have permission for this. You may need to be assigned to this patient, or ask a clinic owner.";
  }
  if (m.includes("duplicate key") || m.includes("already exists")) {
    return "That entry already exists.";
  }
  if (m.includes("failed to fetch") || m.includes("networkerror")) {
    return "Could not reach the server. Your input has been kept — try again.";
  }
  return message;
}

/** Patient list for one clinic, with the bits the list actually shows. */
export async function fetchClinicPatients(
  clinicId: string,
  myUserId: string
): Promise<PatientListItem[] | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const result = await withTimeout(
      supabase
        .from("patients")
        .select(
          `id, full_name, phone, birth_year, created_at,
           patient_users ( user_id ),
           patient_therapists ( therapist_id ),
           care_episodes ( title_fa, status ),
           tickets ( status )`
        )
        .eq("clinic_id", clinicId)
        .order("created_at", { ascending: false })
    );
    if (!result) {
      report("offline");
      return null;
    }
    const { data, error } = result;
    if (error || !data) return null;
    report("connected");
    return (data as Row[]).map((p) => {
      const episodes = (p.care_episodes as Row[]) ?? [];
      const active = episodes.find((e) => e.status === "active") ?? episodes[0];
      return {
        id: p.id as string,
        fullName: p.full_name as string,
        phone: (p.phone as string) ?? null,
        birthYear: (p.birth_year as number) ?? null,
        createdAt: p.created_at as string,
        activeEpisodeTitle: (active?.title_fa as string) ?? null,
        hasLinkedAccount: ((p.patient_users as Row[]) ?? []).length > 0,
        isMine: ((p.patient_therapists as Row[]) ?? []).some(
          (t) => t.therapist_id === myUserId
        ),
        openTickets: ((p.tickets as Row[]) ?? []).filter(
          (t) => t.status === "open"
        ).length,
      };
    });
  } catch {
    report("offline");
    return null;
  }
}

/** One patient with everything the detail page renders. */
export async function fetchPatientRecord(
  patientId: string
): Promise<PatientRecord | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const result = await withTimeout(
      supabase
        .from("patients")
        .select(
          `id, clinic_id, full_name, national_id, phone, birth_year, gender, created_at,
           patient_therapists ( therapist_id ),
           patient_users ( user_id, profiles ( full_name, email ) ),
           care_episodes ( id, title_fa, therapist_note_fa, weekly_target, status, started_at,
             episode_program ( exercise_id, dosage_fa, days_per_week ),
             patient_daily_logs ( date, pain_level, completed ) )`
        )
        .eq("id", patientId)
        .maybeSingle()
    );
    if (!result) {
      report("offline");
      return null;
    }
    const p = result.data as Row | null;
    if (!p) return null;
    report("connected");

    const episodes = ((p.care_episodes as Row[]) ?? [])
      .map<CareEpisode>((e) => ({
        id: e.id as string,
        titleFa: e.title_fa as string,
        therapistNoteFa: (e.therapist_note_fa as string) ?? "",
        weeklyTarget: (e.weekly_target as number) ?? 5,
        status: e.status as CareEpisode["status"],
        startedAt: e.started_at as string,
        program: ((e.episode_program as Row[]) ?? []).map((r) => ({
          exerciseId: r.exercise_id as string,
          dosageFa: r.dosage_fa as string,
          daysPerWeek: r.days_per_week as number,
        })),
        progress: ((e.patient_daily_logs as Row[]) ?? [])
          .map((r) => ({
            date: r.date as string,
            painLevel: r.pain_level as number,
            completed: r.completed as boolean,
          }))
          .sort((a, b) => a.date.localeCompare(b.date)),
      }))
      // Active episodes first, then most recently started.
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "active" ? -1 : 1;
        return b.startedAt.localeCompare(a.startedAt);
      });

    return {
      id: p.id as string,
      clinicId: p.clinic_id as string,
      fullName: p.full_name as string,
      nationalId: (p.national_id as string) ?? null,
      phone: (p.phone as string) ?? null,
      birthYear: (p.birth_year as number) ?? null,
      gender: (p.gender as PatientRecord["gender"]) ?? null,
      createdAt: p.created_at as string,
      therapistIds: ((p.patient_therapists as Row[]) ?? []).map(
        (t) => t.therapist_id as string
      ),
      linkedUsers: ((p.patient_users as Row[]) ?? []).map((u) => {
        const prof = one(u.profiles as Row | Row[] | null);
        return {
          userId: u.user_id as string,
          fullName: (prof?.full_name as string) ?? "",
          email: (prof?.email as string) ?? null,
        };
      }),
      episodes,
    };
  } catch {
    report("offline");
    return null;
  }
}

/** Staff of a clinic, for therapist pickers and reply attribution. */
export async function fetchClinicMembers(
  clinicId: string
): Promise<ClinicMember[] | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const result = await withTimeout(
      supabase
        .from("clinic_members")
        .select("user_id, member_role, profiles ( full_name, email )")
        .eq("clinic_id", clinicId)
    );
    if (!result?.data) return null;
    return (result.data as Row[]).map((m) => {
      const prof = one(m.profiles as Row | Row[] | null);
      return {
        userId: m.user_id as string,
        memberRole: m.member_role as ClinicMember["memberRole"],
        fullName: (prof?.full_name as string) || "(no name)",
        email: (prof?.email as string) ?? null,
      };
    });
  } catch {
    return null;
  }
}

export function createPatient(
  clinicId: string,
  createdBy: string,
  input: {
    fullName: string;
    nationalId: string | null;
    phone: string | null;
    birthYear: number | null;
    gender: string | null;
  }
): Promise<WriteResult & { id?: string }> {
  return (async () => {
    report("saving");
    const supabase = getSupabase();
    if (!supabase) return fail("Not connected.");
    const { data, error } = await supabase
      .from("patients")
      .insert({
        clinic_id: clinicId,
        created_by: createdBy,
        full_name: input.fullName,
        national_id: input.nationalId,
        phone: input.phone,
        birth_year: input.birthYear,
        gender: input.gender,
      })
      .select("id")
      .single();
    report(error ? "save_failed" : "saved");
    if (error || !data) return fail(humanise(error?.message ?? "Insert failed."));
    return { ok: true as const, id: data.id as string };
  })();
}

export function updatePatient(
  patientId: string,
  input: {
    fullName: string;
    nationalId: string | null;
    phone: string | null;
    birthYear: number | null;
    gender: string | null;
  }
): Promise<WriteResult> {
  return write(async () => {
    const supabase = getSupabase();
    if (!supabase) return { error: { message: "Not connected." } };
    return supabase
      .from("patients")
      .update({
        full_name: input.fullName,
        national_id: input.nationalId,
        phone: input.phone,
        birth_year: input.birthYear,
        gender: input.gender,
      })
      .eq("id", patientId);
  });
}

export function assignTherapist(
  patientId: string,
  therapistId: string
): Promise<WriteResult> {
  return write(async () => {
    const supabase = getSupabase();
    if (!supabase) return { error: { message: "Not connected." } };
    return supabase
      .from("patient_therapists")
      .insert({ patient_id: patientId, therapist_id: therapistId });
  });
}

export function unassignTherapist(
  patientId: string,
  therapistId: string
): Promise<WriteResult> {
  return write(async () => {
    const supabase = getSupabase();
    if (!supabase) return { error: { message: "Not connected." } };
    return supabase
      .from("patient_therapists")
      .delete()
      .eq("patient_id", patientId)
      .eq("therapist_id", therapistId);
  });
}

/**
 * Attach an existing account to a patient record. Goes through the
 * `link_patient_account` RPC (migration 004) rather than a client-side
 * email lookup, so no one can enumerate accounts from the browser.
 */
export function linkPatientAccount(
  patientId: string,
  email: string
): Promise<WriteResult> {
  return write(async () => {
    const supabase = getSupabase();
    if (!supabase) return { error: { message: "Not connected." } };
    const { error } = await supabase.rpc("link_patient_account", {
      p_patient: patientId,
      p_email: email,
    });
    return { error };
  });
}

export function unlinkPatientAccount(
  patientId: string,
  userId: string
): Promise<WriteResult> {
  return write(async () => {
    const supabase = getSupabase();
    if (!supabase) return { error: { message: "Not connected." } };
    return supabase
      .from("patient_users")
      .delete()
      .eq("patient_id", patientId)
      .eq("user_id", userId);
  });
}

export function createEpisode(
  patientId: string,
  input: { titleFa: string; therapistNoteFa: string; weeklyTarget: number }
): Promise<WriteResult> {
  return write(async () => {
    const supabase = getSupabase();
    if (!supabase) return { error: { message: "Not connected." } };
    return supabase.from("care_episodes").insert({
      patient_id: patientId,
      title_fa: input.titleFa,
      therapist_note_fa: input.therapistNoteFa,
      weekly_target: input.weeklyTarget,
    });
  });
}

export function updateEpisode(
  episodeId: string,
  input: Partial<{
    titleFa: string;
    therapistNoteFa: string;
    weeklyTarget: number;
    status: CareEpisode["status"];
  }>
): Promise<WriteResult> {
  return write(async () => {
    const supabase = getSupabase();
    if (!supabase) return { error: { message: "Not connected." } };
    const patch: Row = {};
    if (input.titleFa !== undefined) patch.title_fa = input.titleFa;
    if (input.therapistNoteFa !== undefined)
      patch.therapist_note_fa = input.therapistNoteFa;
    if (input.weeklyTarget !== undefined)
      patch.weekly_target = input.weeklyTarget;
    if (input.status !== undefined) patch.status = input.status;
    return supabase.from("care_episodes").update(patch).eq("id", episodeId);
  });
}

/** Add or re-dose one exercise. Upserts on the 004 unique index. */
export function upsertPrescription(
  episodeId: string,
  item: PrescribedExercise
): Promise<WriteResult> {
  return write(async () => {
    const supabase = getSupabase();
    if (!supabase) return { error: { message: "Not connected." } };
    return supabase.from("episode_program").upsert(
      {
        episode_id: episodeId,
        exercise_id: item.exerciseId,
        dosage_fa: item.dosageFa,
        days_per_week: item.daysPerWeek,
      },
      { onConflict: "episode_id,exercise_id" }
    );
  });
}

export function removePrescription(
  episodeId: string,
  exerciseId: string
): Promise<WriteResult> {
  return write(async () => {
    const supabase = getSupabase();
    if (!supabase) return { error: { message: "Not connected." } };
    return supabase
      .from("episode_program")
      .delete()
      .eq("episode_id", episodeId)
      .eq("exercise_id", exerciseId);
  });
}

/* ── Ticket inbox ──────────────────────────────────────────────── */

export async function fetchClinicTickets(
  clinicId: string
): Promise<ClinicTicket[] | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const result = await withTimeout(
      supabase
        .from("tickets")
        .select(
          `id, patient_id, episode_id, exercise_id, subject, message, status, created_at,
           patients!inner ( full_name, clinic_id ),
           ticket_replies ( id, sender, content, created_at, sender_user_id,
             profiles ( full_name ) )`
        )
        .eq("patients.clinic_id", clinicId)
        .order("created_at", { ascending: false })
    );
    if (!result) {
      report("offline");
      return null;
    }
    const { data, error } = result;
    if (error || !data) return null;
    report("connected");
    return (data as Row[]).map((t) => {
      const patient = one(t.patients as Row | Row[] | null);
      const replies = ((t.ticket_replies as Row[]) ?? [])
        .map<TicketReply>((r) => {
          const prof = one(r.profiles as Row | Row[] | null);
          return {
            id: r.id as string,
            from: r.sender as TicketReply["from"],
            content: r.content as string,
            createdAt: r.created_at as string,
            authorName: (prof?.full_name as string) || undefined,
          };
        })
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return {
        id: t.id as string,
        patientId: t.patient_id as string,
        patientName: (patient?.full_name as string) ?? "",
        episodeId: (t.episode_id as string) ?? null,
        exerciseId: (t.exercise_id as string) ?? null,
        subject: t.subject as string,
        message: t.message as string,
        status: t.status as ClinicTicket["status"],
        createdAt: t.created_at as string,
        replies,
      };
    });
  } catch {
    report("offline");
    return null;
  }
}

/**
 * Post a therapist reply and mark the ticket answered.
 *
 * RLS requires sender_user_id = auth.uid() and sender = 'therapist', so a
 * patient cannot forge this. The status update is a second statement —
 * PostgREST has no transaction across the two, so a failure there leaves a
 * delivered reply on a still-open ticket. That is the safe way round: the
 * patient sees the answer either way, and the ticket merely stays in the
 * inbox.
 */
export async function replyToTicket(
  ticketId: string,
  authorUserId: string,
  content: string
): Promise<WriteResult> {
  const result = await write(async () => {
    const supabase = getSupabase();
    if (!supabase) return { error: { message: "Not connected." } };
    return supabase.from("ticket_replies").insert({
      ticket_id: ticketId,
      sender: "therapist",
      sender_user_id: authorUserId,
      content,
    });
  });
  if (!result.ok) return result;
  const supabase = getSupabase();
  await supabase?.from("tickets").update({ status: "answered" }).eq("id", ticketId);
  return ok;
}

export function setTicketStatus(
  ticketId: string,
  status: ClinicTicket["status"]
): Promise<WriteResult> {
  return write(async () => {
    const supabase = getSupabase();
    if (!supabase) return { error: { message: "Not connected." } };
    return supabase.from("tickets").update({ status }).eq("id", ticketId);
  });
}

/* ── Clinician cases (continued) ───────────────────────────────── */

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
