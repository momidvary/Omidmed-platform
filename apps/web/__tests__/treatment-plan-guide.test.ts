import { describe, expect, it } from "vitest";
import { buildTreatmentPlan } from "@/lib/ai/engine";
import { buildTreatmentPlanFa } from "@/lib/ai/treatmentPlanFa";
import { protocolById } from "@/lib/clinical/protocols";
import { TreatmentPlanSchema } from "@/lib/clinical/treatmentPlanSchema";
import type { TreatmentPlanInput } from "@/lib/types";

const input = (region: TreatmentPlanInput["region"]): TreatmentPlanInput => ({
  region,
  stage: "subacute",
  painSeverity: 4,
  irritability: "moderate",
  mainImpairment: "",
  patientGoal: "",
  safetyConfirmed: true,
});

describe("region-aware plan template", () => {
  it("does not prescribe balance or perturbation work for the neck or shoulder", () => {
    for (const region of ["neck", "shoulder"] as const) {
      const plan = buildTreatmentPlan(input(region));
      expect(plan.balance).toEqual([]);
      expect(JSON.stringify(plan)).not.toMatch(/perturbation/i);
      expect(buildTreatmentPlanFa(input(region)).balance).toEqual([]);
    }
    expect(buildTreatmentPlan(input("knee")).balance.length).toBeGreaterThan(0);
  });

  it("adds the chosen protocol phase and stays within the stored plan schema", () => {
    const protocol = protocolById("pfp")!;
    const phase = protocol.phases[0];
    for (const build of [buildTreatmentPlan, buildTreatmentPlanFa]) {
      const plan = build(input("knee"), { protocol, phase });
      const text = JSON.stringify(plan);
      expect(text).toContain(build === buildTreatmentPlan ? phase.goals[0].en : phase.goals[0].fa);
      expect(TreatmentPlanSchema.safeParse(plan).success).toBe(true);
    }
  });

  it("still refuses to build without safety clearance", () => {
    const protocol = protocolById("pfp")!;
    expect(() =>
      buildTreatmentPlan({ ...input("knee"), safetyConfirmed: false }, { protocol, phase: protocol.phases[0] })
    ).toThrow();
  });
});
