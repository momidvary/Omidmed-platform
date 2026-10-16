"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Misc";
import { addDays } from "@/lib/clinical/adherence";
import { clinicFollowUps, SILENT_DAYS, type FollowUpItem } from "@/lib/clinical/followUps";
import { useText } from "@/lib/i18n/text";
import { formatJalali, todayIso } from "@/lib/jalali";
import { useAuth } from "@/lib/store/AuthContext";
import { useLocale } from "@/lib/store/LocaleContext";
import { fetchClinicFollowUpData } from "@/lib/supabase/db";

const text = {
  en: {
    title: "Follow-up",
    subtitle: "Home programs that need a look",
    reviewDue: "Program review due",
    reviewDueNone: "No program is due for review.",
    reviewOn: (date: string) => `review date ${date}`,
    silent: `No exercise report for ${SILENT_DAYS} days`,
    silentNone: "Every published program has a recent report.",
    lastReport: (date: string) => `last report ${date}`,
    neverReported: "no report yet",
    silentHint: "A missing report does not mean the patient stopped; check in with them.",
    failed: "The follow-up list could not be loaded.",
    loading: "Loading follow-up…",
    more: (n: number) => `and ${n} more`,
  },
  fa: {
    title: "پیگیری",
    subtitle: "برنامه‌های خانگی که نیاز به بررسی دارند",
    reviewDue: "زمان بازبینی برنامه رسیده",
    reviewDueNone: "برنامه‌ای در انتظار بازبینی نیست.",
    reviewOn: (date: string) => `تاریخ بازبینی ${date}`,
    silent: `بدون گزارش تمرین در ${SILENT_DAYS.toLocaleString("fa-IR")} روز اخیر`,
    silentNone: "همه برنامه‌های منتشرشده گزارش اخیر دارند.",
    lastReport: (date: string) => `آخرین گزارش ${date}`,
    neverReported: "هنوز گزارشی نداده",
    silentHint: "نبود گزارش به معنی کنار گذاشتن تمرین نیست؛ با بیمار تماس بگیرید.",
    failed: "فهرست پیگیری بارگیری نشد.",
    loading: "در حال بارگیری پیگیری…",
    more: (n: number) => `و ${n.toLocaleString("fa-IR")} مورد دیگر`,
  },
};

const LIMIT = 6;

type State =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; reviewDue: FollowUpItem[]; silent: FollowUpItem[] };

/** Dashboard follow-up: programs due for review and programs with no reports. */
export function FollowUpSection() {
  const t = useText(text);
  const { locale } = useLocale();
  const { activeClinicId } = useAuth();
  const [loaded, setLoaded] = useState<{ key: string; state: State } | null>(null);

  useEffect(() => {
    if (!activeClinicId) return;
    let cancelled = false;
    const today = todayIso();
    const key = `${activeClinicId}:${today}`;
    fetchClinicFollowUpData(activeClinicId, addDays(today, -SILENT_DAYS - 7)).then((data) => {
      if (cancelled) return;
      setLoaded({
        key,
        state: data
          ? { status: "ready", ...clinicFollowUps(data.programs, data.reports, today) }
          : { status: "failed" },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [activeClinicId]);

  if (!activeClinicId) return null;
  const state: State =
    loaded && loaded.key.startsWith(`${activeClinicId}:`) ? loaded.state : { status: "loading" };
  const formatDay = (iso: string) =>
    locale === "fa"
      ? formatJalali(iso)
      : new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale, { dateStyle: "medium", timeZone: "UTC" });

  function list(items: FollowUpItem[], empty: string, detail: (item: FollowUpItem) => string) {
    if (items.length === 0) {
      return <p className="text-sm text-[var(--color-ink-soft)]">{empty}</p>;
    }
    return (
      <ul className="divide-y divide-[var(--color-border)]">
        {items.slice(0, LIMIT).map((item) => (
          <li key={item.patientId}>
            <Link
              href={`/workspace?patient=${encodeURIComponent(item.patientId)}`}
              className="flex items-center justify-between gap-3 py-2.5 hover:text-[var(--color-primary-strong)]"
            >
              <span className="min-w-0 truncate text-sm font-medium" dir="auto">
                {item.patientName}
              </span>
              <span className="shrink-0 text-xs text-[var(--color-ink-soft)]">{detail(item)}</span>
            </Link>
          </li>
        ))}
        {items.length > LIMIT && (
          <li className="py-2 text-xs text-[var(--color-ink-faint)]">{t.more(items.length - LIMIT)}</li>
        )}
      </ul>
    );
  }

  return (
    <Card>
      <CardHeader title={t.title} subtitle={t.subtitle} icon={<Icon name="clock" />} />
      <CardBody>
        {state.status === "loading" ? (
          <Spinner label={t.loading} />
        ) : state.status === "failed" ? (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {t.failed}
          </p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <section aria-labelledby="follow-review">
              <h4 id="follow-review" className="mb-1 text-sm font-semibold text-[var(--color-ink)]">
                {t.reviewDue}
              </h4>
              {list(state.reviewDue, t.reviewDueNone, (item) => t.reviewOn(formatDay(item.date as string)))}
            </section>
            <section aria-labelledby="follow-silent">
              <h4 id="follow-silent" className="mb-1 text-sm font-semibold text-[var(--color-ink)]">
                {t.silent}
              </h4>
              {list(state.silent, t.silentNone, (item) =>
                item.date ? t.lastReport(formatDay(item.date)) : t.neverReported
              )}
              {state.silent.length > 0 && (
                <p className="mt-2 text-xs text-[var(--color-ink-faint)]">{t.silentHint}</p>
              )}
            </section>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
