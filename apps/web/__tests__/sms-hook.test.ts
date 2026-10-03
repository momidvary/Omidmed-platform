// @vitest-environment node
import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MeliPayamakSmsProvider,
  classifyMeliPayamakError,
  getSmsProvider,
  maskPhone,
  toLocalIranFormat,
  verifyStandardWebhook,
  type FetchLike,
  type Logger,
} from "@/lib/sms/smsHook.server";
import { POST } from "@/app/api/auth/sms-hook/route";

const PHONE = "989123456789"; // as Supabase sends it (E.164 without '+')
const TOKEN = "482913";
const API_KEY = "super-secret-api-key";
const KEY_BYTES = Buffer.from("test-hook-secret-bytes-0123456789");
const HOOK_SECRET = `v1,whsec_${KEY_BYTES.toString("base64")}`;

function captureLogger(): Logger & { lines: string[] } {
  const lines: string[] = [];
  return { lines, log: (m) => lines.push(m), error: (m) => lines.push(m) };
}

function fakeFetch(
  response: { status?: number; body?: unknown } | "network-error"
) {
  const calls: { url: string; init?: Parameters<FetchLike>[1] }[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    if (response === "network-error") throw new Error("boom");
    const status = response.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => response.body ?? null };
  };
  return { fetch, calls };
}

function expectNoSecretsIn(lines: string[]) {
  for (const line of lines) {
    expect(line).not.toContain(TOKEN);
    expect(line).not.toContain(API_KEY);
    expect(line).not.toContain(PHONE);
    expect(line).not.toContain("09123456789");
  }
}

function sign(body: string, id = "msg_1", ts = Math.floor(Date.now() / 1000)) {
  const sig = createHmac("sha256", KEY_BYTES).update(`${id}.${ts}.${body}`).digest("base64");
  return { id, timestamp: String(ts), signature: `v1,${sig}` };
}

describe("phone helpers", () => {
  it("masks and converts to the local Iranian format", () => {
    expect(maskPhone(PHONE)).toBe("9891***789");
    expect(toLocalIranFormat(PHONE)).toBe("09123456789");
    expect(toLocalIranFormat("+989123456789")).toBe("09123456789");
  });
});

describe("MeliPayamak provider", () => {
  it("sends the code through the approved pattern (bodyId) to the local number", async () => {
    const { fetch, calls } = fakeFetch({ body: { recId: 123, status: "ok" } });
    const logger = captureLogger();
    const result = await new MeliPayamakSmsProvider(API_KEY, "77000", undefined, fetch, logger)
      .sendOtp({ phone: PHONE, token: TOKEN });
    expect(result).toEqual({ ok: true, provider: "melipayamak" });
    expect(calls[0].url).toBe(`https://console.melipayamak.com/api/send/shared/${API_KEY}`);
    expect(JSON.parse(calls[0].init?.body ?? "{}")).toEqual({
      bodyId: 77000,
      to: "09123456789",
      args: [TOKEN],
    });
    expect(logger.lines).toHaveLength(0);
  });

  it("uses simple send only when no pattern is configured", async () => {
    const { fetch, calls } = fakeFetch({ body: { recId: 7 } });
    const result = await new MeliPayamakSmsProvider(API_KEY, undefined, "50004000", fetch, captureLogger())
      .sendOtp({ phone: PHONE, token: TOKEN });
    expect(result.ok).toBe(true);
    expect(calls[0].url).toBe(`https://console.melipayamak.com/api/send/simple/${API_KEY}`);
  });

  it.each([
    [{ status: 200, body: { recId: 0, status: "اعتبار کافی نیست" } }, "insufficient_credit"],
    [{ status: 401, body: {} }, "invalid_api_key"],
    ["network-error" as const, "network"],
  ])("reports %o as %s without leaking secrets", async (response, detail) => {
    const logger = captureLogger();
    const result = await new MeliPayamakSmsProvider(API_KEY, "77000", undefined, fakeFetch(response).fetch, logger)
      .sendOtp({ phone: PHONE, token: TOKEN });
    expect(result).toEqual({ ok: false, provider: "melipayamak", detail });
    expectNoSecretsIn(logger.lines);
  });

  it("classifies provider errors", () => {
    expect(classifyMeliPayamakError(200, "الگو تایید نشده")).toBe("invalid_pattern");
    expect(classifyMeliPayamakError(429)).toBe("rate_limited");
    expect(classifyMeliPayamakError(500)).toBe("provider_error_500");
  });
});

describe("provider selection", () => {
  it("requires an API key plus a pattern or sender", () => {
    expect(getSmsProvider({})).toBeNull();
    expect(getSmsProvider({ MELIPAYAMAK_API_KEY: "k" })).toBeNull();
    expect(getSmsProvider({ MELIPAYAMAK_API_KEY: "k", MELIPAYAMAK_OTP_PATTERN: "1" })?.name).toBe("melipayamak");
  });

  it("never allows the mock provider in production", () => {
    expect(getSmsProvider({ SMS_PROVIDER: "mock", NODE_ENV: "development" })?.name).toBe("mock");
    expect(getSmsProvider({ SMS_PROVIDER: "mock", NODE_ENV: "production" })).toBeNull();
  });
});

describe("Standard Webhooks signature", () => {
  const body = JSON.stringify({ user: { phone: PHONE }, sms: { otp: TOKEN } });

  it("accepts a correct signature and rejects tampering, wrong secret and old timestamps", () => {
    const h = sign(body);
    expect(verifyStandardWebhook(HOOK_SECRET, h, body)).toBe(true);
    expect(verifyStandardWebhook(HOOK_SECRET, h, body.replace(TOKEN, "000000"))).toBe(false);
    expect(verifyStandardWebhook(`v1,whsec_${Buffer.from("other").toString("base64")}`, h, body)).toBe(false);
    const old = sign(body, "msg_1", Math.floor(Date.now() / 1000) - 3600);
    expect(verifyStandardWebhook(HOOK_SECRET, old, body)).toBe(false);
    expect(verifyStandardWebhook(HOOK_SECRET, { ...h, signature: null }, body)).toBe(false);
  });
});

describe("POST /api/auth/sms-hook", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function request(body: string, headers: Record<string, string>) {
    return new Request("http://localhost/api/auth/sms-hook", {
      method: "POST",
      body,
      headers: {
        "content-type": "application/json",
        "webhook-id": headers.id,
        "webhook-timestamp": headers.timestamp,
        "webhook-signature": headers.signature,
      },
    });
  }

  it("fails closed when the hook secret is not configured", async () => {
    vi.stubEnv("SEND_SMS_HOOK_SECRET", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const body = JSON.stringify({ user: { phone: PHONE }, sms: { otp: TOKEN } });
    const res = await POST(request(body, sign(body)));
    expect(res.status).toBe(500);
  });

  it("rejects an unsigned or forged request before any delivery", async () => {
    vi.stubEnv("SEND_SMS_HOOK_SECRET", HOOK_SECRET);
    vi.stubEnv("SMS_PROVIDER", "mock");
    const body = JSON.stringify({ user: { phone: PHONE }, sms: { otp: TOKEN } });
    const res = await POST(request(body, { ...sign(body), signature: "v1,AAAA" }));
    expect(res.status).toBe(401);
  });

  it("delivers a correctly signed request", async () => {
    vi.stubEnv("SEND_SMS_HOOK_SECRET", HOOK_SECRET);
    vi.stubEnv("SMS_PROVIDER", "mock");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const body = JSON.stringify({ user: { phone: PHONE }, sms: { otp: TOKEN } });
    const res = await POST(request(body, sign(body)));
    expect(res.status).toBe(200);
    expectNoSecretsIn(log.mock.calls.map((c) => String(c[0])));
  });

  it("reports a missing provider configuration as a hook error", async () => {
    vi.stubEnv("SEND_SMS_HOOK_SECRET", HOOK_SECRET);
    vi.stubEnv("SMS_PROVIDER", "");
    vi.stubEnv("MELIPAYAMAK_API_KEY", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const body = JSON.stringify({ user: { phone: PHONE }, sms: { otp: TOKEN } });
    const res = await POST(request(body, sign(body)));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: { http_code: 500, message: "SMS provider is not configured" },
    });
  });
});
