import type { Role } from "@/lib/store/AuthContext";

/**
 * Where each verified role lands after OTP login. The role always comes
 * from the profiles table (server truth) — never from user input.
 * The clinician workspace serves admin/owner/therapist/staff; role-based
 * in-app permissions are enforced by RLS, not by the path.
 */
export function roleHomePath(role: Role): string {
  return role === "patient" ? "/patient" : "/";
}
