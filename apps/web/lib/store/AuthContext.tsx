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
import { isMockMode } from "@/lib/config";

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
}

interface AuthContextValue {
  session: Session | null;
  profile: AuthProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (
    email: string,
    password: string,
    fullName: string
  ) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function loadProfile(userId: string): Promise<AuthProfile | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data: p } = await supabase
    .from("profiles")
    .select("id, role, full_name")
    .eq("id", userId)
    .maybeSingle();
  if (!p) return null;
  const { data: memberships } = await supabase
    .from("clinic_members")
    .select("clinic_id")
    .eq("user_id", userId);
  return {
    id: p.id,
    role: p.role as Role,
    fullName: p.full_name ?? "",
    clinicIds: (memberships ?? []).map((m) => m.clinic_id as string),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState(!isMockMode);

  useEffect(() => {
    if (isMockMode) return;
    const supabase = getSupabase();
    if (!supabase) return;

    // onAuthStateChange also emits INITIAL_SESSION on subscribe, so it is
    // the single source. The profile is (re)loaded only when the user
    // changes — token refreshes must not blank the app.
    let currentUserId: string | null | undefined;
    let active = true;

    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
        const userId = newSession?.user.id ?? null;
        if (userId === currentUserId) return;
        currentUserId = userId;

        if (!userId) {
          setProfile(null);
          setLoading(false);
          return;
        }
        setProfile(null);
        setLoading(true);
        // Defer Supabase calls out of the auth callback (avoids the
        // supabase-js auth-lock deadlock).
        setTimeout(() => {
          loadProfile(userId)
            .catch(() => null)
            .then((p) => {
              if (!active || currentUserId !== userId) return;
              setProfile(p);
              setLoading(false);
            });
        }, 0);
      }
    );
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      loading,
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
    [session, profile, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
