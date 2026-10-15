import { describe, expect, it } from "vitest";
import { describeDosage, dosageFromRow, dosagePayload, validateDosage } from "@/lib/clinical/dosage";

describe("dosage details", () => {
  it("accepts an empty set and the full professional set", () => {
    expect(validateDosage({})).toBeNull();
    expect(validateDosage({
      holdSeconds: 5, restSeconds: 60, loadType: "band", loadDetail: "کش قرمز",
      targetRpe: 6, painLimit: 3, tempo: "3-1-3", side: "right", timesPerDay: 2,
      clinicianNote: "زانو در راستای انگشت دوم",
    })).toBeNull();
  });

  it("rejects values the database would reject", () => {
    expect(validateDosage({ holdSeconds: 0 })).toBe("holdSeconds");
    expect(validateDosage({ holdSeconds: Number.NaN })).toBe("holdSeconds");
    expect(validateDosage({ restSeconds: 601 })).toBe("restSeconds");
    expect(validateDosage({ targetRpe: 11 })).toBe("targetRpe");
    expect(validateDosage({ painLimit: -1 })).toBe("painLimit");
    expect(validateDosage({ timesPerDay: 13 })).toBe("timesPerDay");
    expect(validateDosage({ loadDetail: "red band" })).toBe("loadDetail");
    expect(validateDosage({ tempo: "slow" })).toBe("tempo");
    expect(validateDosage({ tempo: "3-1-3-1-3" })).toBe("tempo");
    expect(validateDosage({ clinicianNote: "x".repeat(301) })).toBe("clinicianNote");
  });

  it("normalizes the payload: Persian digits, spacing, empty values", () => {
    expect(dosagePayload({
      tempo: " ۳ – ۱ / x ", loadType: "band", loadDetail: "  کش   قرمز ",
      clinicianNote: "   ", holdSeconds: undefined, painLimit: 0,
    })).toEqual({ tempo: "3-1-X", loadType: "band", loadDetail: "کش قرمز", painLimit: 0 });
    // A load detail without a load type is never sent.
    expect(dosagePayload({ loadDetail: "2 kg" })).toEqual({});
  });

  it("describes the dosage for the patient in Persian and for the clinician in English", () => {
    const item = {
      targetSets: 3, targetReps: 10, holdSeconds: 5, loadType: "band" as const, loadDetail: "قرمز",
      side: "right" as const, tempo: "3-1-X", restSeconds: 60, targetRpe: 6, painLimit: 3, timesPerDay: 2,
    };
    expect(describeDosage(item, "fa")).toEqual([
      "۳ ست × ۱۰ تکرار",
      "۵ ثانیه نگه‌داشتن در هر تکرار",
      "کش · قرمز",
      "فقط سمت راست",
      "ریتم \u20663-1-X\u2069",
      "استراحت بین ست‌ها ۶۰ ثانیه",
      "شدت تلاش ۶ از ۱۰",
      "درد حین تمرین حداکثر ۳ از ۱۰",
      "۲ بار در روز",
    ]);
    expect(describeDosage({ targetDurationSeconds: 45, painLimit: 0 }, "en")).toEqual([
      "45 s in total",
      "pain during exercise ≤ 0/10",
    ]);
    expect(describeDosage({}, "fa")).toEqual([]);
  });

  it("maps database rows and ignores missing columns", () => {
    expect(dosageFromRow({ hold_seconds: 5, load_type: "band", tempo: null, side: "" })).toMatchObject({
      holdSeconds: 5, loadType: "band", tempo: undefined, side: undefined,
    });
  });
});
