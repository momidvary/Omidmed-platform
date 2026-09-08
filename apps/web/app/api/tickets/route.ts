import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { detectSafetySignals } from "@/lib/clinical/safety";
import { createClient as createServerClient } from "@/utils/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXERCISE_PATTERN = /^[a-z0-9][a-z0-9_-]{1,99}$/;
const MAX_REQUEST_BYTES = 12_288;

interface TicketRequestBody {
  action?: unknown;
  patientId?: unknown;
  episodeId?: unknown;
  ticketId?: unknown;
  subject?: unknown;
  message?: unknown;
  exerciseId?: unknown;
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

function classifyPriority(text: string): "routine" | "urgent" | "emergency" {
  const signals = detectSafetySignals(text);
  if (signals.some((signal) => signal.disposition === "emergency")) {
    return "emergency";
  }
  if (signals.some((signal) => signal.disposition === "urgent")) {
    return "urgent";
  }
  return "routine";
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

  let body: TicketRequestBody;
  try {
    body = (await request.json()) as TicketRequestBody;
  } catch {
    return json({ error: "invalid body" }, 400);
  }

  const userClient = createServerClient(await cookies());
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  if (body.action === "create") {
    const patientId = typeof body.patientId === "string" ? body.patientId : "";
    const episodeId = typeof body.episodeId === "string" ? body.episodeId : "";
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const exerciseId =
      typeof body.exerciseId === "string" && body.exerciseId
        ? body.exerciseId
        : null;

    if (
      !UUID_PATTERN.test(patientId) ||
      !UUID_PATTERN.test(episodeId) ||
      subject.length < 1 ||
      subject.length > 200 ||
      message.length < 1 ||
      message.length > 10_000 ||
      (exerciseId !== null && !EXERCISE_PATTERN.test(exerciseId))
    ) {
      return json({ error: "invalid body" }, 400);
    }

    const priority = classifyPriority(`${subject}\n${message}`);
    const result = await userClient.rpc("create_patient_ticket", {
      p_patient_id: patientId,
      p_episode_id: episodeId,
      p_subject: subject,
      p_message: message,
      p_exercise_id: exerciseId,
      p_priority: priority,
    });
    if (result.error) {
      const status =
        result.error.code === "54000"
          ? 429
          : result.error.code === "42501"
            ? 403
            : 422;
      return json({ error: "ticket could not be created" }, status);
    }
    const row = firstRpcRow(result.data);
    if (!row) return json({ error: "ticket creation returned no row" }, 500);
    return json({
      ticket: {
        id: row.ticket_id,
        createdAt: row.created_at,
        status: row.status,
        priority: row.priority,
      },
    });
  }

  if (body.action === "reply") {
    const ticketId = typeof body.ticketId === "string" ? body.ticketId : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (
      !UUID_PATTERN.test(ticketId) ||
      message.length < 1 ||
      message.length > 10_000
    ) {
      return json({ error: "invalid body" }, 400);
    }

    const priority = classifyPriority(message);
    const result = await userClient.rpc("reply_to_patient_ticket", {
      p_ticket_id: ticketId,
      p_content: message,
      p_priority: priority,
    });
    if (result.error) {
      return json(
        { error: "ticket reply could not be saved" },
        result.error.code === "42501" ? 403 : 422
      );
    }
    const row = firstRpcRow(result.data);
    if (!row) return json({ error: "ticket reply returned no row" }, 500);
    return json({
      reply: {
        id: row.reply_id,
        from: row.sender,
        senderUserId: row.sender_user_id,
        content: row.content,
        createdAt: row.created_at,
      },
      status: row.ticket_status,
      priority: row.ticket_priority,
    });
  }

  return json({ error: "invalid action" }, 400);
}
