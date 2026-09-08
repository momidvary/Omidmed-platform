import { describe, expect, it } from "vitest";
import {
  boundedRetryAfter,
  isStrongServerSecret,
  normalizeWebhookEndpoint,
  NotificationClaimSchema,
  NotificationHealthSchema,
  NotificationPayloadSchema,
  secureTokenEquals,
  signWebhookPayload,
} from "@/lib/notifications/webhook.server";

const payload = {
  schemaVersion: 1,
  event: "clinical-alert.created",
  alertId: "10000000-0000-4000-8000-000000000001",
  clinicId: "20000000-0000-4000-8000-000000000001",
  patientId: "30000000-0000-4000-8000-000000000001",
  severity: "urgent",
  alertType: "ticket-urgent",
  createdAt: "2026-08-23T10:30:00+00:00",
} as const;

describe("clinical alert webhook boundary", () => {
  it("accepts only a public HTTPS hostname", () => {
    expect(normalizeWebhookEndpoint("https://alerts.vendor.com/v1/intake"))
      .toBe("https://alerts.vendor.com/v1/intake");
  });

  it.each([
    "http://alerts.vendor.com/hook",
    "https://localhost/hook",
    "https://127.0.0.1/hook",
    "https://[::1]/hook",
    "https://service.internal/hook",
    "https://user:password@alerts.vendor.com/hook",
    "https://alerts.vendor.com:8443/hook",
    "https://alerts.vendor.com/hook#secret",
  ])("rejects unsafe webhook endpoint %s", (endpoint) => {
    expect(normalizeWebhookEndpoint(endpoint)).toBeNull();
  });

  it("requires non-public server secrets with at least 32 bytes", () => {
    expect(isStrongServerSecret("too-short")).toBe(false);
    expect(isStrongServerSecret(` ${"a".repeat(32)}`)).toBe(false);
    expect(isStrongServerSecret("a".repeat(32))).toBe(true);
  });

  it("compares the full bearer value and signs the exact raw body", () => {
    const secret = "s".repeat(32);
    const body = JSON.stringify(payload);
    const signature = signWebhookPayload(secret, "1724410000", body);
    expect(signature).toMatch(/^v1=[0-9a-f]{64}$/);
    expect(signWebhookPayload(secret, "1724410000", body)).toBe(signature);
    expect(signWebhookPayload(secret, "1724410001", body)).not.toBe(signature);
    expect(secureTokenEquals(`Bearer ${secret}`, `Bearer ${secret}`)).toBe(true);
    expect(secureTokenEquals(`Bearer ${secret}x`, `Bearer ${secret}`)).toBe(false);
  });

  it("accepts only the fixed metadata payload and bounded claim shape", () => {
    expect(NotificationPayloadSchema.safeParse(payload).success).toBe(true);
    expect(
      NotificationClaimSchema.safeParse({
        notification_id: "40000000-0000-4000-8000-000000000001",
        event_key:
          "clinical-alert:10000000-0000-4000-8000-000000000001:created",
        payload,
        attempt_number: 1,
      }).success
    ).toBe(true);
    expect(
      NotificationHealthSchema.safeParse({
        pending_count: 2,
        processing_count: 1,
        dead_letter_count: 0,
        oldest_pending_seconds: 45,
      }).success
    ).toBe(true);
  });

  it("rejects free text, routine severity and unknown alert types", () => {
    expect(
      NotificationPayloadSchema.safeParse({ ...payload, message: "patient text" })
        .success
    ).toBe(false);
    expect(
      NotificationPayloadSchema.safeParse({ ...payload, severity: "routine" })
        .success
    ).toBe(false);
    expect(
      NotificationPayloadSchema.safeParse({ ...payload, alertType: "custom" })
        .success
    ).toBe(false);
  });

  it("bounds Retry-After to the database contract", () => {
    expect(boundedRetryAfter(null)).toBe(60);
    expect(boundedRetryAfter("1")).toBe(30);
    expect(boundedRetryAfter("99999")).toBe(3_600);
    expect(boundedRetryAfter("invalid")).toBe(60);
  });
});
