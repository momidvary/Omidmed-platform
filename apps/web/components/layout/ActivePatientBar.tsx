"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { hasClinicalSafetyClearance } from "@/lib/clinical/safety";
import { isMockMode } from "@/lib/config";
import { useText } from "@/lib/i18n/text";
import { useCases } from "@/lib/store/CaseContext";
import type { SafetyDisposition } from "@/lib/types";

const text = {
  en: {
    label: "Active patient",
    none: "No active patient — open a patient to plan, prescribe or start a protocol phase.",
    choose: "Choose a patient",
    record: "Patient record",
    change: "Change",
    dispositions: {
      "not-screened": "safety screen not done",
      clear: "safety screen clear",
      "medical-review": "medical review needed",
      urgent: "urgent referral",
      emergency: "emergency",
    } as Record<SafetyDisposition, string>,
  },
  fa: {
    label: "بیمار فعال",
    none: "بیمار فعالی انتخاب نشده — برای برنامه‌ریزی، تجویز یا شروع فاز پروتکل، پرونده یک بیمار را باز کنید.",
    choose: "انتخاب بیمار",
    record: "پرونده بیمار",
    change: "تغییر",
    dispositions: {
      "not-screened": "غربالگری ایمنی انجام نشده",
      clear: "غربالگری ایمنی بدون علامت هشدار",
      "medical-review": "نیازمند بررسی پزشکی",
      urgent: "ارجاع فوری",
      emergency: "اورژانس",
    } as Record<SafetyDisposition, string>,
  },
};

/** Paths where the bar adds nothing (the page itself is about choosing a patient). */
const hiddenOn = ["/", "/patients", "/settings"];

/**
 * Shows which patient the clinical tools (planner, protocols, prescription)
 * will act on, so a clinician never starts work for the wrong person.
 */
export function ActivePatientBar() {
  const pathname = usePathname();
  const t = useText(text);
  const { currentCase, hydrated, setCurrentCase } = useCases();
  if (!hydrated || hiddenOn.includes(pathname)) return null;

  if (!currentCase) {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden rounded-xl border border-dashed border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-ink-soft)]">
        <Icon name="users" width={14} height={14} />
        <span>{t.none}</span>
        {!isMockMode && (
          <Link href="/patients" className="font-semibold text-[var(--color-primary-strong)] underline">
            {t.choose}
          </Link>
        )}
      </div>
    );
  }

  const disposition = currentCase.safetyScreen?.disposition ?? "not-screened";
  const cleared = hasClinicalSafetyClearance(currentCase.safetyScreen);

  return (
    <section
      aria-label={t.label}
      className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 print:hidden rounded-xl border border-[var(--color-primary)]/25 bg-[var(--color-primary-tint)] px-4 py-2 text-sm"
    >
      <span className="text-xs text-[var(--color-ink-soft)]">{t.label}:</span>
      <span className="font-semibold text-[var(--color-ink)]" dir="auto">{currentCase.name}</span>
      {currentCase.mainComplaint && (
        <span className="max-w-xs truncate text-xs text-[var(--color-ink-soft)]" dir="auto">{currentCase.mainComplaint}</span>
      )}
      <Badge tone={cleared ? "success" : disposition === "not-screened" ? "warn" : "danger"}>
        {t.dispositions[disposition]}
      </Badge>
      <span className="ms-auto flex items-center gap-3 text-xs">
        {!isMockMode && currentCase.patientId && (
          <Link
            href={`/workspace?patient=${encodeURIComponent(currentCase.patientId)}`}
            className="font-semibold text-[var(--color-primary-strong)] underline"
          >
            {t.record}
          </Link>
        )}
        <Link
          href={isMockMode ? "/case-analysis" : "/patients"}
          onClick={() => {
            if (!isMockMode) setCurrentCase(null);
          }}
          className="text-[var(--color-ink-soft)] underline"
        >
          {t.change}
        </Link>
      </span>
    </section>
  );
}
