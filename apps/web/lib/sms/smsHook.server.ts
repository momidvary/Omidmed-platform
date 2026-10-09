import { createHmac, timingSafeEqual } from "node:crypto";
import { toEnglishDigits } from "@/lib/phone";

/*
 * Supabase Auth "Send SMS" hook support: delivers the phone sign-in code
 * through MeliPayamak (ملی‌پیامک).
 *
 * Security invariants:
 * - The OTP is generated and verified ONLY by Supabase Auth; this code just
 *   delivers it.
 * - The OTP and the provider API key are never logged or returned; phone
 *   numbers appear in logs only masked.
 * - Every hook request must carry a valid Standard Webhooks signature made
 *   with SEND_SMS_HOOK_SECRET (fail closed when the secret is missing).
 *
 * Provider code adapted from feature/phone-otp-all-users
 * (supabase/functions/send-auth-sms/providers.ts).
 */

export interface SmsSendResult {
  ok: boolean;
  provider: string;
  /** Safe diagnostic label — never contains the token, key or phone. */
  detail?: string;
}

export interface SmsProvider {
  name: string;
  sendOtp(input: { phone: string; token: string }): Promise<SmsSendResult>;
}

export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface Logger {
  log(message: string): void;
  error(message: string): void;
}

export function maskPhone(phone: string): string {
  return phone.length < 8 ? "***" : `${phone.slice(0, 4)}***${phone.slice(-3)}`;
}

/** Supabase gives "98912…" (E.164 without '+'); Iranian panels want "0912…". */
export function toLocalIranFormat(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("98") ? `0${digits.slice(2)}` : digits;
}

/**
 * Map an HTTP status + MeliPayamak's Persian status text to a stable label.
 * The raw text is never logged because it can echo request data.
 */
export function classifyMeliPayamakError(httpStatus: number, statusText?: string): string {
  if (httpStatus === 401 || httpStatus === 403) return "invalid_api_key";
  if (httpStatus === 429) return "rate_limited";
  const s = statusText ?? "";
  if (s.includes("اعتبار")) return "insufficient_credit";
  if (s.includes("کلید") || s.includes("احراز")) return "invalid_api_key";
  if (s.includes("الگو") || s.includes("متن پیام یافت نشد")) return "invalid_pattern";
  if (s.includes("گیرنده") || s.includes("شماره")) return "invalid_number";
  if (s.includes("محدود")) return "rate_limited";
  return `provider_error_${httpStatus}`;
}

/**
 * MeliPayamak console REST API.
 * Pattern (service line, preferred):
 *   POST https://console.melipayamak.com/api/send/shared/{apiKey}
 *   { bodyId, to: "09…", args: [token] }
 * Simple-send fallback (only without a pattern):
 *   POST https://console.melipayamak.com/api/send/simple/{apiKey}
 *   { from, to, text }
 * Success is a positive numeric recId.
 */
export class MeliPayamakSmsProvider implements SmsProvider {
  name = "melipayamak";

  constructor(
    private apiKey: string,
    private otpPattern?: string,
    private sender?: string,
    private fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
    private logger: Logger = console
  ) {}

  async sendOtp({ phone, token }: { phone: string; token: string }): Promise<SmsSendResult> {
    const to = toLocalIranFormat(phone);
    if (this.otpPattern) {
      const bodyId = Number(this.otpPattern);
      if (!Number.isInteger(bodyId) || bodyId <= 0) {
        this.logger.error("[sms-hook] MELIPAYAMAK_OTP_PATTERN is not a numeric bodyId");
        return { ok: false, provider: this.name, detail: "invalid_pattern" };
      }
      return this.post("shared", { bodyId, to, args: [token] }, phone);
    }
    if (this.sender) {
      return this.post(
        "simple",
        { from: this.sender, to, text: `کد ورود شما: ${token}` },
        phone
      );
    }
    this.logger.error("[sms-hook] MeliPayamak needs MELIPAYAMAK_OTP_PATTERN (or MELIPAYAMAK_SENDER)");
    return { ok: false, provider: this.name, detail: "not_configured" };
  }

  private async post(
    endpoint: "shared" | "simple",
    body: Record<string, unknown>,
    phone: string
  ): Promise<SmsSendResult> {
    // The API key is part of the URL, so the URL is never logged.
    const url = `https://console.melipayamak.com/api/send/${endpoint}/${this.apiKey}`;
    try {
      const res = await this.fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const parsed = (await res.json().catch(() => null)) as
        | { recId?: number | null; status?: string }
        | null;
      if (res.ok && typeof parsed?.recId === "number" && parsed.recId > 0) {
        return { ok: true, provider: this.name };
      }
      const detail = classifyMeliPayamakError(res.status, parsed?.status);
      this.logger.error(
        `[sms-hook] melipayamak failed http=${res.status} detail=${detail} to=${maskPhone(phone)}`
      );
      return { ok: false, provider: this.name, detail };
    } catch {
      this.logger.error(`[sms-hook] melipayamak network error to=${maskPhone(phone)}`);
      return { ok: false, provider: this.name, detail: "network" };
    }
  }
}

/**
 * BaseServiceNumber `Value` codes (pattern send through the panel web
 * service) mapped to stable labels. Success is a long numeric recId.
 */
const PANEL_VALUE_LABELS: Record<string, string> = {
  "0": "invalid_api_key", // wrong username or API key (password)
  "-1": "webservice_disabled",
  "-2": "rate_limited",
  "-3": "invalid_pattern", // sender line of the pattern is not defined
  "-4": "invalid_pattern", // bodyId wrong or pattern not approved
  "-5": "invalid_pattern", // text does not match the pattern variables
  "-6": "provider_internal_error",
  "-7": "invalid_pattern",
  "-10": "invalid_pattern",
  "2": "insufficient_credit",
  "10": "account_inactive",
  "11": "not_sent",
  "12": "account_documents_incomplete",
  "16": "invalid_number",
  "35": "invalid_number", // recipient is on the blacklist
};

export function classifyPanelResult(value: string, retStatus?: number): string {
  if (PANEL_VALUE_LABELS[value]) return PANEL_VALUE_LABELS[value];
  if (retStatus === 0) return "invalid_api_key";
  return `provider_value_${/^-?\d{1,4}$/.test(value) ? value : "unknown"}`;
}

/**
 * MeliPayamak panel web service, authenticated with the panel username and
 * the panel APIKey (Developers → Web service settings), which MeliPayamak
 * documents as a replacement for the panel password:
 *   POST https://rest.payamak-panel.com/api/SendSMS/BaseServiceNumber
 *   form: username, password=<APIKey>, bodyId, to="09…", text=<args joined by ';'>
 *   → { Value: "<recId>" | "<error code>", RetStatus, StrRetStatus }
 */
export class MeliPayamakPanelSmsProvider implements SmsProvider {
  name = "melipayamak-panel";

  constructor(
    private username: string,
    private apiKey: string,
    private otpPattern: string,
    private fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
    private logger: Logger = console
  ) {}

  async sendOtp({ phone, token }: { phone: string; token: string }): Promise<SmsSendResult> {
    const bodyId = Number(this.otpPattern);
    if (!Number.isInteger(bodyId) || bodyId <= 0) {
      this.logger.error("[sms-hook] MELIPAYAMAK_OTP_PATTERN is not a numeric bodyId");
      return { ok: false, provider: this.name, detail: "invalid_pattern" };
    }
    const form = new URLSearchParams({
      username: this.username,
      password: this.apiKey,
      bodyId: String(bodyId),
      to: toLocalIranFormat(phone),
      text: token,
    });
    try {
      const res = await this.fetchImpl(
        "https://rest.payamak-panel.com/api/SendSMS/BaseServiceNumber",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: form.toString(),
        }
      );
      const parsed = (await res.json().catch(() => null)) as
        | { Value?: unknown; RetStatus?: unknown }
        | null;
      const value = parsed?.Value == null ? "" : String(parsed.Value).trim();
      const retStatus = typeof parsed?.RetStatus === "number" ? parsed.RetStatus : undefined;
      if (res.ok && retStatus === 1 && /^\d{5,}$/.test(value)) {
        return { ok: true, provider: this.name };
      }
      const detail = res.ok
        ? classifyPanelResult(value, retStatus)
        : classifyMeliPayamakError(res.status);
      this.logger.error(
        `[sms-hook] melipayamak panel failed http=${res.status} ret=${retStatus ?? "none"} detail=${detail} to=${maskPhone(phone)}`
      );
      return { ok: false, provider: this.name, detail };
    } catch {
      this.logger.error(`[sms-hook] melipayamak panel network error to=${maskPhone(phone)}`);
      return { ok: false, provider: this.name, detail: "network" };
    }
  }
}

/** Development only: pretends to deliver, never reveals the code. */
export class MockSmsProvider implements SmsProvider {
  name = "mock";
  constructor(private logger: Logger = console) {}
  async sendOtp({ phone }: { phone: string; token: string }): Promise<SmsSendResult> {
    this.logger.log(`[sms-hook] [DEVELOPMENT MOCK] not sending SMS to=${maskPhone(phone)}`);
    return { ok: true, provider: this.name, detail: "development-mock" };
  }
}

export interface SmsEnv {
  SMS_PROVIDER?: string;
  MELIPAYAMAK_API_KEY?: string;
  MELIPAYAMAK_OTP_PATTERN?: string;
  MELIPAYAMAK_SENDER?: string;
  MELIPAYAMAK_USERNAME?: string;
  NODE_ENV?: string;
}

/**
 * The configured provider, or null when it is missing its settings.
 * Default is MeliPayamak. The mock provider is refused in production so a
 * misconfiguration can never silently "succeed" without sending a code.
 */
export function getSmsProvider(
  env: SmsEnv,
  fetchImpl?: FetchLike,
  logger?: Logger
): SmsProvider | null {
  const which = (env.SMS_PROVIDER || "melipayamak").toLowerCase();
  if (which === "mock") {
    return env.NODE_ENV === "production" ? null : new MockSmsProvider(logger);
  }
  if (which !== "melipayamak") return null;
  // Panels display keys and numbers with Persian digits; copies keep them.
  const clean = (value?: string) => toEnglishDigits(value ?? "").trim() || undefined;
  const apiKey = clean(env.MELIPAYAMAK_API_KEY);
  const pattern = clean(env.MELIPAYAMAK_OTP_PATTERN);
  const sender = clean(env.MELIPAYAMAK_SENDER);
  const username = clean(env.MELIPAYAMAK_USERNAME);
  if (!apiKey || (!pattern && !sender)) return null;
  if (username) {
    // Panel APIKey + username: pattern send through the panel web service.
    if (!pattern) return null;
    return new MeliPayamakPanelSmsProvider(username, apiKey, pattern, fetchImpl, logger);
  }
  return new MeliPayamakSmsProvider(apiKey, pattern, sender, fetchImpl, logger);
}

/* ── Standard Webhooks signature (what Supabase Auth hooks use) ────── */

/**
 * Verify `webhook-signature` for the raw body. The secret is the value the
 * Supabase dashboard shows for the hook ("v1,whsec_<base64>").
 * Rejects timestamps more than `toleranceSeconds` away from now (replay).
 */
export function verifyStandardWebhook(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  rawBody: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300
): boolean {
  const { id, timestamp, signature } = headers;
  if (!secret || !id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isInteger(ts) || Math.abs(nowSeconds - ts) > toleranceSeconds) return false;

  const encoded = secret.trim().replace(/^v1,/, "").replace(/^whsec_/, "");
  let key: Buffer;
  try {
    key = Buffer.from(encoded, "base64");
  } catch {
    return false;
  }
  if (key.length === 0) return false;

  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest();
  return signature.split(" ").some((part) => {
    const [version, value] = part.split(",", 2);
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
