import { z } from "zod";

const requiredText = (maximum: number) =>
  z.string().trim().min(1).max(maximum);
const optionalCaseText = (maximum: number) => z.string().trim().max(maximum);
const textList = (maximumItems: number) =>
  z.array(requiredText(300)).max(maximumItems);

const ClinicalHypothesisSchema = z
  .object({
    label: requiredText(160),
    supportingContext: textList(5),
    conflictingOrMissingContext: textList(5),
  })
  .strict();

const ClinicalDraftBaseSchema = z
  .object({
    answer: requiredText(4_000),
    possibleHypotheses: z.array(ClinicalHypothesisSchema).max(5),
    assessmentPriorities: textList(8),
    treatmentConsiderations: textList(8),
    contraindicationsAndStopRules: textList(8),
    missingInformation: textList(10),
    verificationItems: textList(10),
    requiresMedicalReview: z.boolean(),
    abstained: z.boolean(),
    abstainReason: requiredText(600).nullable(),
  })
  .strict();

type ClinicalDraftShape = z.infer<typeof ClinicalDraftBaseSchema>;

const definitiveDiagnosisPatterns = [
  /\b(?:the\s+)?diagnosis\s+(?:is|:)\s*(?!not\b|uncertain\b|unknown\b)/i,
  /\b(?:patient|you)\s+(?:definitely|certainly)\s+(?:has|have)\b/i,
  /تشخیص\s+(?:قطعی|نهایی|مسلم)\s*[:：]/i,
  /التشخيص\s+(?:المؤكد|النهائي|القطعي)\s*[:：]/i,
];

const prescriptivePatterns = [
  /\b(?:prescribe|administer)\b.{0,60}\b(?:mg|mcg|micrograms?|milligrams?|tablets?|capsules?|ml)\b/i,
  /\b(?:take|start)\b.{0,60}\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|tablets?|capsules?)\b/i,
  /\b(?:perform|do|complete)\b.{0,50}\b\d+\s*(?:sets?|reps?|repetitions?|minutes?)\b/i,
  /\b\d+\s+sets?\s+(?:of\s+)?\d+\b/i,
  /(?:تجویز|مصرف).{0,50}(?:\d+|[۰-۹]+)\s*(?:میلی[\s-]?گرم|گرم|قرص|کپسول)/i,
  /(?:انجام\s+ده(?:د|ید)?|تمرین).{0,40}(?:\d+|[۰-۹]+)\s*(?:ست|تکرار|دقیقه)/i,
  /(?:وصف|تناول|إعطاء).{0,50}(?:\d+|[٠-٩]+)\s*(?:ملغ|مجم|غرام|قرص|كبسولة)/i,
  /(?:أد|نفذ).{0,40}(?:\d+|[٠-٩]+)\s*(?:مجموعات|تكرارات|دقائق)/i,
];

function clinicalDraftText(draft: ClinicalDraftShape): string {
  return [
    draft.answer,
    ...draft.possibleHypotheses.flatMap((hypothesis) => [
      hypothesis.label,
      ...hypothesis.supportingContext,
      ...hypothesis.conflictingOrMissingContext,
    ]),
    ...draft.assessmentPriorities,
    ...draft.treatmentConsiderations,
    ...draft.contraindicationsAndStopRules,
    ...draft.missingInformation,
    ...draft.verificationItems,
    draft.abstainReason ?? "",
  ].join("\n");
}

export function clinicalDraftSafetyViolation(
  draft: ClinicalDraftShape
): "definitive_diagnosis" | "prescriptive_instruction" | null {
  const text = clinicalDraftText(draft);
  if (definitiveDiagnosisPatterns.some((pattern) => pattern.test(text))) {
    return "definitive_diagnosis";
  }
  if (prescriptivePatterns.some((pattern) => pattern.test(text))) {
    return "prescriptive_instruction";
  }
  return null;
}

export const ClinicalDraftSchema = ClinicalDraftBaseSchema.superRefine(
  (draft, context) => {
    if (draft.abstained) {
      if (!draft.abstainReason) {
        context.addIssue({
          code: "custom",
          path: ["abstainReason"],
          message: "An abstained draft requires a reason",
        });
      }
      if (draft.possibleHypotheses.length > 0) {
        context.addIssue({
          code: "custom",
          path: ["possibleHypotheses"],
          message: "An abstained draft cannot offer hypotheses",
        });
      }
      if (draft.treatmentConsiderations.length > 0) {
        context.addIssue({
          code: "custom",
          path: ["treatmentConsiderations"],
          message: "An abstained draft cannot offer treatment considerations",
        });
      }
    } else if (draft.abstainReason !== null) {
      context.addIssue({
        code: "custom",
        path: ["abstainReason"],
        message: "A non-abstained draft must not include an abstain reason",
      });
    }

    if (draft.requiresMedicalReview) {
      if (draft.treatmentConsiderations.length > 0) {
        context.addIssue({
          code: "custom",
          path: ["treatmentConsiderations"],
          message: "A medical-review draft cannot suggest treatment progression",
        });
      }
      if (draft.contraindicationsAndStopRules.length === 0) {
        context.addIssue({
          code: "custom",
          path: ["contraindicationsAndStopRules"],
          message: "A medical-review draft requires at least one stop rule",
        });
      }
    }

    const safetyViolation = clinicalDraftSafetyViolation(draft);
    if (safetyViolation) {
      context.addIssue({
        code: "custom",
        path: ["answer"],
        message: `Clinical draft contains a prohibited ${safetyViolation}`,
      });
    }
  }
);

export type ClinicalDraft = z.infer<typeof ClinicalDraftSchema>;

export const ClinicalDraftCaseContextSchema = z
  .object({
    age: z.number().int().min(0).max(120).nullable(),
    gender: optionalCaseText(100).nullable(),
    region: optionalCaseText(100).nullable(),
    mainComplaint: requiredText(10_000),
    painLocation: optionalCaseText(2_000),
    painIntensity: z.number().int().min(0).max(10),
    duration: optionalCaseText(500),
    mechanism: optionalCaseText(5_000),
    aggravating: optionalCaseText(5_000),
    easing: optionalCaseText(5_000),
    medicalHistory: optionalCaseText(20_000),
    surgicalHistory: optionalCaseText(20_000),
    imaging: optionalCaseText(20_000),
    medications: optionalCaseText(10_000),
    functionalLimitations: optionalCaseText(10_000),
    patientGoal: optionalCaseText(5_000),
  })
  .strict()
  .superRefine((contextValue, context) => {
    const encodedSize = new TextEncoder().encode(JSON.stringify(contextValue)).byteLength;
    if (encodedSize > 48_000) {
      context.addIssue({
        code: "custom",
        message: "Case context exceeds the audited AI context limit",
      });
    }
  });

export type ClinicalDraftCaseContext = z.infer<
  typeof ClinicalDraftCaseContextSchema
>;
