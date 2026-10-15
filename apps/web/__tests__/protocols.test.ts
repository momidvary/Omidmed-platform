import { describe, expect, it } from "vitest";
import { protocolById, protocolForHypothesis, protocolLinkFor, protocols, protocolsUsingExercise } from "@/lib/clinical/protocols";
import { regionKnowledge } from "@/lib/clinical/reasoning/knowledge";
import { exercises } from "@/lib/data/exercises";

const persian = /[؀-ۿ]/;
const hypotheses = Object.values(regionKnowledge).flatMap((region) =>
  region!.hypotheses.map((hypothesis) => ({ ...hypothesis, region: region!.region }))
);
const exerciseIds = new Set(exercises.map((exercise) => exercise.id));

describe("condition protocols", () => {
  it("have unique ids and link only to real hypotheses in their own region", () => {
    expect(new Set(protocols.map((p) => p.id)).size).toBe(protocols.length);
    for (const protocol of protocols) {
      expect(protocol.hypotheses.length, protocol.id).toBeGreaterThan(0);
      for (const id of protocol.hypotheses) {
        const hypothesis = hypotheses.find((h) => h.id === id);
        expect(hypothesis, `${protocol.id} → ${id}`).toBeDefined();
        expect(hypothesis!.region, `${protocol.id} → ${id}`).toBe(protocol.region);
      }
    }
  });

  it("never offer a rehab protocol for a hypothesis that needs medical review", () => {
    for (const hypothesis of hypotheses.filter((h) => h.requiresMedicalReview)) {
      expect(protocolForHypothesis(hypothesis.id), hypothesis.id).toBeUndefined();
    }
  });

  it("link each hypothesis to at most one protocol", () => {
    const linked = protocols.flatMap((p) => p.hypotheses);
    expect(new Set(linked).size).toBe(linked.length);
  });

  it("are built from criteria-based phases using library exercises", () => {
    for (const protocol of protocols) {
      expect(protocol.phases.length, protocol.id).toBeGreaterThanOrEqual(3);
      protocol.phases.forEach((phase, index) => {
        const last = index === protocol.phases.length - 1;
        expect(phase.goals.length, `${protocol.id}/${phase.id}`).toBeGreaterThan(0);
        expect(phase.exercises.length, `${protocol.id}/${phase.id}`).toBeGreaterThan(0);
        for (const id of phase.exercises) expect(exerciseIds.has(id), `${protocol.id}/${phase.id}: ${id}`).toBe(true);
        expect(new Set(phase.exercises).size).toBe(phase.exercises.length);
        // Every phase but the last says when to move on.
        expect(phase.progressWhen.length > 0, `${protocol.id}/${phase.id} criteria`).toBe(!last);
      });
      expect(new Set(protocol.phases.map((p) => p.id)).size).toBe(protocol.phases.length);
    }
  });

  it("carry outcome measures, safety checks and references, fully in Persian", () => {
    for (const protocol of protocols) {
      expect(protocol.outcomes.length, protocol.id).toBeGreaterThanOrEqual(2);
      expect(protocol.watchFor.length, protocol.id).toBeGreaterThan(0);
      expect(protocol.references.length, protocol.id).toBeGreaterThan(0);
      for (const reference of protocol.references) expect(reference).toMatch(/(19|20)\d\d/);
      const texts = [
        protocol.title, protocol.summary, ...protocol.principles, ...protocol.watchFor,
        ...protocol.outcomes.map((o) => o.detail),
        ...protocol.phases.flatMap((p) => [p.name, p.typical, ...p.goals, ...p.other, ...p.progressWhen]),
      ];
      for (const text of texts) {
        expect(text.fa, `${protocol.id}: ${text.en}`).toMatch(persian);
        expect(text.en.length, protocol.id).toBeGreaterThan(2);
      }
    }
  });

  it("resolves lookups", () => {
    expect(protocolById("pfp")?.hypotheses).toContain("k_pfp");
    expect(protocolForHypothesis("n_wad")?.id).toBe("neck_mechanical");
    expect(protocolsUsingExercise("ex_eccentric_heel_drop").map((p) => p.id)).toContain("achilles_tendinopathy");
    expect(protocolById("missing")).toBeUndefined();
  });
});

describe("protocol links on ranked hypotheses", () => {
  it("offers a protocol for a physiotherapy hypothesis but never for one needing medical review", () => {
    expect(protocolLinkFor({ id: "k_pfp", requiresMedicalReview: false })?.id).toBe("pfp");
    expect(protocolLinkFor({ id: "k_pfp", requiresMedicalReview: true })).toBeUndefined();
    for (const hypothesis of hypotheses.filter((h) => h.requiresMedicalReview)) {
      expect(protocolLinkFor({ id: hypothesis.id, requiresMedicalReview: true })).toBeUndefined();
    }
  });
});
