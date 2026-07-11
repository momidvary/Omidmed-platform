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
