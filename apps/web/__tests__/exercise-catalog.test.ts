import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateDosage } from "@/lib/clinical/dosage";
import { catalogEntries, exerciseLadders, laddersFor, patientContentOf } from "@/lib/data/exerciseCatalog";
import { exerciseFa } from "@/lib/data/exerciseFa";
import { legacyPatientContentFa, localizeExercise } from "@/lib/data/exerciseLibraryFa";
import { exercises } from "@/lib/data/exercises";
import { EXERCISE_CATEGORIES } from "@/lib/types";

const migration = readFileSync(
  join(__dirname, "../../../database/migrations/031_exercise_library_expansion.sql"),
  "utf8"
);
const sqlRow = (id: string, content: unknown) =>
  `('${id}', '${JSON.stringify(content).replaceAll("'", "''")}'::jsonb)`;
const persian = /[؀-ۿ]/;

describe("expanded exercise library", () => {
  it("roughly quadruples the library with unique ids", () => {
    const ids = exercises.map((exercise) => exercise.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(16 + catalogEntries.length);
    expect(catalogEntries.length).toBeGreaterThanOrEqual(45);
  });

  it("keeps the prescribable set to reviewed exercises only", () => {
    const approved = exercises.filter((exercise) => exercise.review === "approved").map((e) => e.id);
    expect(approved.sort()).toEqual(Object.keys(exerciseFa).sort());
    for (const entry of catalogEntries) expect(entry.review, entry.id).toBe("pending");
  });

  it("stores every pending exercise in migration 031 with the exact patient text", () => {
    const pending = exercises.filter((exercise) => exercise.review === "pending");
    for (const exercise of pending) {
      const entry = catalogEntries.find((candidate) => candidate.id === exercise.id);
      const content = entry ? patientContentOf(entry) : legacyPatientContentFa(exercise.id);
      expect(content, exercise.id).toBeDefined();
      expect(migration.includes(sqlRow(exercise.id, content)), exercise.id).toBe(true);
    }
    const rows = migration.match(/^ {2}\('ex_[a-z0-9_]+', '/gm) ?? [];
    expect(rows).toHaveLength(pending.length);
    // Rows are inserted inactive; activation is a separate reviewed migration.
    expect(migration).toMatch(/'hex'\),\s+false\s+from pg_temp\.exercise_library_031/);
    expect(migration).not.toMatch(/active\s*=\s*true/);
  });

  it("keeps patient content within the database bounds", () => {
    for (const entry of catalogEntries) {
      const content = patientContentOf(entry);
      expect(content.name.length).toBeGreaterThanOrEqual(2);
      expect(content.howTo.length).toBeGreaterThanOrEqual(1);
      expect(content.howTo.length).toBeLessThanOrEqual(20);
      expect(content.commonMistakes.length).toBeLessThanOrEqual(20);
      expect(content.howTo.every((step) => step.length <= 2000)).toBe(true);
      expect(new TextEncoder().encode(JSON.stringify(content)).length).toBeLessThan(32768);
      for (const text of [content.name, content.purpose, content.whenToStop, entry.fa.progression, entry.fa.regression]) {
        expect(text, entry.id).toMatch(persian);
      }
    }
  });

  it("gives every exercise a category and a valid starting dose", () => {
    for (const exercise of exercises) {
      expect(EXERCISE_CATEGORIES, exercise.id).toContain(exercise.category);
      const dose = exercise.defaultDosage;
      const repsMode = dose.targetSets !== undefined && dose.targetReps !== undefined && dose.targetDurationSeconds === undefined;
      const durationMode = dose.targetDurationSeconds !== undefined && dose.targetSets === undefined && dose.targetReps === undefined;
      expect(repsMode || durationMode, exercise.id).toBe(true);
      expect(validateDosage(dose), exercise.id).toBeNull();
      expect(localizeExercise(exercise, "fa").setsReps, exercise.id).toMatch(persian);
    }
  });

  it("builds progression ladders from real exercises", () => {
    const ids = new Set(exercises.map((exercise) => exercise.id));
    for (const ladder of exerciseLadders) {
      expect(ladder.steps.length).toBeGreaterThanOrEqual(3);
      expect(new Set(ladder.steps).size).toBe(ladder.steps.length);
      for (const step of ladder.steps) expect(ids.has(step), `${ladder.id}: ${step}`).toBe(true);
      expect(ladder.label.fa).toMatch(persian);
    }
    expect(laddersFor("ex_slr").map((ladder) => ladder.id)).toContain("knee_quadriceps");
    expect(laddersFor("ex_unknown")).toEqual([]);
  });
});
