import raw from "@/lib/data/exerciseLibrary.json";
import type { DosageDetails, DosageTargets } from "@/lib/clinical/dosage";
import type { ExerciseFa } from "@/lib/data/exerciseFa";
import type { BodyRegionId, Difficulty, ExerciseCategory, Stage } from "@/lib/types";

/*
 * Expanded exercise library (part ب). Content is authored as JSON so the
 * patient-facing Persian text can be checked byte-for-byte against the
 * catalog migration that inserts it (see __tests__/exercise-catalog.test.ts).
 *
 * Every entry here starts as "pending": it is a clinician reference in the
 * library and cannot be prescribed until a physiotherapist reviews it and a
 * migration activates its catalog row.
 */

type Bilingual = { en: string; fa: string };

export interface LibraryText extends ExerciseFa {
  progression: string;
  regression: string;
}

export interface CatalogEntry {
  id: string;
  review: "approved" | "pending";
  region: BodyRegionId;
  category: ExerciseCategory;
  difficulty: Difficulty;
  stage: Stage[];
  equipment: Bilingual;
  goal: Bilingual;
  defaultDosage: DosageTargets & DosageDetails;
  precautions?: Bilingual;
  en: LibraryText;
  fa: LibraryText;
}

export interface ExerciseLadder {
  id: string;
  label: Bilingual;
  /** Easiest first. */
  steps: string[];
}

interface CatalogFile {
  ladders: ExerciseLadder[];
  legacy: Record<string, { category: ExerciseCategory; defaultDosage: DosageTargets & DosageDetails }>;
  exercises: CatalogEntry[];
}

const data = raw as unknown as CatalogFile;

export const catalogEntries: readonly CatalogEntry[] = data.exercises;
export const legacyExerciseMeta = data.legacy;
export const exerciseLadders: readonly ExerciseLadder[] = data.ladders;

const byId = new Map(catalogEntries.map((entry) => [entry.id, entry]));

export function catalogEntry(id: string): CatalogEntry | undefined {
  return byId.get(id);
}

/** The ladders an exercise belongs to, easiest step first. */
export function laddersFor(id: string): ExerciseLadder[] {
  return exerciseLadders.filter((ladder) => ladder.steps.includes(id));
}

/** Exact patient-facing content stored in the database catalog. */
export function patientContentOf(entry: CatalogEntry): ExerciseFa {
  const { name, purpose, howTo, commonMistakes, whenToStop } = entry.fa;
  return { name, purpose, howTo, commonMistakes, whenToStop };
}
