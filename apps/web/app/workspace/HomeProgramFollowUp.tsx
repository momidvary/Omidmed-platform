"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Misc";
import {
  addDays,
  localDateIn,
  reasonLabel,
  scheduledDays,
  suggestProgression,
  DEFAULT_PAIN_LIMIT,
  summarizeItem,
  type SuggestionKind,
} from "@/lib/clinical/adherence";
import { exercises } from "@/lib/data/exercises";
import { localizeExercise } from "@/lib/data/exerciseLibraryFa";
import { useText } from "@/lib/i18n/text";
import { useLocale } from "@/lib/store/LocaleContext";
import { fetchEpisodeExerciseReports } from "@/lib/supabase/db";
import type { PrescriptionRecord } from "@/lib/types";
import { cn } from "@/lib/utils";
import { followUpText } from "./followUpText";
import { useSection } from "./useSection";

const WINDOW_DAYS = 14;

const suggestionTone: Record<SuggestionKind, "danger" | "warn" | "accent" | "success" | "neutral"> = {
  review: "danger",
  regress: "warn",
  reteach: "accent",
  simplify: "accent",
  progress: "success",
  hold: "neutral",
  insufficient: "neutral",
};

function painTone(level: number): string {
  return level >= 7
    ? "bg-[var(--color-danger)] text-white"
    : level >= 4
      ? "bg-[var(--color-warn-soft)] text-[var(--color-warn)]"
      : "bg-[var(--color-success-soft)] text-[var(--color-success)]";
}

export function HomeProgramFollowUp({
  program,
  episodeId,
  scopeKey,
  onEdit,
}: {
  program: PrescriptionRecord;
  episodeId: string;
  /** Patient/clinic scope the reports belong to; part of the load key. */
  scopeKey: string;
  onEdit: () => void;
}) {
  const t = useText(followUpText);
  const { locale } = useLocale();
  const digits = locale === "fa" ? "fa-IR" : "en-US";
  const timezone = program.scheduleTimezone;
  // The patient's calendar day in the prescription's timezone, fixed for this view.
  const [today] = useState(() => (timezone ? localDateIn(timezone) : null));
  const [retry, setRetry] = useState(0);
  const since = today ? addDays(today, -(WINDOW_DAYS - 1)) : null;
  const scheduledProgram =
    Boolean(timezone) && program.items.some((item) => item.scheduledWeekdays?.length);

  const reports = useSection(
    scheduledProgram && since
      ? `${scopeKey}:${episodeId}:${program.id}:${since}:${retry}`
      : null,
    () => fetchEpisodeExerciseReports(episodeId, since as string)
  );

  return (
    <Card>
      <CardHeader
        title={t.title}
        subtitle={t.subtitle(WINDOW_DAYS)}
        icon={<Icon name="exercise" />}
        action={
          <Button size="sm" variant="secondary" onClick={onEdit}>
            {t.editProgram}
          </Button>
        }
      />
      <CardBody className="space-y-4">
        {!scheduledProgram || !today || !since ? (
          <p className="text-sm text-[var(--color-ink-soft)]">{t.noSchedule}</p>
        ) : reports.loading ? (
          <Spinner label={t.loading} />
        ) : reports.failed ? (
          <div role="alert" className="text-sm text-[var(--color-danger)]">
            <p>{t.failed}</p>
            <Button
              size="sm"
              variant="secondary"
              className="mt-2"
              onClick={() => setRetry((value) => value + 1)}
            >
              {t.retry}
            </Button>
          </div>
        ) : (
          <ul className="space-y-3">
            {program.items.map((item) => {
              const itemId = program.itemIds[item.exerciseId];
              const exercise = exercises.find((candidate) => candidate.id === item.exerciseId);
              const local = exercise ? localizeExercise(exercise, locale) : null;
              const name = local?.name ?? item.contentSnapshot?.name ?? item.exerciseId;
              const scheduled = scheduledDays(
                item.scheduledWeekdays,
                since,
                today,
                program.startDate,
                program.endDate
              );
              const summary = summarizeItem(itemId ?? "", scheduled, itemId ? reports.data ?? [] : []);
              const suggestion = suggestProgression(
                summary,
                program.status === "suspended",
                item.painLimit ?? DEFAULT_PAIN_LIMIT
              );
              const trend =
                summary.painTrend === null
                  ? null
                  : summary.painTrend > 0.5
                    ? t.trendUp
                    : summary.painTrend < -0.5
                      ? t.trendDown
                      : t.trendFlat;
              const libraryOption =
                suggestion.kind === "progress"
                  ? local?.progression && { label: t.progressionOption, text: local.progression }
                  : suggestion.kind === "regress"
                    ? local?.regression && { label: t.regressionOption, text: local.regression }
                    : null;
              return (
                <li
                  key={item.exerciseId}
                  className={cn(
                    "rounded-xl border p-4",
                    suggestion.kind === "review"
                      ? "border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)]"
                      : "border-[var(--color-border)]"
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--color-ink)]" dir="auto">
                        {name}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
                        {t.reported(summary.reportedDays, summary.scheduledDays)}
                        {summary.reportedDays > 0 && (
                          <>
                            {" · "}
                            {t.complete(summary.completeDays)} · {t.partial(summary.partialDays)} ·{" "}
                            {t.notDone(summary.notDoneDays)}
                          </>
                        )}
                      </p>
                    </div>
                    <Badge tone={suggestionTone[suggestion.kind]}>
                      {t.suggestion[suggestion.kind]}
                    </Badge>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-ink-soft)]">
                    <span>{t.painSeries}:</span>
                    {summary.pain.length === 0 ? (
                      <span>{t.noReports}</span>
                    ) : (
                      <>
                        {summary.pain.slice(-7).map((entry) => (
                          <span
                            key={entry.date}
                            title={entry.date}
                            className={cn(
                              "grid h-6 min-w-6 place-items-center rounded-md px-1 font-semibold",
                              painTone(entry.level)
                            )}
                          >
                            {entry.level.toLocaleString(digits)}
                          </span>
                        ))}
                        {trend && <span className="ms-1">({trend})</span>}
                      </>
                    )}
                  </div>

                  {summary.topReason && (
                    <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
                      {t.topReason}: {reasonLabel(summary.topReason, locale)}
                    </p>
                  )}

                  <p
                    className={cn(
                      "mt-2 text-xs leading-relaxed",
                      suggestion.kind === "review"
                        ? "font-semibold text-[var(--color-danger)]"
                        : "text-[var(--color-ink)]"
                    )}
                  >
                    {t.why[suggestion.reason]}
                  </p>
                  {libraryOption && (
                    <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                      {libraryOption.label}: {libraryOption.text}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs leading-relaxed text-[var(--color-ink-faint)]">{t.disclaimer}</p>
      </CardBody>
    </Card>
  );
}
