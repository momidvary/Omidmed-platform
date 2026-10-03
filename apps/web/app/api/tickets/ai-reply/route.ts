import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/utils/supabase/server";
import { buildTicketAutoReply } from "@/lib/ai/engine";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_REQUEST_BYTES = 1_024;
const MAX_TICKET_MESSAGE_LENGTH = 4_000;

function json(
  body: Record<string, unknown>,
  status = 200
): NextResponse<Record<string, unknown>> {
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
 * Creates the AI triage auto-reply on a ticket.
 *
 * Security model: sender='ai' is not writable through RLS by any client,
 * so this route is the only path. It verifies the caller is signed in and
 * can see and created the ticket (via their own RLS-scoped session), then
 * calls a narrow idempotent service-only RPC. The service key is never
 * exposed to the browser. Without it the route degrades to 503 and the app
 * simply shows no auto-reply.
 *
 * 🔌 REAL AI API INTEGRATION POINT — replace buildTicketAutoReply with a
 * real AI call here (server-side, keys stay in env).
 */
export async function POST(req: Request) {
  const requestUrl = new URL(req.url);
  const origin = req.headers.get("origin");
  if (!origin || origin !== requestUrl.origin) {
    return json({ error: "forbidden origin" }, 403);
  }
  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (
    !Number.isFinite(declaredLength) ||
    declaredLength < 0 ||
    declaredLength > MAX_REQUEST_BYTES
  ) {
    return json({ error: "request too large" }, 413);
  }

  let body: { ticketId?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid body" }, 400);
  }
  const { ticketId } = body;
  if (typeof ticketId !== "string" || !UUID_PATTERN.test(ticketId)) {
    return json({ error: "invalid body" }, 400);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    return json({ error: "AI replies not configured on the server" }, 503);
  }

  // Caller must be authenticated and able to see this ticket — checked
  // with the caller's OWN session, so RLS does the authorization.
  const userClient = createServerClient(await cookies());
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return json({ error: "unauthorized" }, 401);
  }
  const { data: ticket } = await userClient
    .from("tickets")
    .select("id, message, created_by")
    .eq("id", ticketId)
    .maybeSingle();
  if (!ticket) {
    return json({ error: "ticket not found" }, 404);
  }
  // This endpoint acknowledges a newly submitted patient ticket. Merely
  // being allowed to view a ticket is not sufficient authorization.
  if (ticket.created_by !== user.id) {
    return json({ error: "forbidden" }, 403);
  }
  if (
    typeof ticket.message !== "string" ||
    ticket.message.length === 0 ||
    ticket.message.length > MAX_TICKET_MESSAGE_LENGTH
  ) {
    return json({ error: "invalid stored ticket" }, 422);
  }

  const admin = createSupabaseClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const result = await admin.rpc("attach_ticket_auto_ack", {
    p_ticket_id: ticketId,
    p_expected_creator: user.id,
    p_content: buildTicketAutoReply(ticket.message),
  });
  if (result.error) {
    return json({ error: "insert failed" }, 500);
  }
  const row = firstRpcRow(result.data);
  if (!row) return json({ error: "insert returned no row" }, 500);

  return json({
    reply: {
      id: row.reply_id,
      content: row.content,
      createdAt: row.created_at,
    },
  });
}
