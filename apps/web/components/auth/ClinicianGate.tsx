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
import { useText, type PageText } from "@/lib/i18n/text";

const en = {
  notConfigured:
    "PhysioAI is not configured for secure production use. Supabase authentication is required; contact the platform administrator.",
  loading: "Loading…",
  profileFailed:
    "We could not securely load your account profile and clinic memberships. No clinical workspace was opened. Check the connection and try again.",
  noProfile:
    "Your account does not have a valid PhysioAI profile. Ask the platform administrator to provision it, then sign in again.",
  patientAccount:
    "This account is a patient account. The clinician workspace is for clinic staff only.",
  toPortal: "Go to the patient portal",
  notAuthorised: "This account is not authorised to use the clinician workspace.",
  noClinic: "This account is not assigned to a clinic. Ask a clinic owner to add the membership.",
  selectClinic: "Select the active clinic from the top bar before opening clinical records.",
  tryAgain: "Try again",
  signOut: "Sign out",
  title: "Clinician Sign In",
  subtitle: "Sign in with the account your clinic administrator created for you.",
  email: "Email",
  password: "Password",
  signingIn: "Signing in…",
  signIn: "Sign in",
  forgot: "Forgot password?",
  patientQ: "Patient?",
  portal: "Patient portal",
  invalidCredentials: "Email or password is incorrect.",
  emailNotConfirmed: "This email address has not been confirmed yet.",
  tooMany: "Too many attempts. Wait a few minutes and try again.",
};

const text: PageText<typeof en> = {
  en,
  fa: {
    notConfigured:
      "PhysioAI برای استفاده امن در محیط عملیاتی تنظیم نشده است. احراز هویت Supabase لازم است؛ با مدیر پلتفرم تماس بگیرید.",
    loading: "در حال بارگذاری…",
    profileFailed:
      "پروفایل حساب و عضویت کلینیک شما به‌طور امن بارگذاری نشد و هیچ فضای بالینی باز نشد. اتصال را بررسی و دوباره تلاش کنید.",
    noProfile:
      "حساب شما پروفایل معتبر PhysioAI ندارد. از مدیر پلتفرم بخواهید آن را بسازد و سپس دوباره وارد شوید.",
    patientAccount: "این حساب، حساب بیمار است. فضای کاری بالینی فقط برای کادر کلینیک است.",
    toPortal: "رفتن به پرتال بیمار",
    notAuthorised: "این حساب مجاز به استفاده از فضای کاری بالینی نیست.",
    noClinic: "این حساب به هیچ کلینیکی اختصاص داده نشده است. از صاحب کلینیک بخواهید عضویت را اضافه کند.",
    selectClinic: "پیش از باز کردن پرونده‌ها، کلینیک فعال را از نوار بالا انتخاب کنید.",
    tryAgain: "تلاش دوباره",
    signOut: "خروج",
    title: "ورود کادر درمان",
    subtitle: "با حسابی که مدیر کلینیک برایتان ساخته وارد شوید.",
    email: "ایمیل",
    password: "رمز عبور",
    signingIn: "در حال ورود…",
    signIn: "ورود",
    forgot: "رمز عبور را فراموش کرده‌اید؟",
    patientQ: "بیمار هستید؟",
    portal: "پرتال بیمار",
    invalidCredentials: "ایمیل یا رمز عبور اشتباه است.",
    emailNotConfirmed: "این ایمیل هنوز تأیید نشده است.",
    tooMany: "تعداد تلاش‌ها زیاد بود. چند دقیقه صبر کنید و دوباره تلاش کنید.",
  },
  ar: {
    loading: "جارٍ التحميل…",
    tryAgain: "إعادة المحاولة",
    signOut: "تسجيل الخروج",
    title: "دخول الكادر السريري",
    subtitle: "سجّل الدخول بالحساب الذي أنشأه لك مدير العيادة.",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    signingIn: "جارٍ تسجيل الدخول…",
    signIn: "دخول",
    forgot: "نسيت كلمة المرور؟",
    patientQ: "مريض؟",
    portal: "بوابة المريض",
    toPortal: "الذهاب إلى بوابة المريض",
    invalidCredentials: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
  },
};

/** Localize the common Supabase sign-in errors; keep anything else as-is. */
function signInError(message: string, t: typeof en): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) return t.invalidCredentials;
  if (lower.includes("email not confirmed")) return t.emailNotConfirmed;
  if (lower.includes("rate limit") || lower.includes("too many")) return t.tooMany;
  return message;
}

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
  const t = useText(text);

  if (isMockMode) return <>{children}</>;
  if (hasDataConfigurationError) {
    return (
      <AccessNotice
        message={t.notConfigured}
        onSignOut={async () => undefined}
        showSignOut={false}
      />
    );
  }
  if (loading) return <Spinner label={t.loading} />;
  if (profileLoadError) {
    return (
      <AccessNotice
        message={t.profileFailed}
        onRetry={retryProfile}
        onSignOut={signOut}
      />
    );
  }
  if (!session) return <ClinicianLogin />;

  if (!profile) {
    return (
      <AccessNotice
        message={t.noProfile}
        onSignOut={signOut}
      />
    );
  }

  if (profile.role === "patient") {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="text-sm text-[var(--color-ink-soft)]">
          {t.patientAccount}
        </p>
        <div className="mt-4 flex justify-center gap-3">
          <Link
            href="/patient"
            className="rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white"
          >
            {t.toPortal}
          </Link>
          <Button variant="secondary" onClick={signOut}>
            {t.signOut}
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
        message={t.notAuthorised}
        onSignOut={signOut}
      />
    );
  }

  if (!activeClinicId) {
    return (
      <AccessNotice
        message={
          profile.clinicIds.length === 0
            ? t.noClinic
            : t.selectClinic
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
  const t = useText(text);
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p
        role={onRetry ? "alert" : undefined}
        className="text-sm text-[var(--color-ink-soft)]"
      >
        {message}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        {onRetry && <Button onClick={onRetry}>{t.tryAgain}</Button>}
        {showSignOut && (
          <Button variant="secondary" onClick={onSignOut}>
            {t.signOut}
          </Button>
        )}
      </div>
    </div>
  );
}

function ClinicianLogin() {
  const { signIn } = useAuth();
  const t = useText(text);
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
    if (err) setError(signInError(err, t));
  }

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center">
      <div className="mb-6 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--color-primary)] text-white">
          <Icon name="sparkle" width={24} height={24} />
        </span>
        <h2 className="mt-3 text-lg font-bold text-[var(--color-ink)]">
          {t.title}
        </h2>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          {t.subtitle}
        </p>
      </div>
      <Card>
        <CardBody>
          <form onSubmit={submit} className="space-y-4">
            <Field label={t.email} required>
              <Input
                type="email"
                dir="ltr"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@clinic.com"
              />
            </Field>
            <Field label={t.password} required error={error ?? undefined}>
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
              {busy ? t.signingIn : t.signIn}
            </Button>
            <Link
              href="/auth/forgot-password"
              className="block text-center text-xs text-[var(--color-primary-strong)] underline"
            >
              {t.forgot}
            </Link>
          </form>
          <p className="mt-4 text-center text-xs text-[var(--color-ink-faint)]">
            {t.patientQ}{" "}
            <Link href="/patient" className="text-[var(--color-primary-strong)] underline">
              {t.portal}
            </Link>
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
