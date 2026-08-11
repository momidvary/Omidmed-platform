"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth, type Role } from "@/lib/store/AuthContext";
import { isMockMode } from "@/lib/config";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Misc";

/** Roles allowed into the clinician workspace. */
const STAFF_ROLES: Role[] = [
  "platform_admin",
  "clinic_owner",
  "therapist",
  "clinic_staff",
];

/**
 * Wraps the clinician app. In Supabase mode it requires a signed-in user
 * with a staff role; patients are pointed to the patient portal.
 * Mock mode (dev/demo) passes straight through.
 *
 * The gate is an allow-list and closes on every uncertain state: an
 * unresolved profile must never render the workspace, or a patient sees
 * it during the window between sign-in and the profile arriving.
 */
export function ClinicianGate({ children }: { children: React.ReactNode }) {
  const { session, profile, loading, error, retry, signOut } = useAuth();

  if (isMockMode) return <>{children}</>;
  if (loading) return <Spinner label="Loading…" />;

  if (error === "network") {
    return (
      <Blocked
        title="Can't reach the server"
        body="Your session could not be verified. Check your connection and try again — nothing has been lost."
        bodyFa="اتصال به سرور برقرار نشد. اینترنت خود را بررسی کنید و دوباره تلاش کنید."
      >
        <Button onClick={retry}>Try again</Button>
      </Blocked>
    );
  }

  if (!session) return <ClinicianLogin />;

  if (error === "no_profile" || !profile) {
    return (
      <Blocked
        title="Account setup incomplete"
        body="You are signed in, but this account has no profile yet. Ask your clinic administrator to finish setting it up."
        bodyFa="حساب شما وارد شده اما هنوز پروفایلی برایش ساخته نشده است. از مدیر کلینیک بخواهید تکمیلش کند."
      >
        <Button variant="secondary" onClick={signOut}>
          Sign out
        </Button>
      </Blocked>
    );
  }

  if (!STAFF_ROLES.includes(profile.role)) {
    return (
      <Blocked
        title="This is a patient account"
        body="The clinician workspace is for clinic staff only."
        bodyFa="این حساب، حساب بیمار است. فضای کاری فیزیوتراپیست فقط برای کادر کلینیک است."
      >
        <Link
          href="/patient"
          className="rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white"
        >
          برو به پرتال بیمار
        </Link>
        <Button variant="secondary" onClick={signOut}>
          Sign out
        </Button>
      </Blocked>
    );
  }

  return <>{children}</>;
}

/** A closed-gate screen: why the workspace is not shown, and what to do. */
function Blocked({
  title,
  body,
  bodyFa,
  children,
}: {
  title: string;
  body: string;
  bodyFa: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h2 className="text-sm font-semibold text-[var(--color-ink)]">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-soft)]">
        {body}
      </p>
      <p
        dir="rtl"
        className="mt-2 text-[13px] leading-relaxed text-[var(--color-ink-faint)] font-[family-name:var(--font-vazirmatn)]"
      >
        {bodyFa}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-3">{children}</div>
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
