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
import { hasDataConfigurationError, isMockMode } from "@/lib/config";

export type Role =
  | "platform_admin"
  | "clinic_owner"
  | "therapist"
  | "clinic_staff"
  | "patient";

export interface AuthProfile {
  id: string;
  role: Role;
  fullName: string;
  /** Clinics this user is a member of (staff roles). */
  clinicIds: string[];
  clinics: { id: string; name: string }[];
}

interface AuthContextValue {
  session: Session | null;
  profile: AuthProfile | null;
  activeClinicId: string | null;
  setActiveClinicId: (clinicId: string) => void;
  loading: boolean;
  profileLoadError: boolean;
  retryProfile: () => void;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (
    email: string,
    password: string,
    fullName: string
  ) => Promise<string | null>;
  requestPasswordReset: (email: string) => Promise<string | null>;
  updatePassword: (password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

type ProfileLoadResult =
  | { status: "ready"; profile: AuthProfile }
  | { status: "missing" }
  | { status: "error" };

async function loadProfile(userId: string): Promise<ProfileLoadResult> {
  const supabase = getSupabase();
  if (!supabase) return { status: "error" };

  try {
    const { data: p, error: profileError } = await supabase
      .from("profiles")
      .select("id, role, full_name")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) return { status: "error" };
    if (!p) return { status: "missing" };

    const { data: memberships, error: membershipError } = await supabase
      .from("clinic_members")
      .select("clinic_id")
      .eq("user_id", userId);
    if (membershipError || !memberships) return { status: "error" };

    const clinicIds = memberships.map((m) => m.clinic_id as string);
    const clinicResult = clinicIds.length
      ? await supabase
          .from("clinics")
          .select("id, name")
          .in("id", clinicIds)
          .order("name")
      : { data: [] as { id: string; name: string }[], error: null };
    if (clinicResult.error || !clinicResult.data) return { status: "error" };

    const clinicNames = new Map(
      clinicResult.data.map((clinic) => [
        clinic.id as string,
        (clinic.name as string) || (clinic.id as string),
      ])
    );
    return {
      status: "ready",
      profile: {
        id: p.id,
        role: p.role as Role,
        fullName: p.full_name ?? "",
        clinicIds,
        clinics: clinicIds.map((id) => ({
          id,
          name: clinicNames.get(id) ?? `Clinic ${id.slice(0, 8)}`,
        })),
      },
    };
  } catch {
    return { status: "error" };
  }
}

function activeClinicStorageKey(userId: string): string {
  return `physioai:active-clinic:${userId}`;
}

function initialActiveClinic(profile: AuthProfile): string | null {
  const saved = localStorage.getItem(activeClinicStorageKey(profile.id));
  if (saved && profile.clinicIds.includes(saved)) return saved;
  return profile.clinicIds.length === 1 ? profile.clinicIds[0] : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [activeClinicId, setActiveClinicIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(
    !isMockMode && !hasDataConfigurationError
  );
  const [profileLoadError, setProfileLoadError] = useState(false);
  const [profileRetryToken, setProfileRetryToken] = useState(0);

  useEffect(() => {
    if (isMockMode) return;
    const supabase = getSupabase();
    if (!supabase) return;

    let cancelled = false;
    let requestSequence = 0;

    async function applySession(nextSession: Session | null) {
      const sequence = ++requestSequence;
      setSession(nextSession);
      setProfile(null);
      setActiveClinicIdState(null);
      setProfileLoadError(false);

      if (!nextSession) {
        setLoading(false);
        return;
      }

      setLoading(true);
      const result = await loadProfile(nextSession.user.id);
      if (cancelled || sequence !== requestSequence) return;
      if (result.status === "ready") {
        setProfile(result.profile);
        setActiveClinicIdState(initialActiveClinic(result.profile));
      } else {
        setProfile(null);
        setActiveClinicIdState(null);
        setProfileLoadError(result.status === "error");
      }
      setLoading(false);
    }

    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setSession(null);
          setProfile(null);
          setActiveClinicIdState(null);
          setProfileLoadError(true);
          setLoading(false);
          return;
        }
        void applySession(data.session);
      })
      .catch(() => {
        if (cancelled) return;
        setSession(null);
        setProfile(null);
        setActiveClinicIdState(null);
        setProfileLoadError(true);
        setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (!cancelled) void applySession(newSession);
      }
    );
    return () => {
      cancelled = true;
      requestSequence += 1;
      sub.subscription.unsubscribe();
    };
  }, [profileRetryToken]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      activeClinicId,
      setActiveClinicId: (clinicId) => {
        if (!profile?.clinicIds.includes(clinicId)) return;
        localStorage.setItem(activeClinicStorageKey(profile.id), clinicId);
        setActiveClinicIdState(clinicId);
      },
      loading,
      profileLoadError,
      retryProfile: () => {
        if (isMockMode || hasDataConfigurationError) return;
        setProfileLoadError(false);
        setLoading(true);
        setProfileRetryToken((value) => value + 1);
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
      requestPasswordReset: async (email) => {
        const supabase = getSupabase();
        if (!supabase) return "Supabase not configured";
        const redirectTo = `${window.location.origin}/auth/callback?next=/auth/update-password`;
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo,
        });
        return error ? error.message : null;
      },
      updatePassword: async (password) => {
        const supabase = getSupabase();
        if (!supabase) return "Supabase not configured";
        const { error } = await supabase.auth.updateUser({ password });
        return error ? error.message : null;
      },
      signOut: async () => {
        setSession(null);
        setProfile(null);
        setActiveClinicIdState(null);
        setProfileLoadError(false);
        await getSupabase()?.auth.signOut();
      },
    }),
    [session, profile, activeClinicId, loading, profileLoadError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
