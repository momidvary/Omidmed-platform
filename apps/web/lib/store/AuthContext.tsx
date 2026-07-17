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
  phone: string | null;
  /** Clinics this user is a member of (staff roles). */
  clinicIds: string[];
  /** Whether the account is linked to something valid for its role:
   *  staff → clinic_members row; patient → patient_users row. */
  linked: boolean;
}

export type OtpErrorCode =
  | "invalid_code"
  | "expired_code"
  | "too_many"
  | "sms_failed"
  | "captcha_required"
  | "network"
  | "generic";

interface AuthContextValue {
  session: Session | null;
  profile: AuthProfile | null;
  loading: boolean;
  /** Email/password sign-in (auth mode "email_password"). */
  signIn: (email: string, password: string) => Promise<string | null>;
  /** Email/password sign-up (patient self-registration; the clinic must
   *  still link the account before any data is visible). */
  signUp: (
    email: string,
    password: string,
    fullName: string
  ) => Promise<string | null>;
  /** Send an OTP to an E.164 phone (auth mode "phone_otp").
   *  Never creates a user. */
  sendOtp: (
    phoneE164: string,
    captchaToken?: string
  ) => Promise<OtpErrorCode | null>;
  /** Verify the SMS code for the phone. */
  verifyOtp: (
    phoneE164: string,
    code: string
  ) => Promise<OtpErrorCode | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Map Supabase auth errors to generic, non-revealing UI codes. */
function mapAuthError(message: string, status?: number): OtpErrorCode {
  const m = message.toLowerCase();
  if (status === 429 || m.includes("rate limit") || m.includes("too many"))
    return "too_many";
  if (m.includes("expired")) return "expired_code";
  if (m.includes("invalid") && (m.includes("otp") || m.includes("token")))
    return "invalid_code";
  if (m.includes("captcha")) return "captcha_required";
  if (m.includes("sms") || m.includes("provider") || m.includes("hook"))
    return "sms_failed";
  if (m.includes("fetch") || m.includes("network")) return "network";
  // "Signups not allowed for otp" (unknown phone with shouldCreateUser
  // false) intentionally maps to the same generic message so the login
  // form never reveals whether a number is registered.
  return "generic";
}

async function loadProfile(userId: string): Promise<AuthProfile | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data: p } = await supabase
    .from("profiles")
    .select("id, role, full_name, phone")
    .eq("id", userId)
    .maybeSingle();
  if (!p) return null;

  const role = p.role as Role;
  let clinicIds: string[] = [];
  let linked = false;

  if (role === "patient") {
    const { data: links } = await supabase
      .from("patient_users")
      .select("patient_id")
      .eq("user_id", userId)
      .limit(1);
    linked = (links?.length ?? 0) > 0;
  } else if (role === "platform_admin") {
    linked = true;
  } else {
    const { data: memberships } = await supabase
      .from("clinic_members")
      .select("clinic_id")
      .eq("user_id", userId);
    clinicIds = (memberships ?? []).map((m) => m.clinic_id as string);
    linked = clinicIds.length > 0;
  }

  return {
    id: p.id,
    role,
    fullName: p.full_name ?? "",
    phone: p.phone ?? null,
    clinicIds,
    linked,
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

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) {
        loadProfile(data.session.user.id).then((p) => {
          setProfile(p);
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
        if (newSession) {
          loadProfile(newSession.user.id).then(setProfile);
        } else {
          setProfile(null);
        }
      }
    );
    return () => sub.subscription.unsubscribe();
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
      sendOtp: async (phoneE164, captchaToken) => {
        const supabase = getSupabase();
        if (!supabase) return "generic";
        try {
          const { error } = await supabase.auth.signInWithOtp({
            phone: phoneE164,
            options: {
              // Login must NEVER auto-create accounts: users are
              // provisioned by the clinic/admin through server routes.
              shouldCreateUser: false,
              captchaToken,
            },
          });
          return error ? mapAuthError(error.message, error.status) : null;
        } catch {
          return "network";
        }
      },
      verifyOtp: async (phoneE164, code) => {
        const supabase = getSupabase();
        if (!supabase) return "generic";
        try {
          const { error } = await supabase.auth.verifyOtp({
            phone: phoneE164,
            token: code,
            type: "sms",
          });
          return error ? mapAuthError(error.message, error.status) : null;
        } catch {
          return "network";
        }
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
