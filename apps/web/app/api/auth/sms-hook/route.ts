import { NextResponse } from "next/server";
import {
  getSmsProvider,
  maskPhone,
  verifyStandardWebhook,
} from "@/lib/sms/smsHook.server";

/*
 * Supabase Auth → Hooks → "Send SMS" (HTTPS) points here:
 *   https://<your-app>/api/auth/sms-hook
 * Supabase generates the one-time code and posts it, signed with the hook
 * secret; this route only delivers it through MeliPayamak.
 *
 * Server env: SEND_SMS_HOOK_SECRET (the "v1,whsec_…" value from the hook
 * settings), MELIPAYAMAK_API_KEY, MELIPAYAMAK_OTP_PATTERN (approved
 * pattern bodyId) — or SMS_PROVIDER=mock for local development only.
 */

const MAX_BODY_BYTES = 16_384;

function hookError(httpCode: number, message: string) {
  // Error shape understood by Supabase Auth hooks.
  return NextResponse.json(
    { error: { http_code: httpCode, message } },
    { status: httpCode, headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  const secret = process.env.SEND_SMS_HOOK_SECRET;
  if (!secret) {
    console.error("[sms-hook] SEND_SMS_HOOK_SECRET is not set; refusing to send");
    return hookError(500, "SMS hook is not configured");
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) return hookError(413, "payload too large");

  const verified = verifyStandardWebhook(
    secret,
    {
      id: request.headers.get("webhook-id"),
      timestamp: request.headers.get("webhook-timestamp"),
      signature: request.headers.get("webhook-signature"),
    },
    rawBody
  );
  if (!verified) {
    console.error(
      "[sms-hook] invalid signature: SEND_SMS_HOOK_SECRET does not match the Supabase hook secret"
    );
    return hookError(401, "invalid signature");
  }

  let payload: { user?: { phone?: unknown }; sms?: { otp?: unknown } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return hookError(400, "invalid payload");
  }
  const phone = typeof payload.user?.phone === "string" ? payload.user.phone : "";
  const token = typeof payload.sms?.otp === "string" ? payload.sms.otp : "";
  if (!/^\+?\d{8,15}$/.test(phone) || !/^\d{4,10}$/.test(token)) {
    return hookError(400, "invalid payload");
  }

  const provider = getSmsProvider({
    SMS_PROVIDER: process.env.SMS_PROVIDER,
    MELIPAYAMAK_API_KEY: process.env.MELIPAYAMAK_API_KEY,
    MELIPAYAMAK_OTP_PATTERN: process.env.MELIPAYAMAK_OTP_PATTERN,
    MELIPAYAMAK_SENDER: process.env.MELIPAYAMAK_SENDER,
    NODE_ENV: process.env.NODE_ENV,
  });
  if (!provider) {
    console.error("[sms-hook] no SMS provider configured");
    return hookError(500, "SMS provider is not configured");
  }

  const result = await provider.sendOtp({ phone, token });
  if (!result.ok) {
    console.error(
      `[sms-hook] delivery failed provider=${result.provider} detail=${result.detail ?? "unknown"} to=${maskPhone(phone)}`
    );
    return hookError(502, `SMS delivery failed (${result.detail ?? "unknown"})`);
  }
  return NextResponse.json({}, { headers: { "Cache-Control": "no-store" } });
}
