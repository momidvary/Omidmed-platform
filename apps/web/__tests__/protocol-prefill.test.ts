import { describe, expect, it } from "vitest";
import { addPhaseExercises, MAX_PRESCRIPTION_ITEMS } from "@/lib/clinical/protocolPrefill";
import { protocolById } from "@/lib/clinical/protocols";
import { exerciseFa } from "@/lib/data/exerciseFa";
import { exercises } from "@/lib/data/exercises";
import type { PrescriptionItemInput } from "@/lib/types";

type Row = PrescriptionItemInput & { rowId: string };
let n = 0;
const newRow = (): Row => ({ rowId: `r${++n}`, exerciseId: "", dosageFa: "", daysPerWeek: 0 });
const prescribable = exercises.filter((e) => e.review === "approved" && exerciseFa[e.id]);

describe("start a home program from a protocol phase", () => {
  const phase = protocolById("pfp")!.phases[0];

  it("adds only reviewed exercises, each with its starting dose, replacing the blank row", () => {
    const result = addPhaseExercises([newRow()], phase.exercises, prescribable, newRow);
    expect(result.added.length).toBeGreaterThan(0);
    for (const id of result.added) expect(prescribable.some((e) => e.id === id)).toBe(true);
    // Unreviewed exercises are reported, never added.
    for (const id of result.pending) expect(prescribable.some((e) => e.id === id)).toBe(false);
    expect(result.added.length + result.pending.length).toBe(phase.exercises.length);
    expect(result.items.map((item) => item.exerciseId)).toEqual(result.added);
    const quadSets = result.items.find((item) => item.exerciseId === "ex_quad_sets")!;
    expect(quadSets).toMatchObject({ targetSets: 3, targetReps: 10, holdSeconds: 5 });
    // Schedule is left for the clinician.
    expect(quadSets.daysPerWeek).toBe(0);
  });

  it("keeps rows the clinician already filled and does not duplicate exercises", () => {
    const own: Row = { ...newRow(), exerciseId: "ex_quad_sets", dosageFa: "۲ ست × ۵ تکرار", targetSets: 2, targetReps: 5, daysPerWeek: 3 };
    const result = addPhaseExercises([own, newRow()], phase.exercises, prescribable, newRow);
    expect(result.items[0]).toBe(own);
    expect(result.already).toEqual(["ex_quad_sets"]);
    expect(result.items.filter((item) => item.exerciseId === "ex_quad_sets")).toHaveLength(1);
  });

  it("respects the prescription item limit", () => {
    const full = prescribable.slice(0, 7).map((e) => ({ ...newRow(), exerciseId: e.id, dosageFa: "x x x", daysPerWeek: 1 }));
    const padded = [...full, ...Array.from({ length: MAX_PRESCRIPTION_ITEMS - full.length }, (_, i) => ({ ...newRow(), exerciseId: `custom_${i}`, dosageFa: "x x x", daysPerWeek: 1 }))];
    const result = addPhaseExercises(padded, ["ex_wall_sit", "ex_glute_bridge"], prescribable, newRow);
    expect(result.items).toHaveLength(MAX_PRESCRIPTION_ITEMS);
    expect(result.added).toEqual([]);
  });

  it("leaves one blank row when nothing can be added", () => {
    const result = addPhaseExercises([newRow()], ["ex_slr"], prescribable, newRow);
    expect(result.pending).toEqual(["ex_slr"]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].exerciseId).toBe("");
  });
});
