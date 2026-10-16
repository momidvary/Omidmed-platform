import { describe, expect, it } from "vitest";
import { POST_OP_QUESTION, emptyFindings, normalizeFindings } from "@/lib/clinical/reasoning/findings";
import { rankHypotheses } from "@/lib/clinical/reasoning/rank";

describe("post-operative question", () => {
  const withAnswer = (answer: "yes" | "no") => {
    const findings = emptyFindings();
    findings.intake.answers[POST_OP_QUESTION] = answer;
    findings.intake.answers.k_lachman_unknown_id = "yes";
    return findings;
  };

  it("is kept for every region with a knowledge module, unlike unknown ids", () => {
    const normalized = normalizeFindings(withAnswer("yes"), "knee");
    expect(normalized.intake.answers[POST_OP_QUESTION]).toBe("yes");
    expect(normalized.intake.answers).not.toHaveProperty("k_lachman_unknown_id");
  });

  it("does not change the diagnostic ranking", () => {
    const base = rankHypotheses("knee", normalizeFindings(emptyFindings(), "knee"), 60);
    const postOp = rankHypotheses("knee", normalizeFindings(withAnswer("yes"), "knee"), 60);
    expect(postOp?.hypotheses.map((h) => [h.id, h.score])).toEqual(base?.hypotheses.map((h) => [h.id, h.score]));
  });
});
