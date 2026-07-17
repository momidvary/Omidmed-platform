/*
 * Pure clinical calculations — session counting and progress math.
 * Kept free of I/O so they are unit-testable and shared by UI + tests.
 */

export interface SessionLike {
  status: string;
  session_number?: number | null;
}

export interface SessionCounts {
  planned: number | null;
  completed: number;
  /** null when no plan; never negative. */
  remaining: number | null;
  overPlan: number; // sessions beyond the plan (0 when within plan)
}

/** Only `completed` sessions count as delivered (spec 7.6 / 10.1). */
export function sessionCounts(
  sessions: SessionLike[],
  plannedCount: number | null | undefined
): SessionCounts {
  const completed = sessions.filter((s) => s.status === "completed").length;
  const planned = plannedCount && plannedCount > 0 ? plannedCount : null;
  if (planned === null) {
    return { planned: null, completed, remaining: null, overPlan: 0 };
  }
  return {
    planned,
    completed,
    remaining: Math.max(0, planned - completed),
    overPlan: Math.max(0, completed - planned),
  };
}

/** Next session number: max over non-cancelled sessions + 1 (stable
 *  against deletions — numbers are never reused). */
export function nextSessionNumber(sessions: SessionLike[]): number {
  const max = sessions
    .filter((s) => s.status !== "cancelled")
    .reduce((m, s) => Math.max(m, s.session_number ?? 0), 0);
  return max + 1;
}

/* ── Progress math ─────────────────────────────────────────────── */

export type MetricDirection =
  | "higher_is_better"
  | "lower_is_better"
  | "target_range"
  | "neutral"
  | "clinician_interpretation";

export interface MeasurementPoint {
  measuredAt: string; // ISO date
  numericValue: number | null;
  unit: string | null;
}

export interface MetricSummary {
  count: number;
  baseline: number | null;
  latest: number | null;
  absoluteChange: number | null;
  /** null when baseline is 0/missing or metric is non-numeric. */
  percentChange: number | null;
  /** true improvement respecting direction; null when not judgeable. */
  improved: boolean | null;
  /** false when points carry mixed units (never compare those). */
  comparable: boolean;
  /** enough points to draw a trend (≥ 2). */
  hasTrend: boolean;
}

export function summarizeMetric(
  points: MeasurementPoint[],
  direction: MetricDirection
): MetricSummary {
  const numeric = points
    .filter((p) => p.numericValue !== null && p.numericValue !== undefined)
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));

  const units = new Set(numeric.map((p) => p.unit ?? ""));
  const comparable = units.size <= 1;

  const empty: MetricSummary = {
    count: numeric.length,
    baseline: null,
    latest: null,
    absoluteChange: null,
    percentChange: null,
    improved: null,
    comparable,
    hasTrend: false,
  };
  if (numeric.length === 0 || !comparable) return empty;

  const baseline = numeric[0].numericValue as number;
  const latest = numeric[numeric.length - 1].numericValue as number;
  if (numeric.length === 1) {
    return { ...empty, baseline, latest, hasTrend: false };
  }

  const absoluteChange = latest - baseline;
  // No percentage when baseline is zero (division by zero is meaningless).
  const percentChange =
    baseline === 0 ? null : (absoluteChange / Math.abs(baseline)) * 100;

  let improved: boolean | null = null;
  if (direction === "higher_is_better") improved = absoluteChange > 0;
  else if (direction === "lower_is_better") improved = absoluteChange < 0;
  // target_range / neutral / clinician_interpretation: a raw numeric
  // change is NOT automatically an "improvement" — leave null.

  return {
    count: numeric.length,
    baseline,
    latest,
    absoluteChange,
    percentChange,
    improved,
    comparable,
    hasTrend: true,
  };
}

/** Categorical metrics never get percentage progress (spec 15.5). */
export function categoricalSummary(points: { measuredAt: string; value: string }[]) {
  const sorted = [...points].sort((a, b) =>
    a.measuredAt.localeCompare(b.measuredAt)
  );
  return {
    count: sorted.length,
    baseline: sorted[0]?.value ?? null,
    latest: sorted[sorted.length - 1]?.value ?? null,
    percentChange: null as null,
  };
}

/** Range warning for a proposed value against the metric definition. */
export function outOfRange(
  value: number,
  min: number | null | undefined,
  max: number | null | undefined
): boolean {
  if (min !== null && min !== undefined && value < min) return true;
  if (max !== null && max !== undefined && value > max) return true;
  return false;
}
