"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/store/AuthContext";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";

export default function UpdatePasswordPage() {
  const { session, loading, updatePassword } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (password.length < 12) {
      setError("Use at least 12 characters.");
      return;
    }
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await updatePassword(password);
    setBusy(false);
    if (result) {
      setError(result);
      return;
    }
    setDone(true);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-6 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--color-primary)] text-white">
          <Icon name="shield" width={24} height={24} />
        </span>
        <h1 className="mt-3 text-lg font-bold text-[var(--color-ink)]">
          Choose a new password
        </h1>
      </div>
      <Card>
        <CardBody>
          {loading ? (
            <p role="status" className="text-sm text-[var(--color-ink-soft)]">
              Verifying reset link…
            </p>
          ) : !session ? (
            <div role="alert" className="space-y-4 text-sm text-[var(--color-danger)]">
              <p>The reset session is missing or expired.</p>
              <Link href="/auth/forgot-password" className="underline">
                Request another link
              </Link>
            </div>
          ) : done ? (
            <div role="status" className="space-y-4 text-sm text-[var(--color-success)]">
              <p>Password updated successfully.</p>
              <Link href="/" className="underline">
                Continue to PhysioAI
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <Field label="New password" required hint="At least 12 characters">
                <Input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </Field>
              <Field label="Confirm password" required error={error ?? undefined}>
                <Input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </Field>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Updating…" : "Update password"}
              </Button>
            </form>
          )}
        </CardBody>
      </Card>
    </main>
  );
}
