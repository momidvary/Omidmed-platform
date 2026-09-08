import { getSupabase } from "./client";
import type {
  CaseAssessmentRevisionInput,
  CaseAssessmentVersion,
  ClinicalAlert,
  ClinicalDocumentation,
  ClinicalSessionNote,
  ClinicianTicket,
  CaseSafetyScreen,
  CreatePatientEpisodeInput,
  InvitePatientAccountInput,
  OutcomeInstrument,
  OutcomeMeasurement,
  PatientCase,
  Patient,
  PatientRegistryItem,
  PatientRegistryResult,
  PrescriptionItemInput,
  PrescriptionRecord,
  PrescriptionStatus,
  ProgressEntry,
  StartPatientEpisodeInput,
  Ticket,
  TreatmentPlan,
  TreatmentPlanInput,
  TreatmentPlanRecord,
  TreatmentPlanStatus,
  UpdatePatientRecordInput,
} from "@/lib/types";
import {
  normalizeTreatmentPlan,
  TreatmentPlanSchema,
} from "@/lib/clinical/treatmentPlanSchema";
import { localDateValue } from "@/lib/utils";

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

type PortalRow = Record<string, unknown>;

/**
 * Choose the newest explicitly active episode. Paused/completed episodes are
 * historical records and must never become an actionable portal fallback.
 */
export function selectPortalActiveEpisode<T extends PortalRow>(
  episodes: readonly T[]
): T | undefined {
  return [...episodes]
    .filter(
      (episode) =>
        episode.status === "active" &&
        typeof episode.id === "string" &&
        episode.id.length > 0
    )
    .sort((a, b) => {
      const byStart = String(b.started_at ?? "").localeCompare(
        String(a.started_at ?? "")
      );
      return byStart || String(b.id).localeCompare(String(a.id));
    })[0];
}

/**
 * Return the latest patient-actionable prescription for a calendar date.
 * Publication alone is insufficient: scheduled and expired prescriptions are
 * deliberately excluded from the program shown to the patient.
 */
export function selectCurrentPublishedPrescription<T extends PortalRow>(
  prescriptions: readonly T[],
  today: string
): T | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return undefined;

  return [...prescriptions]
    .filter((prescription) => {
      if (prescription.status !== "published") return false;
      if (
        typeof prescription.start_date !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(prescription.start_date) ||
        prescription.start_date > today
      ) {
        return false;
      }

      const endDate = prescription.end_date;
      return (
        endDate === null ||
        endDate === undefined ||
        (typeof endDate === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(endDate) &&
          endDate >= today)
      );
    })
    .sort((a, b) => {
      const byPublication = String(b.published_at ?? "").localeCompare(
        String(a.published_at ?? "")
      );
      return (
        byPublication ||
        String(b.id ?? "").localeCompare(String(a.id ?? ""))
      );
    })[0];
}

/**
 * Load every patient record linked to the signed-in account. A family account
 * may legitimately be linked to multiple patients, so the caller must require
 * an explicit selection instead of relying on database row order.
 */
export async function fetchMyPatients(userId: string): Promise<Patient[] | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const linkResult = await withTimeout(
      supabase
        .from("patient_users")
        .select("patient_id")
        .eq("user_id", userId)
        .order("patient_id", { ascending: true })
    );
    if (!linkResult) {
      report("offline");
      return null;
    }
    if (linkResult.error || !linkResult.data) {
      report("offline");
      return null;
    }
    const patientIds = [
      ...new Set(linkResult.data.map((row) => row.patient_id as string)),
    ].filter(Boolean);
    if (patientIds.length === 0) {
      report("connected");
      return [];
    }

    const result = await withTimeout(
      supabase
        .from("patients")
        .select(
          `id, full_name, birth_year,
           care_episodes ( id, title_fa, weekly_target, status, started_at,
             patient_daily_logs ( date, pain_level, completed ),
             exercise_prescriptions ( id, version, status, start_date, end_date,
               precautions, stop_rules, review_date, published_at,
               prescription_items ( exercise_id, exercise_version, content_snapshot,
                 dosage_fa, days_per_week, sort_order ) ) ),
           tickets ( id, episode_id, exercise_id, subject, message, status, priority,
             acknowledged_by, acknowledged_at, closed_by, closed_at, closure_note,
             created_at,
             ticket_replies ( id, sender, sender_user_id, content, created_at ) )`
        )
        .in("id", patientIds)
        .eq("care_episodes.status", "active")
    );
    if (!result) {
      report("offline");
      return null;
    }
    if (result.error || !result.data) {
      report("offline");
      return null;
    }

    const portalDate = localDateValue();
    const patients = result.data.flatMap((p): Patient[] => {
      const active = selectPortalActiveEpisode(
        (p.care_episodes ?? []) as PortalRow[]
      );
      // A linked identity without an active care episode has no actionable
      // portal context. Historical episodes never become a write target.
      if (!active) return [];
      const activeEpisodeId = active.id as string;
      const birthYear = p.birth_year as number | null;
      const publishedPrescription = selectCurrentPublishedPrescription(
        (active.exercise_prescriptions as PortalRow[]) ?? [],
        portalDate
      );
      const prescribedRows = publishedPrescription
        ? ([
            ...((publishedPrescription.prescription_items as PortalRow[]) ?? []),
          ]).sort(
            (a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)
          )
        : [];

      return [
        {
          id: p.id,
          episodeId: activeEpisodeId,
          nationalId: "",
          nameFa: p.full_name,
          age: birthYear
            ? Math.max(0, new Date().getFullYear() - birthYear)
            : 0,
          conditionFa: (active.title_fa as string) ?? "",
          // Kept empty for type compatibility. Internal clinician notes are
          // intentionally not selected or returned to the patient portal.
          therapistNoteFa: "",
          weeklyTarget: (active.weekly_target as number) ?? 5,
          prescription: publishedPrescription
            ? {
                id: publishedPrescription.id as string,
                version: publishedPrescription.version as number,
                startDate: publishedPrescription.start_date as string,
                endDate:
                  (publishedPrescription.end_date as string | null) ?? null,
                precautionsFa: publishedPrescription.precautions as string,
                stopRulesFa: publishedPrescription.stop_rules as string,
                reviewDate: publishedPrescription.review_date as string,
                publishedAt: publishedPrescription.published_at as string,
              }
            : undefined,
          program: prescribedRows.map((row) => ({
            exerciseId: row.exercise_id as string,
            exerciseVersion: row.exercise_version as number,
            contentSnapshot: row.content_snapshot as Patient["program"][number]["contentSnapshot"],
            dosageFa: row.dosage_fa as string,
            daysPerWeek: row.days_per_week as number,
          })),
          progress: ((active.patient_daily_logs as PortalRow[]) ?? [])
            .map((row) => ({
              date: row.date as string,
              painLevel: row.pain_level as number,
              completed: row.completed as boolean,
            }))
            .sort((a, b) => a.date.localeCompare(b.date)),
          tickets: (((p.tickets as PortalRow[]) ?? []).filter(
            (row) => row.episode_id === activeEpisodeId
          ))
            .map((row) => ({
              id: row.id as string,
              createdAt: row.created_at as string,
              exerciseId: (row.exercise_id as string) ?? null,
              subject: row.subject as string,
              message: row.message as string,
              status: row.status as Ticket["status"],
              priority: row.priority as Ticket["priority"],
              acknowledgedBy:
                (row.acknowledged_by as string | null) ?? null,
              acknowledgedAt:
                (row.acknowledged_at as string | null) ?? null,
              closedBy: (row.closed_by as string | null) ?? null,
              closedAt: (row.closed_at as string | null) ?? null,
              closureNote: (row.closure_note as string | null) ?? null,
              replies: ((row.ticket_replies as PortalRow[]) ?? [])
                .map((reply) => ({
                  id: reply.id as string,
                  from: reply.sender as "ai" | "therapist" | "patient",
                  senderUserId:
                    (reply.sender_user_id as string | null) ?? null,
                  content: reply.content as string,
                  createdAt: reply.created_at as string,
                }))
                .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
            }))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        },
      ];
    });

    report("connected");
    return patients.sort((a, b) => a.nameFa.localeCompare(b.nameFa, "fa"));
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

export async function createPatientTicket(
  patientId: string,
  episodeId: string,
  ticket: Ticket
): Promise<Ticket | null> {
  report("saving");
  try {
    const response = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        patientId,
        episodeId,
        exerciseId: ticket.exerciseId,
        subject: ticket.subject,
        message: ticket.message,
      }),
    });
    if (!response.ok) {
      report("save_failed");
      return null;
    }
    const payload = (await response.json()) as {
      ticket?: {
        id?: unknown;
        createdAt?: unknown;
        status?: unknown;
        priority?: unknown;
      };
    };
    const row = payload.ticket;
    if (
      !row ||
      typeof row.id !== "string" ||
      typeof row.createdAt !== "string" ||
      !["open", "acknowledged", "answered", "closed"].includes(
        String(row.status)
      ) ||
      !["routine", "urgent", "emergency"].includes(String(row.priority))
    ) {
      report("save_failed");
      return null;
    }
    report("saved");
    return {
      ...ticket,
      id: row.id,
      createdAt: row.createdAt,
      status: row.status as Ticket["status"],
      priority: row.priority as Ticket["priority"],
      replies: [],
    };
  } catch {
    report("save_failed");
    return null;
  }
}

export async function replyToPatientTicket(
  ticketId: string,
  content: string
): Promise<{
  reply: Ticket["replies"][number];
  status: Ticket["status"];
  priority: Ticket["priority"];
} | null> {
  const message = content.trim();
  if (!ticketId || !message || message.length > 10_000) return null;
  report("saving");
  try {
    const response = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reply", ticketId, message }),
    });
    if (!response.ok) {
      report("save_failed");
      return null;
    }
    const payload = (await response.json()) as {
      reply?: {
        id?: unknown;
        from?: unknown;
        senderUserId?: unknown;
        content?: unknown;
        createdAt?: unknown;
      };
      status?: unknown;
      priority?: unknown;
    };
    if (
      !payload.reply ||
      typeof payload.reply.id !== "string" ||
      payload.reply.from !== "patient" ||
      typeof payload.reply.content !== "string" ||
      typeof payload.reply.createdAt !== "string" ||
      payload.status !== "open" ||
      !["routine", "urgent", "emergency"].includes(String(payload.priority))
    ) {
      report("save_failed");
      return null;
    }
    report("saved");
    return {
      reply: {
        id: payload.reply.id,
        from: "patient",
        senderUserId:
          typeof payload.reply.senderUserId === "string"
            ? payload.reply.senderUserId
            : null,
        content: payload.reply.content,
        createdAt: payload.reply.createdAt,
      },
      status: "open",
      priority: payload.priority as Ticket["priority"],
    };
  } catch {
    report("save_failed");
    return null;
  }
}

/**
 * Ask the server to attach the AI triage reply to a ticket. Returns the
 * created reply, or null when the server AI key isn't configured.
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

/* Clinic patient registry */

/** Limits shared by the tenant-scoped patient registry query. */
const MAX_REGISTRY_PAGE = 500;
const MAX_REGISTRY_PAGE_SIZE = 50;
const MAX_REGISTRY_SEARCH_LENGTH = 80;

function boundedInteger(
  value: number,
  fallback: number,
  min: number,
  max: number
) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function registrySearchTerm(value: string): string {
  // These are ILIKE metacharacters. Removing them prevents accidental
  // all-record wildcard searches while retaining ordinary Unicode names.
  return value
    .trim()
    .slice(0, MAX_REGISTRY_SEARCH_LENGTH)
    .replace(/[%_\\]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Load one bounded page of patients for the explicitly selected clinic.
 * Related reads are restricted to IDs from that page, so neither an inactive
 * tenant nor an unbounded episode history can enter the result.
 */
export async function fetchPatientRegistry({
  clinicId,
  search = "",
  page = 1,
  pageSize = 20,
}: {
  clinicId: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<PatientRegistryResult | null> {
  const supabase = getSupabase();
  if (!supabase || !clinicId) return null;

  const safePage = boundedInteger(page, 1, 1, MAX_REGISTRY_PAGE);
  const safePageSize = boundedInteger(
    pageSize,
    20,
    1,
    MAX_REGISTRY_PAGE_SIZE
  );
  const from = (safePage - 1) * safePageSize;
  const term = registrySearchTerm(search);

  try {
    let patientsQuery = supabase
      .from("patients")
      .select(
        "id, clinic_id, full_name, phone, birth_year, gender, created_at",
        { count: "exact" }
      )
      .eq("clinic_id", clinicId)
      .is("archived_at", null)
      .order("full_name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + safePageSize - 1);

    if (term) patientsQuery = patientsQuery.ilike("full_name", `%${term}%`);

    const patientResult = await withTimeout(patientsQuery);
    if (!patientResult) {
      report("offline");
      return null;
    }
    const { data: patientRows, error: patientError, count } = patientResult;
    if (patientError || !patientRows) {
      report("offline");
      return null;
    }

    type Row = Record<string, unknown>;
    const scopedRows = (patientRows as Row[]).filter(
      (row) => row.clinic_id === clinicId
    );
    const patientIds = scopedRows.map((row) => row.id as string);

    if (patientIds.length === 0) {
      report("connected");
      return {
        patients: [],
        total: count ?? 0,
        page: safePage,
        pageSize: safePageSize,
      };
    }

    const [episodeResult, assignmentResult, therapistResult, accountResult] = await Promise.all([
      withTimeout(
        supabase
          .from("care_episodes")
          .select(
            "id, patient_id, title_fa, weekly_target, status, started_at, ended_at, created_at"
          )
          .in("patient_id", patientIds)
          .order("created_at", { ascending: false })
          .limit(Math.min(safePageSize * 4, 200))
      ),
      withTimeout(
        supabase
          .from("patient_therapists")
          .select("patient_id, therapist_id")
          .in("patient_id", patientIds)
          .limit(Math.min(safePageSize * 20, 1000))
      ),
      withTimeout(
        supabase.rpc("list_clinic_therapists", {
          p_clinic_id: clinicId,
        })
      ),
      withTimeout(
        supabase.rpc("list_patient_account_links", {
          p_patient_ids: patientIds,
        })
      ),
    ]);

    if (
      !episodeResult ||
      episodeResult.error ||
      !episodeResult.data ||
      !assignmentResult ||
      assignmentResult.error ||
      !assignmentResult.data ||
      !therapistResult ||
      therapistResult.error ||
      !therapistResult.data ||
      !accountResult ||
      accountResult.error ||
      !accountResult.data
    ) {
      report("offline");
      return null;
    }

    const pagePatientIds = new Set(patientIds);
    const activeEpisodes = new Map<string, Row>();
    const latestEpisodes = new Map<string, Row>();
    for (const raw of episodeResult.data as Row[]) {
      const patientId = raw.patient_id as string;
      if (!pagePatientIds.has(patientId)) continue;
      if (!latestEpisodes.has(patientId)) latestEpisodes.set(patientId, raw);
      if (raw.status === "active" && !activeEpisodes.has(patientId)) {
        activeEpisodes.set(patientId, raw);
      }
    }

    const therapistNames = new Map<string, string>();
    for (const raw of therapistResult.data as Row[]) {
      const therapistId = raw.id as string;
      if (!therapistId) continue;
      therapistNames.set(
        therapistId,
        (raw.full_name as string) || "Unnamed therapist"
      );
    }

    const assignments = new Map<
      string,
      PatientRegistryItem["assignedTherapists"]
    >();
    for (const raw of assignmentResult.data as Row[]) {
      const patientId = raw.patient_id as string;
      if (!pagePatientIds.has(patientId)) continue;

      const therapistId = raw.therapist_id as string;
      if (!therapistId) continue;

      const current = assignments.get(patientId) ?? [];
      if (current.some((therapist) => therapist.id === therapistId)) continue;
      current.push({
        id: therapistId,
        fullName: therapistNames.get(therapistId) ?? "Unnamed therapist",
      });
      assignments.set(patientId, current);
    }

    const accountLinks = new Map<
      string,
      PatientRegistryItem["accountLinks"]
    >();
    for (const raw of accountResult.data as Row[]) {
      const patientId = raw.patient_id as string;
      if (!pagePatientIds.has(patientId)) continue;
      const current = accountLinks.get(patientId) ?? [];
      current.push({
        userId: raw.user_id as string,
        fullName: (raw.full_name as string) || "Patient account",
        email: (raw.email as string | null) ?? null,
        relationship: raw.relationship as PatientRegistryItem["accountLinks"][number]["relationship"],
        authorizedAt: raw.authorized_at as string,
        expiresAt: (raw.expires_at as string | null) ?? null,
        revokedAt: (raw.revoked_at as string | null) ?? null,
      });
      accountLinks.set(patientId, current);
    }

    const patients: PatientRegistryItem[] = scopedRows.map((row) => {
      const patientId = row.id as string;
      const episode = activeEpisodes.get(patientId);
      const latestEpisode = latestEpisodes.get(patientId);
      return {
        id: patientId,
        clinicId,
        fullName: (row.full_name as string) || "Unnamed patient",
        phone: (row.phone as string | null) ?? null,
        birthYear: (row.birth_year as number | null) ?? null,
        gender: (row.gender as PatientRegistryItem["gender"]) ?? null,
        createdAt: row.created_at as string,
        activeEpisode: episode
          ? {
              id: episode.id as string,
              titleFa: (episode.title_fa as string) || "Untitled episode",
              weeklyTarget: (episode.weekly_target as number) ?? 5,
              startedAt:
                (episode.started_at as string) ||
                (episode.created_at as string),
            }
          : null,
        latestEpisode: latestEpisode
          ? {
              id: latestEpisode.id as string,
              titleFa: (latestEpisode.title_fa as string) || "Untitled episode",
              weeklyTarget: (latestEpisode.weekly_target as number) ?? 5,
              status: latestEpisode.status as "active" | "paused" | "completed",
              startedAt:
                (latestEpisode.started_at as string) ||
                (latestEpisode.created_at as string),
              endedAt: (latestEpisode.ended_at as string | null) ?? null,
            }
          : null,
        assignedTherapists: assignments.get(patientId) ?? [],
        accountLinks: accountLinks.get(patientId) ?? [],
      };
    });

    report("connected");
    return {
      patients,
      total: count ?? patients.length,
      page: safePage,
      pageSize: safePageSize,
    };
  } catch {
    report("offline");
    return null;
  }
}

export async function fetchClinicTherapistDirectory(
  clinicId: string
): Promise<{ id: string; fullName: string }[] | null> {
  const supabase = getSupabase();
  if (!supabase || !clinicId) return null;
  try {
    const result = await withTimeout(
      supabase.rpc("list_clinic_therapists", { p_clinic_id: clinicId })
    );
    if (!result || result.error || !result.data) return null;
    return (result.data as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      fullName: (row.full_name as string) || "Unnamed therapist",
    }));
  } catch {
    return null;
  }
}

/**
 * Atomically create a patient and their first care episode. The database RPC
 * owns authorization and transactionality; the browser never performs a
 * sequence of partial inserts.
 */
export function createPatientEpisode(
  input: CreatePatientEpisodeInput
): Promise<boolean> {
  const currentYear = new Date().getFullYear();
  const fullName = input.fullName.trim().replace(/\s+/g, " ");
  const phone = input.phone?.trim() || null;
  const titleFa = input.titleFa.trim().replace(/\s+/g, " ");
  const validGender =
    input.gender === null ||
    input.gender === "male" ||
    input.gender === "female" ||
    input.gender === "other";
  const validBirthYear =
    input.birthYear === null ||
    (Number.isInteger(input.birthYear) &&
      input.birthYear >= 1900 &&
      input.birthYear <= currentYear);

  if (
    !input.clinicId ||
    fullName.length < 2 ||
    fullName.length > 120 ||
    (phone !== null && (phone.length < 7 || phone.length > 16)) ||
    !validBirthYear ||
    !validGender ||
    titleFa.length < 2 ||
    titleFa.length > 160 ||
    !Number.isInteger(input.weeklyTarget) ||
    input.weeklyTarget < 1 ||
    input.weeklyTarget > 7
  ) {
    return Promise.resolve(false);
  }

  return trackedWrite(async () => {
    const supabase = getSupabase();
    if (!supabase) return false;

    const { error } = await supabase.rpc("create_patient_episode", {
      p_clinic_id: input.clinicId,
      p_full_name: fullName,
      p_phone: phone,
      p_birth_year: input.birthYear,
      p_gender: input.gender,
      p_title_fa: titleFa,
      p_weekly_target: input.weeklyTarget,
      p_assigned_therapist_id: input.assignedTherapistId,
    });
    return !error;
  });
}

/** Update demographics through the server-authorized workflow. */
export function updatePatientRecord(
  input: UpdatePatientRecordInput
): Promise<boolean> {
  const currentYear = new Date().getFullYear();
  const fullName = input.fullName.trim().replace(/\s+/g, " ");
  const phone = input.phone?.trim() || null;
  if (
    !input.patientId ||
    fullName.length < 2 ||
    fullName.length > 120 ||
    (phone !== null && (phone.length < 7 || phone.length > 16)) ||
    (input.birthYear !== null &&
      (!Number.isInteger(input.birthYear) ||
        input.birthYear < 1900 ||
        input.birthYear > currentYear)) ||
    (input.gender !== null &&
      input.gender !== "female" &&
      input.gender !== "male" &&
      input.gender !== "other")
  ) {
    return Promise.resolve(false);
  }
  return trackedWrite(async () => {
    const supabase = getSupabase();
    if (!supabase) return false;
    const { error } = await supabase.rpc("update_patient_record", {
      p_patient_id: input.patientId,
      p_full_name: fullName,
      p_phone: phone,
      p_birth_year: input.birthYear,
      p_gender: input.gender,
    });
    return !error;
  });
}

export function setPatientPrimaryTherapist(
  patientId: string,
  therapistId: string | null
): Promise<boolean> {
  if (!patientId) return Promise.resolve(false);
  return trackedWrite(async () => {
    const supabase = getSupabase();
    if (!supabase) return false;
    const { error } = await supabase.rpc("set_patient_primary_therapist", {
      p_patient_id: patientId,
      p_therapist_id: therapistId,
    });
    return !error;
  });
}

export function startPatientEpisode(
  input: StartPatientEpisodeInput
): Promise<boolean> {
  const title = input.titleFa.trim().replace(/\s+/g, " ");
  if (
    !input.patientId ||
    title.length < 2 ||
    title.length > 160 ||
    !Number.isInteger(input.weeklyTarget) ||
    input.weeklyTarget < 1 ||
    input.weeklyTarget > 7
  ) {
    return Promise.resolve(false);
  }
  return trackedWrite(async () => {
    const supabase = getSupabase();
    if (!supabase) return false;
    const { error } = await supabase.rpc("start_patient_episode", {
      p_patient_id: input.patientId,
      p_title_fa: title,
      p_weekly_target: input.weeklyTarget,
      p_assigned_therapist_id: input.assignedTherapistId,
    });
    return !error;
  });
}

export function transitionCareEpisode(
  episodeId: string,
  status: "active" | "paused" | "completed"
): Promise<boolean> {
  if (!episodeId) return Promise.resolve(false);
  return trackedWrite(async () => {
    const supabase = getSupabase();
    if (!supabase) return false;
    const { error } = await supabase.rpc("transition_care_episode", {
      p_episode_id: episodeId,
      p_status: status,
    });
    return !error;
  });
}

export function archivePatientRecord(
  patientId: string,
  reason: string
): Promise<boolean> {
  const normalizedReason = reason.trim().replace(/\s+/g, " ");
  if (!patientId || normalizedReason.length < 3 || normalizedReason.length > 1000) {
    return Promise.resolve(false);
  }
  return trackedWrite(async () => {
    const supabase = getSupabase();
    if (!supabase) return false;
    const { error } = await supabase.rpc("archive_patient_record", {
      p_patient_id: patientId,
      p_reason: normalizedReason,
    });
    return !error;
  });
}

export function revokePatientAccountLink(
  patientId: string,
  userId: string,
  reason: string
): Promise<boolean> {
  const normalizedReason = reason.trim().replace(/\s+/g, " ");
  if (!patientId || !userId || normalizedReason.length < 3 || normalizedReason.length > 1000) {
    return Promise.resolve(false);
  }
  return trackedWrite(async () => {
    const supabase = getSupabase();
    if (!supabase) return false;
    const { error } = await supabase.rpc("revoke_patient_account_link", {
      p_patient_id: patientId,
      p_user_id: userId,
      p_reason: normalizedReason,
    });
    return !error;
  });
}

export async function invitePatientAccount(
  input: InvitePatientAccountInput
): Promise<{ ok: boolean; status?: string }> {
  try {
    const response = await fetch("/api/patients/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const payload = (await response.json()) as { status?: string };
    return { ok: response.ok, status: payload.status };
  } catch {
    return { ok: false };
  }
}

/* Clinician ticket inbox */

/**
 * Load the latest clinic tickets with their patient and reply thread.
 * The inner patient join and explicit clinic filter prevent a multi-clinic
 * user from mixing the inactive tenant into the current inbox. RLS remains
 * the final authorization boundary.
 */
export async function fetchClinicianTickets(
  clinicId: string
): Promise<ClinicianTicket[] | null> {
  const supabase = getSupabase();
  if (!supabase || !clinicId) return null;

  try {
    const selection = `id, patient_id, exercise_id, subject, message, status, priority,
      acknowledged_by, acknowledged_at, closed_by, closed_at, closure_note,
      created_at, last_patient_activity_at, last_clinician_activity_at,
      patients!inner (
        id, full_name, clinic_id,
        patient_therapists ( therapist_id )
      ),
      ticket_replies ( id, sender, sender_user_id, content, created_at )`;
    // Active work is fetched separately so a large answered/closed history can
    // never crowd an old unresolved ticket out of the inbox. Refuse a silently
    // truncated queue if a clinic exceeds the documented operational bound.
    const [activeResult, historyResult] = await Promise.all([
      withTimeout(
        supabase
          .from("tickets")
          .select(selection)
          .eq("patients.clinic_id", clinicId)
          .in("status", ["open", "acknowledged"])
          .order("last_patient_activity_at", { ascending: false })
          .limit(501)
      ),
      withTimeout(
      supabase
        .from("tickets")
        .select(selection)
        .eq("patients.clinic_id", clinicId)
          .in("status", ["answered", "closed"])
          .order("last_patient_activity_at", { ascending: false })
          .limit(100)
      ),
    ]);

    if (!activeResult || !historyResult) {
      report("offline");
      return null;
    }
    if (
      activeResult.error ||
      historyResult.error ||
      !activeResult.data ||
      !historyResult.data ||
      activeResult.data.length > 500
    ) {
      report("offline");
      return null;
    }
    const data = [...activeResult.data, ...historyResult.data];

    type Row = Record<string, unknown>;
    const tickets = data.flatMap((raw): ClinicianTicket[] => {
      const row = raw as Row;
      const patientValue = row.patients;
      const patient = (Array.isArray(patientValue)
        ? patientValue[0]
        : patientValue) as Row | undefined;

      // Defence in depth: never return a row whose joined tenant differs.
      if (!patient || patient.clinic_id !== clinicId) return [];

      const replies = ((row.ticket_replies as Row[]) ?? [])
        .map((reply) => ({
          id: reply.id as string,
          from: reply.sender as "ai" | "therapist" | "patient",
          senderUserId: (reply.sender_user_id as string | null) ?? null,
          content: reply.content as string,
          createdAt: reply.created_at as string,
        }))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

      const createdAt = row.created_at as string;
      const lastPatientActivityAt =
        (row.last_patient_activity_at as string | null) ?? createdAt;
      const lastTherapistActivityAt =
        (row.last_clinician_activity_at as string | null) ?? null;
      const unread =
        !lastTherapistActivityAt ||
        lastPatientActivityAt.localeCompare(lastTherapistActivityAt) > 0;
      const assignments = (patient.patient_therapists as Row[]) ?? [];

      return [
        {
          id: row.id as string,
          patientId: patient.id as string,
          patientName: (patient.full_name as string) || "Unnamed patient",
          clinicId,
          assignedTherapistIds: assignments.map(
            (assignment) => assignment.therapist_id as string
          ),
          createdAt,
          exerciseId: (row.exercise_id as string) ?? null,
          subject: row.subject as string,
          message: row.message as string,
          status: row.status as ClinicianTicket["status"],
          priority: row.priority as ClinicianTicket["priority"],
          acknowledgedBy:
            (row.acknowledged_by as string | null) ?? null,
          acknowledgedAt:
            (row.acknowledged_at as string | null) ?? null,
          closedBy: (row.closed_by as string | null) ?? null,
          closedAt: (row.closed_at as string | null) ?? null,
          closureNote: (row.closure_note as string | null) ?? null,
          replies,
          unread,
          lastPatientActivityAt,
          lastClinicianActivityAt: lastTherapistActivityAt,
        },
      ];
    });

    report("connected");
    return tickets;
  } catch {
    report("offline");
    return null;
  }
}

/**
 * Atomically add a clinician reply and mark the ticket answered. The database
 * RPC derives the actor from auth.uid() and enforces clinic membership and
 * assignment, so neither authorship nor tenant scope can be client-forged.
 */
export function replyToClinicianTicket({
  ticketId,
  content,
}: {
  ticketId: string;
  content: string;
}): Promise<boolean> {
  const reply = content.trim();
  if (!ticketId || !reply || reply.length > 4000) {
    return Promise.resolve(false);
  }

  return trackedWrite(async () => {
    const supabase = getSupabase();
    if (!supabase) return false;

    const { error } = await supabase.rpc("reply_to_ticket", {
      p_ticket_id: ticketId,
      p_content: reply,
    });
    return !error;
  });
}

export function acknowledgeClinicianTicket(ticketId: string): Promise<boolean> {
  if (!ticketId) return Promise.resolve(false);
  return trackedWrite(async () => {
    const supabase = getSupabase();
    if (!supabase) return false;
    const { error } = await supabase.rpc("acknowledge_ticket", {
      p_ticket_id: ticketId,
    });
    return !error;
  });
}

export function closeClinicianTicket({
  ticketId,
  closureNote,
}: {
  ticketId: string;
  closureNote: string;
}): Promise<boolean> {
  const note = closureNote.trim();
  if (!ticketId || note.length < 3 || note.length > 2000) {
    return Promise.resolve(false);
  }
  return trackedWrite(async () => {
    const supabase = getSupabase();
    if (!supabase) return false;
    const { error } = await supabase.rpc("close_ticket", {
      p_ticket_id: ticketId,
      p_closure_note: note,
    });
    return !error;
  });
}

const CLINICAL_ALERT_SELECT = `
  id, clinic_id, patient_id, episode_id, case_id, prescription_id,
  alert_type, severity, status, metric_value, source_table, source_id,
  source_recorded_at, created_at,
  acknowledged_by, acknowledged_at, resolved_by, resolved_at, resolution_note,
  patients!clinical_alerts_patient_id_fkey ( full_name )
`;

/**
 * Load every unresolved alert first, plus a small recent resolved history.
 * Resolved rows can never crowd an older open alert out of the response.
 */
export async function fetchClinicalAlerts(
  clinicId: string
): Promise<ClinicalAlert[] | null> {
  const supabase = getSupabase();
  if (!supabase || !clinicId) return null;
  try {
    const [unresolvedResult, resolvedResult] = await Promise.all([
      withTimeout(
        supabase
          .from("clinical_alerts")
          .select(CLINICAL_ALERT_SELECT)
          .eq("clinic_id", clinicId)
          .in("status", ["open", "acknowledged"])
          .order("created_at", { ascending: true })
          .limit(500)
      ),
      withTimeout(
        supabase
          .from("clinical_alerts")
          .select(CLINICAL_ALERT_SELECT)
          .eq("clinic_id", clinicId)
          .eq("status", "resolved")
          .order("resolved_at", { ascending: false })
          .limit(50)
      ),
    ]);
    if (
      !unresolvedResult ||
      !resolvedResult ||
      unresolvedResult.error ||
      resolvedResult.error ||
      !unresolvedResult.data ||
      !resolvedResult.data
    ) {
      report("offline");
      return null;
    }

    type Row = Record<string, unknown>;
    const seen = new Set<string>();
    const alerts = [
      ...(unresolvedResult.data as Row[]),
      ...(resolvedResult.data as Row[]),
    ].flatMap((row): ClinicalAlert[] => {
      const id = row.id as string;
      if (!id || seen.has(id) || row.clinic_id !== clinicId) return [];
      seen.add(id);
      const patientValue = row.patients as Row | Row[] | null;
      const patient = Array.isArray(patientValue)
        ? patientValue[0]
        : patientValue;
      if (!patient || typeof patient.full_name !== "string") return [];
      return [
        {
          id,
          clinicId,
          patientId: row.patient_id as string,
          patientName: patient.full_name,
          episodeId: row.episode_id as string,
          caseId: (row.case_id as string | null) ?? null,
          prescriptionId: (row.prescription_id as string | null) ?? null,
          alertType: row.alert_type as ClinicalAlert["alertType"],
          severity: row.severity as ClinicalAlert["severity"],
          status: row.status as ClinicalAlert["status"],
          metricValue:
            typeof row.metric_value === "number" ? row.metric_value : null,
          sourceTable: row.source_table as ClinicalAlert["sourceTable"],
          sourceId: row.source_id as string,
          sourceRecordedAt: row.source_recorded_at as string,
          createdAt: row.created_at as string,
          acknowledgedBy: (row.acknowledged_by as string | null) ?? null,
          acknowledgedAt: (row.acknowledged_at as string | null) ?? null,
          resolvedBy: (row.resolved_by as string | null) ?? null,
          resolvedAt: (row.resolved_at as string | null) ?? null,
          resolutionNote: (row.resolution_note as string | null) ?? null,
        },
      ];
    });
    report("connected");
    return alerts;
  } catch {
    report("offline");
    return null;
  }
}

export function acknowledgeClinicalAlert(alertId: string): Promise<boolean> {
  if (!alertId) return Promise.resolve(false);
  return trackedWrite(async () => {
    const supabase = getSupabase();
    if (!supabase) return false;
    const { data, error } = await supabase.rpc(
      "acknowledge_clinical_alert",
      { p_alert_id: alertId }
    );
    return !error && data === true;
  });
}

export function resolveClinicalAlert({
  alertId,
  resolutionNote,
  resumePrescription,
}: {
  alertId: string;
  resolutionNote: string;
  resumePrescription: boolean;
}): Promise<boolean> {
  const note = resolutionNote.trim();
  if (!alertId || note.length < 3 || note.length > 2000) {
    return Promise.resolve(false);
  }
  return trackedWrite(async () => {
    const supabase = getSupabase();
    if (!supabase) return false;
    const { data, error } = await supabase.rpc("resolve_clinical_alert", {
      p_alert_id: alertId,
      p_resolution_note: note,
      p_resume_prescription: resumePrescription,
    });
    return !error && data === true;
  });
}

/* Append-only clinical documentation */

export async function fetchOutcomeInstruments(): Promise<
  OutcomeInstrument[] | null
> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const result = await withTimeout(
      supabase
        .from("outcome_measure_catalog_versions")
        .select(
          "instrument_key, version, display_name, score_min, score_max, unit, direction"
        )
        .eq("active", true)
        .order("display_name")
    );
    if (!result || result.error || !result.data) return null;
    return result.data.map((row) => ({
      key: row.instrument_key as string,
      version: Number(row.version),
      displayName: row.display_name as string,
      scoreMin: Number(row.score_min),
      scoreMax: Number(row.score_max),
      unit: row.unit as string,
      direction: row.direction as OutcomeInstrument["direction"],
    }));
  } catch {
    return null;
  }
}

export async function fetchClinicalDocumentation(
  episodeId: string
): Promise<ClinicalDocumentation | null> {
  const supabase = getSupabase();
  if (!supabase || !episodeId) return null;
  try {
    const [notesResult, outcomesResult] = await Promise.all([
      withTimeout(
        supabase
          .from("clinical_session_notes")
          .select(
            `id, episode_id, case_id, occurred_at, subjective, objective,
             interventions, response, plan, authored_by, created_at,
             supersedes_id, correction_reason`
          )
          .eq("episode_id", episodeId)
          .order("occurred_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(500)
      ),
      withTimeout(
        supabase
          .from("outcome_measurements_v2")
          .select(
            `id, episode_id, case_id, instrument_key, instrument_version,
             instrument_name_snapshot, score, score_min_snapshot,
             score_max_snapshot, unit_snapshot, direction_snapshot,
             measured_at, notes, authored_by, created_at, supersedes_id,
             correction_reason`
          )
          .eq("episode_id", episodeId)
          .order("measured_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(500)
      ),
    ]);
    if (
      !notesResult ||
      !outcomesResult ||
      notesResult.error ||
      outcomesResult.error ||
      !notesResult.data ||
      !outcomesResult.data
    ) {
      return null;
    }
    type DocumentationRow = Record<string, unknown>;
    const noteRows = notesResult.data as DocumentationRow[];
    const outcomeRows = outcomesResult.data as DocumentationRow[];
    const supersededNotes = new Set(
      noteRows.map((row) => row.supersedes_id as string | null).filter(Boolean)
    );
    const supersededOutcomes = new Set(
      outcomeRows
        .map((row) => row.supersedes_id as string | null)
        .filter(Boolean)
    );
    const sessionNotes: ClinicalSessionNote[] = noteRows.map((row) => ({
      id: row.id as string,
      episodeId: row.episode_id as string,
      caseId: (row.case_id as string | null) ?? null,
      occurredAt: row.occurred_at as string,
      subjective: row.subjective as string,
      objective: row.objective as string,
      interventions: row.interventions as string,
      response: row.response as string,
      plan: row.plan as string,
      authoredBy: row.authored_by as string,
      createdAt: row.created_at as string,
      supersedesId: (row.supersedes_id as string | null) ?? null,
      correctionReason: (row.correction_reason as string | null) ?? null,
      isCurrent: !supersededNotes.has(row.id as string),
    }));
    const outcomeMeasurements: OutcomeMeasurement[] = outcomeRows.map(
      (row) => ({
        id: row.id as string,
        episodeId: row.episode_id as string,
        caseId: (row.case_id as string | null) ?? null,
        instrumentKey: row.instrument_key as string,
        instrumentVersion: Number(row.instrument_version),
        instrumentName: row.instrument_name_snapshot as string,
        score: Number(row.score),
        scoreMin: Number(row.score_min_snapshot),
        scoreMax: Number(row.score_max_snapshot),
        unit: row.unit_snapshot as string,
        direction: row.direction_snapshot as OutcomeMeasurement["direction"],
        measuredAt: row.measured_at as string,
        notes: (row.notes as string | null) ?? null,
        authoredBy: row.authored_by as string,
        createdAt: row.created_at as string,
        supersedesId: (row.supersedes_id as string | null) ?? null,
        correctionReason: (row.correction_reason as string | null) ?? null,
        isCurrent: !supersededOutcomes.has(row.id as string),
      })
    );
    report("connected");
    return { sessionNotes, outcomeMeasurements };
  } catch {
    report("offline");
    return null;
  }
}

export function appendClinicalSessionNote(input: {
  episodeId: string;
  caseId?: string | null;
  occurredAt: string;
  subjective: string;
  objective: string;
  interventions: string;
  response: string;
  plan: string;
  supersedesId?: string | null;
  correctionReason?: string | null;
}): Promise<boolean> {
  if (!input.episodeId || !input.occurredAt) return Promise.resolve(false);
  return trackedWrite(async () => {
    const supabase = getSupabase();
    if (!supabase) return false;
    const { error } = await supabase.rpc("append_clinical_session_note", {
      p_episode_id: input.episodeId,
      p_case_id: input.caseId ?? null,
      p_occurred_at: input.occurredAt,
      p_subjective: input.subjective,
      p_objective: input.objective,
      p_interventions: input.interventions,
      p_response: input.response,
      p_plan: input.plan,
      p_supersedes_id: input.supersedesId ?? null,
      p_correction_reason: input.correctionReason ?? null,
    });
    return !error;
  });
}

export function recordOutcomeMeasurement(input: {
  episodeId: string;
  caseId?: string | null;
  instrumentKey: string;
  score: number;
  measuredAt: string;
  notes?: string | null;
  supersedesId?: string | null;
  correctionReason?: string | null;
}): Promise<boolean> {
  if (
    !input.episodeId ||
    !input.instrumentKey ||
    !Number.isFinite(input.score) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.measuredAt)
  ) {
    return Promise.resolve(false);
  }
  return trackedWrite(async () => {
    const supabase = getSupabase();
    if (!supabase) return false;
    const { error } = await supabase.rpc("record_outcome_measurement_v2", {
      p_episode_id: input.episodeId,
      p_case_id: input.caseId ?? null,
      p_instrument_key: input.instrumentKey,
      p_score: input.score,
      p_measured_at: input.measuredAt,
      p_notes: input.notes ?? null,
      p_supersedes_id: input.supersedesId ?? null,
      p_correction_reason: input.correctionReason ?? null,
    });
    return !error;
  });
}

/* ── Clinician cases ───────────────────────────────────────────── */

const CASE_ASSESSMENT_HISTORY_LIMIT = 500;

export async function fetchCaseAssessmentHistory(
  caseId: string
): Promise<CaseAssessmentVersion[] | null> {
  const supabase = getSupabase();
  if (!supabase || !caseId) return null;
  try {
    const result = await withTimeout(
      supabase
        .from("case_assessment_versions")
        .select(
          `id, case_id, patient_id, episode_id, version, change_type,
           assessed_at, name, age, gender, region, main_complaint,
           pain_location, pain_intensity, duration, mechanism, aggravating,
           easing, medical_history, surgical_history, imaging, medications,
           functional_limitations, patient_goal, authored_by, created_at,
           supersedes_id, change_reason, source`,
          { count: "exact" }
        )
        .eq("case_id", caseId)
        .order("version", { ascending: false })
        .limit(CASE_ASSESSMENT_HISTORY_LIMIT + 1)
    );
    if (
      !result ||
      result.error ||
      !result.data ||
      (result.count ?? result.data.length) > CASE_ASSESSMENT_HISTORY_LIMIT ||
      result.data.length > CASE_ASSESSMENT_HISTORY_LIMIT
    ) {
      return null;
    }

    type AssessmentRow = Record<string, unknown>;
    const rows = result.data as AssessmentRow[];
    const history = rows.map((row, index): CaseAssessmentVersion => ({
      id: row.id as string,
      caseId: row.case_id as string,
      patientId: (row.patient_id as string | null) ?? null,
      episodeId: (row.episode_id as string | null) ?? null,
      version: Number(row.version),
      changeType: row.change_type as CaseAssessmentVersion["changeType"],
      assessedAt: row.assessed_at as string,
      name: row.name as string,
      age: row.age === null ? null : Number(row.age),
      gender: (row.gender as CaseAssessmentVersion["gender"]) ?? null,
      region: row.region as CaseAssessmentVersion["region"],
      mainComplaint: row.main_complaint as string,
      painLocation: (row.pain_location as string | null) ?? "",
      painIntensity: Number(row.pain_intensity),
      duration: (row.duration as string | null) ?? "",
      mechanism: (row.mechanism as string | null) ?? "",
      aggravating: (row.aggravating as string | null) ?? "",
      easing: (row.easing as string | null) ?? "",
      medicalHistory: (row.medical_history as string | null) ?? "",
      surgicalHistory: (row.surgical_history as string | null) ?? "",
      imaging: (row.imaging as string | null) ?? "",
      medications: (row.medications as string | null) ?? "",
      functionalLimitations:
        (row.functional_limitations as string | null) ?? "",
      patientGoal: (row.patient_goal as string | null) ?? "",
      authoredBy: (row.authored_by as string | null) ?? null,
      createdAt: row.created_at as string,
      supersedesId: (row.supersedes_id as string | null) ?? null,
      changeReason: (row.change_reason as string | null) ?? null,
      source: row.source as CaseAssessmentVersion["source"],
      isCurrent: index === 0,
    }));
    report("connected");
    return history;
  } catch {
    report("offline");
    return null;
  }
}

export async function reviseCaseAssessment(
  input: CaseAssessmentRevisionInput
): Promise<{
  id: string;
  version: number;
  authoredBy: string;
  createdAt: string;
} | null> {
  const reason = input.changeReason.trim();
  const assessedAt = new Date(input.assessedAt);
  if (
    !input.caseId ||
    !input.supersedesId ||
    !["correction", "reassessment"].includes(input.changeType) ||
    reason.length < 3 ||
    reason.length > 1000 ||
    Number.isNaN(assessedAt.getTime()) ||
    !input.assessment.name.trim() ||
    !input.assessment.mainComplaint.trim() ||
    !input.assessment.region ||
    !Number.isInteger(input.assessment.painIntensity) ||
    input.assessment.painIntensity < 0 ||
    input.assessment.painIntensity > 10
  ) {
    report("save_failed");
    return null;
  }

  const supabase = getSupabase();
  if (!supabase) return null;
  report("saving");
  try {
    const { data, error } = await supabase.rpc(
      "record_case_assessment_revision",
      {
        p_case_id: input.caseId,
        p_supersedes_id: input.supersedesId,
        p_change_type: input.changeType,
        p_change_reason: reason,
        p_assessed_at: input.assessedAt,
        p_assessment: {
          name: input.assessment.name,
          age: input.assessment.age,
          gender: input.assessment.gender,
          region: input.assessment.region,
          main_complaint: input.assessment.mainComplaint,
          pain_location: input.assessment.painLocation,
          pain_intensity: input.assessment.painIntensity,
          duration: input.assessment.duration,
          mechanism: input.assessment.mechanism,
          aggravating: input.assessment.aggravating,
          easing: input.assessment.easing,
          medical_history: input.assessment.medicalHistory,
          surgical_history: input.assessment.surgicalHistory,
          imaging: input.assessment.imaging,
          medications: input.assessment.medications,
          functional_limitations: input.assessment.functionalLimitations,
          patient_goal: input.assessment.patientGoal,
        },
      }
    );
    const row = (Array.isArray(data) ? data[0] : data) as
      | Record<string, unknown>
      | null;
    if (
      error ||
      !row ||
      typeof row.assessment_version_id !== "string" ||
      !Number.isInteger(Number(row.assessment_version)) ||
      typeof row.authored_by !== "string" ||
      typeof row.created_at !== "string"
    ) {
      report("save_failed");
      return null;
    }
    report("saved");
    return {
      id: row.assessment_version_id,
      version: Number(row.assessment_version),
      authoredBy: row.authored_by,
      createdAt: row.created_at,
    };
  } catch {
    report("save_failed");
    return null;
  }
}

export async function fetchCases(
  clinicId: string
): Promise<PatientCase[] | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const result = await withTimeout(
      supabase
        .from("cases")
        .select("*")
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
    return data.map((row) => ({
      id: row.id,
      clinicId: row.clinic_id,
      patientId: row.patient_id ?? undefined,
      episodeId: row.episode_id ?? undefined,
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
      safetyScreen: row.safety_screened_at
        ? {
            screenedAt: row.safety_screened_at,
            selectedFlagIds: row.red_flag_ids ?? [],
            disposition: row.safety_disposition ?? "not-screened",
            notes: row.safety_notes ?? undefined,
            actionTaken: row.safety_action_taken ?? undefined,
          }
        : undefined,
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
  // Real intakes must be attached to one registry patient and the active
  // episode chosen for that patient. Migration 006 validates tenant/episode
  // integrity in the database; this guard prevents accidental legacy writes.
  if (!c.patientId || !c.episodeId) return Promise.resolve(false);

  return trackedWrite(async () => {
    const supabase = getSupabase();
    if (!supabase) return false;
    const { error } = await supabase.from("cases").insert({
      id: c.id,
      clinic_id: clinicId,
      patient_id: c.patientId,
      episode_id: c.episodeId,
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
      safety_screened_at: c.safetyScreen?.screenedAt ?? null,
      red_flag_ids: c.safetyScreen?.selectedFlagIds ?? [],
      safety_disposition:
        c.safetyScreen?.disposition ?? "not-screened",
      safety_notes: c.safetyScreen?.notes ?? null,
      safety_action_taken: c.safetyScreen?.actionTaken ?? null,
    });
    return !error;
  });
}

/**
 * Persist a clinician-attested safety re-screen. The database derives the
 * disposition from its versioned flag catalog, stamps the actor/time, appends
 * history, and invalidates published artifacts when the result is non-clear.
 */
export async function recordCaseSafetyScreen({
  caseId,
  selectedFlagIds,
  notes,
  actionTaken,
}: {
  caseId: string;
  selectedFlagIds: string[];
  notes?: string;
  actionTaken?: string;
}): Promise<CaseSafetyScreen | null> {
  const normalizedNotes = notes?.trim() || undefined;
  const normalizedAction = actionTaken?.trim() || undefined;
  if (
    !caseId ||
    selectedFlagIds.length > 100 ||
    (normalizedNotes?.length ?? 0) > 10000 ||
    (normalizedAction?.length ?? 0) > 4000 ||
    (selectedFlagIds.length > 0 && (normalizedAction?.length ?? 0) < 3)
  ) {
    report("save_failed");
    return null;
  }

  const supabase = getSupabase();
  if (!supabase) return null;
  report("saving");
  try {
    const { data, error } = await supabase.rpc("record_case_safety_screen", {
      p_case_id: caseId,
      p_red_flag_ids: [...new Set(selectedFlagIds)],
      p_notes: normalizedNotes ?? null,
      p_action_taken: normalizedAction ?? null,
    });
    const row = (Array.isArray(data) ? data[0] : data) as
      | Record<string, unknown>
      | null;
    const disposition = row?.disposition;
    if (
      error ||
      !row ||
      typeof row.screened_at !== "string" ||
      !Array.isArray(row.red_flag_ids) ||
      ![
        "clear",
        "medical-review",
        "urgent",
        "emergency",
      ].includes(String(disposition))
    ) {
      report("save_failed");
      return null;
    }
    const screen: CaseSafetyScreen = {
      screenedAt: row.screened_at,
      selectedFlagIds: row.red_flag_ids.filter(
        (flag): flag is string => typeof flag === "string"
      ),
      disposition: disposition as CaseSafetyScreen["disposition"],
      notes: typeof row.notes === "string" ? row.notes : undefined,
      actionTaken:
        typeof row.action_taken === "string" ? row.action_taken : undefined,
    };
    report("saved");
    return screen;
  } catch {
    report("save_failed");
    return null;
  }
}

/* ── Versioned treatment plans ────────────────────────────────── */

export interface TreatmentPlanMutationResult {
  id: string;
  version: number;
  status: TreatmentPlanStatus;
  timestamp: string;
}

export async function fetchTreatmentPlans(
  caseId: string
): Promise<TreatmentPlanRecord[] | null> {
  const supabase = getSupabase();
  if (!supabase || !caseId) return null;
  try {
    const result = await withTimeout(
      supabase
        .from("treatment_plans")
        .select(
          `id, clinic_id, patient_id, episode_id, case_id, version, status,
           planner_input, plan_output, created_by, created_at,
           reviewed_by, reviewed_at, review_note`
        )
        .eq("case_id", caseId)
        .order("version", { ascending: false })
        .limit(20)
    );
    if (!result) {
      report("offline");
      return null;
    }
    if (result.error || !result.data) return null;
    report("connected");
    const records: TreatmentPlanRecord[] = [];
    for (const row of result.data) {
      const parsedPlan = TreatmentPlanSchema.safeParse(row.plan_output);
      if (!parsedPlan.success) return null;
      records.push({
        id: row.id,
        clinicId: row.clinic_id,
        patientId: row.patient_id,
        episodeId: row.episode_id,
        caseId: row.case_id,
        version: row.version,
        status: row.status as TreatmentPlanStatus,
        input: row.planner_input as TreatmentPlanInput,
        plan: parsedPlan.data,
        createdBy: row.created_by,
        createdAt: row.created_at,
        reviewedBy: row.reviewed_by,
        reviewedAt: row.reviewed_at,
        reviewNote: row.review_note,
      });
    }
    return records;
  } catch {
    report("offline");
    return null;
  }
}

export async function saveTreatmentPlanDraft({
  caseId,
  input,
  plan,
}: {
  caseId: string;
  input: TreatmentPlanInput;
  plan: TreatmentPlan;
}): Promise<TreatmentPlanMutationResult | null> {
  const parsedPlan = TreatmentPlanSchema.safeParse(normalizeTreatmentPlan(plan));
  if (!caseId || !input.safetyConfirmed || !parsedPlan.success) return null;
  report("saving");
  try {
    const supabase = getSupabase();
    if (!supabase) {
      report("save_failed");
      return null;
    }
    const { data, error } = await supabase.rpc("save_treatment_plan_draft", {
      p_case_id: caseId,
      p_planner_input: input,
      p_plan_output: parsedPlan.data,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) {
      report("save_failed");
      return null;
    }
    report("saved");
    return {
      id: row.plan_id,
      version: row.plan_version,
      status: row.plan_status as TreatmentPlanStatus,
      timestamp: row.plan_created_at,
    };
  } catch {
    report("save_failed");
    return null;
  }
}

export async function reviewTreatmentPlan({
  planId,
  decision,
  note,
}: {
  planId: string;
  decision: "approved" | "rejected";
  note?: string;
}): Promise<TreatmentPlanMutationResult | null> {
  if (!planId || (note?.length ?? 0) > 2000) return null;
  report("saving");
  try {
    const supabase = getSupabase();
    if (!supabase) {
      report("save_failed");
      return null;
    }
    const { data, error } = await supabase.rpc("review_treatment_plan", {
      p_plan_id: planId,
      p_decision: decision,
      p_review_note: note?.trim() || null,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) {
      report("save_failed");
      return null;
    }
    report("saved");
    return {
      id: row.plan_id,
      version: row.plan_version,
      status: row.plan_status as TreatmentPlanStatus,
      timestamp: row.plan_reviewed_at,
    };
  } catch {
    report("save_failed");
    return null;
  }
}

/* ── Exercise prescription publish workflow ───────────────────── */

export interface PrescriptionMutationResult {
  id: string;
  version: number;
  status: PrescriptionStatus;
  timestamp: string;
}

export async function fetchPrescriptionHistory(
  episodeId: string
): Promise<PrescriptionRecord[] | null> {
  const supabase = getSupabase();
  if (!supabase || !episodeId) return null;
  try {
    const result = await withTimeout(
      supabase
        .from("exercise_prescriptions")
        .select(
          `id, treatment_plan_id, episode_id, version, status, start_date,
           end_date, precautions, stop_rules, review_date, created_at,
           published_at, revoked_at,
           prescription_items ( exercise_id, exercise_version, content_snapshot,
             dosage_fa, days_per_week, sort_order )`
        )
        .eq("episode_id", episodeId)
        .order("version", { ascending: false })
        .limit(20)
    );
    if (!result) {
      report("offline");
      return null;
    }
    if (result.error || !result.data) return null;
    report("connected");
    type Row = Record<string, unknown>;
    return result.data.map((row) => ({
      id: row.id,
      treatmentPlanId: row.treatment_plan_id,
      episodeId: row.episode_id,
      version: row.version,
      status: row.status as PrescriptionStatus,
      startDate: row.start_date,
      endDate: row.end_date,
      precautions: row.precautions,
      stopRules: row.stop_rules,
      reviewDate: row.review_date,
      createdAt: row.created_at,
      publishedAt: row.published_at,
      revokedAt: row.revoked_at,
      items: ([...((row.prescription_items as Row[]) ?? [])])
        .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
        .map((item) => ({
          exerciseId: item.exercise_id as string,
          exerciseVersion: item.exercise_version as number,
          contentSnapshot: item.content_snapshot as PrescriptionItemInput["contentSnapshot"],
          dosageFa: item.dosage_fa as string,
          daysPerWeek: item.days_per_week as number,
        })),
    }));
  } catch {
    report("offline");
    return null;
  }
}

export async function savePrescriptionDraft({
  treatmentPlanId,
  startDate,
  endDate,
  precautions,
  stopRules,
  reviewDate,
  items,
}: {
  treatmentPlanId: string;
  startDate: string;
  endDate: string | null;
  precautions: string;
  stopRules: string;
  reviewDate: string;
  items: PrescriptionItemInput[];
}): Promise<PrescriptionMutationResult | null> {
  if (
    !treatmentPlanId ||
    !startDate ||
    !reviewDate ||
    precautions.trim().length < 3 ||
    stopRules.trim().length < 3 ||
    items.length < 1 ||
    items.length > 20 ||
    new Set(items.map((item) => item.exerciseId)).size !== items.length
  ) {
    return null;
  }
  report("saving");
  try {
    const supabase = getSupabase();
    if (!supabase) {
      report("save_failed");
      return null;
    }
    const { data, error } = await supabase.rpc("save_prescription_draft", {
      p_treatment_plan_id: treatmentPlanId,
      p_start_date: startDate,
      p_end_date: endDate,
      p_precautions: precautions.trim(),
      p_stop_rules: stopRules.trim(),
      p_review_date: reviewDate,
      p_items: items,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) {
      report("save_failed");
      return null;
    }
    report("saved");
    return {
      id: row.prescription_id,
      version: row.prescription_version,
      status: row.prescription_status as PrescriptionStatus,
      timestamp: row.prescription_created_at,
    };
  } catch {
    report("save_failed");
    return null;
  }
}

export async function publishPrescription(
  prescriptionId: string
): Promise<PrescriptionMutationResult | null> {
  if (!prescriptionId) return null;
  report("saving");
  try {
    const supabase = getSupabase();
    if (!supabase) {
      report("save_failed");
      return null;
    }
    const { data, error } = await supabase.rpc("publish_prescription", {
      p_prescription_id: prescriptionId,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) {
      report("save_failed");
      return null;
    }
    report("saved");
    return {
      id: row.prescription_id,
      version: row.prescription_version,
      status: row.prescription_status as PrescriptionStatus,
      timestamp: row.prescription_published_at,
    };
  } catch {
    report("save_failed");
    return null;
  }
}

export async function revokePrescription(
  prescriptionId: string
): Promise<boolean> {
  if (!prescriptionId) return false;
  return trackedWrite(async () => {
    const supabase = getSupabase();
    if (!supabase) return false;
    const { data, error } = await supabase.rpc("revoke_prescription", {
      p_prescription_id: prescriptionId,
    });
    return !error && data === true;
  });
}
