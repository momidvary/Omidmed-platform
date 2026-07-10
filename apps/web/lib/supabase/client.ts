import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/*
 * Supabase connection.
 *
 * Configure by creating apps/web/.env.local with:
 *   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
 *
 * The anon key is safe for the browser (protected by Row Level Security).
 * Never put the service_role key in the browser or in the repo.
 *
 * Until these are set, the app runs fully in local/mock mode and
 * `getSupabase()` returns null. The database schema for the tables the
 * app expects lives in database/schema.sql at the repo root.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!client) client = createClient(url!, anonKey!);
  return client;
}
