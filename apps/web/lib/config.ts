import { isSupabaseConfigured } from "@/lib/supabase/client";

/**
 * Data mode:
 * - "supabase": real auth + database; no localStorage fallback.
 * - "mock": local demo data, no auth.
 *
 * Mock mode requires an EXPLICIT opt-in. It is deliberately not inferred
 * from missing env vars: NEXT_PUBLIC_* values are inlined at build time,
 * so a typo or an unset Production variable on the host would otherwise
 * ship a clinical app that silently runs with no auth at all and serves
 * fabricated patient records. Missing config is an error, not a fallback.
 */
export const isMockMode = process.env.NEXT_PUBLIC_DATA_MODE === "mock";

/**
 * Real mode was requested (or defaulted to) but Supabase is not
 * configured. The app must refuse to render rather than degrade — see
 * `ConfigError` in components/ui/ModeNotice.tsx.
 */
export const isMisconfigured = !isMockMode && !isSupabaseConfigured;

/**
 * localStorage persistence is only allowed in development or explicit
 * mock mode — never as a silent fallback in production.
 */
export const allowLocalFallback =
  process.env.NODE_ENV === "development" || isMockMode;
