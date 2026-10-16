import { describe, expect, it } from "vitest";
import { assessOutcomeChange } from "@/lib/clinical/outcomeChange";

describe("outcome change against the MCID", () => {
  it("treats a fall in pain as improvement and checks the 2-point threshold", () => {
    expect(assessOutcomeChange("nrs_pain", 7, 4, "higher-worse")).toMatchObject({
      delta: -3,
      direction: 1,
      meaningful: true,
    });
    expect(assessOutcomeChange("nrs_pain", 7, 6, "higher-worse")).toMatchObject({
      direction: 1,
      meaningful: false,
    });
  });

  it("uses the instrument's own scale and direction", () => {
    expect(assessOutcomeChange("lefs", 40, 52, "higher-better")).toMatchObject({ direction: 1, meaningful: true });
    expect(assessOutcomeChange("odi", 30, 42, "higher-worse")).toMatchObject({ direction: -1, meaningful: true });
    expect(assessOutcomeChange("odi", 30, 30, "higher-worse")).toMatchObject({ direction: 0, meaningful: false });
  });

  it("does not claim significance for an instrument without an MCID", () => {
    expect(assessOutcomeChange("custom_scale", 10, 30, "higher-better")).toMatchObject({
      direction: 1,
      meaningful: null,
      mcid: null,
    });
  });
});
