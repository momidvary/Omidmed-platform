"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/store/AuthContext";
import { useLocale } from "@/lib/store/LocaleContext";
import { isMockMode, authMode } from "@/lib/config";
import { roleHomePath } from "@/lib/auth/redirect";
import { PhoneOtpLogin } from "./PhoneOtpLogin";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Misc";

/**
 * Wraps the clinician app. Supabase mode requires a signed-in session
 * (email/password or phone OTP depending on NEXT_PUBLIC_AUTH_MODE) with
 * a linked staff role; patients are redirected to /patient; accounts
 * without a valid profile/linkage are signed out with a generic message.
 * Mock mode (dev/demo) passes straight through.
 *
 * The auth mode only changes HOW users sign in — authorization always
 * comes from auth.uid() + profiles/clinic_members (RLS), never from the
 * sign-in method.
 */
export function ClinicianGate({ children }: { children: React.ReactNode }) {
  const { session, profile, loading } = useAuth();
  const { t } = useLocale();
  const router = useRouter();

  const isPatient = !!profile && profile.role === "patient";

  useEffect(() => {
    if (isPatient) router.replace(roleHomePath("patient"));
  }, [isPatient, router]);

  if (isMockMode) return <>{children}</>;
  if (loading) return <Spinner label="…" />;

  if (!session) {
    return (
      <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center">
        <div className="mb-6 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--color-primary)] text-white">
            <Icon name="sparkle" width={24} height={24} />
          </span>
          <h2 className="mt-3 text-lg font-bold text-[var(--color-ink)]">
            {t("otp.title")} — PhysioAI
          </h2>
        </div>
        {authMode === "phone_otp" ? <PhoneOtpLogin t={t} /> : <EmailLogin />}
      </div>
    );
  }

  if (isPatient) return <Spinner label="…" />;

  // Signed in but no profile or no clinic membership → deny generically.
  if (!profile || !profile.linked) {
    return <UnlinkedScreen message={t("otp.notLinked")} />;
  }

  return <>{children}</>;
}

/** Email/password sign-in form (auth mode "email_password"). */
function EmailLogin() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = await signIn(email.trim(), password);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <Card>
      <CardBody>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email" required>
            <Input
              type="email"
              dir="ltr"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@clinic.com"
            />
          </Field>
          <Field label="Password" required error={error ?? undefined}>
            <Input
              type="password"
              dir="ltr"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-[var(--color-ink-faint)]">
          Patient?{" "}
          <Link
            href="/patient"
            className="text-[var(--color-primary-strong)] underline"
          >
            پرتال بیمار
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}

/** Signs the session out and shows only a generic message. */
export function UnlinkedScreen({ message }: { message: string }) {
  const { signOut } = useAuth();

  useEffect(() => {
    // No data is shown to unlinked accounts; end the session immediately.
    void signOut();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col justify-center">
      <Card>
        <CardBody className="space-y-4 py-8 text-center">
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-[var(--color-warn-soft)] text-[var(--color-warn)]">
            <Icon name="alert" width={22} height={22} />
          </span>
          <p className="text-sm leading-relaxed text-[var(--color-ink-soft)]">
            {message}
          </p>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            ←
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
