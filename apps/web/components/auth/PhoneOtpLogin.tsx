"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth, type OtpErrorCode } from "@/lib/store/AuthContext";
import {
  countries,
  maskPhone,
  normalizePhoneNumber,
  toEnglishDigits,
} from "@/lib/phone";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";

const RESEND_SECONDS = 60;
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

type Step = "phone" | "code" | "done";

/**
 * Single sign-in flow for ALL roles: country code + mobile number +
 * optional CAPTCHA → 6-digit SMS code. No role selection, no email, no
 * password. `shouldCreateUser` is always false (accounts are provisioned
 * by the clinic/admin).
 */
export function PhoneOtpLogin({
  t,
  onSuccess,
}: {
  /** Translator (the host page supplies its locale). */
  t: (key: string) => string;
  onSuccess?: () => void;
}) {
  const { sendOtp, verifyOtp } = useAuth();
  const [step, setStep] = useState<Step>("phone");
  const [dialCode, setDialCode] = useState(countries[0].dialCode);
  const [phoneInput, setPhoneInput] = useState("");
  const [e164, setE164] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  const country = countries.find((c) => c.dialCode === dialCode) ?? countries[0];

  // Resend countdown tick.
  useEffect(() => {
    if (countdown <= 0) return;
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  // Optional Cloudflare Turnstile CAPTCHA (enabled when the site key is
  // configured; token verification is done by Supabase Auth itself).
  const captchaRef = useRef<HTMLDivElement>(null);
  const [captchaToken, setCaptchaToken] = useState<string | undefined>();
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || step !== "phone") return;
    type TurnstileApi = {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
    };
    const w = window as unknown as { turnstile?: TurnstileApi };
    const render = () => {
      if (w.turnstile && captchaRef.current && !captchaRef.current.hasChildNodes()) {
        w.turnstile.render(captchaRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token: string) => setCaptchaToken(token),
          "expired-callback": () => setCaptchaToken(undefined),
        });
      }
    };
    if (w.turnstile) {
      render();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.onload = render;
    document.head.appendChild(script);
  }, [step]);

  const errText = useCallback(
    (codeName: OtpErrorCode): string =>
      t(
        {
          invalid_code: "otp.invalidCode",
          expired_code: "otp.expiredCode",
          too_many: "otp.tooMany",
          sms_failed: "otp.smsFailed",
          captcha_required: "otp.captchaRequired",
          network: "otp.networkFailed",
          generic: "otp.generic",
        }[codeName]
      ),
    [t]
  );

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    const normalized = normalizePhoneNumber(phoneInput, country);
    if (!normalized.ok) {
      setError(t("otp.invalidPhone"));
      return;
    }
    if (TURNSTILE_SITE_KEY && !captchaToken) {
      setError(t("otp.captchaRequired"));
      return;
    }
    setBusy(true);
    const err = await sendOtp(normalized.e164, captchaToken);
    setBusy(false);
    if (err) {
      // The phone stays in the input — nothing the user typed is lost.
      setError(errText(err));
      return;
    }
    setE164(normalized.e164);
    setStep("code");
    setCode("");
    setCountdown(RESEND_SECONDS);
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const clean = toEnglishDigits(code).replace(/\D/g, "");
    if (clean.length < 6) {
      setError(t("otp.invalidCode"));
      return;
    }
    setBusy(true);
    const err = await verifyOtp(e164, clean);
    setBusy(false);
    if (err) {
      setError(errText(err));
      if (err === "expired_code") setCode("");
      return;
    }
    setStep("done");
    onSuccess?.();
  }

  if (step === "done") {
    return (
      <Card>
        <CardBody className="py-8 text-center text-sm text-[var(--color-success)]">
          <Icon name="check" width={22} height={22} className="mx-auto mb-2" />
          {t("otp.success")}
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody className="space-y-4">
        {step === "phone" ? (
          <form onSubmit={handleSend} className="space-y-4">
            <p className="text-sm text-[var(--color-ink-soft)]">
              {t("otp.subtitle")}
            </p>
            <div className="flex gap-2" dir="ltr">
              <Field label={t("otp.country")}>
                <Select
                  value={dialCode}
                  onChange={(e) => setDialCode(e.target.value)}
                  className="w-36"
                >
                  {countries.map((c) => (
                    <option key={c.dialCode} value={c.dialCode}>
                      {c.flag} +{c.dialCode}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex-1">
                <Field label={t("otp.phone")} error={error ?? undefined}>
                  <Input
                    inputMode="tel"
                    dir="ltr"
                    autoComplete="tel"
                    value={phoneInput}
                    onChange={(e) => {
                      setPhoneInput(e.target.value);
                      setError(null);
                    }}
                    placeholder={`0${country.placeholder}`}
                  />
                </Field>
              </div>
            </div>
            {TURNSTILE_SITE_KEY && <div ref={captchaRef} className="min-h-[65px]" />}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? t("otp.sending") : t("otp.send")}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="space-y-4">
            <p className="text-sm text-[var(--color-ink-soft)]">
              {t("otp.codeSent")}{" "}
              <span dir="ltr" className="font-mono font-semibold text-[var(--color-ink)]">
                {maskPhone(e164)}
              </span>
            </p>
            <Field label={t("otp.code")} error={error ?? undefined}>
              <Input
                inputMode="numeric"
                dir="ltr"
                autoComplete="one-time-code"
                maxLength={8}
                value={code}
                onChange={(e) => {
                  setCode(toEnglishDigits(e.target.value).replace(/\D/g, ""));
                  setError(null);
                }}
                placeholder="123456"
                className="text-center text-lg tracking-[0.4em]"
              />
            </Field>
            <Button type="submit" className="w-full" disabled={busy || code.length < 6}>
              {busy ? t("otp.verifying") : t("otp.verify")}
            </Button>
            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => {
                  setStep("phone");
                  setError(null);
                }}
                className="text-[var(--color-ink-soft)] underline"
              >
                {t("otp.editPhone")}
              </button>
              {countdown > 0 ? (
                <span className="text-[var(--color-ink-faint)]">
                  {t("otp.resendIn")} {countdown}s
                </span>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleSend()}
                  className="font-medium text-[var(--color-primary-strong)] underline"
                >
                  {t("otp.resend")}
                </button>
              )}
            </div>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
