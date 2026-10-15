import { describe, expect, it } from "vitest";
import { isDoseUntouched, withExercise, withPatch } from "@/lib/clinical/exercisePrefill";
import { exercises } from "@/lib/data/exercises";
import type { PrescriptionItemInput } from "@/lib/types";

const quadSets = exercises.find((exercise) => exercise.id === "ex_quad_sets")!;
const blank: PrescriptionItemInput = { exerciseId: "", dosageFa: "", daysPerWeek: 0 };

describe("starting-dose prefill", () => {
  it("fills an empty row with the exercise's suggested dose", () => {
    const row = withExercise({ ...blank, rowId: "r1" }, quadSets);
    expect(row).toMatchObject({
      rowId: "r1",
      exerciseId: "ex_quad_sets",
      targetSets: 3,
      targetReps: 10,
      holdSeconds: 5,
      timesPerDay: 3,
      dosageFa: "۳ ست × ۱۰ تکرار",
    });
    expect(row.targetDurationSeconds).toBeUndefined();
  });

  it("never overwrites a dose the clinician already entered", () => {
    const typed = { ...blank, exerciseId: "ex_wall_sit", dosageFa: "۲ ست × ۵ تکرار", targetSets: 2, targetReps: 5, painLimit: 1 };
    expect(isDoseUntouched(typed)).toBe(false);
    expect(withExercise(typed, quadSets)).toEqual({ ...typed, exerciseId: "ex_quad_sets" });
    expect(isDoseUntouched({ ...blank, clinicianNote: "آرام" })).toBe(false);
  });

  it("clears the exercise when the selection is emptied", () => {
    expect(withExercise({ ...blank, exerciseId: "ex_quad_sets" }, undefined).exerciseId).toBe("");
  });
});

describe("generated dose text follows edited targets", () => {
  const prefilled = withExercise({ ...blank }, quadSets);

  it("updates the generated text when sets or reps change", () => {
    expect(withPatch(prefilled, { targetReps: 12 }).dosageFa).toBe("۳ ست × ۱۲ تکرار");
    const duration = withPatch(prefilled, { targetSets: undefined, targetReps: undefined, targetDurationSeconds: 60 });
    expect(duration.dosageFa).toBe("۶۰ ثانیه در مجموع");
  });

  it("keeps text the clinician wrote", () => {
    const custom = withPatch(prefilled, { dosageFa: "۳ ست × ۱۰ تکرار، صبح و عصر" });
    expect(withPatch(custom, { targetReps: 12 }).dosageFa).toBe("۳ ست × ۱۰ تکرار، صبح و عصر");
    expect(withPatch(prefilled, { holdSeconds: 8 }).dosageFa).toBe("۳ ست × ۱۰ تکرار");
  });
});
