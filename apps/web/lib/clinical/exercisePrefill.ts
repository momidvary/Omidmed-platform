import { DOSAGE_KEYS, describeDosage } from "@/lib/clinical/dosage";
import type { Exercise, PrescriptionItemInput } from "@/lib/types";

/** True while the clinician has not entered any dose for this row. */
export function isDoseUntouched(item: PrescriptionItemInput): boolean {
  return (
    !item.dosageFa.trim() &&
    item.targetSets === undefined &&
    item.targetReps === undefined &&
    item.targetDurationSeconds === undefined &&
    DOSAGE_KEYS.every((key) => item[key] === undefined || item[key] === "")
  );
}

/**
 * Selecting an exercise fills an empty row with its suggested starting dose.
 * Anything the clinician already typed is kept; the dose is always editable
 * and still validated by the form and the draft RPC.
 */
export function withExercise<T extends PrescriptionItemInput>(item: T, exercise: Exercise | undefined): T {
  if (!exercise || !isDoseUntouched(item)) return { ...item, exerciseId: exercise?.id ?? "" };
  const { targetSets, targetReps, targetDurationSeconds, ...details } = exercise.defaultDosage;
  return {
    ...item,
    ...details,
    exerciseId: exercise.id,
    targetSets,
    targetReps,
    targetDurationSeconds,
    dosageFa: describeDosage({ targetSets, targetReps, targetDurationSeconds }, "fa")[0] ?? "",
  };
}

const targetText = (item: PrescriptionItemInput) =>
  describeDosage(
    { targetSets: item.targetSets, targetReps: item.targetReps, targetDurationSeconds: item.targetDurationSeconds },
    "fa"
  )[0] ?? "";

/**
 * Keeps the generated patient dose text in step with edited targets, so the
 * patient never sees "۳ ست × ۱۰ تکرار" above a target of 12 reps. Text the
 * clinician wrote themselves is never replaced.
 */
export function withPatch<T extends PrescriptionItemInput>(item: T, patch: Partial<T>): T {
  const next = { ...item, ...patch };
  const targetsChanged = ["targetSets", "targetReps", "targetDurationSeconds"].some((key) => key in patch);
  if (!targetsChanged || "dosageFa" in patch) return next;
  const generated = item.dosageFa.trim() === "" || item.dosageFa === targetText(item);
  return generated ? { ...next, dosageFa: targetText(next) } : next;
}
