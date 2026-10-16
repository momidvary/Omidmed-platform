import { describe, expect, it } from "vitest";
import { applyPlanGuide } from "@/lib/ai/planGuide";
import { buildTreatmentPlan } from "@/lib/ai/engine";
import { protocolById } from "@/lib/clinical/protocols";
import { detectProtocolPhase } from "@/lib/clinical/protocols/detect";

describe("current protocol phase", () => {
  const pfp = protocolById("pfp")!;

  it("reads the phase named in a protocol-guided plan, in either language", () => {
    for (const lang of ["fa", "en"] as const) {
      const base = buildTreatmentPlan({
        region: "knee", stage: "subacute", painSeverity: 4, irritability: "moderate",
        mainImpairment: "", patientGoal: "", safetyConfirmed: true,
      });
      const plan = applyPlanGuide(base, { protocol: pfp, phase: pfp.phases[1] }, lang);
      const found = detectProtocolPhase(plan.exerciseTherapy.join("\n"), []);
      expect(found?.protocol.id).toBe("pfp");
      expect(found?.index).toBe(1);
      expect(found?.next?.id).toBe(pfp.phases[2].id);
      expect(found?.basis).toBe("plan");
    }
  });

  it("falls back to a clear exercise match within the region", () => {
    const first = pfp.phases[0];
    const found = detectProtocolPhase("", first.exercises, "knee");
    expect(found?.protocol.id).toBe("pfp");
    expect(found?.phase.id).toBe(first.id);
    expect(found?.basis).toBe("exercises");
  });

  it("reports no next phase for the last phase", () => {
    const last = pfp.phases.at(-1)!;
    const found = detectProtocolPhase(`${pfp.title.fa} — ${last.name.fa}`, []);
    expect(found?.phase.id).toBe(last.id);
    expect(found?.next).toBeNull();
  });

  it("declines to guess when several protocols match equally", () => {
    // Late-stage knee phases share hop and single-leg work across protocols.
    expect(detectProtocolPhase("", ["ex_single_leg_squat", "ex_balance_reach", "ex_hop_progression"], "knee")).toBeNull();
  });

  it("does not guess from one shared exercise or an empty program", () => {
    expect(detectProtocolPhase("", ["ex_quad_sets"])).toBeNull();
    expect(detectProtocolPhase("free text plan", [])).toBeNull();
  });
});
