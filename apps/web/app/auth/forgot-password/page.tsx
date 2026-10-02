"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/store/AuthContext";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center text-sm text-[var(--color-ink-soft)]">
          Loading…
        </main>
      }
    >
      <ForgotPasswordForm />
    </Suspense>
  );
}

function ForgotPasswordForm() {
  const { requestPasswordReset } = useAuth();
  const searchParams = useSearchParams();
  const invalidLink = searchParams.has("error");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await requestPasswordReset(email.trim());
    setBusy(false);
    if (result) {
      setError("The reset email could not be sent. Please wait and try again.");
      return;
    }
    // Keep the message account-enumeration safe.
    setSent(true);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-6 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--color-primary)] text-white">
          <Icon name="shield" width={24} height={24} />
        </span>
        <h1 className="mt-3 text-lg font-bold text-[var(--color-ink)]">
          Reset password / بازیابی رمز
        </h1>
      </div>
      <Card>
        <CardBody>
          {sent ? (
            <div role="status" className="space-y-4 text-sm leading-relaxed text-[var(--color-ink-soft)]">
              <p>
                If an account exists for this email, a time-limited reset link
                has been sent. اگر حسابی با این ایمیل وجود داشته باشد، لینک
                بازیابی ارسال شده است.
              </p>
              <Link href="/" className="text-[var(--color-primary-strong)] underline">
                Return to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {invalidLink && (
                <p role="alert" className="text-sm text-[var(--color-danger)]">
                  This reset link is invalid or expired. Request a new one.
                </p>
              )}
              <Field label="Account email / ایمیل حساب" required error={error ?? undefined}>
                <Input
                  type="email"
                  dir="ltr"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Sending…" : "Send reset link"}
              </Button>
            </form>
          )}
        </CardBody>
      </Card>
    </main>
  );
}
