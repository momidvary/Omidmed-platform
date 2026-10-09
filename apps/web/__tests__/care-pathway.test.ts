import { describe, expect, it } from "vitest";
import { carePathwayStates, type CarePathwayInput } from "@/lib/clinical/carePathway";

const base: CarePathwayInput = {
  cases: "ready",
  hasCase: true,
  safetyCleared: true,
  findings: "saved",
  plan: "approved",
  program: "published",
  hasEpisode: true,
  sessions: "some",
};

describe("care pathway", () => {
  it("starts with the assessment for a new patient", () => {
    const states = carePathwayStates({
      ...base,
      hasCase: false,
      findings: "none",
      plan: "none",
      program: "none",
      sessions: "none",
    });
    expect(states.assessment).toBe("next");
    expect(states.exam).toBe("locked");
    expect(states.plan).toBe("locked");
    expect(states.program).toBe("locked");
  });

  it("never advances past an unresolved safety screen", () => {
    const states = carePathwayStates({ ...base, safetyCleared: false });
    expect(states.exam).toBe("blocked");
    expect(states.plan).toBe("locked");
    expect(states.program).toBe("locked");
  });

  it("keeps the home program locked until the plan is approved", () => {
    const draft = carePathwayStates({ ...base, plan: "draft", program: "none" });
    expect(draft.plan).toBe("waiting");
    expect(draft.program).toBe("locked");
    const none = carePathwayStates({ ...base, plan: "none", program: "none" });
    expect(none.plan).toBe("next");
  });

  it("flags a suspended program", () => {
    expect(carePathwayStates({ ...base, program: "suspended" }).program).toBe("blocked");
  });

  it("reports failed loads as unknown, never as not done", () => {
    const states = carePathwayStates({
      ...base,
      cases: "failed",
      findings: "failed",
      plan: "failed",
      sessions: "failed",
    });
    expect(states.assessment).toBe("unknown");
    expect(states.exam).toBe("unknown");
    expect(states.plan).toBe("unknown");
    expect(states.program).toBe("locked");
    expect(states.sessions).toBe("unknown");
    expect(Object.values(states)).not.toContain("next");
  });

  it("does not mark a later step as next while an earlier one is loading", () => {
    const states = carePathwayStates({ ...base, findings: "loading", plan: "none" });
    expect(states.exam).toBe("loading");
    expect(Object.values(states)).not.toContain("next");
  });

  it("marks everything done for a patient in active care", () => {
    expect(Object.values(carePathwayStates(base)).every((state) => state === "done")).toBe(true);
  });
});
