"use client";

import { localizedRedFlag, riskFactors } from "@/lib/data/redFlags";
import { useText } from "@/lib/i18n/text";
import { useLocale } from "@/lib/store/LocaleContext";
import type { CaseSafetyScreen } from "@/lib/types";

const text = {
  en: {
    title: "Precautions — recorded risk factors",
    body: "These do not block treatment. Dose conservatively and re-check related warning signs at every visit.",
  },
  fa: {
    title: "احتیاط — عوامل خطر ثبت‌شده",
    body: "این موارد درمان را متوقف نمی‌کنند. دوز را محتاطانه انتخاب کنید و علائم هشدار مرتبط را در هر جلسه دوباره بررسی کنید.",
  },
};

/** Risk factors from the latest safety screen, shown wherever treatment is planned. */
export function RiskFactorNote({
  screen,
  className = "",
}: {
  screen: CaseSafetyScreen | undefined;
  className?: string;
}) {
  const t = useText(text);
  const { locale } = useLocale();
  const ids = new Set(screen?.riskFactorIds ?? []);
  const items = riskFactors
    .filter((flag) => ids.has(flag.id))
    .map((flag) => localizedRedFlag(flag, locale));
  if (!screen?.screenedAt || items.length === 0) return null;

  return (
    <div
      role="note"
      className={`rounded-2xl border border-[var(--color-warn)]/40 bg-[var(--color-warn-soft)] px-5 py-3 text-sm ${className}`}
    >
      <p className="font-semibold text-[var(--color-warn)]">{t.title}</p>
      <ul className="mt-1 list-disc space-y-0.5 ps-5 text-[var(--color-ink)]">
        {items.map((item) => (
          <li key={item.id}>
            <span className="font-medium">{item.label}</span>
            <span className="text-[var(--color-ink-soft)]"> — {item.detail}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-[var(--color-ink-soft)]">{t.body}</p>
    </div>
  );
}
