import { describe, expect, it } from "vitest";
import { buildTreatmentPlan } from "@/lib/ai/engine";
import {
  normalizeTreatmentPlan,
  TreatmentPlanSchema,
} from "@/lib/clinical/treatmentPlanSchema";

const input = {
  region: "knee" as const,
  stage: "subacute" as const,
  painSeverity: 4,
  irritability: "moderate" as const,
  mainImpairment: "quadriceps weakness",
  patientGoal: "return to stairs",
  safetyConfirmed: true,
};

describe("treatment plan persistence schema", () => {
  it("accepts the bounded deterministic planner output", () => {
    expect(TreatmentPlanSchema.safeParse(buildTreatmentPlan(input)).success).toBe(
      true
    );
  });

  it("requires core exercise, education, home and progression sections", () => {
    const plan = buildTreatmentPlan(input);
    expect(
      TreatmentPlanSchema.safeParse({ ...plan, homeProgram: [] }).success
    ).toBe(false);
    expect(
      TreatmentPlanSchema.safeParse({ ...plan, progression: [] }).success
    ).toBe(false);
  });

  it("rejects unknown properties and oversized clinician items", () => {
    const plan = buildTreatmentPlan(input);
    expect(
      TreatmentPlanSchema.safeParse({ ...plan, hiddenInstruction: "publish" })
        .success
    ).toBe(false);
    expect(
      TreatmentPlanSchema.safeParse({
        ...plan,
        education: ["x".repeat(1_001)],
      }).success
    ).toBe(false);
  });

  it("normalizes clinician line editing before immutable storage", () => {
    const plan = buildTreatmentPlan(input);
    const normalized = normalizeTreatmentPlan({
      ...plan,
      education: ["  Explain pacing  ", "", "   "],
      frequency: "  Weekly review  ",
    });
    expect(normalized.education).toEqual(["Explain pacing"]);
    expect(normalized.frequency).toBe("Weekly review");
    expect(TreatmentPlanSchema.safeParse(normalized).success).toBe(true);
  });
});
