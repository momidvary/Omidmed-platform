import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";

/*
 * Supabase connection.
 *
 * Configure via apps/web/.env.local (see .env.local.example):
 *   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
 *
 * The publishable key is safe for the browser (protected by Row Level
 * Security). Never expose the secret/service_role key.
 *
 * When these variables are absent, `getSupabase()` returns null. The data-mode
 * policy in lib/config.ts permits a development/demo fallback, but production
 * fails closed with a configuration notice. Apply every numbered migration in
 * order; there is no production schema fallback in the client.
 */

export const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!client) client = createClient();
  return client;
}
