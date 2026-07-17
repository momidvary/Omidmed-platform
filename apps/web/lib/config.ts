import { isSupabaseConfigured } from "@/lib/supabase/client";

/**
 * Data mode:
 * - "supabase": real auth + database; no localStorage fallback.
 * - "mock": local demo data, no auth. Active when NEXT_PUBLIC_DATA_MODE=mock
 *   or when Supabase env vars are missing.
 */
export const isMockMode =
  process.env.NEXT_PUBLIC_DATA_MODE === "mock" || !isSupabaseConfigured;

/**
 * localStorage persistence is only allowed in development or explicit
 * mock mode — never as a silent fallback in production.
 */
export const allowLocalFallback =
  process.env.NODE_ENV === "development" || isMockMode;

/**
 * Authentication mode (provider-neutral authorization: roles, RLS and
 * clinical data never depend on how the user signed in — only on
 * auth.uid() + profiles/clinic_members/patient_users/patient_therapists).
 * - "email_password": Supabase email + password (default — works without
 *   any SMS provider being configured).
 * - "phone_otp": phone number + SMS one-time code (requires the
 *   send-auth-sms Edge Function + SMS provider; see docs/MELIPAYAMAK_SETUP_FA.md).
 */
export type AuthMode = "email_password" | "phone_otp";

export const authMode: AuthMode =
  process.env.NEXT_PUBLIC_AUTH_MODE === "phone_otp"
    ? "phone_otp"
    : "email_password";
