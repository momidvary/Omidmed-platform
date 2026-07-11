// Supabase Send SMS Hook → delivers the auth OTP through an SMS provider.
// Deploy:  supabase functions deploy send-auth-sms --no-verify-jwt
// Secrets: supabase secrets set KAVENEGAR_API_KEY=... KAVENEGAR_VERIFY_TEMPLATE=... \
//          SMS_PROVIDER=kavenegar SEND_SMS_HOOK_SECRET=<from dashboard>
//
// Security invariants:
// - The OTP token is generated ONLY by Supabase (never here).
// - The token is never logged; phone numbers are logged masked.
// - The hook signature is verified with SEND_SMS_HOOK_SECRET.

import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

interface SmsSendResult {
  ok: boolean;
  provider: string;
  /** Safe, non-sensitive diagnostic label. */
  detail?: string;
}

interface SmsProvider {
  name: string;
  sendOtp(input: {
    phone: string; // E.164 without '+' (as Supabase provides)
    token: string;
    locale?: "fa" | "en" | "ar";
  }): Promise<SmsSendResult>;
}

function maskPhone(phone: string): string {
  return phone.length < 8
    ? "***"
    : `${phone.slice(0, 4)}***${phone.slice(-3)}`;
}

/* ── Kavenegar (Verify Lookup: template-based OTP delivery) ────── */
class KavenegarSmsProvider implements SmsProvider {
  name = "kavenegar";
  constructor(
    private apiKey: string,
    private template: string
  ) {}

  async sendOtp({ phone, token }: { phone: string; token: string }): Promise<SmsSendResult> {
    const receptor = phone.startsWith("98") ? `0${phone.slice(2)}` : phone;
    const url =
      `https://api.kavenegar.com/v1/${this.apiKey}/verify/lookup.json` +
      `?receptor=${encodeURIComponent(receptor)}` +
      `&token=${encodeURIComponent(token)}` +
      `&template=${encodeURIComponent(this.template)}`;
    try {
      const res = await fetch(url);
      const body = (await res.json().catch(() => null)) as
        | { return?: { status?: number } }
        | null;
      const status = body?.return?.status;
      if (res.ok && status === 200) {
        return { ok: true, provider: this.name };
      }
      // Log provider status code only — no token, no full phone.
      console.error(
        `[send-auth-sms] kavenegar failed status=${status ?? res.status} to=${maskPhone(phone)}`
      );
      return { ok: false, provider: this.name, detail: `status_${status ?? res.status}` };
    } catch {
      console.error(`[send-auth-sms] kavenegar network error to=${maskPhone(phone)}`);
      return { ok: false, provider: this.name, detail: "network" };
    }
  }
}

/* ── Mock (development only — never delivers, never reveals OTP) ── */
class MockSmsProvider implements SmsProvider {
  name = "mock";
  async sendOtp({ phone }: { phone: string; token: string }): Promise<SmsSendResult> {
    console.log(
      `[send-auth-sms] [DEVELOPMENT MOCK] pretending to deliver OTP to=${maskPhone(phone)}`
    );
    return { ok: true, provider: this.name, detail: "development-mock" };
  }
}

function getProvider(): SmsProvider | null {
  const which = (Deno.env.get("SMS_PROVIDER") ?? "kavenegar").toLowerCase();
  if (which === "mock") return new MockSmsProvider();
  const apiKey = Deno.env.get("KAVENEGAR_API_KEY");
  const template = Deno.env.get("KAVENEGAR_VERIFY_TEMPLATE");
  if (!apiKey || !template) return null;
  return new KavenegarSmsProvider(apiKey, template);
}

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

  const provider = getProvider();
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
