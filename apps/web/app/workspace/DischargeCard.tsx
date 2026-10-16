"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { transitionCareEpisode } from "@/lib/supabase/db";
import { useText } from "@/lib/i18n/text";
import { useLocale } from "@/lib/store/LocaleContext";

export interface DischargeTrend {
  name: string;
  first: number;
  last: number;
  unit: string;
  count: number;
  better: 1 | -1 | 0;
  meaningful: boolean | null;
}

const text = {
  en: {
    title: "End of treatment (discharge)",
    start: "Prepare discharge",
    summary: "Summary of this episode",
    notes: (n: number) => `${n} signed session note${n === 1 ? "" : "s"}`,
    noRepeat: "No outcome measure has been repeated. Re-measure before discharge so the change can be judged.",
    meaningful: "meaningful change",
    belowMcid: "below the meaningful change",
    better: "improved",
    worse: "worse",
    same: "unchanged",
    step1: "1. Record the final outcome measures and sign a discharge note",
    openNote: "Open the discharge note",
    step2: "2. Close the episode",
    warning:
      "Closing the episode deactivates the patient's current home program and archives the approved treatment plan. It cannot be undone; for a new problem, start a new episode. Write any self-management advice in the discharge note.",
    confirm: "I have signed the discharge note and the patient knows their program is ending.",
    close: "Close the episode",
    closing: "Closing…",
    failed: "The episode could not be closed. Check your connection and permissions and try again.",
    cancel: "Not now",
    completed: (date: string) => `This episode was closed on ${date}.`,
    newEpisode: "For a new problem, start a new episode from the Patients page.",
    toPatients: "Patients page",
  },
  fa: {
    title: "پایان درمان (ترخیص)",
    start: "آماده‌سازی ترخیص",
    summary: "خلاصه این دوره درمان",
    notes: (n: number) => `${n.toLocaleString("fa-IR")} یادداشت جلسه امضاشده`,
    noRepeat: "هیچ ابزار پیامدی دوباره سنجیده نشده است. پیش از ترخیص دوباره بسنجید تا میزان تغییر مشخص شود.",
    meaningful: "تغییر معنادار بالینی",
    belowMcid: "کمتر از حد تغییر معنادار",
    better: "بهبود",
    worse: "بدتر",
    same: "بدون تغییر",
    step1: "۱. سنجش نهایی پیامد و امضای یادداشت ترخیص",
    openNote: "باز کردن یادداشت ترخیص",
    step2: "۲. بستن دوره درمان",
    warning:
      "با بستن دوره، برنامه خانگی فعلی بیمار غیرفعال و برنامه درمان تأییدشده بایگانی می‌شود. این کار برگشت‌پذیر نیست؛ برای مشکل جدید یک دوره درمان تازه شروع کنید. توصیه‌های خودمدیریتی را در یادداشت ترخیص بنویسید.",
    confirm: "یادداشت ترخیص را امضا کرده‌ام و بیمار می‌داند برنامه‌اش تمام می‌شود.",
    close: "بستن دوره درمان",
    closing: "در حال بستن…",
    failed: "دوره درمان بسته نشد. اتصال و دسترسی خود را بررسی و دوباره تلاش کنید.",
    cancel: "فعلاً نه",
    completed: (date: string) => `این دوره درمان در ${date} بسته شد.`,
    newEpisode: "برای مشکل جدید، از صفحه بیماران یک دوره درمان تازه شروع کنید.",
    toPatients: "صفحه بیماران",
  },
};

/**
 * Discharge from the patient's workspace: a summary of the episode, the
 * discharge note, then an explicit, confirmed close. Closing is done by the
 * transition_care_episode RPC, which also revokes the published program and
 * supersedes the approved plan.
 */
export function DischargeCard({
  episodeId,
  status,
  endedAt,
  noteCount,
  trends,
  dischargeNoteHref,
  onClosed,
}: {
  episodeId: string;
  status: "active" | "paused" | "completed";
  endedAt: string | null;
  noteCount: number;
  trends: DischargeTrend[];
  dischargeNoteHref: string;
  onClosed: () => void;
}) {
  const t = useText(text);
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const digits = (value: number) => (locale === "fa" ? value.toLocaleString("fa-IR") : String(value));

  if (status === "completed") {
    const date = endedAt
      ? new Date(endedAt).toLocaleDateString(locale === "fa" ? "fa-IR" : locale, { dateStyle: "medium" })
      : "—";
    return (
      <Card>
        <CardBody className="flex flex-wrap items-center gap-2 text-sm text-[var(--color-ink-soft)]">
          <Icon name="check" width={16} height={16} />
          <span>{t.completed(date)}</span>
          <span>{t.newEpisode}</span>
          <Link href="/patients" className="font-semibold text-[var(--color-primary-strong)] underline">
            {t.toPatients}
          </Link>
        </CardBody>
      </Card>
    );
  }

  if (!open) {
    return (
      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-semibold text-[var(--color-ink)]">{t.title}</span>
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            {t.start}
          </Button>
        </CardBody>
      </Card>
    );
  }

  const repeated = trends.filter((trend) => trend.count > 1);

  async function close() {
    if (!confirmed || busy) return;
    setBusy(true);
    setFailed(false);
    const ok = await transitionCareEpisode(episodeId, "completed");
    setBusy(false);
    if (ok) onClosed();
    else setFailed(true);
  }

  return (
    <Card>
      <CardHeader title={t.title} icon={<Icon name="check" />} />
      <CardBody className="space-y-5">
        <section aria-labelledby="discharge-summary" className="space-y-2">
          <h3 id="discharge-summary" className="text-sm font-semibold text-[var(--color-ink)]">
            {t.summary}
          </h3>
          <p className="text-sm text-[var(--color-ink-soft)]">{t.notes(noteCount)}</p>
          {repeated.length === 0 ? (
            <p className="rounded-xl bg-[var(--color-warn-soft)] px-3 py-2 text-sm text-[var(--color-warn)]">
              {t.noRepeat}
            </p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {repeated.map((trend) => (
                <li key={trend.name} className="flex flex-wrap items-center gap-2">
                  <span className="text-[var(--color-ink)]">{trend.name}</span>
                  <span className="text-xs text-[var(--color-ink-soft)]">
                    {digits(trend.first)} {locale === "fa" ? "←" : "→"} {digits(trend.last)} {trend.unit}
                  </span>
                  <Badge tone={trend.better > 0 ? "success" : trend.better < 0 ? "danger" : "neutral"}>
                    {trend.better > 0 ? t.better : trend.better < 0 ? t.worse : t.same}
                  </Badge>
                  {trend.better !== 0 && trend.meaningful !== null && (
                    <Badge tone="neutral">{trend.meaningful ? t.meaningful : t.belowMcid}</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-[var(--color-ink)]">{t.step1}</h3>
          <Link
            href={dischargeNoteHref}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--color-border)] px-4 text-sm font-semibold text-[var(--color-primary-strong)] hover:bg-[var(--color-primary-tint)]"
          >
            <Icon name="edit" width={15} height={15} />
            {t.openNote}
          </Link>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-[var(--color-ink)]">{t.step2}</h3>
          <p className="rounded-xl bg-[var(--color-surface-muted)] px-3 py-2 text-xs leading-6 text-[var(--color-ink-soft)]">
            {t.warning}
          </p>
          <label className="flex items-start gap-2 text-sm text-[var(--color-ink)]">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>{t.confirm}</span>
          </label>
          {failed && (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {t.failed}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" disabled={!confirmed || busy} onClick={() => void close()}>
              {busy ? t.closing : t.close}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t.cancel}
            </Button>
          </div>
        </section>
      </CardBody>
    </Card>
  );
}
