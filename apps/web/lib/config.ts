import { isSupabaseConfigured } from "@/lib/supabase/client";

/**
 * Data mode:
 * - "supabase": real auth + database; no localStorage fallback.
 * - "mock": local demo data, no auth. Explicit in production; local
 *   development may also use it when Supabase variables are absent.
 */
const explicitMockMode = process.env.NEXT_PUBLIC_DATA_MODE === "mock";

/**
 * Production is fail-closed: missing Supabase variables must never silently
 * turn off authentication. Local development may still fall back to demo data.
 */
export const isMockMode =
  explicitMockMode ||
  (process.env.NODE_ENV !== "production" && !isSupabaseConfigured);

export const hasDataConfigurationError =
  !isMockMode && !isSupabaseConfigured;

/**
 * localStorage persistence is only allowed in development or explicit
 * mock mode — never as a silent fallback in production.
 */
export const allowLocalFallback =
  process.env.NODE_ENV === "development" || isMockMode;
