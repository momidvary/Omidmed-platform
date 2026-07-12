import { describe, expect, it } from "vitest";
import {
  categoricalSummary,
  nextSessionNumber,
  outOfRange,
  sessionCounts,
  summarizeMetric,
} from "@/lib/clinical/calc";
import { maskPhone, normalizeIranianPhoneNumber } from "@/lib/phone";

describe("sessionCounts", () => {
  const s = (status: string) => ({ status });

  it("counts only completed sessions", () => {
    const r = sessionCounts(
      [s("completed"), s("completed"), s("draft"), s("scheduled"), s("cancelled"), s("no_show")],
      10
    );
    expect(r.completed).toBe(2);
    expect(r.remaining).toBe(8);
    expect(r.overPlan).toBe(0);
  });

  it("never shows negative remaining; reports over-plan", () => {
    const r = sessionCounts(Array(12).fill(s("completed")), 10);
    expect(r.remaining).toBe(0);
    expect(r.overPlan).toBe(2);
  });

  it("handles missing plan", () => {
    const r = sessionCounts([s("completed")], null);
    expect(r.planned).toBeNull();
    expect(r.remaining).toBeNull();
    expect(r.overPlan).toBe(0);
  });
});

describe("nextSessionNumber", () => {
  it("is stable against deletions (max+1, never reused)", () => {
    expect(
      nextSessionNumber([
        { status: "completed", session_number: 1 },
        { status: "completed", session_number: 4 }, // 2,3 deleted
      ])
    ).toBe(5);
  });

  it("ignores cancelled sessions", () => {
    expect(
      nextSessionNumber([
        { status: "cancelled", session_number: 7 },
        { status: "completed", session_number: 2 },
      ])
    ).toBe(3);
  });

  it("starts at 1", () => {
    expect(nextSessionNumber([])).toBe(1);
  });
});

describe("summarizeMetric", () => {
  const pt = (d: string, v: number | null, unit = "deg") => ({
    measuredAt: d,
    numericValue: v,
    unit,
  });

  it("baseline is first, latest is last (by date)", () => {
    const r = summarizeMetric(
      [pt("2026-07-10", 90), pt("2026-07-01", 70), pt("2026-07-05", 80)],
      "higher_is_better"
    );
    expect(r.baseline).toBe(70);
    expect(r.latest).toBe(90);
    expect(r.absoluteChange).toBe(20);
    expect(r.improved).toBe(true);
    expect(r.hasTrend).toBe(true);
  });

  it("lower_is_better: decreasing pain is improvement", () => {
    const r = summarizeMetric(
      [pt("2026-07-01", 8, "nprs"), pt("2026-07-10", 3, "nprs")],
      "lower_is_better"
    );
    expect(r.improved).toBe(true);
    const worse = summarizeMetric(
      [pt("2026-07-01", 3, "nprs"), pt("2026-07-10", 8, "nprs")],
      "lower_is_better"
    );
    expect(worse.improved).toBe(false);
  });

  it("single measurement: no trend, no change", () => {
    const r = summarizeMetric([pt("2026-07-01", 70)], "higher_is_better");
    expect(r.hasTrend).toBe(false);
    expect(r.absoluteChange).toBeNull();
  });

  it("baseline zero: no percentage change", () => {
    const r = summarizeMetric(
      [pt("2026-07-01", 0), pt("2026-07-10", 30)],
      "higher_is_better"
    );
    expect(r.percentChange).toBeNull();
    expect(r.absoluteChange).toBe(30);
  });

  it("mixed units are never compared", () => {
    const r = summarizeMetric(
      [pt("2026-07-01", 70, "deg"), pt("2026-07-10", 1.2, "m")],
      "higher_is_better"
    );
    expect(r.comparable).toBe(false);
    expect(r.baseline).toBeNull();
  });

  it("neutral direction never auto-labels improvement", () => {
    const r = summarizeMetric(
      [pt("2026-07-01", 1), pt("2026-07-10", 5)],
      "neutral"
    );
    expect(r.improved).toBeNull();
  });
});

describe("categoricalSummary", () => {
  it("never yields a percentage", () => {
    const r = categoricalSummary([
      { measuredAt: "2026-07-01", value: "severe" },
      { measuredAt: "2026-07-10", value: "mild" },
    ]);
    expect(r.percentChange).toBeNull();
    expect(r.baseline).toBe("severe");
    expect(r.latest).toBe("mild");
  });
});

describe("outOfRange", () => {
  it("flags values outside the definition bounds", () => {
    expect(outOfRange(160, 0, 150)).toBe(true);
    expect(outOfRange(-5, 0, 150)).toBe(true);
    expect(outOfRange(90, 0, 150)).toBe(false);
    expect(outOfRange(90, null, null)).toBe(false);
  });
});

describe("phone normalization (shared with patient form)", () => {
  it("normalizes all accepted formats", () => {
    for (const input of ["09123456789", "9123456789", "989123456789", "+989123456789", "00989123456789", "۰۹۱۲۳۴۵۶۷۸۹"]) {
      expect(normalizeIranianPhoneNumber(input)).toEqual({ ok: true, e164: "+989123456789" });
    }
  });
  it("rejects invalid numbers", () => {
    expect(normalizeIranianPhoneNumber("0812345").ok).toBe(false);
    expect(normalizeIranianPhoneNumber("").ok).toBe(false);
  });
  it("masks numbers", () => {
    expect(maskPhone("+989123456789")).toBe("+98912***6789");
  });
});
