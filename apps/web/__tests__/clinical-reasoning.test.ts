import { describe, expect, it } from "vitest";
import {
  ClinicalFindingsSchema,
  FINDING_ID,
  emptyFindings,
  hasAnyFinding,
  normalizeFindings,
  type ClinicalFindings,
} from "@/lib/clinical/reasoning/findings";
import { regionKnowledge } from "@/lib/clinical/reasoning/knowledge";
import { rankHypotheses, supportLevel } from "@/lib/clinical/reasoning/rank";

function findings(
  answers: ClinicalFindings["intake"]["answers"] = {},
  tests: ClinicalFindings["exam"]["tests"] = {}
): ClinicalFindings {
  return {
    intake: { answers, irritability: null },
    exam: { tests, notes: {} },
  };
}

describe("knowledge base integrity", () => {
  const all = Object.values(regionKnowledge);
  const ids = all.flatMap((k) => [
    ...k!.questions.map((q) => q.id),
    ...k!.tests.map((t) => t.id),
    ...k!.hypotheses.map((h) => h.id),
  ]);

  it("uses unique, storage-safe ids across all regions", () => {
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(FINDING_ID);
  });

  it("only references questions and tests defined in the same region", () => {
    for (const knowledge of all) {
      const questions = new Set(knowledge!.questions.map((q) => q.id));
      const tests = new Set(knowledge!.tests.map((t) => t.id));
      for (const hypothesis of knowledge!.hypotheses) {
        for (const feature of hypothesis.features) {
          expect(questions.has(feature.question), feature.question).toBe(true);
        }
        for (const link of hypothesis.tests) {
          expect(tests.has(link.test), link.test).toBe(true);
        }
      }
    }
  });

  it("keeps accuracy figures in range and always cites a source", () => {
    for (const knowledge of all) {
      for (const test of knowledge!.tests) {
        if (!test.accuracy) continue;
        expect(test.accuracy.source.length).toBeGreaterThan(5);
        for (const value of [test.accuracy.sensitivity, test.accuracy.specificity]) {
          if (value !== undefined) {
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it("stays within the stored-findings entry limit and has Persian labels", () => {
    for (const knowledge of all) {
      expect(knowledge!.questions.length).toBeLessThanOrEqual(80);
      expect(knowledge!.tests.length).toBeLessThanOrEqual(80);
      for (const item of [...knowledge!.questions, ...knowledge!.tests]) {
        expect(item.fa).toMatch(/[؀-ۿ]/);
      }
    }
  });
});

describe("hypothesis ranking", () => {
  it("returns null for regions without a structured module", () => {
    expect(rankHypotheses("post-op", emptyFindings(), 40)).toBeNull();
    expect(rankHypotheses(undefined, emptyFindings(), 40)).toBeNull();
  });

  it("ranks ACL injury first for a pop with rapid swelling and a positive Lachman", () => {
    const result = rankHypotheses(
      "knee",
      findings(
        { k_pop_rapid_swelling: "yes", k_giving_way: "yes", k_twisting: "yes" },
        { k_lachman: "positive" }
      ),
      24
    )!;
    expect(result.hypotheses[0].id).toBe("k_acl");
    expect(result.hypotheses[0].level).toBe("stronger");
    expect(result.limitedData).toBe(false);
    const reasons = result.hypotheses[0].supporting.map((r) => r.label.en);
    expect(reasons).toContain("Lachman test");
    expect(reasons).toContain("Pop at injury with rapid swelling (within ~2 hours)");
  });

  it("lets a negative high-sensitivity test count against a hypothesis", () => {
    const withoutTest = rankHypotheses(
      "low-back",
      findings({ lb_leg_below_knee: "yes" }),
      40
    )!;
    const withNegativeSlr = rankHypotheses(
      "low-back",
      findings({ lb_leg_below_knee: "yes" }, { lb_slr: "negative" }),
      40
    )!;
    const score = (r: typeof withoutTest) =>
      r.hypotheses.find((h) => h.id === "lb_radiculopathy")!.score;
    expect(score(withNegativeSlr)).toBe(score(withoutTest) - 3);
    expect(
      withNegativeSlr.hypotheses
        .find((h) => h.id === "lb_radiculopathy")!
        .against.map((r) => r.label.en)
    ).toContain("Straight leg raise");
  });

  it("applies age bands transparently", () => {
    const older = rankHypotheses("knee", findings(), 67)!;
    const oa = older.hypotheses.find((h) => h.id === "k_oa")!;
    expect(oa.supporting.some((r) => r.kind === "age" && r.weight === 2)).toBe(true);
    const younger = rankHypotheses("knee", findings(), 30)!;
    expect(
      younger.hypotheses.find((h) => h.id === "k_oa")!.against.some((r) => r.kind === "age")
    ).toBe(true);
  });

  it("flags serious hypotheses with support for medical review", () => {
    const result = rankHypotheses(
      "neck",
      findings({ n_clumsy_gait: "yes", n_bilateral: "yes" }, { n_hoffmann: "positive" }),
      58
    )!;
    expect(result.medicalReview.map((h) => h.id)).toEqual(["n_myelopathy"]);
    expect(result.medicalReview[0].requiresMedicalReview).toBe(true);
  });

  it("marks sparse records as limited data", () => {
    const result = rankHypotheses("shoulder", findings({ s_overhead: "yes" }), 45)!;
    expect(result.limitedData).toBe(true);
    expect(result.answeredQuestions).toBe(1);
  });

  it("suggests unrecorded tests that discriminate the leading hypotheses", () => {
    const result = rankHypotheses(
      "knee",
      findings({ k_pop_rapid_swelling: "yes", k_twisting: "yes" }),
      22
    )!;
    const suggested = result.nextTests.map((s) => s.test.id);
    expect(suggested).toContain("k_lachman");
    expect(suggested.length).toBeLessThanOrEqual(4);

    const afterLachman = rankHypotheses(
      "knee",
      findings({ k_pop_rapid_swelling: "yes", k_twisting: "yes" }, { k_lachman: "negative" }),
      22
    )!;
    expect(afterLachman.nextTests.map((s) => s.test.id)).not.toContain("k_lachman");
  });

  it("ignores equivocal tests and unknown answers", () => {
    const base = rankHypotheses("hip", findings(), 50)!;
    const noisy = rankHypotheses(
      "hip",
      findings({ h_groin: "unknown" }, { h_fadir: "equivocal" }),
      50
    )!;
    expect(noisy.hypotheses.map((h) => [h.id, h.score])).toEqual(
      base.hypotheses.map((h) => [h.id, h.score])
    );
  });

  it("maps scores to support levels", () => {
    expect(supportLevel(5)).toBe("stronger");
    expect(supportLevel(2)).toBe("some");
    expect(supportLevel(0)).toBe("weak");
    expect(supportLevel(-1)).toBe("against");
  });
});

describe("findings schema and normalisation", () => {
  it("accepts a complete record and rejects unknown keys or values", () => {
    const valid = {
      intake: { answers: { k_twisting: "yes" }, irritability: "moderate" },
      exam: { tests: { k_lachman: "positive" }, notes: { rom: "Flexion 110°" } },
    };
    expect(ClinicalFindingsSchema.safeParse(valid).success).toBe(true);
    expect(
      ClinicalFindingsSchema.safeParse({ ...valid, extra: true }).success
    ).toBe(false);
    expect(
      ClinicalFindingsSchema.safeParse({
        ...valid,
        intake: { ...valid.intake, answers: { k_twisting: "maybe" } },
      }).success
    ).toBe(false);
    expect(
      ClinicalFindingsSchema.safeParse({
        ...valid,
        exam: { ...valid.exam, notes: { diagnosis: "x" } },
      }).success
    ).toBe(false);
    expect(
      ClinicalFindingsSchema.safeParse({
        ...valid,
        exam: { ...valid.exam, notes: { rom: "x".repeat(2001) } },
      }).success
    ).toBe(false);
  });

  it("drops unknown answers, blank notes and ids from other regions", () => {
    const normalized = normalizeFindings(
      {
        intake: {
          answers: { k_twisting: "yes", k_locking: "unknown", s_overhead: "yes" },
          irritability: "low",
        },
        exam: {
          tests: { k_lachman: "negative", s_painful_arc: "positive" },
          notes: { rom: "  ", strength: " 4/5 quads " },
        },
      },
      "knee"
    );
    expect(normalized).toEqual({
      intake: { answers: { k_twisting: "yes" }, irritability: "low" },
      exam: { tests: { k_lachman: "negative" }, notes: { strength: "4/5 quads" } },
    });
    expect(hasAnyFinding(normalized)).toBe(true);
    expect(hasAnyFinding(emptyFindings())).toBe(false);
  });
});
