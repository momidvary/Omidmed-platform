import { describe, expect, it } from "vitest";
import { exercises, exerciseGoals } from "@/lib/data/exercises";
import { exerciseGoalFa, exerciseLibraryFa, localizeExercise } from "@/lib/data/exerciseLibraryFa";
import { exerciseFa } from "@/lib/data/exerciseFa";
import { buildTreatmentPlan, buildEducation } from "@/lib/ai/engine";
import { buildTreatmentPlanFa } from "@/lib/ai/treatmentPlanFa";
import { buildEducationFa } from "@/lib/ai/educationFa";
import { buildChatReplyFa, suggestedPromptsFa } from "@/lib/ai/chatFa";
import type { PatientCase, TreatmentPlanInput } from "@/lib/types";

const persian = /[؀-ۿ]/;

describe("Persian exercise library", () => {
  it("covers every exercise and goal without widening the prescribable set", () => {
    for (const exercise of exercises) {
      const fa = exerciseLibraryFa(exercise.id);
      expect(fa, exercise.id).toBeDefined();
      const local = localizeExercise(exercise, "fa");
      expect(local.id).toBe(exercise.id);
      expect(local.name).toMatch(persian);
      expect(local.setsReps).toMatch(persian);
      expect(local.howTo.length).toBeGreaterThan(0);
      expect(localizeExercise(exercise, "en")).toBe(exercise);
    }
    for (const goal of exerciseGoals) expect(exerciseGoalFa[goal]).toMatch(persian);
    // Patient-facing content (and so the prescription allow-list) is unchanged.
    expect(Object.keys(exerciseFa)).toHaveLength(8);
  });
});

describe("Persian deterministic templates keep the English safety gates", () => {
  const planInput: TreatmentPlanInput = {
    region: "knee",
    stage: "chronic",
    painSeverity: 4,
    irritability: "moderate",
    mainImpairment: "",
    patientGoal: "",
    safetyConfirmed: true,
  };

  it("treatment plan", () => {
    expect(() => buildTreatmentPlanFa({ ...planInput, safetyConfirmed: false })).toThrow();
    expect(() =>
      buildTreatmentPlanFa({
        ...planInput,
        stage: "post-op",
        postOpDetails: {
          procedure: "TKA",
          surgeryDate: "2026-01-01",
          precautions: "",
          weightBearingStatus: "",
          protocolConfirmed: false,
        },
      })
    ).toThrow();
    const fa = buildTreatmentPlanFa(planInput);
    const en = buildTreatmentPlan(planInput);
    expect(Object.keys(fa).sort()).toEqual(Object.keys(en).sort());
    expect(fa.frequency).toMatch(persian);
  });

  it("patient handout", () => {
    const base: PatientCase = {
      id: "case-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      name: "Test",
      age: 40,
      gender: "female",
      mainComplaint: "Knee pain",
      painLocation: "",
      painIntensity: 4,
      duration: "",
      mechanism: "",
      aggravating: "",
      easing: "",
      medicalHistory: "",
      surgicalHistory: "",
      imaging: "",
      medications: "",
      functionalLimitations: "",
      patientGoal: "",
      region: "knee",
    };
    expect(() => buildEducationFa(base)).toThrow();
    const cleared: PatientCase = {
      ...base,
      safetyScreen: {
        screenedAt: "2026-01-01T00:00:00.000Z",
        selectedFlagIds: [],
        disposition: "clear",
      },
    };
    const fa = buildEducationFa(cleared);
    const en = buildEducation(cleared);
    expect(fa.contact).toHaveLength(en.contact.length);
    expect(fa.contact[1]).toMatch(/اورژانس/);
    expect(fa.problem).toMatch(persian);
  });

  it("template chat answers Persian questions in Persian", () => {
    for (const prompt of suggestedPromptsFa) {
      expect(buildChatReplyFa(prompt)).toMatch(persian);
    }
    expect(buildChatReplyFa("پرچم‌های قرمز کمردرد چیست؟")).toMatch(/ارجاع/);
  });
});
