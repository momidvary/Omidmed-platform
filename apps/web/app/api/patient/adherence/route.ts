import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient as createServerClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 8_192;
const adherenceRequestSchema = z
  .object({
    patientId: z.uuid(),
    episodeId: z.uuid(),
    prescriptionItemId: z.uuid(),
    status: z.enum(["complete", "partial", "not_done"]),
    painLevel: z.number().int().min(0).max(10),
    clientSubmissionId: z.uuid(),
    completedSets: z.number().int().min(0).max(50).nullable().optional(),
    completedReps: z.number().int().min(0).max(1000).nullable().optional(),
    completedDurationSeconds: z
      .number()
      .int()
      .min(0)
      .max(21600)
      .nullable()
      .optional(),
    nonCompletionReason: z.string().trim().max(500).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    const reason = value.nonCompletionReason?.trim() ?? "";
    if (value.status === "complete" && reason) {
      ctx.addIssue({ code: "custom", message: "complete events cannot include a reason" });
    }
    if (value.status !== "complete" && (reason.length < 3 || reason.length > 500)) {
      ctx.addIssue({ code: "custom", message: "a reason is required" });
    }
  });

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function firstRow(value: unknown): Record<string, unknown> | null {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" ? (row as Record<string, unknown>) : null;
}

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  if (request.headers.get("origin") !== requestUrl.origin) {
    return json({ error: "forbidden_origin" }, 403);
  }
  const length = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(length) || length < 0 || length > MAX_REQUEST_BYTES) {
    return json({ error: "request_too_large" }, 413);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_body" }, 400);
  }
  const parsed = adherenceRequestSchema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid_body" }, 400);

  const userClient = createServerClient(await cookies());
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secret) return json({ error: "adherence_service_not_configured" }, 503);

  const admin = createAdminClient(supabaseUrl, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const value = parsed.data;
  const result = await admin.rpc("record_exercise_completion_event", {
    p_actor_id: user.id,
    p_patient_id: value.patientId,
    p_episode_id: value.episodeId,
    p_prescription_item_id: value.prescriptionItemId,
    p_status: value.status,
    p_pain_level: value.painLevel,
    p_client_submission_id: value.clientSubmissionId,
    p_completed_sets: value.completedSets ?? null,
    p_completed_reps: value.completedReps ?? null,
    p_completed_duration_seconds: value.completedDurationSeconds ?? null,
    p_non_completion_reason: value.nonCompletionReason?.trim() || null,
  });
  if (result.error) {
    const status = result.error.code === "42501" ? 403 : result.error.code === "23514" || result.error.code === "22023" ? 422 : 500;
    return json({ error: "adherence_event_rejected" }, status);
  }
  const row = firstRow(result.data);
  if (!row) return json({ error: "adherence_event_missing" }, 500);
  return json({
    event: {
      id: row.event_id,
      localDate: row.local_date,
      prescriptionStatus: row.prescription_status,
      alertCreated: row.alert_created,
    },
  });
}
