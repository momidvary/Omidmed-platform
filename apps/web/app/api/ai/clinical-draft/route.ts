import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient as createServerClient } from "@/utils/supabase/server";
import { detectSafetySignals } from "@/lib/clinical/safety";
import {
  CLINICAL_DRAFT_PROMPT_VERSION,
  ClinicalDraftGenerationError,
  generateClinicalDraft,
} from "@/lib/ai/clinicalDraft.server";
import {
  ClinicalDraftCaseContextSchema,
  ClinicalDraftSchema,
} from "@/lib/ai/clinicalDraftSchema";
import {
  minimizeClinicalAiPayload,
  resolveClinicalAiLimits,
} from "@/lib/ai/clinicalDraftPolicy";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_REQUEST_BYTES = 8_192;
const UUID = z.string().uuid();
const RequestSchema = z.object({
  requestId: UUID,
  caseId: UUID,
  question: z.string().trim().min(3).max(2_000),
}).strict();
const ReservationSchema = z.object({
  reservation_outcome: z.enum([
    "reserved",
    "existing",
    "conflict",
    "minute_limit",
    "user_daily_limit",
    "clinic_daily_limit",
  ]),
  audit_id: UUID.nullable(),
  audit_status: z
    .enum(["pending", "generated", "refused", "error"])
    .nullable(),
  audit_case_id: UUID.nullable(),
  audit_input_hash: z.string().nullable(),
  audit_prompt_version: z.string().nullable(),
  audit_model: z.string().nullable(),
  audit_output: z.unknown().nullable(),
  audit_error_code: z.string().nullable(),
  audit_created_at: z.string().nullable(),
});
const CompletionSchema = z.object({
  audit_id: UUID,
  audit_status: z.enum(["generated", "refused", "error"]),
  audit_model: z.string(),
  audit_output: z.unknown().nullable(),
  audit_error_code: z.string().nullable(),
  audit_created_at: z.string(),
});

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function inputHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function parseReservation(value: unknown) {
  const row = Array.isArray(value) ? value[0] : value;
  const parsed = ReservationSchema.safeParse(row);
  return parsed.success ? parsed.data : null;
}

function parseCompletion(value: unknown) {
  const row = Array.isArray(value) ? value[0] : value;
  const parsed = CompletionSchema.safeParse(row);
  return parsed.success ? parsed.data : null;
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim();
  if (contentType !== "application/json") {
    return json({ error: "unsupported_media_type" }, 415);
  }

  const declaredLength = request.headers.get("content-length");
  const contentLength = declaredLength === null ? 0 : Number(declaredLength);
  if (
    !Number.isFinite(contentLength) ||
    contentLength < 0 ||
    contentLength > MAX_REQUEST_BYTES
  ) {
    return json({ error: "request_too_large" }, 413);
  }

  let rawBody: unknown;
  try {
    const rawText = await request.text();
    if (new TextEncoder().encode(rawText).byteLength > MAX_REQUEST_BYTES) {
      return json({ error: "request_too_large" }, 413);
    }
    rawBody = JSON.parse(rawText);
  } catch {
    return json({ error: "invalid_body" }, 400);
  }
  const parsedBody = RequestSchema.safeParse(rawBody);
  if (!parsedBody.success) return json({ error: "invalid_body" }, 400);

  const enabled = process.env.ENABLE_CLINICAL_AI_DRAFTS === "true";
  const dataProcessingApproved =
    process.env.OPENAI_CLINICAL_DATA_PROCESSING_APPROVED === "true";
  const model = process.env.OPENAI_MODEL?.trim();
  const openAiKey = process.env.OPENAI_API_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseSecret = process.env.SUPABASE_SECRET_KEY;
  if (
    !enabled ||
    !dataProcessingApproved ||
    !model ||
    !openAiKey ||
    !supabaseUrl ||
    !supabaseSecret
  ) {
    return json({ error: "clinical_ai_not_configured" }, 503);
  }
  const limitResult = resolveClinicalAiLimits({
    CLINICAL_AI_PER_MINUTE_LIMIT:
      process.env.CLINICAL_AI_PER_MINUTE_LIMIT,
    CLINICAL_AI_DAILY_USER_LIMIT:
      process.env.CLINICAL_AI_DAILY_USER_LIMIT,
    CLINICAL_AI_DAILY_CLINIC_LIMIT:
      process.env.CLINICAL_AI_DAILY_CLINIC_LIMIT,
  });
  if (!limitResult.ok) {
    return json({ error: "clinical_ai_not_configured" }, 503);
  }

  const userClient = createServerClient(await cookies());
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  const { caseId, question, requestId } = parsedBody.data;
  const { data: patientCase, error: caseError } = await userClient
    .from("cases")
    .select(
      `id, clinic_id, age, gender, region, main_complaint, pain_location,
       pain_intensity, duration, mechanism, aggravating, easing,
       medical_history, surgical_history, imaging, medications,
       functional_limitations, patient_goal, safety_screened_at,
       safety_disposition, red_flag_ids`
    )
    .eq("id", caseId)
    .maybeSingle();
  if (caseError || !patientCase) return json({ error: "case_not_found" }, 404);

  const { data: membership } = await userClient
    .from("clinic_members")
    .select("member_role")
    .eq("clinic_id", patientCase.clinic_id)
    .eq("user_id", user.id)
    .in("member_role", ["clinic_owner", "therapist"])
    .maybeSingle();
  if (!membership) return json({ error: "forbidden" }, 403);

  if (
    !patientCase.safety_screened_at ||
    patientCase.safety_disposition !== "clear" ||
    (patientCase.red_flag_ids?.length ?? 0) > 0
  ) {
    return json({ error: "safety_clearance_required" }, 409);
  }

  const parsedCaseContext = ClinicalDraftCaseContextSchema.safeParse({
    age: patientCase.age,
    gender: patientCase.gender,
    region: patientCase.region,
    mainComplaint: patientCase.main_complaint ?? "",
    painLocation: patientCase.pain_location ?? "",
    painIntensity: patientCase.pain_intensity,
    duration: patientCase.duration ?? "",
    mechanism: patientCase.mechanism ?? "",
    aggravating: patientCase.aggravating ?? "",
    easing: patientCase.easing ?? "",
    medicalHistory: patientCase.medical_history ?? "",
    surgicalHistory: patientCase.surgical_history ?? "",
    imaging: patientCase.imaging ?? "",
    medications: patientCase.medications ?? "",
    functionalLimitations: patientCase.functional_limitations ?? "",
    patientGoal: patientCase.patient_goal ?? "",
  });
  if (!parsedCaseContext.success) {
    return json({ error: "case_context_invalid" }, 422);
  }
  const caseContext = parsedCaseContext.data;
  const safetySignals = detectSafetySignals(
    `${question}\n${Object.values(caseContext).join("\n")}`
  );
  if (safetySignals.length > 0) {
    return json(
      {
        error: "safety_signal_detected",
        disposition: safetySignals[0].disposition,
        signalIds: safetySignals.map((signal) => signal.id),
      },
      409
    );
  }
  const minimizedPayload = minimizeClinicalAiPayload(question, caseContext);

  const admin = createAdminClient(supabaseUrl, supabaseSecret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const contextSnapshot = {
    question: minimizedPayload.question,
    caseContext: minimizedPayload.caseContext,
    directIdentifierRedactions: minimizedPayload.redactionCount,
  };
  const generationInputHash = inputHash({
    promptVersion: CLINICAL_DRAFT_PROMPT_VERSION,
    requestedModel: model,
    ...contextSnapshot,
  });

  const { data: reservationData, error: reservationError } = await admin.rpc(
    "reserve_ai_generation",
    {
      p_request_id: requestId,
      p_clinic_id: patientCase.clinic_id,
      p_case_id: caseId,
      p_requested_by: user.id,
      p_model: model,
      p_prompt_version: CLINICAL_DRAFT_PROMPT_VERSION,
      p_input_hash: generationInputHash,
      p_context_snapshot: contextSnapshot,
      p_per_minute_limit: limitResult.limits.perMinute,
      p_daily_user_limit: limitResult.limits.perUserPerDay,
      p_daily_clinic_limit: limitResult.limits.perClinicPerDay,
    }
  );
  const reservation = parseReservation(reservationData);
  if (reservationError?.code === "23514") {
    return json({ error: "safety_or_access_changed" }, 409);
  }
  if (reservationError || !reservation) {
    return json({ error: "audit_unavailable" }, 503);
  }

  if (reservation.reservation_outcome === "conflict") {
    return json({ error: "request_id_conflict" }, 409);
  }
  if (reservation.reservation_outcome === "minute_limit") {
    return json({ error: "rate_limited" }, 429);
  }
  if (
    reservation.reservation_outcome === "user_daily_limit" ||
    reservation.reservation_outcome === "clinic_daily_limit"
  ) {
    return json(
      {
        error: "daily_quota_exhausted",
        scope:
          reservation.reservation_outcome === "user_daily_limit"
            ? "user"
            : "clinic",
      },
      429
    );
  }

  if (reservation.reservation_outcome === "existing") {
    if (reservation.audit_status === "pending") {
      return json(
        { error: "request_in_progress", auditId: reservation.audit_id },
        409
      );
    }
    if (reservation.audit_status !== "generated") {
      if (
        reservation.audit_status === "refused" &&
        reservation.audit_error_code === "authorization_or_safety_changed"
      ) {
        return json({ error: "safety_or_access_changed" }, 409);
      }
      return json(
        {
          error:
            reservation.audit_status === "refused"
              ? "generation_refused"
              : "generation_failed",
          auditId: reservation.audit_id,
        },
        reservation.audit_status === "refused" ? 422 : 502
      );
    }

    const existingDraft = ClinicalDraftSchema.safeParse(
      reservation.audit_output
    );
    if (!existingDraft.success || !reservation.audit_id) {
      return json({ error: "audited_output_invalid" }, 503);
    }
    return json({
      draft: existingDraft.data,
      auditId: reservation.audit_id,
      model: reservation.audit_model,
      promptVersion: reservation.audit_prompt_version,
      generatedAt: reservation.audit_created_at,
      requiresHumanReview: true,
      auditStatus: "pending-review",
    });
  }

  if (
    reservation.reservation_outcome !== "reserved" ||
    reservation.audit_status !== "pending" ||
    !reservation.audit_id
  ) {
    return json({ error: "audit_unavailable" }, 503);
  }

  try {
    const generated = await generateClinicalDraft({
      model,
      userId: user.id,
      question: minimizedPayload.question,
      caseContext: minimizedPayload.caseContext,
    });
    const { data: completionData, error: completionError } = await admin.rpc(
      "complete_ai_generation",
      {
        p_audit_id: reservation.audit_id,
        p_requested_by: user.id,
        p_status: "generated",
        p_model: generated.responseModel,
        p_provider_response_id: generated.responseId,
        p_output: generated.draft,
        p_usage: generated.usage,
        p_error_code: null,
      }
    );
    const completion = parseCompletion(completionData);
    if (
      completion?.audit_status === "refused" &&
      completion.audit_error_code === "authorization_or_safety_changed"
    ) {
      return json({ error: "safety_or_access_changed" }, 409);
    }
    if (
      completionError ||
      !completion ||
      completion.audit_id !== reservation.audit_id ||
      completion.audit_status !== "generated"
    ) {
      return json({ error: "audit_write_failed" }, 503);
    }

    return json({
      draft: generated.draft,
      auditId: completion.audit_id,
      model: generated.responseModel,
      promptVersion: CLINICAL_DRAFT_PROMPT_VERSION,
      generatedAt: completion.audit_created_at,
      requiresHumanReview: true,
      auditStatus: "pending-review",
    });
  } catch (error) {
    const generationError =
      error instanceof ClinicalDraftGenerationError ? error : null;
    const rejectedBySafety =
      generationError?.code === "provider_refusal" ||
      generationError?.code === "schema_validation_failed" ||
      generationError?.code === "unsafe_model_output";
    const errorCode = generationError?.code ?? "generation_failed";
    const failureStatus = rejectedBySafety ? "refused" : "error";
    const { data: failureData, error: failureAuditError } = await admin.rpc(
      "complete_ai_generation",
      {
        p_audit_id: reservation.audit_id,
        p_requested_by: user.id,
        p_status: failureStatus,
        p_model: generationError?.responseModel ?? model,
        p_provider_response_id: generationError?.responseId ?? null,
        p_output: null,
        p_usage: generationError?.usage ?? null,
        p_error_code: errorCode,
      }
    );
    const failedCompletion = parseCompletion(failureData);
    if (
      failureAuditError ||
      !failedCompletion ||
      failedCompletion.audit_id !== reservation.audit_id ||
      failedCompletion.audit_status !== failureStatus
    ) {
      return json({ error: "audit_write_failed" }, 503);
    }

    if (generationError?.code === "provider_refusal") {
      return json({ error: "generation_refused" }, 422);
    }
    if (
      generationError?.code === "schema_validation_failed" ||
      generationError?.code === "unsafe_model_output"
    ) {
      return json({ error: "invalid_model_output" }, 502);
    }
    if (generationError?.code === "incomplete_response") {
      return json({ error: "incomplete_model_output" }, 502);
    }
    return json({ error: "generation_failed" }, 502);
  }
}
