import "server-only";
import { cookies } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/utils/supabase/server";
import { maskPhone } from "@/lib/phone";
import type { Role } from "@/lib/store/AuthContext";

/*
 * Server-only helpers for provisioning routes. The service key NEVER
 * leaves the server; every route first authenticates the CALLER with
 * their own cookie session and checks their role before using it.
 */

export function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return null;
  return createSupabaseClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface Caller {
  id: string;
  role: Role;
  clinicIds: string[];
}

/** Authenticate the request's caller from their session cookie. */
export async function getCaller(): Promise<Caller | null> {
  const client = createServerClient(await cookies());
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;
  const { data: p } = await client
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!p) return null;
  const { data: memberships } = await client
    .from("clinic_members")
    .select("clinic_id")
    .eq("user_id", user.id);
  return {
    id: p.id,
    role: p.role as Role,
    clinicIds: (memberships ?? []).map((m) => m.clinic_id as string),
  };
}

/**
 * Find the auth user for an E.164 phone, or create one (phone-confirmed
 * so they can immediately sign in with OTP). Returns the user id.
 */
export async function findOrCreateUserByPhone(
  admin: NonNullable<ReturnType<typeof getAdminClient>>,
  phoneE164: string,
  fullName: string
): Promise<{ userId: string; created: boolean } | { error: string }> {
  // GoTrue stores phones without the leading '+'.
  const stored = phoneE164.replace("+", "");
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("phone", phoneE164)
    .maybeSingle();
  if (existing) return { userId: existing.id as string, created: false };

  const { data, error } = await admin.auth.admin.createUser({
    phone: stored,
    phone_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) {
    // Could be a duplicate registered before profiles.phone sync existed.
    return { error: "user_create_failed" };
  }
  // Ensure the profile row exists and carries the normalized phone.
  await admin
    .from("profiles")
    .upsert({ id: data.user.id, full_name: fullName, phone: phoneE164 });
  return { userId: data.user.id, created: true };
}

/** Insert an audit log row (service role). Phones must arrive masked. */
export async function writeAudit(
  admin: NonNullable<ReturnType<typeof getAdminClient>>,
  entry: {
    actorId: string;
    action: string;
    targetUserId?: string;
    clinicId?: string;
    patientId?: string;
    detail?: Record<string, unknown>;
  }
) {
  await admin.from("audit_logs").insert({
    actor_id: entry.actorId,
    action: entry.action,
    target_user_id: entry.targetUserId ?? null,
    clinic_id: entry.clinicId ?? null,
    patient_id: entry.patientId ?? null,
    detail: entry.detail ?? null,
  });
}

export { maskPhone };
