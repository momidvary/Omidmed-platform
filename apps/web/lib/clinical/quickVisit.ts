import type { ClinicalFindings } from "@/lib/clinical/reasoning/findings";
import {
  getRegionKnowledge,
  type ExamTest,
  type IntakeQuestion,
} from "@/lib/clinical/reasoning/knowledge";
import { rankHypotheses, type RankedHypothesis, type ReasoningResult } from "@/lib/clinical/reasoning/rank";
import { riskFactors, warningSigns } from "@/lib/data/redFlags";
import type { BodyRegionId, RedFlagItem } from "@/lib/types";

/*
 * Quick visit: the same knowledge base and ranking as the full case
 * analysis, asked one item at a time. Each next question or test is the one
 * that best separates the hypotheses still in play; questions that bear on a
 * hypothesis needing medical review are always asked. Nothing here decides:
 * the result is a provisional hypothesis the clinician confirms.
 */

/* ── Safety screen ────────────────────────────────────────────────── */

/**
 * Warning signs that only apply to some regions. Every other warning sign is
 * shown for every region, and an unknown region shows them all. The
 * clinician can always open the full list.
 */
const WARNING_REGIONS: Record<string, BodyRegionId[]> = {
  rf_cancer_spinal: ["low-back", "neck", "hip"],
  rf_ce_saddle: ["low-back", "hip"],
  rf_ce_bladder: ["low-back", "hip"],
  rf_ce_sexual: ["low-back", "hip"],
  rf_neuro_bilateral: ["low-back", "neck", "shoulder", "hip"],
  rf_umn: ["neck", "shoulder"],
  rf_cad: ["neck", "shoulder"],
  rf_gca: ["neck", "shoulder"],
  rf_aaa: ["low-back", "hip"],
  rf_dvt_calf: ["knee", "ankle-foot", "hip"],
};

const KNOWN_REGIONS: BodyRegionId[] = ["neck", "shoulder", "low-back", "hip", "knee", "ankle-foot"];

export function quickSafetyItems(region: BodyRegionId | null | undefined): {
  warnings: RedFlagItem[];
  risks: RedFlagItem[];
  /** Warning signs left out as not relevant to this region. */
  hidden: number;
} {
  const known = region && KNOWN_REGIONS.includes(region);
  const warnings = warningSigns.filter(
    (flag) => !known || !WARNING_REGIONS[flag.id] || WARNING_REGIONS[flag.id].includes(region!)
  );
  return { warnings, risks: riskFactors, hidden: warningSigns.length - warnings.length };
}

/* ── Adaptive questions and tests ─────────────────────────────────── */

/** Hypotheses within this many points of the leader are still in play. */
const IN_PLAY_MARGIN = 4;
/** At least this many history answers before stopping on a clear lead. */
const MIN_QUESTIONS = 4;
/** A lead this large over the runner-up counts as clear. */
const CLEAR_LEAD = 3;
export const MAX_TESTS = 3;

function answered(findings: ClinicalFindings, id: string): boolean {
  const answer = findings.intake.answers[id];
  return answer === "yes" || answer === "no";
}

/**
 * How much a question can move each hypothesis: score if "yes" minus score
 * if "no". Questions that move hypotheses in play by different amounts
 * separate them; questions on a medical-review hypothesis count double.
 */
function questionValues(
  region: BodyRegionId,
  findings: ClinicalFindings,
  age: number | null,
  skipped: ReadonlySet<string>,
  thorough: boolean
): { question: IntakeQuestion; value: number; serious: boolean }[] {
  const knowledge = getRegionKnowledge(region);
  const result = rankHypotheses(region, findings, age);
  if (!knowledge || !result) return [];
  const top = result.hypotheses[0]?.score ?? 0;
  // "More questions" weighs every hypothesis, not only those still in play.
  const inPlayIds = new Set(
    (thorough
      ? result.hypotheses
      : result.hypotheses.filter((h) => h.score >= top - IN_PLAY_MARGIN).slice(0, 4)
    ).map((h) => h.id)
  );
  const inPlay = knowledge.hypotheses.filter((rule) => inPlayIds.has(rule.id));
  const serious = knowledge.hypotheses.filter((rule) => rule.requiresMedicalReview);

  return knowledge.questions
    .filter((question) => !answered(findings, question.id) && !skipped.has(question.id))
    .map((question) => {
      const delta = (rule: (typeof knowledge.hypotheses)[number]) =>
        rule.features
          .filter((feature) => feature.question === question.id)
          .reduce((sum, feature) => sum + (feature.when === "yes" ? feature.weight : -feature.weight), 0);
      const deltas = inPlay.map(delta);
      let value = 0;
      for (let i = 0; i < deltas.length; i += 1) {
        for (let j = i + 1; j < deltas.length; j += 1) value += Math.abs(deltas[i] - deltas[j]);
      }
      const seriousValue = serious.reduce((sum, rule) => sum + Math.abs(delta(rule)), 0);
      return { question, value: value + 2 * seriousValue, serious: seriousValue > 0 };
    });
}

function lead(result: ReasoningResult): number {
  const [first, second] = result.hypotheses;
  if (!first) return 0;
  return second ? first.score - second.score : first.score;
}

/**
 * The next history question to ask, or null when more would not help.
 * `thorough` (the clinician asked for more) skips the early stop.
 */
export function nextQuestion(
  region: BodyRegionId,
  findings: ClinicalFindings,
  age: number | null,
  skipped: ReadonlySet<string> = new Set(),
  thorough = false
): IntakeQuestion | null {
  const candidates = questionValues(region, findings, age, skipped, thorough);
  const result = rankHypotheses(region, findings, age);
  if (!result) return null;
  const seriousPending = candidates.some((candidate) => candidate.serious);
  if (
    !thorough &&
    result.answeredQuestions >= MIN_QUESTIONS &&
    lead(result) >= CLEAR_LEAD &&
    !seriousPending
  ) {
    return null;
  }
  const best = candidates
    .filter((candidate) => candidate.value > 0)
    .sort((a, b) => b.value - a.value)[0];
  return best?.question ?? null;
}

/** The next examination test to record, or null when enough are recorded. */
export function nextTest(
  region: BodyRegionId,
  findings: ClinicalFindings,
  age: number | null,
  skipped: ReadonlySet<string> = new Set(),
  thorough = false
): ExamTest | null {
  const result = rankHypotheses(region, findings, age);
  if (!result) return null;
  const recorded = Object.keys(findings.exam.tests).length;
  if (!thorough && recorded >= MAX_TESTS) return null;
  if (!thorough && recorded >= 2 && lead(result) >= CLEAR_LEAD) return null;
  return result.nextTests.find((candidate) => !skipped.has(candidate.test.id))?.test ?? null;
}

/* ── Result ───────────────────────────────────────────────────────── */

export type Certainty = "strong" | "moderate" | "low";

export interface QuickResult {
  /** Serious hypotheses with support: refer before treating. */
  medicalReview: RankedHypothesis[];
  leading: RankedHypothesis | null;
  /** Shown beside the leader when the two are close. */
  runnerUp: RankedHypothesis | null;
  certainty: Certainty;
}

export function quickResult(result: ReasoningResult | null): QuickResult {
  if (!result) return { medicalReview: [], leading: null, runnerUp: null, certainty: "low" };
  const [leading = null, second = null] = result.hypotheses;
  const margin = lead(result);
  const certainty: Certainty =
    result.limitedData || !leading || leading.score < 2
      ? "low"
      : leading.level === "stronger" && margin >= CLEAR_LEAD
        ? "strong"
        : margin >= 2
          ? "moderate"
          : "low";
  return {
    medicalReview: result.medicalReview,
    leading,
    runnerUp: second && margin < 2 && second.level !== "against" ? second : null,
    certainty,
  };
}

/** Symptom duration chosen in the quick visit → planner stage. */
export type Duration = "under6w" | "6to12w" | "over12w";

export function stageForDuration(duration: Duration): "acute" | "subacute" | "chronic" {
  return duration === "under6w" ? "acute" : duration === "6to12w" ? "subacute" : "chronic";
}

/** Irritability suggested from current pain, editable by the clinician. */
export function irritabilityForPain(pain: number): "low" | "moderate" | "high" {
  return pain >= 7 ? "high" : pain >= 4 ? "moderate" : "low";
}
