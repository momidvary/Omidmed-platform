import type { BodyRegionId } from "@/lib/types";
import type { ClinicalFindings } from "@/lib/clinical/reasoning/findings";
import {
  KNOWLEDGE_VERSION,
  getRegionKnowledge,
  type ExamTest,
  type HypothesisRule,
  type LocalizedText,
} from "@/lib/clinical/reasoning/knowledge";

/*
 * Transparent hypothesis ranking from recorded findings.
 *
 * Score = base rate + Σ feature weights + Σ test weights + age weights.
 * Every contribution is returned as a reason so the clinician can see
 * exactly why a hypothesis moved. The score is relative support from the
 * recorded findings only — not a probability and not a diagnosis.
 */

export type SupportLevel = "stronger" | "some" | "weak" | "against";

export interface ReasonItem {
  kind: "base" | "history" | "test" | "age";
  label: LocalizedText;
  detail: LocalizedText;
  weight: number;
}

export interface RankedHypothesis {
  id: string;
  label: LocalizedText;
  score: number;
  level: SupportLevel;
  requiresMedicalReview: boolean;
  supporting: ReasonItem[];
  against: ReasonItem[];
}

export interface SuggestedTest {
  test: ExamTest;
  informs: LocalizedText[];
}

export interface ReasoningResult {
  region: BodyRegionId;
  knowledgeVersion: string;
  answeredQuestions: number;
  totalQuestions: number;
  recordedTests: number;
  totalTests: number;
  /** Too little was recorded for the ranking to mean much. */
  limitedData: boolean;
  hypotheses: RankedHypothesis[];
  /** Serious hypotheses with support → medical review before treatment. */
  medicalReview: RankedHypothesis[];
  nextTests: SuggestedTest[];
}

const ANSWER_TEXT: Record<"yes" | "no", LocalizedText> = {
  yes: { en: "Yes", fa: "بله" },
  no: { en: "No", fa: "خیر" },
};

const RESULT_TEXT: Record<"positive" | "negative", LocalizedText> = {
  positive: { en: "Positive", fa: "مثبت" },
  negative: { en: "Negative", fa: "منفی" },
};

export function supportLevel(score: number): SupportLevel {
  if (score >= 4) return "stronger";
  if (score >= 2) return "some";
  if (score >= 0) return "weak";
  return "against";
}

function scoreHypothesis(
  rule: HypothesisRule,
  findings: ClinicalFindings,
  questionLabels: Map<string, LocalizedText>,
  testLabels: Map<string, LocalizedText>,
  age: number | null
): RankedHypothesis {
  const reasons: ReasonItem[] = [];

  if (rule.prior) {
    reasons.push({
      kind: "base",
      label:
        rule.prior > 0
          ? { en: "Common presentation for this region", fa: "تظاهر شایع در این ناحیه" }
          : { en: "Less common presentation", fa: "تظاهر کمتر شایع" },
      detail: { en: "Base rate", fa: "شیوع پایه" },
      weight: rule.prior,
    });
  }

  for (const feature of rule.features) {
    const answer = findings.intake.answers[feature.question];
    if (answer !== feature.when) continue;
    const label = questionLabels.get(feature.question);
    if (!label) continue;
    reasons.push({
      kind: "history",
      label,
      detail: ANSWER_TEXT[feature.when],
      weight: feature.weight,
    });
  }

  for (const link of rule.tests) {
    const result = findings.exam.tests[link.test];
    if (result !== "positive" && result !== "negative") continue;
    const weight = result === "positive" ? link.positive : link.negative;
    const label = testLabels.get(link.test);
    if (!weight || !label) continue;
    reasons.push({ kind: "test", label, detail: RESULT_TEXT[result], weight });
  }

  if (age !== null) {
    for (const band of rule.age ?? []) {
      const matches =
        (band.atLeast === undefined || age >= band.atLeast) &&
        (band.below === undefined || age < band.below);
      if (!matches) continue;
      const range =
        band.atLeast !== undefined ? `≥ ${band.atLeast}` : `< ${band.below}`;
      reasons.push({
        kind: "age",
        label: { en: `Age ${age}`, fa: `سن ${age}` },
        detail: { en: range, fa: range },
        weight: band.weight,
      });
    }
  }

  const score = reasons.reduce((sum, reason) => sum + reason.weight, 0);
  return {
    id: rule.id,
    label: rule.label,
    score,
    level: supportLevel(score),
    requiresMedicalReview: rule.requiresMedicalReview === true,
    supporting: reasons.filter((reason) => reason.weight > 0),
    against: reasons.filter((reason) => reason.weight < 0),
  };
}

export function rankHypotheses(
  region: BodyRegionId | null | undefined,
  findings: ClinicalFindings,
  age: number | null
): ReasoningResult | null {
  const knowledge = getRegionKnowledge(region);
  if (!knowledge || !region) return null;

  const questionLabels = new Map(
    knowledge.questions.map((q) => [q.id, { en: q.en, fa: q.fa }])
  );
  const testLabels = new Map(
    knowledge.tests.map((t) => [t.id, { en: t.en, fa: t.fa }])
  );

  const hypotheses = knowledge.hypotheses
    .map((rule) =>
      scoreHypothesis(rule, findings, questionLabels, testLabels, age)
    )
    .sort((a, b) => b.score - a.score || a.label.en.localeCompare(b.label.en));

  const answeredQuestions = knowledge.questions.filter((q) => {
    const answer = findings.intake.answers[q.id];
    return answer === "yes" || answer === "no";
  }).length;
  const recordedTests = knowledge.tests.filter(
    (t) => findings.exam.tests[t.id] !== undefined
  ).length;

  // Tests not yet recorded, ranked by how strongly they bear on the
  // currently leading hypotheses (and any serious hypothesis with support).
  const focus = [
    ...hypotheses.slice(0, 3),
    ...hypotheses.filter(
      (h, index) => index >= 3 && h.requiresMedicalReview && h.score >= 1
    ),
  ];
  const rules = new Map(knowledge.hypotheses.map((rule) => [rule.id, rule]));
  const nextTests = knowledge.tests
    .filter((test) => findings.exam.tests[test.id] === undefined)
    .map((test) => {
      let value = 0;
      const informs: LocalizedText[] = [];
      for (const hypothesis of focus) {
        const link = rules
          .get(hypothesis.id)
          ?.tests.find((candidate) => candidate.test === test.id);
        if (!link) continue;
        value += Math.abs(link.positive) + Math.abs(link.negative);
        informs.push(hypothesis.label);
      }
      return { test, informs, value };
    })
    .filter((candidate) => candidate.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 4)
    .map(({ test, informs }) => ({ test, informs }));

  return {
    region,
    knowledgeVersion: KNOWLEDGE_VERSION,
    answeredQuestions,
    totalQuestions: knowledge.questions.length,
    recordedTests,
    totalTests: knowledge.tests.length,
    limitedData: answeredQuestions + recordedTests < 3,
    hypotheses,
    medicalReview: hypotheses.filter(
      (h) => h.requiresMedicalReview && h.score >= 2
    ),
    nextTests,
  };
}
