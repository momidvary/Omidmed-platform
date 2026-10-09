import { z } from "zod";
import type { BodyRegionId } from "@/lib/types";
import { getRegionKnowledge } from "@/lib/clinical/reasoning/knowledge";

/*
 * Structured history and examination findings recorded by the clinician.
 * The same bounds are enforced by private.is_valid_case_findings_payload
 * (migration 029); keep the two in step.
 */

export const FINDING_ID = /^[a-z][a-z0-9_]{0,63}$/;
export const MAX_FINDING_ENTRIES = 80;
export const MAX_NOTE_LENGTH = 2000;

export const EXAM_NOTE_KEYS = [
  "observation",
  "rom",
  "strength",
  "neuro",
  "palpation",
  "functional",
  "other",
] as const;
export type ExamNoteKey = (typeof EXAM_NOTE_KEYS)[number];

const boundedRecord = <T extends z.ZodTypeAny>(value: T) =>
  z
    .record(z.string().regex(FINDING_ID), value)
    .refine((record) => Object.keys(record).length <= MAX_FINDING_ENTRIES, {
      message: "Too many entries",
    });

export const ClinicalFindingsSchema = z
  .object({
    intake: z
      .object({
        answers: boundedRecord(z.enum(["yes", "no", "unknown"])),
        irritability: z.enum(["low", "moderate", "high"]).nullable(),
      })
      .strict(),
    exam: z
      .object({
        tests: boundedRecord(z.enum(["positive", "negative", "equivocal"])),
        notes: z
          .object(
            Object.fromEntries(
              EXAM_NOTE_KEYS.map((key) => [
                key,
                z.string().max(MAX_NOTE_LENGTH).optional(),
              ])
            ) as Record<ExamNoteKey, z.ZodOptional<z.ZodString>>
          )
          .strict(),
      })
      .strict(),
  })
  .strict();

export type ClinicalFindings = z.infer<typeof ClinicalFindingsSchema>;
export type Irritability = NonNullable<ClinicalFindings["intake"]["irritability"]>;

export function emptyFindings(): ClinicalFindings {
  return {
    intake: { answers: {}, irritability: null },
    exam: { tests: {}, notes: {} },
  };
}

/** A saved findings version for one case. */
export interface CaseFindingsVersion {
  id: string;
  caseId: string;
  version: number;
  region: BodyRegionId;
  knowledgeVersion: string;
  findings: ClinicalFindings;
  authoredBy: string | null;
  createdAt: string;
}

/**
 * Drop "unknown" answers, empty notes and ids that do not belong to the
 * region (e.g. after the case region was revised), so only meaningful,
 * region-valid findings are stored, ranked or sent to the AI draft.
 */
export function normalizeFindings(
  findings: ClinicalFindings,
  region: BodyRegionId | null | undefined
): ClinicalFindings {
  const knowledge = getRegionKnowledge(region);
  const questionIds = new Set(knowledge?.questions.map((q) => q.id) ?? []);
  const testIds = new Set(knowledge?.tests.map((t) => t.id) ?? []);
  const answers = Object.fromEntries(
    Object.entries(findings.intake.answers).filter(
      ([id, answer]) => questionIds.has(id) && answer !== "unknown"
    )
  );
  const tests = Object.fromEntries(
    Object.entries(findings.exam.tests).filter(([id]) => testIds.has(id))
  );
  const notes = Object.fromEntries(
    Object.entries(findings.exam.notes)
      .map(([key, value]) => [key, value?.trim() ?? ""] as const)
      .filter(([, value]) => value.length > 0)
  );
  return {
    intake: { answers, irritability: findings.intake.irritability },
    exam: { tests, notes },
  };
}

export function hasAnyFinding(findings: ClinicalFindings): boolean {
  return (
    Object.keys(findings.intake.answers).length > 0 ||
    findings.intake.irritability !== null ||
    Object.keys(findings.exam.tests).length > 0 ||
    Object.values(findings.exam.notes).some((note) => (note ?? "").trim())
  );
}
