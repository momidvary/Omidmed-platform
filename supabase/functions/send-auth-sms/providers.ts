// SMS provider abstraction for the send-auth-sms Edge Function.
//
// This module is runtime-agnostic: no Deno globals, fetch and logger are
// injectable, so the exact code that runs in production is unit-testable
// from vitest (apps/web/lib/__tests__/sms-providers.test.ts).
//
// Security invariants (apply to every provider):
// - The OTP token is generated ONLY by Supabase — providers just deliver it.
// - The token and the API key are NEVER logged or returned in results.
// - Phone numbers appear in logs only masked (maskPhone).

export interface SmsSendResult {
  ok: boolean;
  provider: string;
  /** Safe, non-sensitive diagnostic label (never contains token/key/phone). */
  detail?: string;
}

export interface SmsOtpInput {
  /** E.164 without '+' (as Supabase provides), e.g. "989123456789". */
  phone: string;
  token: string;
  locale?: "fa" | "en" | "ar";
}

export interface SmsProvider {
  name: string;
  sendOtp(input: SmsOtpInput): Promise<SmsSendResult>;
}

/** Minimal fetch shape so tests can inject a fake without DOM lib types. */
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string }
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export interface Logger {
  log(message: string): void;
  error(message: string): void;
}

export function maskPhone(phone: string): string {
  return phone.length < 8
    ? "***"
    : `${phone.slice(0, 4)}***${phone.slice(-3)}`;
}

/** Supabase gives "9891234..."; Iranian SMS panels want local "0912...". */
export function toLocalIranFormat(phone: string): string {
  return phone.startsWith("98") ? `0${phone.slice(2)}` : phone;
}

/* ── MeliPayamak (console.melipayamak.com REST) — default provider ──
 *
 * Pattern / service-line send (خط خدماتی — reaches blacklisted numbers):
 *   POST https://console.melipayamak.com/api/send/shared/{apiKey}
 *   body { bodyId: <approved pattern id>, to: "09...", args: [token] }
 * Fallback simple send (only when no pattern is configured):
 *   POST https://console.melipayamak.com/api/send/simple/{apiKey}
 *   body { from: <sender line>, to: "09...", text }
 * Both respond { recId: number|null, status: string } — success is a
 * positive recId; `status` is a Persian description used here only to
 * classify the error (never logged verbatim, it may echo input).
 */
export class MeliPayamakSmsProvider implements SmsProvider {
  name = "melipayamak";

  constructor(
    private apiKey: string,
    /** Approved OTP pattern (bodyId). Preferred delivery path. */
    private otpPattern?: string,
    /** Sender line for the simple-send fallback. */
    private sender?: string,
    private fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
    private logger: Logger = console
  ) {}

  async sendOtp({ phone, token }: SmsOtpInput): Promise<SmsSendResult> {
    const to = toLocalIranFormat(phone);

    if (this.otpPattern) {
      const bodyId = Number(this.otpPattern);
      if (!Number.isFinite(bodyId) || bodyId <= 0) {
        this.logger.error(
          `[send-auth-sms] melipayamak MELIPAYAMAK_OTP_PATTERN is not a numeric bodyId`
        );
        return { ok: false, provider: this.name, detail: "invalid_pattern" };
      }
      return this.post(
        "shared",
        { bodyId, to, args: [token] },
        phone
      );
    }

    if (this.sender) {
      return this.post(
        "simple",
        { from: this.sender, to, text: `کد ورود شما: ${token}` },
        phone
      );
    }

    this.logger.error(
      "[send-auth-sms] melipayamak missing MELIPAYAMAK_OTP_PATTERN (or MELIPAYAMAK_SENDER fallback)"
    );
    return { ok: false, provider: this.name, detail: "not_configured" };
  }

  private async post(
    endpoint: "shared" | "simple",
    body: Record<string, unknown>,
    phone: string
  ): Promise<SmsSendResult> {
    // apiKey lives in the URL path — the URL must therefore never be logged.
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
        `[send-auth-sms] melipayamak failed http=${res.status} detail=${detail} to=${maskPhone(phone)}`
      );
      return { ok: false, provider: this.name, detail };
    } catch {
      this.logger.error(
        `[send-auth-sms] melipayamak network error to=${maskPhone(phone)}`
      );
      return { ok: false, provider: this.name, detail: "network" };
    }
  }
}

/**
 * Map an HTTP status + MeliPayamak Persian status text to a safe,
 * stable diagnostic label. The raw status text is never logged/returned
 * because it can echo request data.
 */
export function classifyMeliPayamakError(
  httpStatus: number,
  statusText?: string
): string {
  if (httpStatus === 401 || httpStatus === 403) return "invalid_api_key";
  if (httpStatus === 429) return "rate_limited";
  const s = statusText ?? "";
  if (s.includes("اعتبار")) return "insufficient_credit"; // credit
  if (s.includes("کلید") || s.includes("احراز")) return "invalid_api_key";
  if (s.includes("الگو") || s.includes("متن پیام یافت نشد"))
    return "invalid_pattern";
  if (s.includes("گیرنده") || s.includes("شماره")) return "invalid_number";
  if (s.includes("محدود")) return "rate_limited";
  return `provider_error_${httpStatus}`;
}

/* ── Kavenegar (Verify Lookup: template-based OTP delivery) ────── */
export class KavenegarSmsProvider implements SmsProvider {
  name = "kavenegar";

  constructor(
    private apiKey: string,
    private template: string,
    private fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
    private logger: Logger = console
  ) {}

  async sendOtp({ phone, token }: SmsOtpInput): Promise<SmsSendResult> {
    const receptor = toLocalIranFormat(phone);
    // apiKey lives in the URL path — the URL must therefore never be logged.
    const url =
      `https://api.kavenegar.com/v1/${this.apiKey}/verify/lookup.json` +
      `?receptor=${encodeURIComponent(receptor)}` +
      `&token=${encodeURIComponent(token)}` +
      `&template=${encodeURIComponent(this.template)}`;
    try {
      const res = await this.fetchImpl(url);
      const body = (await res.json().catch(() => null)) as
        | { return?: { status?: number } }
        | null;
      const status = body?.return?.status;
      if (res.ok && status === 200) {
        return { ok: true, provider: this.name };
      }
      // Log provider status code only — no token, no full phone.
      this.logger.error(
        `[send-auth-sms] kavenegar failed status=${status ?? res.status} to=${maskPhone(phone)}`
      );
      return {
        ok: false,
        provider: this.name,
        detail: `status_${status ?? res.status}`,
      };
    } catch {
      this.logger.error(
        `[send-auth-sms] kavenegar network error to=${maskPhone(phone)}`
      );
      return { ok: false, provider: this.name, detail: "network" };
    }
  }
}

/* ── Mock (development only — never delivers, never reveals OTP) ── */
export class MockSmsProvider implements SmsProvider {
  name = "mock";

  constructor(private logger: Logger = console) {}

  async sendOtp({ phone }: SmsOtpInput): Promise<SmsSendResult> {
    this.logger.log(
      `[send-auth-sms] [DEVELOPMENT MOCK] pretending to deliver OTP to=${maskPhone(phone)}`
    );
    return { ok: true, provider: this.name, detail: "development-mock" };
  }
}

/* ── Provider selection from environment ───────────────────────── */

export interface ProviderEnv {
  get(name: string): string | undefined;
}

/**
 * Build the configured provider. Default is MeliPayamak; Kavenegar is
 * kept for backwards compatibility; Mock is development-only.
 * Returns null when the selected provider is missing its secrets.
 */
export function getProvider(
  env: ProviderEnv,
  fetchImpl?: FetchLike,
  logger?: Logger
): SmsProvider | null {
  const which = (env.get("SMS_PROVIDER") ?? "melipayamak").toLowerCase();

  if (which === "mock") return new MockSmsProvider(logger);

  if (which === "kavenegar") {
    const apiKey = env.get("KAVENEGAR_API_KEY");
    const template = env.get("KAVENEGAR_VERIFY_TEMPLATE");
    if (!apiKey || !template) return null;
    return new KavenegarSmsProvider(apiKey, template, fetchImpl, logger);
  }

  if (which === "melipayamak") {
    const apiKey = env.get("MELIPAYAMAK_API_KEY");
    if (!apiKey) return null;
    const pattern = env.get("MELIPAYAMAK_OTP_PATTERN");
    const sender = env.get("MELIPAYAMAK_SENDER");
    if (!pattern && !sender) return null;
    return new MeliPayamakSmsProvider(apiKey, pattern, sender, fetchImpl, logger);
  }

  return null;
}
