"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/store/AuthContext";
import { hasDataConfigurationError, isMockMode } from "@/lib/config";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Misc";

/**
 * Wraps the clinician app. In Supabase mode it requires a signed-in user
 * with a staff role; patients are pointed to the patient portal.
 * Mock mode (dev/demo) passes straight through.
 */
export function ClinicianGate({ children }: { children: React.ReactNode }) {
  const {
    session,
    profile,
    activeClinicId,
    loading,
    profileLoadError,
    retryProfile,
    signOut,
  } = useAuth();

  if (isMockMode) return <>{children}</>;
  if (hasDataConfigurationError) {
    return (
      <AccessNotice
        message="PhysioAI is not configured for secure production use. Supabase authentication is required; contact the platform administrator."
        onSignOut={async () => undefined}
        showSignOut={false}
      />
    );
  }
  if (loading) return <Spinner label="Loading…" />;
  if (profileLoadError) {
    return (
      <AccessNotice
        message="We could not securely load your account profile and clinic memberships. No clinical workspace was opened. Check the connection and try again."
        onRetry={retryProfile}
        onSignOut={signOut}
      />
    );
  }
  if (!session) return <ClinicianLogin />;

  if (!profile) {
    return (
      <AccessNotice
        message="Your account does not have a valid PhysioAI profile. Ask the platform administrator to provision it, then sign in again."
        onSignOut={signOut}
      />
    );
  }

  if (profile.role === "patient") {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="text-sm text-[var(--color-ink-soft)]">
          This account is a patient account. The clinician workspace is for
          clinic staff only.
        </p>
        <div className="mt-4 flex justify-center gap-3">
          <Link
            href="/patient"
            className="rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white"
          >
            برو به پرتال بیمار
          </Link>
          <Button variant="secondary" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  if (
    !["platform_admin", "clinic_owner", "therapist", "clinic_staff"].includes(
      profile.role
    )
  ) {
    return (
      <AccessNotice
        message="This account is not authorised to use the clinician workspace."
        onSignOut={signOut}
      />
    );
  }

  if (!activeClinicId) {
    return (
      <AccessNotice
        message={
          profile.clinicIds.length === 0
            ? "This account is not assigned to a clinic. Ask a clinic owner to add the membership."
            : "Select the active clinic from the top bar before opening clinical records."
        }
        onSignOut={signOut}
      />
    );
  }

  return <>{children}</>;
}

function AccessNotice({
  message,
  onSignOut,
  onRetry,
  showSignOut = true,
}: {
  message: string;
  onSignOut: () => Promise<void>;
  onRetry?: () => void;
  showSignOut?: boolean;
}) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p
        role={onRetry ? "alert" : undefined}
        className="text-sm text-[var(--color-ink-soft)]"
      >
        {message}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        {onRetry && <Button onClick={onRetry}>Try again</Button>}
        {showSignOut && (
          <Button variant="secondary" onClick={onSignOut}>
            Sign out
          </Button>
        )}
      </div>
    </div>
  );
}

function ClinicianLogin() {
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
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center">
      <div className="mb-6 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--color-primary)] text-white">
          <Icon name="sparkle" width={24} height={24} />
        </span>
        <h2 className="mt-3 text-lg font-bold text-[var(--color-ink)]">
          Clinician Sign In
        </h2>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          Sign in with the account your clinic administrator created for you.
        </p>
      </div>
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
            <Link
              href="/auth/forgot-password"
              className="block text-center text-xs text-[var(--color-primary-strong)] underline"
            >
              Forgot password?
            </Link>
          </form>
          <p className="mt-4 text-center text-xs text-[var(--color-ink-faint)]">
            Patient?{" "}
            <Link href="/patient" className="text-[var(--color-primary-strong)] underline">
              پرتال بیمار
            </Link>
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
