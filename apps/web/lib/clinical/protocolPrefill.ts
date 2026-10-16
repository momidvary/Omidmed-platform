import { isDoseUntouched, withExercise } from "@/lib/clinical/exercisePrefill";
import type { Exercise, PrescriptionItemInput } from "@/lib/types";

export const MAX_PRESCRIPTION_ITEMS = 20;

export interface PhasePrefillResult<T> {
  items: T[];
  /** Exercise ids added with their starting dose. */
  added: string[];
  /** In the phase but not prescribable yet (awaiting clinical review). */
  pending: string[];
  /** Already in the prescription; left as the clinician set them. */
  already: string[];
  /** Not added because the prescription is at its item limit. */
  overLimit: string[];
}

/**
 * Add a protocol phase's exercises to a draft prescription. Only reviewed
 * (prescribable) exercises are added, each with its library starting dose;
 * rows the clinician already filled are kept unchanged, blank rows are
 * replaced, and nothing is saved — the clinician still reviews every item,
 * sets the schedule and saves the draft.
 */
export function addPhaseExercises<T extends PrescriptionItemInput>(
  items: readonly T[],
  phaseExerciseIds: readonly string[],
  prescribable: readonly Exercise[],
  newRow: () => T
): PhasePrefillResult<T> {
  const kept = items.filter((item) => item.exerciseId || !isDoseUntouched(item));
  const present = new Set(kept.map((item) => item.exerciseId));
  const result: PhasePrefillResult<T> = { items: [...kept], added: [], pending: [], already: [], overLimit: [] };
  for (const id of phaseExerciseIds) {
    const exercise = prescribable.find((candidate) => candidate.id === id);
    if (present.has(id)) result.already.push(id);
    else if (!exercise) result.pending.push(id);
    else if (result.items.length >= MAX_PRESCRIPTION_ITEMS) result.overLimit.push(id);
    else {
      result.items.push(withExercise(newRow(), exercise));
      result.added.push(id);
      present.add(id);
    }
  }
  if (result.items.length === 0) result.items.push(newRow());
  return result;
}
