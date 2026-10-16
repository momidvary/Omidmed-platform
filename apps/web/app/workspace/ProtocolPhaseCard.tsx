"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import type { DetectedPhase } from "@/lib/clinical/protocols/detect";
import { useText } from "@/lib/i18n/text";
import { useLocale } from "@/lib/store/LocaleContext";
import { cn } from "@/lib/utils";

const text = {
  en: {
    title: "Treatment phase",
    phaseOf: (index: number, total: number) => `Phase ${index} of ${total}`,
    basisPlan: "Recognised from the approved treatment plan.",
    basisExercises: "Recognised from the current home program's exercises — check it is right.",
    criteria: "Before moving on, check the criteria for the next phase:",
    criteriaHint: "These ticks are only a checklist on this screen; they are not saved.",
    next: (name: string) => `Start the next phase: ${name}`,
    nextHint: "Opens the home-program builder with the next phase's exercises; you review and publish a new version.",
    last: "This is the last phase of the protocol: focus on self-management and plan discharge.",
    note: "Write a session note",
    viewProtocol: "View protocol",
    unknown: "The current home program does not match a protocol phase clearly.",
    choose: "Choose a protocol and phase",
  },
  fa: {
    title: "فاز درمان",
    phaseOf: (index: number, total: number) => `فاز ${index} از ${total}`,
    basisPlan: "از روی برنامه درمان تأییدشده تشخیص داده شد.",
    basisExercises: "از روی تمرین‌های برنامه خانگی فعلی تشخیص داده شد — درستی آن را بررسی کنید.",
    criteria: "پیش از رفتن به فاز بعد، معیارها را بررسی کنید:",
    criteriaHint: "این تیک‌ها فقط چک‌لیست همین صفحه است و ذخیره نمی‌شود.",
    next: (name: string) => `شروع فاز بعد: ${name}`,
    nextHint: "سازنده برنامه خانگی با تمرین‌های فاز بعد باز می‌شود؛ شما بررسی و نسخه جدید را منتشر می‌کنید.",
    last: "این آخرین فاز پروتکل است: تمرکز بر خودمدیریتی و برنامه‌ریزی ترخیص.",
    note: "نوشتن یادداشت جلسه",
    viewProtocol: "مشاهده پروتکل",
    unknown: "برنامه خانگی فعلی به‌وضوح با فاز مشخصی از پروتکل‌ها مطابقت ندارد.",
    choose: "انتخاب پروتکل و فاز",
  },
};

/**
 * Where the patient is in their protocol and what moves them on. Detection
 * and the criteria checklist only guide; the next phase is a new program
 * version the clinician reviews and publishes.
 */
export function ProtocolPhaseCard({
  detected,
  onNextPhase,
  notesHref,
}: {
  detected: DetectedPhase | null;
  onNextPhase: (protocolId: string, phaseId: string) => void;
  notesHref: string;
}) {
  const t = useText(text);
  const { locale } = useLocale();
  const lang = locale === "fa" ? "fa" : "en";
  const [checked, setChecked] = useState<Set<string>>(new Set());

  if (!detected) {
    return (
      <Card>
        <CardBody className="flex flex-wrap items-center gap-3">
          <Icon name="treatment" width={20} height={20} className="text-[var(--color-ink-faint)]" />
          <p className="flex-1 text-sm text-[var(--color-ink-soft)]">{t.unknown}</p>
          <Link href="/protocols" className="text-sm font-semibold text-[var(--color-primary-strong)] underline">
            {t.choose}
          </Link>
        </CardBody>
      </Card>
    );
  }

  const { protocol, phase, index, next } = detected;
  const criteria = phase.progressWhen;
  const allChecked = criteria.every((item) => checked.has(item.en));

  return (
    <Card>
      <CardHeader
        title={`${t.title}: ${protocol.title[lang]}`}
        subtitle={detected.basis === "plan" ? t.basisPlan : t.basisExercises}
        icon={<Icon name="treatment" width={18} height={18} />}
        action={
          <Link href={`/protocols/${protocol.id}`} className="text-sm font-medium text-[var(--color-primary-strong)] underline">
            {t.viewProtocol}
          </Link>
        }
      />
      <CardBody className="space-y-4">
        <ol className="flex flex-wrap items-center gap-2" aria-label={t.phaseOf(index + 1, protocol.phases.length)}>
          {protocol.phases.map((item, position) => (
            <li
              key={item.id}
              aria-current={position === index ? "step" : undefined}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm",
                position < index && "bg-[var(--color-success-soft)] text-[var(--color-success)]",
                position === index && "bg-[var(--color-primary)] font-semibold text-white",
                position > index && "bg-[var(--color-surface-muted)] text-[var(--color-ink-soft)]"
              )}
            >
              {(position + 1).toLocaleString(locale === "fa" ? "fa-IR" : "en")}. {item.name[lang]}
            </li>
          ))}
        </ol>

        {next ? (
          <div className="space-y-3 rounded-xl border border-[var(--color-primary)]/25 bg-[var(--color-primary-tint)] p-4">
            <p className="text-sm font-semibold text-[var(--color-ink)]">{t.criteria}</p>
            <ul className="space-y-2">
              {criteria.map((item) => (
                <li key={item.en}>
                  <label className="flex items-start gap-3 text-sm text-[var(--color-ink)]">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4"
                      checked={checked.has(item.en)}
                      onChange={(event) =>
                        setChecked((previous) => {
                          const updated = new Set(previous);
                          if (event.target.checked) updated.add(item.en);
                          else updated.delete(item.en);
                          return updated;
                        })
                      }
                    />
                    <span>{item[lang]}</span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="text-xs text-[var(--color-ink-faint)]">{t.criteriaHint}</p>
            <Button onClick={() => onNextPhase(protocol.id, next.id)} disabled={!allChecked}>
              <Icon name="arrow" width={16} height={16} className="rtl:rotate-180" />
              {t.next(next.name[lang])}
            </Button>
            <p className="text-xs text-[var(--color-ink-soft)]">{t.nextHint}</p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[var(--color-success-soft)] p-4">
            <p className="flex-1 text-sm text-[var(--color-success)]">{t.last}</p>
            <Link href={notesHref} className="text-sm font-semibold text-[var(--color-primary-strong)] underline">
              {t.note}
            </Link>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
