import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/utils/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RELATIONSHIPS = new Set(["self", "parent", "guardian", "caregiver"]);
const MAX_REQUEST_BYTES = 2_048;

interface InviteBody {
  patientId?: unknown;
  email?: unknown;
  relationship?: unknown;
  expiresAt?: unknown;
  authorityAttested?: unknown;
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function firstRpcRow(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === "object"
      ? (first as Record<string, unknown>)
      : null;
  }
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  if (!origin || origin !== requestUrl.origin) {
    return json({ error: "forbidden origin" }, 403);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (
    !Number.isFinite(declaredLength) ||
    declaredLength < 0 ||
    declaredLength > MAX_REQUEST_BYTES
  ) {
    return json({ error: "request too large" }, 413);
  }

  let body: InviteBody;
  try {
    body = (await request.json()) as InviteBody;
  } catch {
    return json({ error: "invalid body" }, 400);
  }

  const patientId =
    typeof body.patientId === "string" ? body.patientId : "";
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const relationship =
    typeof body.relationship === "string" ? body.relationship : "";
  const expiresAt =
    typeof body.expiresAt === "string" && body.expiresAt
      ? body.expiresAt
      : null;
  const expiryTime = expiresAt === null ? null : Date.parse(expiresAt);

  if (
    !UUID_PATTERN.test(patientId) ||
    email.length > 254 ||
    !EMAIL_PATTERN.test(email) ||
    !RELATIONSHIPS.has(relationship) ||
    body.authorityAttested !== true ||
    (expiryTime !== null &&
      (!Number.isFinite(expiryTime) || expiryTime <= Date.now())) ||
    (relationship !== "self" && expiryTime === null)
  ) {
    return json({ error: "invalid body" }, 400);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    return json({ error: "patient invitations are not configured" }, 503);
  }

  const userClient = createServerClient(await cookies());
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  const linkParams = {
    p_patient_id: patientId,
    p_email: email,
    p_relationship: relationship,
    p_expires_at: expiresAt,
    p_authority_attested: true,
  };
  const firstLink = await userClient.rpc(
    "link_patient_account_by_email",
    linkParams
  );
  if (firstLink.error) {
    return json(
      { error: "patient link is not permitted" },
      firstLink.error.code === "42501" ? 403 : 422
    );
  }
  const firstStatus = firstRpcRow(firstLink.data)?.link_status;
  if (firstStatus === "linked" || firstStatus === "already-linked") {
    return json({ status: "linked-existing" });
  }
  if (firstStatus !== "account-not-found") {
    return json({ error: "patient link failed" }, 500);
  }

  const reservation = await userClient.rpc("reserve_patient_invitation", {
    p_patient_id: patientId,
    p_email: email,
  });
  if (reservation.error) {
    return json(
      { error: "invitation is temporarily unavailable" },
      reservation.error.code === "P0001" ? 429 : 403
    );
  }

  const admin = createSupabaseClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const invitation = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${requestUrl.origin}/auth/update-password`,
  });

  // If another request created the Auth user first, the second link attempt
  // still produces one idempotent portal grant without exposing account state.
  const finalLink = await userClient.rpc(
    "link_patient_account_by_email",
    linkParams
  );
  const finalStatus = firstRpcRow(finalLink.data)?.link_status;
  if (
    finalLink.error ||
    (finalStatus !== "linked" && finalStatus !== "already-linked")
  ) {
    return json({ error: "invitation could not be linked" }, 502);
  }
  return json({ status: invitation.error ? "linked-existing" : "invited" });
}
