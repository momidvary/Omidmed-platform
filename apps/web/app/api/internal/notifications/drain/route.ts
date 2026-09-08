import { performance } from "node:perf_hooks";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import {
  boundedRetryAfter,
  isStrongServerSecret,
  normalizeWebhookEndpoint,
  NotificationClaimSchema,
  NotificationHealthSchema,
  secureTokenEquals,
  signWebhookPayload,
} from "@/lib/notifications/webhook.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BATCH_SIZE = 10;
const DELIVERY_TIMEOUT_MS = 10_000;

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function elapsedMs(startedAt: number): number {
  return Math.min(120_000, Math.max(0, Math.round(performance.now() - startedAt)));
}

async function drain(request: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  const webhookSecret = process.env.CLINICAL_ALERT_WEBHOOK_SECRET;
  const endpoint = normalizeWebhookEndpoint(
    process.env.CLINICAL_ALERT_WEBHOOK_URL
  );
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseSecret = process.env.SUPABASE_SECRET_KEY;

  if (
    !isStrongServerSecret(cronSecret) ||
    !isStrongServerSecret(webhookSecret) ||
    !endpoint ||
    !supabaseUrl ||
    !supabaseSecret
  ) {
    return json({ error: "notification_delivery_not_configured" }, 503);
  }
  if (
    !secureTokenEquals(
      request.headers.get("authorization"),
      `Bearer ${cronSecret}`
    )
  ) {
    return json({ error: "unauthorized" }, 401);
  }

  const admin = createAdminClient(supabaseUrl, supabaseSecret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const claimResult = await admin.rpc("claim_notification_batch", {
    p_limit: BATCH_SIZE,
  });
  if (claimResult.error) {
    return json({ error: "notification_claim_failed" }, 500);
  }
  const parsedClaims = NotificationClaimSchema.array().safeParse(
    claimResult.data ?? []
  );
  if (!parsedClaims.success) {
    // Any rows already leased here are recovered by the database lease timeout.
    return json({ error: "invalid_notification_claim" }, 500);
  }

  const results = await Promise.all(
    parsedClaims.data.map(async (claim) => {
      const rawBody = JSON.stringify(claim.payload);
      const timestamp = Math.floor(Date.now() / 1_000).toString();
      const startedAt = performance.now();
      let success = false;
      let errorCode: string | null = null;
      let responseStatus: number | null = null;
      let retryAfterSeconds = 60;

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          redirect: "error",
          cache: "no-store",
          signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": claim.event_key,
            "X-PhysioAI-Delivery": claim.notification_id,
            "X-PhysioAI-Event": claim.payload.event,
            "X-PhysioAI-Timestamp": timestamp,
            "X-PhysioAI-Signature": signWebhookPayload(
              webhookSecret,
              timestamp,
              rawBody
            ),
          },
          body: rawBody,
        });
        responseStatus = response.status;
        retryAfterSeconds = boundedRetryAfter(response.headers.get("retry-after"));
        success = response.ok;
        errorCode = response.ok ? null : "webhook_http_error";
        await response.body?.cancel();
      } catch (error) {
        errorCode =
          error instanceof Error &&
          (error.name === "AbortError" || error.name === "TimeoutError")
            ? "webhook_timeout"
            : "webhook_network_error";
      }

      const completion = await admin.rpc("complete_notification_delivery", {
        p_notification_id: claim.notification_id,
        p_success: success,
        p_error_code: errorCode,
        p_response_status: responseStatus,
        p_duration_ms: elapsedMs(startedAt),
        p_retry_after_seconds: retryAfterSeconds,
      });
      if (completion.error) return "completion-error" as const;
      if (completion.data === "delivered") return "delivered" as const;
      if (completion.data === "dead-letter") return "dead-letter" as const;
      return "retrying" as const;
    })
  );
  const healthResult = await admin.rpc("get_notification_delivery_health");
  const healthValue = Array.isArray(healthResult.data)
    ? healthResult.data[0]
    : healthResult.data;
  const health = NotificationHealthSchema.safeParse(healthValue);

  return json({
    claimed: parsedClaims.data.length,
    delivered: results.filter((result) => result === "delivered").length,
    retrying: results.filter((result) => result === "retrying").length,
    deadLetteredThisRun: results.filter((result) => result === "dead-letter")
      .length,
    completionErrors: results.filter((result) => result === "completion-error")
      .length,
    queueHealth: health.success
      ? {
          pending: health.data.pending_count,
          processing: health.data.processing_count,
          deadLetter: health.data.dead_letter_count,
          oldestPendingSeconds: health.data.oldest_pending_seconds,
        }
      : null,
    healthUnavailable: Boolean(healthResult.error || !health.success),
  });
}

export async function GET(request: Request): Promise<Response> {
  return drain(request);
}

export async function POST(request: Request): Promise<Response> {
  return drain(request);
}
