import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExerciseAnimation, frameAt } from "@/components/clinical/ExerciseAnimation";
import { FLOOR, L, VIEW_H, VIEW_W, dist, poseAt, solve, type JointName, type PinName, type Pt } from "@/lib/animation/figure";
import { motions } from "@/lib/animation/motions";
import { buildScene, figureOptions, sampleSkeletons } from "@/lib/animation/scene";
import { exercises } from "@/lib/data/exercises";

const JOINT_OF_PIN: Record<PinName, JointName> = {
  nearAnkle: "nearAnkle", farAnkle: "farAnkle", nearToe: "nearToe", farToe: "farToe",
  nearWrist: "nearWrist", farWrist: "farWrist",
};

describe("exercise animations", () => {
  it("cover every library exercise and nothing else", () => {
    expect(Object.keys(motions).sort()).toEqual(exercises.map((exercise) => exercise.id).sort());
  });

  for (const [id, motion] of Object.entries(motions)) {
    it(`${id} stays in frame, above the floor and on its pins`, () => {
      const opts = figureOptions(motion);
      const sequences = motion.alt ? [motion.keys, motion.alt] : [motion.keys];
      for (const keys of sequences) {
        expect(keys.length).toBeGreaterThanOrEqual(2);
        // Pinned joints must be pinned in every keyframe, or a limb would snap.
        const pinSets = keys.map((key) => Object.entries(key.pin ?? {}).filter(([, v]) => v !== undefined).map(([k]) => k).sort().join());
        expect(new Set(pinSets).size, `${id} pin sets`).toBe(1);
      }
      for (const sk of sampleSkeletons(motion)) {
        for (const [name, p] of Object.entries(sk.joints) as [JointName, Pt][]) {
          expect(Number.isFinite(p[0]) && Number.isFinite(p[1]), `${id} ${name}`).toBe(true);
          expect(p[1], `${id} ${name} below floor`).toBeLessThanOrEqual(FLOOR + 1);
          expect(p[0], `${id} ${name} x`).toBeGreaterThanOrEqual(0);
          expect(p[0], `${id} ${name} x`).toBeLessThanOrEqual(VIEW_W);
        }
        expect(sk.joints.head[1] - L.head, `${id} head top`).toBeGreaterThanOrEqual(0);
        expect(sk.joints.head[1] + L.head, `${id} head bottom`).toBeLessThanOrEqual(FLOOR + 1);
        expect(sk.joints.head[1], `${id} head`).toBeLessThanOrEqual(VIEW_H);
      }
      // Fixed-point pins are actually reached (reachable feet / hands).
      for (const keys of sequences) {
        for (const p of [0, 0.5, 1]) {
          const pose = poseAt(keys, p);
          const sk = solve(pose, opts);
          for (const [pin, target] of Object.entries(pose.pin ?? {}) as [PinName, Pt | undefined][]) {
            if (!Array.isArray(target)) continue;
            expect(dist(sk.joints[JOINT_OF_PIN[pin]], target), `${id} ${pin} at p=${p}`).toBeLessThan(1.5);
          }
        }
      }
      // Something visibly moves or is highlighted.
      const start = buildScene(motion, 0);
      const end = buildScene(motion, 1);
      const moved = start.ghost.length > 0 || (motion.glow?.length ?? 0) > 0;
      expect(moved, `${id} shows movement`).toBe(true);
      expect(end.figure.length).toBeGreaterThan(10);
    });
  }

  it("renders an accessible, labelled player with controls", () => {
    render(<ExerciseAnimation exerciseId="ex_glute_bridge" name="پل باسن" lang="fa" holdSeconds={5} />);
    expect(screen.getByRole("img", { name: "نمایش متحرک تمرین پل باسن" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "آهسته ۰٫۵×" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "عادی ۱×" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "خط راهنما" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "وضعیت پایانی" })).toBeInTheDocument();
    expect(screen.getByText(/شکل کلی حرکت/)).toBeInTheDocument();
  });

  it("walks through move, hold and return within one repetition", () => {
    const motion = motions.ex_glute_bridge;
    const phases = [0, 1200, 2800, 4400, 5800].map((clock) => frameAt(motion, clock, 2).phase);
    expect(phases).toEqual([0, 1, 2, 3, 3]);
    expect(frameAt(motion, 0, 2).p).toBe(0);
    expect(frameAt(motion, 2800, 2).p).toBe(1);
    // A full cycle (700 + 1600 + 2000 + 1600 ms) starts the next repetition.
    expect(frameAt(motion, 5900, 2).rep).toBe(2);
    expect(frameAt(motions.ex_bird_dog, 5900, 2).alternate).toBe(true);
    expect(frameAt(motions.ex_cat_camel, 100, undefined).phase).toBe(-1);
  });

  it("renders nothing for an exercise without a motion", () => {
    const { container } = render(<ExerciseAnimation exerciseId="ex_unknown" name="x" lang="en" />);
    expect(container).toBeEmptyDOMElement();
  });
});
