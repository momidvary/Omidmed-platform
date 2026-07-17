// Supabase Send SMS Hook → delivers the auth OTP through an SMS provider.
// Deploy:  supabase functions deploy send-auth-sms --no-verify-jwt
// Secrets (MeliPayamak — default):
//   supabase secrets set SMS_PROVIDER=melipayamak MELIPAYAMAK_API_KEY=... \
//     MELIPAYAMAK_OTP_PATTERN=<approved bodyId> SEND_SMS_HOOK_SECRET=<from dashboard>
//   (optional fallback without a pattern: MELIPAYAMAK_SENDER=<line number>)
// Secrets (Kavenegar — legacy, still supported):
//   supabase secrets set SMS_PROVIDER=kavenegar KAVENEGAR_API_KEY=... \
//     KAVENEGAR_VERIFY_TEMPLATE=... SEND_SMS_HOOK_SECRET=<from dashboard>
//
// Security invariants:
// - The OTP token is generated ONLY by Supabase (never here).
// - The token is never logged; phone numbers are logged masked.
// - The hook signature is verified with SEND_SMS_HOOK_SECRET.

import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { getProvider } from "./providers.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405 });
  }

  const payloadText = await req.text();

  // Verify the hook signature (Supabase signs with standardwebhooks).
  const hookSecret = Deno.env.get("SEND_SMS_HOOK_SECRET");
  let payload: { user?: { phone?: string }; sms?: { otp?: string } };
  try {
    if (hookSecret) {
      const wh = new Webhook(hookSecret.replace("v1,whsec_", ""));
      payload = wh.verify(payloadText, Object.fromEntries(req.headers)) as typeof payload;
    } else {
      payload = JSON.parse(payloadText);
      console.error("[send-auth-sms] WARNING: SEND_SMS_HOOK_SECRET not set — signature NOT verified");
    }
  } catch {
    return new Response(JSON.stringify({ error: "invalid signature" }), { status: 401 });
  }

  const phone = payload?.user?.phone;
  const token = payload?.sms?.otp;
  if (!phone || !token) {
    return new Response(JSON.stringify({ error: "invalid payload" }), { status: 400 });
  }

  const provider = getProvider({ get: (name) => Deno.env.get(name) });
  if (!provider) {
    console.error("[send-auth-sms] no SMS provider configured");
    return new Response(JSON.stringify({ error: "provider not configured" }), { status: 500 });
  }

  const result = await provider.sendOtp({ phone, token });
  if (!result.ok) {
    return new Response(
      JSON.stringify({ error: `sms send failed (${result.detail ?? "unknown"})` }),
      { status: 500 }
    );
  }
  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
