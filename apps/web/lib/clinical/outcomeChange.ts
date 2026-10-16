/*
 * Whether a change in an outcome score is larger than the commonly cited
 * minimal clinically important difference (MCID). Thresholds are population
 * averages: a change below one is not proof of no benefit, and a change above
 * one is not proof that the treatment caused it.
 */

export interface Mcid {
  /** Points on the instrument's own scale. */
  points: number;
  source: string;
}

/** Keyed by the instrument_key in outcome_measure_catalog_versions. */
export const MCID: Record<string, Mcid> = {
  nrs_pain: { points: 2, source: "Farrar et al., Pain 2001; Childs et al., Spine 2005" },
  lefs: { points: 9, source: "Binkley et al., Phys Ther 1999" },
  odi: { points: 10, source: "Ostelo et al., Spine 2008" },
  ndi: { points: 7.5, source: "Young et al., Spine J 2009 (0–50 scale)" },
  quickdash: { points: 8, source: "Mintken et al., J Shoulder Elbow Surg 2009" },
  psfs: { points: 2, source: "Stratford et al., Physiother Can 1995; Abbott & Schmitt, JOSPT 2014" },
};

export interface OutcomeChange {
  /** Last minus first, on the instrument's scale. */
  delta: number;
  /** 1 better, -1 worse, 0 unchanged. */
  direction: 1 | -1 | 0;
  /** null when no MCID is recorded for this instrument. */
  meaningful: boolean | null;
  mcid: Mcid | null;
}

export function assessOutcomeChange(
  instrumentKey: string,
  first: number,
  last: number,
  scoreDirection: "higher-better" | "higher-worse"
): OutcomeChange {
  const delta = last - first;
  const direction: OutcomeChange["direction"] =
    delta === 0 ? 0 : (delta > 0) === (scoreDirection === "higher-better") ? 1 : -1;
  const mcid = MCID[instrumentKey] ?? null;
  return {
    delta,
    direction,
    meaningful: mcid ? Math.abs(delta) >= mcid.points : null,
    mcid,
  };
}
