"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/Misc";
import { hasClinicalSafetyClearance } from "@/lib/clinical/safety";
import { regionLabel } from "@/lib/data/bodyRegionsFa";
import { useText } from "@/lib/i18n/text";
import { useCases } from "@/lib/store/CaseContext";
import { useLocale } from "@/lib/store/LocaleContext";

const text = {
  en: {
    note: "Demo patients stored only in this browser. They are fictional; no real patient data is used.",
    age: (age: number) => `${age} y`,
    analysis: "Examination & analysis",
    planner: "Treatment plan",
    newCase: "New demo assessment",
    cleared: "Safety screen clear",
    notCleared: "Safety screen not clear",
    empty: "No demo patients",
    emptyHint: "Create a demo assessment to try the clinical workflow.",
  },
  fa: {
    note: "بیماران نمایشی فقط در همین مرورگر ذخیره می‌شوند. این افراد ساختگی‌اند و هیچ داده واقعی بیمار استفاده نمی‌شود.",
    age: (age: number) => `${age} ساله`,
    analysis: "معاینه و تحلیل",
    planner: "برنامه درمان",
    newCase: "ارزیابی نمایشی جدید",
    cleared: "غربالگری ایمنی بدون علامت هشدار",
    notCleared: "غربالگری ایمنی تأیید نشده",
    empty: "بیمار نمایشی وجود ندارد",
    emptyHint: "برای امتحان روند بالینی یک ارزیابی نمایشی بسازید.",
  },
};

/** Mock-mode registry: the same fictional cases the dashboard and tools use. */
export function DemoPatientList() {
  const t = useText(text);
  const { locale } = useLocale();
  const router = useRouter();
  const { cases, hydrated, setCurrentCase } = useCases();
  if (!hydrated) return null;

  if (cases.length === 0) {
    return (
      <EmptyState
        icon="user"
        title={t.empty}
        description={t.emptyHint}
        action={<ButtonLink href="/new-case">{t.newCase}</ButtonLink>}
      />
    );
  }

  function open(caseId: string, href: string) {
    setCurrentCase(caseId);
    router.push(href);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--color-ink-soft)]">{t.note}</p>
        <ButtonLink href="/new-case" size="sm">{t.newCase}</ButtonLink>
      </div>
      <ul className="space-y-3">
        {cases.map((patientCase) => {
          const cleared = hasClinicalSafetyClearance(patientCase.safetyScreen);
          return (
            <li key={patientCase.id}>
              <Card>
                <CardBody className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[var(--color-ink)]">
                      {patientCase.name}
                      {patientCase.age ? (
                        <span className="ms-2 text-xs font-normal text-[var(--color-ink-soft)]">{t.age(patientCase.age)}</span>
                      ) : null}
                    </p>
                    <p className="truncate text-sm text-[var(--color-ink-soft)]">{patientCase.mainComplaint}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {patientCase.region && <Badge tone="primary">{regionLabel(patientCase.region, locale)}</Badge>}
                      <Badge tone={cleared ? "success" : "danger"}>{cleared ? t.cleared : t.notCleared}</Badge>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => open(patientCase.id, "/case-analysis")}>
                      {t.analysis}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => open(patientCase.id, "/treatment-planner")}>
                      {t.planner}
                    </Button>
                  </div>
                </CardBody>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
