import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";

const UUID = z.string().uuid();

export const NotificationPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    event: z.literal("clinical-alert.created"),
    alertId: UUID,
    clinicId: UUID,
    patientId: UUID,
    severity: z.enum(["urgent", "emergency"]),
    alertType: z.enum(["high-pain", "ticket-urgent", "ticket-emergency"]),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const NotificationClaimSchema = z
  .object({
    notification_id: UUID,
    event_key: z
      .string()
      .regex(/^clinical-alert:[0-9a-f-]{36}:created$/i),
    payload: NotificationPayloadSchema,
    attempt_number: z.number().int().min(1).max(8),
  })
  .strict();

export const NotificationHealthSchema = z
  .object({
    pending_count: z.number().int().nonnegative(),
    processing_count: z.number().int().nonnegative(),
    dead_letter_count: z.number().int().nonnegative(),
    oldest_pending_seconds: z.number().int().nonnegative(),
  })
  .strict();

const BLOCKED_HOST_SUFFIXES = [
  ".arpa",
  ".example",
  ".home",
  ".internal",
  ".invalid",
  ".lan",
  ".local",
  ".localhost",
  ".onion",
  ".test",
];

/**
 * Accept only a public HTTPS hostname. The value is deployment-controlled,
 * never request-controlled, but these checks still prevent common accidental
 * SSRF configurations such as localhost and literal private IP endpoints.
 */
export function normalizeWebhookEndpoint(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 2_048) {
    return null;
  }
  if (value.trim() !== value) return null;

  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    return null;
  }

  const hostname = endpoint.hostname
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.$/, "");
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username !== "" ||
    endpoint.password !== "" ||
    endpoint.hash !== "" ||
    endpoint.port !== "" ||
    hostname.length === 0 ||
    hostname === "localhost" ||
    !hostname.includes(".") ||
    isIP(hostname) !== 0 ||
    BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    return null;
  }

  return endpoint.toString();
}

export function isStrongServerSecret(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim() === value &&
    Buffer.byteLength(value, "utf8") >= 32 &&
    Buffer.byteLength(value, "utf8") <= 4_096
  );
}

/** Compare bearer material without a length-dependent early return. */
export function secureTokenEquals(
  provided: string | null,
  expected: string
): boolean {
  if (provided === null || provided.length > 8_192) return false;
  const providedDigest = createHash("sha256").update(provided).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

/** Recipient verifies HMAC-SHA256 over `${timestamp}.${rawBody}`. */
export function signWebhookPayload(
  secret: string,
  timestamp: string,
  rawBody: string
): string {
  return `v1=${createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex")}`;
}

export function boundedRetryAfter(
  headerValue: string | null,
  nowMs = Date.now()
): number {
  if (!headerValue) return 60;
  const numeric = Number(headerValue);
  const seconds = Number.isFinite(numeric)
    ? Math.ceil(numeric)
    : Math.ceil((Date.parse(headerValue) - nowMs) / 1_000);
  return Number.isFinite(seconds) ? Math.min(3_600, Math.max(30, seconds)) : 60;
}
