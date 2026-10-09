import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/utils/supabase/server";
import { normalizeIranianMobile } from "@/lib/phone";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RELATIONSHIPS = new Set(["self", "parent", "guardian", "caregiver"]);
const MAX_REQUEST_BYTES = 2_048;

interface InviteBody {
  patientId?: unknown;
  phone?: unknown;
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

/*
 * Link a patient-portal account by MOBILE NUMBER (clinic owners only).
 *
 * The patient signs in at /patient with that number and an SMS one-time
 * code (Supabase phone auth). If no Auth account has the number yet, one is
 * created here with the service key — phone marked confirmed, no SMS sent —
 * and then linked. Authorization (owner of the patient's clinic, consent
 * attestation, patient-only account) is enforced by the database RPC under
 * the caller's own session; the service key only creates the Auth user.
 */
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
  const phone =
    typeof body.phone === "string" ? normalizeIranianMobile(body.phone) : null;
  const relationship =
    typeof body.relationship === "string" ? body.relationship : "";
  const expiresAt =
    typeof body.expiresAt === "string" && body.expiresAt
      ? body.expiresAt
      : null;
  const expiryTime = expiresAt === null ? null : Date.parse(expiresAt);

  if (
    !UUID_PATTERN.test(patientId) ||
    !phone ||
    !RELATIONSHIPS.has(relationship) ||
    body.authorityAttested !== true ||
    (expiryTime !== null &&
      (!Number.isFinite(expiryTime) || expiryTime <= Date.now())) ||
    (relationship !== "self" && expiryTime === null)
  ) {
    return json({ error: "invalid body", reason: "invalid" }, 400);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    return json(
      { error: "patient account linking is not configured", reason: "not_configured" },
      503
    );
  }

  const userClient = createServerClient(await cookies());
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return json({ error: "unauthorized", reason: "unauthorized" }, 401);

  const linkParams = {
    p_patient_id: patientId,
    p_phone: phone,
    p_relationship: relationship,
    p_expires_at: expiresAt,
    p_authority_attested: true,
  };

  async function link() {
    const result = await userClient.rpc("link_patient_account_by_phone", linkParams);
    if (result.error) {
      // 42501: caller is not an owner of this patient's clinic.
      // 23514: not a patient-only account (staff, no profile, or already
      //        the "self" account of another patient).
      const code = result.error.code;
      return {
        failure: json(
          {
            error: "patient link is not permitted",
            reason:
              code === "42501"
                ? "not_permitted"
                : code === "23514"
                  ? "account_not_eligible"
                  : "invalid",
          },
          code === "42501" ? 403 : 422
        ),
        status: null,
      };
    }
    return {
      failure: null,
      status: firstRpcRow(result.data)?.link_status as string | undefined,
    };
  }

  const first = await link();
  if (first.failure) return first.failure;
  if (first.status === "linked" || first.status === "already-linked") {
    return json({ status: "linked-existing" });
  }
  if (first.status !== "account-not-found") {
    return json({ error: "patient link failed", reason: "link_failed" }, 500);
  }

  // No Auth account has this number yet: create it (no SMS is sent; the
  // patient requests a code when signing in), then link it.
  const admin = createSupabaseClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const created = await admin.auth.admin.createUser({
    phone,
    phone_confirm: true,
  });

  // A concurrent request may have created the account first; the second
  // link attempt is idempotent either way.
  const second = await link();
  if (second.failure) return second.failure;
  if (second.status === "linked" || second.status === "already-linked") {
    return json({ status: created.error ? "linked-existing" : "created" });
  }
  return json(
    { error: "portal account could not be created", reason: "create_failed" },
    502
  );
}
