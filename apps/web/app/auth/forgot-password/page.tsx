"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/store/AuthContext";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { useText, type PageText } from "@/lib/i18n/text";

const en = {
  loading: "Loading…",
  sendFailed: "The reset email could not be sent. Please wait and try again.",
  title: "Reset password",
  sent: "If an account exists for this email, a time-limited reset link has been sent.",
  back: "Return to sign in",
  invalidLink: "This reset link is invalid or expired. Request a new one.",
  email: "Account email",
  sending: "Sending…",
  send: "Send reset link",
};

const text: PageText<typeof en> = {
  en,
  fa: {
    loading: "در حال بارگذاری…",
    sendFailed: "ایمیل بازیابی ارسال نشد. کمی صبر کنید و دوباره تلاش کنید.",
    title: "بازیابی رمز عبور",
    sent: "اگر حسابی با این ایمیل وجود داشته باشد، لینک بازیابی با اعتبار محدود ارسال شده است.",
    back: "بازگشت به صفحه ورود",
    invalidLink: "این لینک بازیابی نامعتبر یا منقضی است. لینک جدید درخواست کنید.",
    email: "ایمیل حساب",
    sending: "در حال ارسال…",
    send: "ارسال لینک بازیابی",
  },
  ar: {
    loading: "جارٍ التحميل…",
    title: "إعادة تعيين كلمة المرور",
    sent: "إذا كان هناك حساب بهذا البريد، فقد أُرسل رابط إعادة تعيين محدود الصلاحية.",
    back: "العودة إلى تسجيل الدخول",
    email: "بريد الحساب",
    sending: "جارٍ الإرسال…",
    send: "إرسال رابط إعادة التعيين",
  },
};

export default function ForgotPasswordPage() {
  const t = useText(text);
  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center text-sm text-[var(--color-ink-soft)]">
          {t.loading}
        </main>
      }
    >
      <ForgotPasswordForm />
    </Suspense>
  );
}

function ForgotPasswordForm() {
  const { requestPasswordReset } = useAuth();
  const t = useText(text);
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
      setError(t.sendFailed);
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
          {t.title}
        </h1>
      </div>
      <Card>
        <CardBody>
          {sent ? (
            <div role="status" className="space-y-4 text-sm leading-relaxed text-[var(--color-ink-soft)]">
              <p>{t.sent}</p>
              <Link href="/" className="text-[var(--color-primary-strong)] underline">
                {t.back}
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {invalidLink && (
                <p role="alert" className="text-sm text-[var(--color-danger)]">
                  {t.invalidLink}
                </p>
              )}
              <Field label={t.email} required error={error ?? undefined}>
                <Input
                  type="email"
                  dir="ltr"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? t.sending : t.send}
              </Button>
            </form>
          )}
        </CardBody>
      </Card>
    </main>
  );
}
