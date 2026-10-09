"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/store/AuthContext";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { useText, type PageText } from "@/lib/i18n/text";

const en = {
  tooShort: "Use at least 12 characters.",
  mismatch: "Passwords do not match.",
  title: "Choose a new password",
  verifying: "Verifying reset link…",
  expired: "The reset session is missing or expired.",
  requestAnother: "Request another link",
  updated: "Password updated successfully.",
  continue: "Continue to PhysioAI",
  newPassword: "New password",
  hint: "At least 12 characters",
  confirm: "Confirm password",
  updating: "Updating…",
  update: "Update password",
};

const text: PageText<typeof en> = {
  en,
  fa: {
    tooShort: "حداقل ۱۲ نویسه وارد کنید.",
    mismatch: "رمزهای عبور یکسان نیستند.",
    title: "انتخاب رمز عبور جدید",
    verifying: "در حال بررسی لینک بازیابی…",
    expired: "جلسه بازیابی وجود ندارد یا منقضی شده است.",
    requestAnother: "درخواست لینک جدید",
    updated: "رمز عبور با موفقیت تغییر کرد.",
    continue: "ادامه به PhysioAI",
    newPassword: "رمز عبور جدید",
    hint: "حداقل ۱۲ نویسه",
    confirm: "تکرار رمز عبور",
    updating: "در حال به‌روزرسانی…",
    update: "تغییر رمز عبور",
  },
  ar: {
    tooShort: "استخدم 12 حرفاً على الأقل.",
    mismatch: "كلمتا المرور غير متطابقتين.",
    title: "اختر كلمة مرور جديدة",
    newPassword: "كلمة المرور الجديدة",
    confirm: "تأكيد كلمة المرور",
    update: "تحديث كلمة المرور",
  },
};

export default function UpdatePasswordPage() {
  const { session, loading, updatePassword } = useAuth();
  const t = useText(text);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (password.length < 12) {
      setError(t.tooShort);
      return;
    }
    if (password !== confirmation) {
      setError(t.mismatch);
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
          {t.title}
        </h1>
      </div>
      <Card>
        <CardBody>
          {loading ? (
            <p role="status" className="text-sm text-[var(--color-ink-soft)]">
              {t.verifying}
            </p>
          ) : !session ? (
            <div role="alert" className="space-y-4 text-sm text-[var(--color-danger)]">
              <p>{t.expired}</p>
              <Link href="/auth/forgot-password" className="underline">
                {t.requestAnother}
              </Link>
            </div>
          ) : done ? (
            <div role="status" className="space-y-4 text-sm text-[var(--color-success)]">
              <p>{t.updated}</p>
              <Link href="/" className="underline">
                {t.continue}
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <Field label={t.newPassword} required hint={t.hint}>
                <Input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </Field>
              <Field label={t.confirm} required error={error ?? undefined}>
                <Input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </Field>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? t.updating : t.update}
              </Button>
            </form>
          )}
        </CardBody>
      </Card>
    </main>
  );
}
