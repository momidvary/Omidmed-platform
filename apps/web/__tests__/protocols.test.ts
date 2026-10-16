import { describe, expect, it } from "vitest";
import {
  phaseForWeeks,
  postOpProtocolsFor,
  protocolById,
  protocolForHypothesis,
  protocolLinkFor,
  protocols,
  protocolsUsingExercise,
  weeksSince,
} from "@/lib/clinical/protocols";
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
    for (const protocol of protocols.filter((candidate) => !candidate.postOp)) {
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

describe("post-operative protocols", () => {
  const postOp = protocols.filter((protocol) => protocol.postOp);

  it("cover the common operations and never link to a diagnostic hypothesis", () => {
    expect(postOp.map((protocol) => protocol.id).sort()).toEqual(["ankle_fracture", "rc_repair", "tha", "tka"]);
    for (const protocol of postOp) expect(protocol.hypotheses).toEqual([]);
  });

  it("put the surgeon's protocol first and give each phase a contiguous week window", () => {
    for (const protocol of postOp) {
      expect(protocol.principles[0].en, protocol.id).toMatch(/surgeon/i);
      let expectedFrom = 0;
      protocol.phases.forEach((phase, index) => {
        expect(phase.weeks, `${protocol.id}/${phase.id}`).toBeDefined();
        expect(phase.weeks!.from).toBe(expectedFrom);
        const last = index === protocol.phases.length - 1;
        expect(phase.weeks!.to === null, `${protocol.id}/${phase.id}`).toBe(last);
        if (phase.weeks!.to !== null) expectedFrom = phase.weeks!.to;
      });
    }
  });

  it("suggests a phase from the weeks since surgery", () => {
    const tka = protocolById("tka")!;
    expect(phaseForWeeks(tka, 0)).toBe("early");
    expect(phaseForWeeks(tka, 3)).toBe("strength");
    expect(phaseForWeeks(tka, 20)).toBe("function");
    expect(phaseForWeeks(protocolById("pfp")!, 3)).toBeNull();
    expect(weeksSince("2026-09-01", "2026-10-16")).toBe(6);
    expect(weeksSince("2026-10-20", "2026-10-16")).toBeNull();
  });

  it("are offered by region, and all of them for a general post-op case", () => {
    expect(postOpProtocolsFor("knee").map((protocol) => protocol.id)).toEqual(["tka", "acl"]);
    expect(postOpProtocolsFor("post-op")).toHaveLength(5);
    expect(postOpProtocolsFor("neck")).toEqual([]);
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
