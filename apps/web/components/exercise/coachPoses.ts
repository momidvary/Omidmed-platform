/**
 * Coach illustrations for the exercise library and patient portal.
 *
 * One exercise has a looping animated demonstration; a few others have a
 * still drawing of their key position. Every pose is a hand-placed drawing
 * of a coach in a gym setting, not a recording or an analysis of anyone.
 * Coordinates are in a 320×200 view box with the floor at y = 188.
 */

export const ANIMATED_COACH_EXERCISES = ["ex_glute_bridge"] as const;

export type CoachTone = "skin" | "skinFar" | "shirt" | "shorts" | "shoe" | "shoeFar";

/** A rounded limb or body segment: x1, y1, x2, y2, stroke width, tone. */
export type CoachSegment = readonly [number, number, number, number, number, CoachTone];

export interface CoachPose {
  scene: { bars?: boolean; pillar?: boolean; mat?: { x: number; width: number }; shadow?: number };
  /** Far-side limbs, drawn first, optionally shifted to suggest depth. */
  far: { shift: readonly [number, number]; segments: readonly CoachSegment[] };
  near: readonly CoachSegment[];
  head: readonly [number, number];
  hair: string;
  /** Orange movement cue (an arrow path), when the still needs one. */
  cue?: string;
}

export const COACH_STILL_POSES: Record<string, CoachPose> = {
  ex_bird_dog: {
    scene: { mat: { x: 40, width: 250 } },
    far: {
      shift: [0, 0],
      segments: [
        [122, 128, 122, 183, 7, "skinFar"],
        [192, 130, 270, 121, 11, "skinFar"],
        [268, 121, 280, 118, 6, "shoeFar"],
      ],
    },
    near: [
      [120, 128, 194, 130, 15, "shirt"],
      [192, 130, 192, 181, 11, "skin"],
      [192, 130, 192, 152, 14, "shorts"],
      [192, 182, 234, 183, 9, "skin"],
      [234, 184, 244, 184, 6, "shoe"],
      [120, 128, 72, 120, 7, "skin"],
      [120, 128, 108, 126, 9, "shirt"],
    ],
    head: [102, 118],
    hair: "M97 110 Q105 105 111 112 Q114 119 110 124 Q108 114 97 110 Z",
  },
  ex_wall_sit: {
    scene: { pillar: true },
    far: {
      shift: [4, -2],
      segments: [
        [226, 142, 185, 142, 12, "skinFar"],
        [185, 142, 185, 180, 9.5, "skinFar"],
        [188, 186, 170, 186, 6, "shoeFar"],
      ],
    },
    near: [
      [228, 90, 228, 140, 15, "shirt"],
      [228, 142, 185, 142, 12, "skin"],
      [228, 142, 209, 142, 14, "shorts"],
      [185, 142, 185, 181, 9.5, "skin"],
      [188, 186, 170, 186, 6, "shoe"],
      [226, 94, 218, 116, 6.5, "skin"],
      [218, 116, 200, 134, 6.5, "skin"],
      [226, 94, 223, 104, 8.5, "shirt"],
    ],
    head: [227, 72],
    hair: "M222 64 Q231 60 236 67 Q238 74 234 79 Q234 69 222 64 Z",
  },
  ex_calf_raise: {
    scene: { bars: true },
    far: {
      shift: [-4, -1],
      segments: [
        [210, 96, 211, 137, 12, "skinFar"],
        [211, 137, 212, 176, 9.5, "skinFar"],
        [212, 178, 228, 187, 6, "shoeFar"],
      ],
    },
    near: [
      [211, 42, 210, 94, 15, "shirt"],
      [210, 96, 211, 137, 12, "skin"],
      [210, 96, 210.5, 114, 14, "shorts"],
      [211, 137, 212, 176, 9.5, "skin"],
      [212, 178, 228, 187, 6, "shoe"],
      [213, 46, 230, 62, 6.5, "skin"],
      [230, 62, 251, 70, 6.5, "skin"],
      [213, 46, 221, 54, 8.5, "shirt"],
    ],
    head: [212, 24],
    hair: "M203 22 Q205 14 213 15 Q209 19 207 27 Q204 27 203 22 Z",
    cue: "M238 176 L238 160 M233 165 L238 159 L243 165",
  },
  ex_heel_slides: {
    scene: { bars: true, mat: { x: 56, width: 216 } },
    far: {
      shift: [4, -2],
      segments: [
        [165, 180, 95, 182, 11, "skinFar"],
        [93, 182, 89, 173, 6, "shoeFar"],
      ],
    },
    near: [
      [232, 180, 167, 180, 15, "shirt"],
      [165, 180, 130, 150, 12, "skin"],
      [165, 180, 149, 166.5, 14, "shorts"],
      [130, 150, 108, 181, 9.5, "skin"],
      [110, 184, 92, 184, 6, "shoe"],
      [232, 183, 200, 184, 6.5, "skin"],
      [200, 184, 172, 184, 6.5, "skin"],
      [232, 183, 220, 183.5, 8.5, "shirt"],
    ],
    head: [249, 175],
    hair: "M244 167 Q253 163 258 170 Q260 177 255 182 Q255 172 244 167 Z",
    cue: "M84 170 L104 170 M98 165 L104 170 L98 175",
  },
  ex_ankle_balance: {
    scene: { bars: true, shadow: 158 },
    far: {
      shift: [0, 0],
      segments: [
        [160, 99, 160, 140, 12, "skinFar"],
        [160, 140, 160, 180, 9.5, "skinFar"],
        [162, 185, 144, 186, 6, "shoeFar"],
      ],
    },
    near: [
      [161, 47, 160, 97, 15, "shirt"],
      [160, 99, 128, 124, 12, "skin"],
      [160, 99, 146, 110, 14, "shorts"],
      [160, 99, 160, 112, 14, "shorts"],
      [128, 124, 132, 158, 9.5, "skin"],
      [133, 160, 118, 163, 6, "shoe"],
      [162, 51, 178, 73, 6.5, "skin"],
      [178, 73, 167, 96, 6.5, "skin"],
      [162, 51, 170, 62, 8.5, "shirt"],
    ],
    head: [160, 29],
    hair: "M155 21 Q164 17 169 24 Q171 31 167 36 Q167 26 155 21 Z",
  },
};

export type CoachDemoKind = "animated" | "still";

export function coachDemoKind(exerciseId: string): CoachDemoKind | null {
  if ((ANIMATED_COACH_EXERCISES as readonly string[]).includes(exerciseId)) return "animated";
  if (Object.hasOwn(COACH_STILL_POSES, exerciseId)) return "still";
  return null;
}
