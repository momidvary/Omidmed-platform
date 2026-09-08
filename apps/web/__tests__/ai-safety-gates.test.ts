import { describe, expect, it } from "vitest";
import { buildEducation, buildTreatmentPlan } from "@/lib/ai/engine";
import type { PatientCase, TreatmentPlanInput } from "@/lib/types";

const clearedPlanInput: TreatmentPlanInput = {
  region: "knee",
  stage: "subacute",
  painSeverity: 4,
  irritability: "moderate",
  mainImpairment: "Quadriceps weakness",
  patientGoal: "Walk independently",
  safetyConfirmed: true,
};

const baseCase: PatientCase = {
  id: "case-test",
  createdAt: "2026-08-11T09:00:00.000Z",
  name: "Test Patient",
  age: 40,
  gender: "female",
  mainComplaint: "Knee pain",
  painLocation: "Right knee",
  painIntensity: 4,
  duration: "Two weeks",
  mechanism: "Gradual onset",
  aggravating: "Stairs",
  easing: "Rest",
  medicalHistory: "",
  surgicalHistory: "",
  imaging: "",
  medications: "",
  functionalLimitations: "Stairs",
  patientGoal: "Walk comfortably",
  region: "knee",
};

describe("buildTreatmentPlan safety gates", () => {
  it("throws when clinical safety clearance has not been confirmed", () => {
    expect(() =>
      buildTreatmentPlan({ ...clearedPlanInput, safetyConfirmed: false })
    ).toThrow(/completed clinical safety screen is required/i);
  });

  it("throws for post-operative planning without a confirmed protocol", () => {
    expect(() =>
      buildTreatmentPlan({ ...clearedPlanInput, stage: "post-op" })
    ).toThrow(/surgical protocol.*must be confirmed/i);

    expect(() =>
      buildTreatmentPlan({
        ...clearedPlanInput,
        stage: "post-op",
        postOpDetails: {
          procedure: "Total knee arthroplasty",
          surgeryDate: "2026-07-20",
          precautions: "Follow surgeon restrictions",
          weightBearingStatus: "Weight-bearing as tolerated",
          protocolConfirmed: false,
        },
      })
    ).toThrow(/surgical protocol.*must be confirmed/i);
  });

  it("allows post-operative planning after safety and protocol confirmation", () => {
    const plan = buildTreatmentPlan({
      ...clearedPlanInput,
      stage: "post-op",
      postOpDetails: {
        procedure: "Total knee arthroplasty",
        surgeryDate: "2026-07-20",
        precautions: "Follow surgeon restrictions",
        weightBearingStatus: "Weight-bearing as tolerated",
        protocolConfirmed: true,
      },
    });

    expect(plan.strengthening.join(" ")).toContain("Total knee arthroplasty");
  });
});

describe("buildEducation safety gate", () => {
  it.each([
    ["no screen", undefined],
    [
      "an incomplete screen",
      { disposition: "not-screened" as const, screenedAt: null, selectedFlagIds: [] },
    ],
    [
      "an urgent screen",
      {
        disposition: "urgent" as const,
        screenedAt: "2026-08-11T09:00:00.000Z",
        selectedFlagIds: ["rf_fever"],
      },
    ],
  ])("throws with %s", (_label, safetyScreen) => {
    expect(() => buildEducation({ ...baseCase, safetyScreen })).toThrow(
      /cannot be generated until.*safety screen.*clear/i
    );
  });

  it("generates education only after a completed clear screen", () => {
    const handout = buildEducation({
      ...baseCase,
      safetyScreen: {
        disposition: "clear",
        screenedAt: "2026-08-11T09:00:00.000Z",
        selectedFlagIds: [],
      },
    });

    expect(handout.problem).toContain("Right knee");
    expect(handout.contact.length).toBeGreaterThan(0);
  });
});
