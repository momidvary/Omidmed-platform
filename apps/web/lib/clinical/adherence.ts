import type { Locale } from "@/lib/i18n/translations";

/*
 * Home-program follow-up from the patient's own per-exercise reports.
 *
 * Decision support only: the suggestion is a transparent rule over the
 * reports, shown to the clinician as a draft. It never changes a
 * prescription; the clinician edits and publishes a new version.
 * Reports are self-reported and a missing report is not "not done".
 */

export const NON_COMPLETION_REASONS = [
  "pain",
  "no_time",
  "unclear",
  "forgot",
  "other",
] as const;
export type ReasonCode = (typeof NON_COMPLETION_REASONS)[number];

const reasonLabels: Record<"en" | "fa", Record<ReasonCode, string>> = {
  en: {
    pain: "Pain or discomfort",
    no_time: "No time",
    unclear: "Unsure how to do it",
    forgot: "Forgot",
    other: "Other",
  },
  fa: {
    pain: "درد یا ناراحتی",
    no_time: "وقت نداشتم",
    unclear: "مطمئن نبودم چطور انجام دهم",
    forgot: "فراموش کردم",
    other: "دلیل دیگر",
  },
};

export function isReasonCode(value: string | null | undefined): value is ReasonCode {
  return (NON_COMPLETION_REASONS as readonly string[]).includes(value ?? "");
}

export function reasonLabel(code: ReasonCode, locale: Locale): string {
  return reasonLabels[locale === "fa" ? "fa" : "en"][code];
}

export interface ExerciseReportLike {
  id: string;
  prescriptionItemId: string;
  localDate: string;
  status: "complete" | "partial" | "not_done";
  painLevel: number;
  nonCompletionReason: string | null;
  createdAt: string;
  supersedesId: string | null;
}

/**
 * Drop corrected reports and keep the latest report per exercise per day,
 * so a retry or correction is never counted twice.
 */
export function currentReports<T extends ExerciseReportLike>(reports: T[]): T[] {
  const superseded = new Set(
    reports.map((report) => report.supersedesId).filter(Boolean) as string[]
  );
  const latest = new Map<string, T>();
  for (const report of reports) {
    if (superseded.has(report.id)) continue;
    const key = `${report.prescriptionItemId}|${report.localDate}`;
    const existing = latest.get(key);
    if (!existing || existing.createdAt <= report.createdAt) latest.set(key, report);
  }
  return [...latest.values()].sort((a, b) =>
    a.localDate === b.localDate
      ? a.createdAt.localeCompare(b.createdAt)
      : a.localDate.localeCompare(b.localDate)
  );
}

/* ── Local calendar dates as YYYY-MM-DD strings ─────────────────── */

export function localDateIn(timeZone: string, at: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function weekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Scheduled days for an exercise in [from, to], within the prescription dates. */
export function scheduledDays(
  weekdays: number[] | undefined,
  from: string,
  to: string,
  startDate: string,
  endDate: string | null
): string[] {
  if (!weekdays?.length) return [];
  const first = from > startDate ? from : startDate;
  const last = endDate && endDate < to ? endDate : to;
  const days: string[] = [];
  for (let day = first; day <= last; day = addDays(day, 1)) {
    if (weekdays.includes(weekday(day))) days.push(day);
    if (days.length > 400) break;
  }
  return days;
}

/* ── Per-exercise summary ───────────────────────────────────────── */

export interface AdherenceSummary {
  itemId: string;
  scheduledDays: number;
  reportedDays: number;
  completeDays: number;
  partialDays: number;
  notDoneDays: number;
  /** Chronological pain after each reported day. */
  pain: { date: string; level: number }[];
  /** Chronological status of each reported day. */
  statuses: ExerciseReportLike["status"][];
  latestPain: number | null;
  maxPain: number | null;
  /** Mean of the last three reports minus mean of the first three (≥ 4 reports). */
  painTrend: number | null;
  topReason: ReasonCode | null;
  lastReportDate: string | null;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function summarizeItem(
  itemId: string,
  scheduled: string[],
  reports: ExerciseReportLike[]
): AdherenceSummary {
  const mine = currentReports(reports).filter(
    (report) => report.prescriptionItemId === itemId
  );
  const pain = mine.map((report) => ({ date: report.localDate, level: report.painLevel }));
  const levels = pain.map((entry) => entry.level);
  const reasons = new Map<ReasonCode, number>();
  for (const report of mine) {
    if (report.status === "complete") continue;
    const code = isReasonCode(report.nonCompletionReason) ? report.nonCompletionReason : null;
    if (code) reasons.set(code, (reasons.get(code) ?? 0) + 1);
  }
  const topReason =
    [...reasons.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    itemId,
    scheduledDays: scheduled.length,
    reportedDays: mine.length,
    completeDays: mine.filter((report) => report.status === "complete").length,
    partialDays: mine.filter((report) => report.status === "partial").length,
    notDoneDays: mine.filter((report) => report.status === "not_done").length,
    pain,
    statuses: mine.map((report) => report.status),
    latestPain: levels.length ? levels[levels.length - 1] : null,
    maxPain: levels.length ? Math.max(...levels) : null,
    painTrend:
      levels.length >= 4
        ? Math.round((mean(levels.slice(-3)) - mean(levels.slice(0, 3))) * 10) / 10
        : null,
    topReason,
    lastReportDate: mine.length ? mine[mine.length - 1].localDate : null,
  };
}

/* ── Rule-based suggestion ──────────────────────────────────────── */

export type SuggestionKind =
  | "review"
  | "regress"
  | "reteach"
  | "simplify"
  | "progress"
  | "hold"
  | "insufficient";

/** Why the rule fired, rendered by the UI in the clinician's language. */
export type SuggestionReason =
  | "highPain"
  | "suspended"
  | "fewReports"
  | "painRising"
  | "painHigh"
  | "lowCompletionPain"
  | "lowCompletionUnclear"
  | "lowCompletionTime"
  | "lowCompletion"
  | "consistentLowPain"
  | "stable";

export interface Suggestion {
  kind: SuggestionKind;
  reason: SuggestionReason;
}

export const MIN_REPORTS = 3;

export function suggestProgression(
  summary: AdherenceSummary,
  programSuspended: boolean
): Suggestion {
  if (programSuspended) return { kind: "review", reason: "suspended" };
  if ((summary.maxPain ?? 0) >= 7) return { kind: "review", reason: "highPain" };
  if (summary.reportedDays < MIN_REPORTS) return { kind: "insufficient", reason: "fewReports" };

  const recent = summary.pain.slice(-3).map((entry) => entry.level);
  if ((summary.painTrend ?? 0) >= 2) return { kind: "regress", reason: "painRising" };
  if (recent.length === 3 && mean(recent) >= 5) return { kind: "regress", reason: "painHigh" };

  const completion = summary.completeDays / summary.reportedDays;
  if (completion < 0.5) {
    if (summary.topReason === "pain") return { kind: "regress", reason: "lowCompletionPain" };
    if (summary.topReason === "unclear") return { kind: "reteach", reason: "lowCompletionUnclear" };
    if (summary.topReason === "no_time" || summary.topReason === "forgot") {
      return { kind: "simplify", reason: "lowCompletionTime" };
    }
    return { kind: "hold", reason: "lowCompletion" };
  }

  // Progress only on a sustained, settled response: the last three reports
  // complete, current pain low and not rising (24-hour response rule).
  const lastThree = summary.statuses.slice(-3);
  if (
    summary.reportedDays >= 4 &&
    lastThree.length === 3 &&
    lastThree.every((status) => status === "complete") &&
    (summary.latestPain ?? 10) <= 3 &&
    (summary.painTrend ?? 0) <= 0
  ) {
    return { kind: "progress", reason: "consistentLowPain" };
  }
  return { kind: "hold", reason: "stable" };
}
