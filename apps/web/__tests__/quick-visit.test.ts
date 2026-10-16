import { describe, expect, it } from "vitest";
import {
  MAX_TESTS,
  nextQuestion,
  nextTest,
  quickResult,
  quickSafetyItems,
} from "@/lib/clinical/quickVisit";
import { emptyFindings, type ClinicalFindings } from "@/lib/clinical/reasoning/findings";
import { getRegionKnowledge } from "@/lib/clinical/reasoning/knowledge";
import { rankHypotheses } from "@/lib/clinical/reasoning/rank";
import type { BodyRegionId } from "@/lib/types";

/** Ask questions and tests the way the quick visit does, answering from a fixed patient. */
function simulate(
  region: BodyRegionId,
  age: number,
  yes: string[],
  positive: string[] = []
): { findings: ClinicalFindings; asked: string[]; tested: string[] } {
  const findings = emptyFindings();
  const asked: string[] = [];
  for (let guard = 0; guard < 50; guard += 1) {
    const question = nextQuestion(region, findings, age);
    if (!question) break;
    asked.push(question.id);
    findings.intake.answers[question.id] = yes.includes(question.id) ? "yes" : "no";
  }
  const tested: string[] = [];
  for (let guard = 0; guard < 20; guard += 1) {
    const test = nextTest(region, findings, age);
    if (!test) break;
    tested.push(test.id);
    findings.exam.tests[test.id] = positive.includes(test.id) ? "positive" : "negative";
  }
  return { findings, asked, tested };
}

describe("quick visit safety items", () => {
  it("keeps region-relevant warning signs and every general one", () => {
    const knee = quickSafetyItems("knee").warnings.map((flag) => flag.id);
    expect(knee).toContain("rf_fever");
    expect(knee).toContain("rf_dvt_calf");
    expect(knee).not.toContain("rf_ce_saddle");
    const back = quickSafetyItems("low-back").warnings.map((flag) => flag.id);
    expect(back).toEqual(expect.arrayContaining(["rf_ce_saddle", "rf_ce_bladder", "rf_cancer_spinal", "rf_aaa"]));
    const neck = quickSafetyItems("neck").warnings.map((flag) => flag.id);
    expect(neck).toEqual(expect.arrayContaining(["rf_cad", "rf_umn", "rf_gca"]));
  });

  it("shows every warning sign when the region is unknown", () => {
    const all = quickSafetyItems(undefined);
    expect(all.hidden).toBe(0);
    expect(quickSafetyItems("post-op").hidden).toBe(0);
  });
});

describe("quick visit questions and tests", () => {
  it("reaches an ACL lead with fewer questions than the full list", () => {
    const { findings, asked, tested } = simulate(
      "knee",
      24,
      ["k_twisting", "k_pop_rapid_swelling", "k_giving_way"],
      ["k_lachman", "k_pivot_shift", "k_anterior_drawer"]
    );
    expect(asked.length).toBeLessThan(getRegionKnowledge("knee")!.questions.length);
    expect(asked.length).toBeGreaterThanOrEqual(4);
    expect(tested.length).toBeLessThanOrEqual(MAX_TESTS);
    expect(tested).toContain("k_lachman");
    const result = quickResult(rankHypotheses("knee", findings, 24));
    expect(result.leading?.id).toBe("k_acl");
    expect(result.certainty).toBe("strong");
  });

  it("finds patellofemoral pain in a young patient with stair pain", () => {
    const { findings } = simulate("knee", 22, ["k_squat_stairs", "k_gradual"], ["k_squat_pain"]);
    expect(quickResult(rankHypotheses("knee", findings, 22)).leading?.id).toBe("k_pfp");
  });

  it("always asks the questions that bear on a medical-review hypothesis", () => {
    const { asked } = simulate("low-back", 30, ["lb_mechanical"]);
    const knowledge = getRegionKnowledge("low-back")!;
    const serious = knowledge.hypotheses.filter((rule) => rule.requiresMedicalReview);
    const seriousQuestions = new Set(serious.flatMap((rule) => rule.features.map((feature) => feature.question)));
    for (const id of seriousQuestions) expect(asked, id).toContain(id);
  });

  it("flags medical review when serious findings are present", () => {
    const { findings } = simulate("low-back", 30, ["lb_inflammatory_onset", "lb_morning_stiffness_long", "lb_night_second_half"]);
    const result = quickResult(rankHypotheses("low-back", findings, 30));
    expect(result.medicalReview.map((h) => h.id)).toContain("lb_axspa");
  });

  it("skips a question the clinician passes over", () => {
    const first = nextQuestion("knee", emptyFindings(), 30)!;
    const second = nextQuestion("knee", emptyFindings(), 30, new Set([first.id]));
    expect(second?.id).not.toBe(first.id);
  });

  it("reports low certainty with little information", () => {
    expect(quickResult(rankHypotheses("knee", emptyFindings(), 30)).certainty).toBe("low");
  });
});

describe("quick visit: more questions", () => {
  it("keeps asking past the early stop when the clinician asks for more", () => {
    const findings = emptyFindings();
    for (let guard = 0; guard < 50; guard += 1) {
      const question = nextQuestion("knee", findings, 24);
      if (!question) break;
      findings.intake.answers[question.id] = ["k_twisting", "k_pop_rapid_swelling", "k_giving_way"].includes(question.id) ? "yes" : "no";
    }
    expect(nextQuestion("knee", findings, 24)).toBeNull();
    expect(nextQuestion("knee", findings, 24, new Set(), true)).not.toBeNull();
  });
});
