import { describe, expect, it } from "vitest";
import { buildDailyAggregateProgressEntry } from "@/app/patient/page";

describe("patient daily aggregate completion policy", () => {
  it.each([0, 3, 6, 7, 10])(
    "requires an explicit completion choice at pain %i",
    (painLevel) => {
      expect(
        buildDailyAggregateProgressEntry("2026-08-23", painLevel, null)
      ).toBeNull();
    }
  );

  it("does not infer completion from a low pain score", () => {
    expect(
      buildDailyAggregateProgressEntry("2026-08-23", 1, "incomplete")
    ).toEqual({
      date: "2026-08-23",
      painLevel: 1,
      completed: false,
    });
  });

  it("does not overwrite an explicit completion choice at high pain", () => {
    expect(
      buildDailyAggregateProgressEntry("2026-08-23", 8, "complete")
    ).toEqual({
      date: "2026-08-23",
      painLevel: 8,
      completed: true,
    });
  });
});
