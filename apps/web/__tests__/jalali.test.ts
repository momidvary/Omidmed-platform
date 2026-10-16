import { describe, expect, it } from "vitest";
import { formatJalali, fromJalali, jalaliMonthLength, toJalali } from "@/lib/jalali";

describe("Jalali calendar", () => {
  it("converts known dates both ways", () => {
    const pairs: [string, [number, number, number]][] = [
      ["2026-10-16", [1405, 7, 24]],
      ["2025-03-21", [1404, 1, 1]],
      ["2025-03-20", [1403, 12, 30]],
      ["2021-03-20", [1399, 12, 30]],
      ["2024-12-31", [1403, 10, 11]],
      ["2026-03-21", [1405, 1, 1]],
    ];
    for (const [iso, [year, month, day]] of pairs) {
      expect(toJalali(iso), iso).toEqual({ year, month, day });
      expect(fromJalali({ year, month, day }), iso).toBe(iso);
    }
  });

  it("round-trips every day across several years", () => {
    const start = Date.UTC(2023, 0, 1, 12);
    for (let day = 0; day < 365 * 4; day += 1) {
      const iso = new Date(start + day * 86_400_000).toISOString().slice(0, 10);
      const jalali = toJalali(iso)!;
      expect(fromJalali(jalali), iso).toBe(iso);
    }
  });

  it("knows month lengths and rejects days that do not exist", () => {
    expect(jalaliMonthLength(1405, 1)).toBe(31);
    expect(jalaliMonthLength(1405, 7)).toBe(30);
    expect(jalaliMonthLength(1403, 12)).toBe(30);
    expect(jalaliMonthLength(1404, 12)).toBe(29);
    expect(fromJalali({ year: 1404, month: 12, day: 30 })).toBeNull();
    expect(fromJalali({ year: 1405, month: 13, day: 1 })).toBeNull();
    expect(toJalali("not-a-date")).toBeNull();
  });

  it("formats a Persian label", () => {
    expect(formatJalali("2026-10-16")).toBe("۲۴ مهر ۱۴۰۵");
  });
});
