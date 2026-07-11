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
 * 🔌 REAL AI API INTEGRATION POINT — replace buildTicketAutoReply with a
 * real AI call here (server-side, keys stay in env).
 */
export async function POST(req: Request) {
  let body: { ticketId?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { ticketId, message } = body;
  if (!ticketId || typeof message !== "string") {
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
  const { data: ticket } = await userClient
    .from("tickets")
    .select("id")
    .eq("id", ticketId)
    .maybeSingle();
  if (!ticket) {
    return NextResponse.json({ error: "ticket not found" }, { status: 404 });
  }

  const admin = createSupabaseClient(url, secret);
  const { data, error } = await admin
    .from("ticket_replies")
    .insert({
      ticket_id: ticketId,
      sender: "ai",
      sender_user_id: null,
      content: buildTicketAutoReply(message),
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
