import type { BodyRegionId } from "@/lib/types";
import {
  ClinicalFindingsSchema,
  normalizeFindings,
} from "@/lib/clinical/reasoning/findings";
import { getRegionKnowledge } from "@/lib/clinical/reasoning/knowledge";
import { rankHypotheses } from "@/lib/clinical/reasoning/rank";
import type { StructuredFindingsContext } from "@/lib/ai/clinicalDraftSchema";

/**
 * Turn the latest saved findings row into the bounded, labelled context the
 * audited AI draft receives: English knowledge-base labels (no ids to guess),
 * clinician notes (redacted later with the rest of the payload) and the
 * transparent rule-based ranking for the model to critique.
 *
 * Returns null when nothing usable was recorded for the case's current
 * region, so the model is never told about findings that do not exist.
 */
export function buildStructuredFindingsContext(
  row: { region: unknown; knowledge_version: unknown; findings: unknown } | null,
  caseRegion: BodyRegionId | null,
  age: number | null
): StructuredFindingsContext | null {
  if (!row || !caseRegion || row.region !== caseRegion) return null;
  const knowledge = getRegionKnowledge(caseRegion);
  const parsed = ClinicalFindingsSchema.safeParse(row.findings);
  if (!knowledge || !parsed.success) return null;

  const findings = normalizeFindings(parsed.data, caseRegion);
  const history = knowledge.questions.flatMap((question) => {
    const answer = findings.intake.answers[question.id];
    return answer === "yes" || answer === "no"
      ? [{ item: question.en, answer }]
      : [];
  });
  const examTests = knowledge.tests.flatMap((test) => {
    const result = findings.exam.tests[test.id];
    if (!result) return [];
    const accuracy = test.accuracy
      ? [
          `Target: ${test.accuracy.target}`,
          test.accuracy.sensitivity !== undefined
            ? `sensitivity ${test.accuracy.sensitivity}`
            : null,
          test.accuracy.specificity !== undefined
            ? `specificity ${test.accuracy.specificity}`
            : null,
          test.accuracy.note ?? null,
          `source: ${test.accuracy.source}`,
        ]
          .filter(Boolean)
          .join("; ")
      : null;
    return [{ test: test.en, result, accuracy }];
  });
  const examNotes = Object.entries(findings.exam.notes).flatMap(([field, note]) =>
    note ? [{ field, note }] : []
  );

  if (
    history.length === 0 &&
    examTests.length === 0 &&
    examNotes.length === 0 &&
    findings.intake.irritability === null
  ) {
    return null;
  }

  const ranking = rankHypotheses(caseRegion, findings, age);
  return {
    knowledgeVersion: String(row.knowledge_version).slice(0, 40),
    region: caseRegion,
    irritability: findings.intake.irritability,
    history,
    examTests,
    examNotes,
    ruleBasedRanking: (ranking?.hypotheses ?? []).map((hypothesis) => ({
      hypothesis: hypothesis.label.en,
      relativeSupport: hypothesis.score,
      requiresMedicalReview: hypothesis.requiresMedicalReview,
      reasons: [...hypothesis.supporting, ...hypothesis.against].map(
        (reason) =>
          `${reason.weight > 0 ? "+" : ""}${reason.weight} ${reason.label.en} (${reason.detail.en})`
      ),
    })),
    suggestedNextTests: (ranking?.nextTests ?? []).map(({ test }) => test.en),
  };
}
