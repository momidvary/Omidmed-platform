import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/utils/supabase/server";
import { buildTicketAutoReply } from "@/lib/ai/engine";

/*
 * Creates the AI triage auto-reply on a ticket.
 *
 * Security model: sender='ai' is not writable through RLS by any client,
 * so this route is the only path. It verifies the caller is signed in and
 * can see the ticket (via their own RLS-scoped session), then inserts the
 * reply with the server-only service key (SUPABASE_SECRET_KEY — never
 * exposed to the browser). Without that key the route degrades to 503 and
 * the app simply shows no auto-reply.
 *
 * Three rules keep this safe once a real model is wired in below:
 *
 *   1. The prompt text comes from the STORED ticket, never from the
 *      request body. Otherwise any authenticated patient could have the
 *      model answer an arbitrary prompt and have the output filed in a
 *      clinical record under the clinic's own AI persona.
 *   2. One AI reply per ticket, enforced by checking first. Replays and
 *      double-submits return the existing reply instead of stacking.
 *   3. A per-user hourly cap, so a loop cannot run up a provider bill.
 *
 * 🔌 REAL AI API INTEGRATION POINT — replace buildTicketAutoReply with a
 * real AI call here (server-side, keys stay in env). Keep 1–3 in place.
 */

/** Max tickets one user may trigger an AI reply for, per hour. */
const HOURLY_LIMIT = 10;

export async function POST(req: Request) {
  let body: { ticketId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { ticketId } = body;
  if (!ticketId || typeof ticketId !== "string") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    return NextResponse.json(
      { error: "AI replies not configured on the server" },
      { status: 503 }
    );
  }

  // Caller must be authenticated and able to see this ticket — checked
  // with the caller's OWN session, so RLS does the authorization.
  const userClient = createServerClient(await cookies());
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // The message is read from the row, never taken from the request.
  const { data: ticket } = await userClient
    .from("tickets")
    .select("id, message")
    .eq("id", ticketId)
    .maybeSingle();
  if (!ticket) {
    return NextResponse.json({ error: "ticket not found" }, { status: 404 });
  }

  // Idempotent: a ticket gets exactly one AI reply.
  const { data: existing } = await userClient
    .from("ticket_replies")
    .select("id, content, created_at")
    .eq("ticket_id", ticketId)
    .eq("sender", "ai")
    .limit(1)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({
      reply: {
        id: existing.id,
        content: existing.content,
        createdAt: existing.created_at,
      },
    });
  }

  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await userClient
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("created_by", user.id)
    .gte("created_at", since);
  if ((count ?? 0) > HOURLY_LIMIT) {
    return NextResponse.json(
      { error: "too many requests" },
      { status: 429, headers: { "Retry-After": "3600" } }
    );
  }

  const admin = createSupabaseClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin
    .from("ticket_replies")
    .insert({
      ticket_id: ticketId,
      sender: "ai",
      sender_user_id: null,
      content: buildTicketAutoReply(ticket.message),
    })
    .select("id, content, created_at")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "insert failed" }, { status: 500 });
  }

  return NextResponse.json({
    reply: { id: data.id, content: data.content, createdAt: data.created_at },
  });
}
