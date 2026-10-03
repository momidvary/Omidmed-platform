import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ClinicalDraftSchema } from "@/lib/ai/clinicalDraftSchema";
import { createClient as createServerClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 150_000;
const ReviewSchema = z
  .object({
    auditId: z.string().uuid(),
    decision: z.enum(["accepted", "edited", "rejected"]),
    editedOutput: ClinicalDraftSchema.optional(),
    notes: z.string().trim().max(2_000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.decision === "edited" && !value.editedOutput) {
      context.addIssue({
        code: "custom",
        path: ["editedOutput"],
        message: "editedOutput is required for an edited decision",
      });
    }
    if (value.decision !== "edited" && value.editedOutput) {
      context.addIssue({
        code: "custom",
        path: ["editedOutput"],
        message: "editedOutput is allowed only for an edited decision",
      });
    }
  });
const ReviewResultSchema = z.object({
  review_outcome: z.enum(["created", "existing"]),
  review_id: z.string().uuid(),
  review_decision: z.enum(["accepted", "edited", "rejected"]),
  review_created_at: z.string(),
});

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim();
  if (contentType !== "application/json") {
    return json({ error: "unsupported_media_type" }, 415);
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
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
  const parsed = ReviewSchema.safeParse(rawBody);
  if (!parsed.success) return json({ error: "invalid_body" }, 400);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseSecret = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseSecret) {
    return json({ error: "review_service_not_configured" }, 503);
  }

  const userClient = createServerClient(await cookies());
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  // RLS permits only the original requester or a clinic owner to read this
  // audit, which becomes the authorization check for review.
  const { data: audit } = await userClient
    .from("ai_generation_audits")
    .select("id, status")
    .eq("id", parsed.data.auditId)
    .maybeSingle();
  if (!audit) return json({ error: "audit_not_found" }, 404);
  if (audit.status !== "generated") {
    return json({ error: "audit_not_reviewable" }, 409);
  }

  const admin = createAdminClient(supabaseUrl, supabaseSecret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: reviewData, error } = await admin.rpc(
    "record_ai_generation_review",
    {
      p_audit_id: audit.id,
      p_reviewer_id: user.id,
      p_decision: parsed.data.decision,
      p_edited_output: parsed.data.editedOutput ?? null,
      p_notes: parsed.data.notes || null,
    }
  );
  const reviewRow = Array.isArray(reviewData) ? reviewData[0] : reviewData;
  const review = ReviewResultSchema.safeParse(reviewRow);
  if (error || !review.success) {
    if (error?.code === "42501") return json({ error: "forbidden" }, 403);
    if (error?.code === "23514") {
      return json({ error: "audit_not_reviewable" }, 409);
    }
    return json({ error: "review_write_failed" }, 503);
  }
  if (review.data.review_outcome === "existing") {
    return json(
      {
        error: "already_reviewed",
        decision: review.data.review_decision,
      },
      409
    );
  }

  return json({
    review: {
      id: review.data.review_id,
      decision: review.data.review_decision,
      created_at: review.data.review_created_at,
    },
  });
}
