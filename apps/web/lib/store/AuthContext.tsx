"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/client";
import { isMisconfigured, isMockMode } from "@/lib/config";

export type Role =
  | "platform_admin"
  | "clinic_owner"
  | "therapist"
  | "clinic_staff"
  | "patient";

export interface ClinicMembership {
  clinicId: string;
  clinicName: string;
  memberRole: "clinic_owner" | "therapist" | "clinic_staff";
}

export interface AuthProfile {
  id: string;
  role: Role;
  fullName: string;
  email: string | null;
  /** Clinics this user is a member of, with the role held in each. */
  memberships: ClinicMembership[];
}

/**
 * Why the session could not be resolved.
 * - "network": the auth server or database was unreachable.
 * - "no_profile": signed in, but no `profiles` row (trigger never ran).
 * Both leave `profile` null, and callers must NOT treat that as "allowed".
 */
export type AuthError = "network" | "no_profile";

interface AuthContextValue {
  session: Session | null;
  profile: AuthProfile | null;
  loading: boolean;
  error: AuthError | null;
  retry: () => void;
  /**
   * The clinic the user is currently acting in. A therapist may hold a
   * post in more than one clinic, so this cannot be inferred — writes go
   * to whichever clinic is selected here.
   */
  activeClinicId: string | null;
  setActiveClinic: (clinicId: string) => void;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (
    email: string,
    password: string,
    fullName: string
  ) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Throws on transport failure; resolves null when there is no profile row. */
async function loadProfile(userId: string): Promise<AuthProfile | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data: p, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, full_name, email")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!p) return null;
  const { data: memberships, error: memberError } = await supabase
    .from("clinic_members")
    .select("clinic_id, member_role, clinics ( name )")
    .eq("user_id", userId);
  if (memberError) throw memberError;
  type Row = {
    clinic_id: string;
    member_role: ClinicMembership["memberRole"];
    clinics: { name: string } | { name: string }[] | null;
  };
  return {
    id: p.id,
    role: p.role as Role,
    fullName: p.full_name ?? "",
    email: (p.email as string | null) ?? null,
    memberships: ((memberships ?? []) as Row[]).map((m) => {
      const clinic = Array.isArray(m.clinics) ? m.clinics[0] : m.clinics;
      return {
        clinicId: m.clinic_id,
        clinicName: clinic?.name ?? "Clinic",
        memberRole: m.member_role,
      };
    }),
  };
}

const ACTIVE_CLINIC_KEY = "physioai:activeClinic:v1";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  // Only start in the loading state when there is actually something to
  // load — mock mode and a missing configuration both resolve instantly,
  // so seeding `true` there would strand the UI on a spinner.
  const [loading, setLoading] = useState(!isMockMode && !isMisconfigured);
  const [error, setError] = useState<AuthError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [chosenClinicId, setChosenClinicId] = useState<string | null>(null);

  // Restore the last clinic the user worked in. Validated against the
  // memberships below, so a stale or revoked id can never take effect.
  useEffect(() => {
    const stored = localStorage.getItem(ACTIVE_CLINIC_KEY);
    if (stored) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time localStorage hydration; cannot run during SSR
      setChosenClinicId(stored);
    }
  }, []);

  useEffect(() => {
    if (isMockMode) return;
    const supabase = getSupabase();
    if (!supabase) return;
    let active = true;

    // The role gate depends on `profile`, so `loading` must stay true for
    // the whole session→profile resolution. Otherwise there is a window
    // where the session exists, the profile does not, and a patient sees
    // the clinician workspace.
    async function resolve(next: Session | null) {
      if (!active) return;
      setSession(next);
      if (!next) {
        setProfile(null);
        setError(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const p = await loadProfile(next.user.id);
        if (!active) return;
        setProfile(p);
        setError(p ? null : "no_profile");
      } catch {
        if (!active) return;
        setProfile(null);
        setError("network");
      } finally {
        if (active) setLoading(false);
      }
    }

    supabase.auth
      .getSession()
      .then(({ data }) => resolve(data.session))
      .catch(() => {
        // Never leave the app spinning forever on an unreachable backend.
        if (!active) return;
        setError("network");
        setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        void resolve(newSession);
      }
    );
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [attempt]);

  // Only ever resolves to a clinic the user actually belongs to; falls
  // back to the first membership so single-clinic users never see a picker.
  const activeClinicId =
    profile?.memberships.find((m) => m.clinicId === chosenClinicId)?.clinicId ??
    profile?.memberships[0]?.clinicId ??
    null;

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      loading,
      error,
      activeClinicId,
      setActiveClinic: (clinicId) => {
        setChosenClinicId(clinicId);
        localStorage.setItem(ACTIVE_CLINIC_KEY, clinicId);
      },
      retry: () => {
        setError(null);
        setLoading(true);
        setAttempt((n) => n + 1);
      },
      signIn: async (email, password) => {
        const supabase = getSupabase();
        if (!supabase) return "Supabase not configured";
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        return error ? error.message : null;
      },
      signUp: async (email, password, fullName) => {
        const supabase = getSupabase();
        if (!supabase) return "Supabase not configured";
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        return error ? error.message : null;
      },
      signOut: async () => {
        await getSupabase()?.auth.signOut();
      },
    }),
    [session, profile, loading, error, activeClinicId]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
