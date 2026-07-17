import { describe, it, expect } from "vitest";
import {
  MockSmsProvider,
  MeliPayamakSmsProvider,
  KavenegarSmsProvider,
  classifyMeliPayamakError,
  getProvider,
  maskPhone,
  toLocalIranFormat,
  type FetchLike,
  type Logger,
} from "../../../../supabase/functions/send-auth-sms/providers";

/* Test doubles ---------------------------------------------------- */

const PHONE = "989123456789"; // as Supabase provides (E.164 without '+')
const TOKEN = "123456";
const API_KEY = "super-secret-api-key";

function captureLogger(): Logger & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    log: (m: string) => lines.push(m),
    error: (m: string) => lines.push(m),
  };
}

function fakeFetch(
  response: { status?: number; body?: unknown } | "network-error",
  calls: { url: string; init?: Parameters<FetchLike>[1] }[] = []
): { fetch: FetchLike; calls: typeof calls } {
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    if (response === "network-error") throw new Error("boom");
    const status = response.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => response.body ?? null,
    };
  };
  return { fetch, calls };
}

/** No log line may ever contain the OTP, the API key, or the full phone. */
function expectNoSecretsIn(lines: string[]) {
  for (const line of lines) {
    expect(line).not.toContain(TOKEN);
    expect(line).not.toContain(API_KEY);
    expect(line).not.toContain(PHONE);
    expect(line).not.toContain("09123456789");
  }
}

/* Helpers ---------------------------------------------------------- */

describe("maskPhone / toLocalIranFormat", () => {
  it("masks all but prefix and last digits", () => {
    expect(maskPhone(PHONE)).toBe("9891***789");
    expect(maskPhone("123")).toBe("***");
  });

  it("converts 98-prefixed numbers to local 0-prefixed format", () => {
    expect(toLocalIranFormat(PHONE)).toBe("09123456789");
    expect(toLocalIranFormat("09123456789")).toBe("09123456789");
  });
});

/* Mock provider ---------------------------------------------------- */

describe("MockSmsProvider", () => {
  it("succeeds, labels itself as development mock, never reveals the OTP", async () => {
    const logger = captureLogger();
    const result = await new MockSmsProvider(logger).sendOtp({
      phone: PHONE,
      token: TOKEN,
    });
    expect(result).toEqual({
      ok: true,
      provider: "mock",
      detail: "development-mock",
    });
    expect(logger.lines.some((l) => l.includes("[DEVELOPMENT MOCK]"))).toBe(true);
    expect(logger.lines.some((l) => l.includes(maskPhone(PHONE)))).toBe(true);
    expectNoSecretsIn(logger.lines);
  });
});

/* MeliPayamak ------------------------------------------------------ */

describe("MeliPayamakSmsProvider (pattern send)", () => {
  it("sends via the shared/pattern endpoint with local phone format", async () => {
    const { fetch, calls } = fakeFetch({ body: { recId: 123456789, status: "ارسال موفق بود" } });
    const logger = captureLogger();
    const provider = new MeliPayamakSmsProvider(API_KEY, "77000", undefined, fetch, logger);

    const result = await provider.sendOtp({ phone: PHONE, token: TOKEN });

    expect(result).toEqual({ ok: true, provider: "melipayamak" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      `https://console.melipayamak.com/api/send/shared/${API_KEY}`
    );
    expect(JSON.parse(calls[0].init?.body ?? "{}")).toEqual({
      bodyId: 77000,
      to: "09123456789",
      args: [TOKEN],
    });
    expect(logger.lines).toHaveLength(0); // success logs nothing
  });

  it("falls back to simple send when only a sender line is configured", async () => {
    const { fetch, calls } = fakeFetch({ body: { recId: 42, status: "ok" } });
    const provider = new MeliPayamakSmsProvider(
      API_KEY, undefined, "50004000", fetch, captureLogger()
    );

    const result = await provider.sendOtp({ phone: PHONE, token: TOKEN });

    expect(result.ok).toBe(true);
    expect(calls[0].url).toBe(
      `https://console.melipayamak.com/api/send/simple/${API_KEY}`
    );
    const body = JSON.parse(calls[0].init?.body ?? "{}");
    expect(body.from).toBe("50004000");
    expect(body.to).toBe("09123456789");
    expect(body.text).toContain(TOKEN); // token goes to the SMS text itself
  });

  it("rejects a non-numeric pattern without calling the API", async () => {
    const { fetch, calls } = fakeFetch({ body: {} });
    const logger = captureLogger();
    const provider = new MeliPayamakSmsProvider(API_KEY, "not-a-number", undefined, fetch, logger);

    const result = await provider.sendOtp({ phone: PHONE, token: TOKEN });

    expect(result).toEqual({ ok: false, provider: "melipayamak", detail: "invalid_pattern" });
    expect(calls).toHaveLength(0);
    expectNoSecretsIn(logger.lines);
  });

  it("fails safely when neither pattern nor sender is configured", async () => {
    const logger = captureLogger();
    const provider = new MeliPayamakSmsProvider(
      API_KEY, undefined, undefined, fakeFetch({ body: {} }).fetch, logger
    );
    const result = await provider.sendOtp({ phone: PHONE, token: TOKEN });
    expect(result).toEqual({ ok: false, provider: "melipayamak", detail: "not_configured" });
    expectNoSecretsIn(logger.lines);
  });

  it.each([
    [{ status: 401, body: null }, "invalid_api_key"],
    [{ status: 429, body: null }, "rate_limited"],
    [{ status: 200, body: { recId: null, status: "اعتبار کافی نیست" } }, "insufficient_credit"],
    [{ status: 200, body: { recId: null, status: "الگو یافت نشد" } }, "invalid_pattern"],
    [{ status: 200, body: { recId: null, status: "شماره گیرنده نامعتبر است" } }, "invalid_number"],
    [{ status: 500, body: null }, "provider_error_500"],
  ])("maps provider failure %j to detail %s", async (response, expected) => {
    const { fetch } = fakeFetch(response);
    const logger = captureLogger();
    const provider = new MeliPayamakSmsProvider(API_KEY, "77000", undefined, fetch, logger);

    const result = await provider.sendOtp({ phone: PHONE, token: TOKEN });

    expect(result.ok).toBe(false);
    expect(result.detail).toBe(expected);
    expect(logger.lines.length).toBeGreaterThan(0);
    expectNoSecretsIn(logger.lines);
  });

  it("maps network errors and logs only the masked phone", async () => {
    const { fetch } = fakeFetch("network-error");
    const logger = captureLogger();
    const provider = new MeliPayamakSmsProvider(API_KEY, "77000", undefined, fetch, logger);

    const result = await provider.sendOtp({ phone: PHONE, token: TOKEN });

    expect(result).toEqual({ ok: false, provider: "melipayamak", detail: "network" });
    expect(logger.lines.some((l) => l.includes(maskPhone(PHONE)))).toBe(true);
    expectNoSecretsIn(logger.lines);
  });
});

describe("classifyMeliPayamakError", () => {
  it("prefers HTTP auth/rate statuses over body text", () => {
    expect(classifyMeliPayamakError(401, "هرچیزی")).toBe("invalid_api_key");
    expect(classifyMeliPayamakError(403)).toBe("invalid_api_key");
    expect(classifyMeliPayamakError(429)).toBe("rate_limited");
  });

  it("classifies Persian status texts", () => {
    expect(classifyMeliPayamakError(200, "اعتبار شما کافی نمی‌باشد")).toBe("insufficient_credit");
    expect(classifyMeliPayamakError(200, "کلید وب سرویس نامعتبر است")).toBe("invalid_api_key");
    expect(classifyMeliPayamakError(200, "ارسال بیش از حد مجاز محدود شده است")).toBe("rate_limited");
    expect(classifyMeliPayamakError(502, undefined)).toBe("provider_error_502");
  });
});

/* Kavenegar (legacy) ----------------------------------------------- */

describe("KavenegarSmsProvider", () => {
  it("succeeds on Kavenegar status 200", async () => {
    const { fetch, calls } = fakeFetch({ body: { return: { status: 200 } } });
    const provider = new KavenegarSmsProvider(API_KEY, "otp-template", fetch, captureLogger());

    const result = await provider.sendOtp({ phone: PHONE, token: TOKEN });

    expect(result).toEqual({ ok: true, provider: "kavenegar" });
    expect(calls[0].url).toContain("receptor=09123456789");
  });

  it("reports failures with the provider status, logging no secrets", async () => {
    const { fetch } = fakeFetch({ body: { return: { status: 418 } } });
    const logger = captureLogger();
    const provider = new KavenegarSmsProvider(API_KEY, "otp-template", fetch, logger);

    const result = await provider.sendOtp({ phone: PHONE, token: TOKEN });

    expect(result).toEqual({ ok: false, provider: "kavenegar", detail: "status_418" });
    expectNoSecretsIn(logger.lines);
  });
});

/* Provider selection ------------------------------------------------ */

describe("getProvider", () => {
  const env = (vars: Record<string, string>) => ({
    get: (name: string) => vars[name],
  });

  it("defaults to MeliPayamak when SMS_PROVIDER is unset", () => {
    const provider = getProvider(
      env({ MELIPAYAMAK_API_KEY: API_KEY, MELIPAYAMAK_OTP_PATTERN: "77000" })
    );
    expect(provider?.name).toBe("melipayamak");
  });

  it("returns null when MeliPayamak secrets are incomplete", () => {
    expect(getProvider(env({}))).toBeNull();
    expect(getProvider(env({ MELIPAYAMAK_API_KEY: API_KEY }))).toBeNull();
    expect(
      getProvider(env({ SMS_PROVIDER: "melipayamak", MELIPAYAMAK_OTP_PATTERN: "77000" }))
    ).toBeNull();
  });

  it("still supports kavenegar and mock explicitly", () => {
    expect(
      getProvider(
        env({
          SMS_PROVIDER: "kavenegar",
          KAVENEGAR_API_KEY: API_KEY,
          KAVENEGAR_VERIFY_TEMPLATE: "tpl",
        })
      )?.name
    ).toBe("kavenegar");
    expect(getProvider(env({ SMS_PROVIDER: "kavenegar" }))).toBeNull();
    expect(getProvider(env({ SMS_PROVIDER: "mock" }))?.name).toBe("mock");
  });

  it("returns null for an unknown provider name", () => {
    expect(getProvider(env({ SMS_PROVIDER: "twilio" }))).toBeNull();
  });
});
