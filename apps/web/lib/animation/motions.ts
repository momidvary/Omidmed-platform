import { FLOOR, type JointName, type LimbPose, type Pose, type Pt, type SegName, type Target } from "@/lib/animation/figure";

/*
 * Keyframes for every library exercise. Each motion is a short sequence of
 * poses built from a few shared starting positions; the animation plays
 * start → end, holds, and returns. These are illustrative only and are not a
 * substitute for the clinician's instructions or the reviewed exercise text.
 */

export type Prop =
  | { kind: "wall"; x: number; side: "left" | "right" }
  | { kind: "box"; x: number; w: number; h: number }
  | { kind: "chair"; x: number }
  | { kind: "roll"; at: Pt; r: number }
  | { kind: "band"; from: Target; to: Target }
  | { kind: "post"; at: Pt }
  | { kind: "stick"; from: Target; to: Target }
  | { kind: "dowel" }
  | { kind: "weight"; at: Target };

export type Glow = SegName | "glute" | "scapula";

export interface Motion {
  view?: "side" | "front";
  /** Head drawing: profile, face toward the viewer, or back of the head. */
  head?: "side" | "front" | "top";
  face?: 1 | -1;
  keys: Pose[];
  /** Mirror-side keys used on every other repetition (alternating exercises). */
  alt?: Pose[];
  /** "rep": move, hold, return. "cycle": smooth continuous back-and-forth. */
  mode?: "rep" | "cycle";
  props?: Prop[];
  /** Dotted path of this joint across the movement. */
  track?: JointName;
  glow?: Glow[];
  /** Movement duration multiplier (1 ≈ 1.6 s each way). */
  tempo?: number;
  /** Magnify around a point, e.g. the head or the foot. */
  zoom?: { scale: number; at: Pt };
  /** Scenery: the gym seen from the side (default) or the floor seen from above. */
  backdrop?: "gym" | "floor";
}

type PoseInput = Partial<Omit<Pose, "legN" | "legF" | "armN" | "armF">> & {
  legN?: Partial<LimbPose>;
  legF?: Partial<LimbPose>;
  armN?: Partial<LimbPose>;
  armF?: Partial<LimbPose>;
};

/** Base pose with overrides; pins, hints and lengths merge key by key. */
function P(base: Pose, o: PoseInput = {}): Pose {
  return {
    ...base,
    ...o,
    legN: { ...base.legN, ...o.legN },
    legF: { ...base.legF, ...o.legF },
    armN: { ...base.armN, ...o.armN },
    armF: { ...base.armF, ...o.armF },
    pin: o.pin ? { ...base.pin, ...o.pin } : base.pin,
    hint: o.hint ? { ...base.hint, ...o.hint } : base.hint,
    len: o.len ? { ...base.len, ...o.len } : base.len,
  };
}

const UP: Pt = [0, -1];
const NO_LEG_PINS = { nearAnkle: undefined, farAnkle: undefined };
const FWD: Pt = [1, 0];
const LYING = FLOOR - 9; // hip / shoulder height when lying down

/* ── Shared starting positions ─────────────────────────────────── */

/** Lying on the back, head on the left. */
const SUPINE: Pose = {
  root: [240, LYING], anchor: { joint: "shoulder", at: [180, LYING] },
  trunk: 180, neck: 166,
  legN: { a: 0, b: 0, c: 85 }, legF: { a: 0, b: 0, c: 85 },
  armN: { a: -3, b: -2 }, armF: { a: -3, b: -2 },
};
/** Lying on the back, knees bent, feet flat. */
const HOOK = P(SUPINE, {
  legN: { c: 0 }, legF: { c: 0 },
  pin: { nearAnkle: [322, 215], farAnkle: [322, 215] },
  hint: { legN: UP, legF: UP },
});
/** Lying face down, head on the left. */
const PRONE: Pose = {
  root: [240, LYING], trunk: 180, neck: 171,
  legN: { a: 0, b: 0, c: -15 }, legF: { a: 0, b: 0, c: -15 },
  armN: { a: -3, b: -2 }, armF: { a: -3, b: -2 },
};
/** Standing, facing right. */
const STAND: Pose = {
  root: [200, 117], trunk: 90, neck: 90,
  legN: { a: -90, b: -90, c: 0 }, legF: { a: -90, b: -90, c: 0 },
  armN: { a: -93, b: -88 }, armF: { a: -87, b: -92 },
  pin: { nearAnkle: [200, 217], farAnkle: [200, 217] },
  hint: { legN: FWD, legF: FWD },
};
/** Standing, facing the viewer. */
const STAND_FRONT: Pose = {
  root: [200, 117], trunk: 90, neck: 90,
  legN: { a: -90, b: -90, c: -20 }, legF: { a: -90, b: -90, c: 200 },
  armN: { a: -84, b: -88 }, armF: { a: -96, b: -92 },
  pin: { nearAnkle: [210, 217], farAnkle: [190, 217] },
  hint: { legN: [1, 0], legF: [-1, 0] },
  len: { nearFoot: 0.6, farFoot: 0.6 },
};
/** Sitting on a chair, facing right. */
const SIT: Pose = {
  root: [190, 169], trunk: 92, neck: 92,
  legN: { a: 0, b: -90, c: 0 }, legF: { a: 0, b: -90, c: 0 },
  armN: { a: -55, b: -5 }, armF: { a: -60, b: -10 },
  pin: { nearAnkle: [244, 217], farAnkle: [244, 217] },
  hint: { legN: [1, -1], legF: [1, -1] },
};
const CHAIR: Prop = { kind: "chair", x: 160 };
/** Sitting on the floor, legs straight. */
const LONG_SIT: Pose = {
  root: [170, LYING], trunk: 80, neck: 85,
  legN: { a: 0, b: 0, c: 85 }, legF: { a: 0, b: 0, c: 85 },
  armN: { a: -115, b: -100 }, armF: { a: -112, b: -98 },
};
/** Hands and knees, head on the left. */
const QUAD: Pose = {
  root: [250, 162], trunk: 170, neck: 175,
  legN: { a: -90, b: 0, c: 0 }, legF: { a: -90, b: 0, c: 0 },
  armN: { a: -90, b: -90 }, armF: { a: -90, b: -90 },
};
/** Lying on the side seen from the front, top leg nearest; head on the left. */
const SIDE_LYING: Pose = {
  root: [245, 205], trunk: 180, neck: 180,
  legN: { a: 0, b: 0, c: 0 }, legF: { a: 0, b: 0, c: 0 },
  armN: { a: -62, b: 0 }, armF: { a: 180, b: 95 },
};
/** Half-kneeling: back (far) knee down, front (near) foot forward. */
const HALF_KNEEL: Pose = {
  root: [200, 162], trunk: 90, neck: 90,
  legN: { a: -10, b: -90, c: 0 }, legF: { a: -90, b: 180, c: 200 },
  armN: { a: -88, b: -85 }, armF: { a: -92, b: -95 },
  pin: { nearAnkle: [254, 217] }, hint: { legN: [1, -0.3] },
};
/** Seen from above (standing): trunk and upper arms foreshortened. */
const TOP: Pose = {
  root: [200, 120], trunk: 90, neck: 90,
  legN: { a: -90, b: -90, c: 0 }, legF: { a: -90, b: -90, c: 0 },
  armN: { a: -90, b: -90 }, armF: { a: -90, b: -90 },
  len: {
    trunk: 0.02, neck: 0.02, nearThigh: 0, nearShin: 0, nearFoot: 0, farThigh: 0, farShin: 0, farFoot: 0,
    nearUpperArm: 0.12, farUpperArm: 0.12, nearForearm: 0.95, farForearm: 0.95,
  },
};

/* ── Small helpers ─────────────────────────────────────────────── */

// Hips lifted: the hip-to-shoulder line now slopes down toward the head.
const bridgeUp = (o: PoseInput = {}) => P(HOOK, { trunk: 204, ...o });

/** Side-plank geometry: forearm under the shoulder, body pivoting up. */
const SIDE_PLANK_BASE: Pose = {
  root: [222, 211], anchor: { joint: "shoulder", at: [170, 182] },
  trunk: 151, neck: 151,
  legN: { a: -3, b: -3, c: 0 }, legF: { a: -3, b: -3, c: 0 },
  armN: { a: -90, b: 0 }, armF: { a: -40, b: -150 },
  len: { nearForearm: 0.25 },
};

/* ── Motions ───────────────────────────────────────────────────── */

export const motions: Record<string, Motion> = {
  /* Knee and post-op */
  ex_quad_sets: {
    keys: [P(LONG_SIT, { legN: { a: 8, b: -8 } }), P(LONG_SIT, { legN: { a: 2, b: -2, c: 95 } })],
    props: [{ kind: "roll", at: [221, 214], r: 7 }],
    glow: ["nearThigh"],
  },
  ex_ankle_pumps: {
    mode: "cycle",
    keys: [P(SUPINE, { legN: { c: 40 }, legF: { c: 40 } }), P(SUPINE, { legN: { c: 115 }, legF: { c: 115 } })],
    track: "nearToe",
    zoom: { scale: 1.3, at: [300, 190] },
  },
  ex_heel_slides: {
    keys: [
      P(SUPINE, { pin: { nearAnkle: [336, 215], nearWrist: [210, 176] }, hint: { legN: UP, armN: [1, 1] }, legN: { c: 80 } }),
      P(SUPINE, { pin: { nearAnkle: [282, 215], nearWrist: [205, 172] }, hint: { legN: UP, armN: [1, 1] }, legN: { c: 20 } }),
    ],
    props: [{ kind: "band", from: { joint: "nearWrist" }, to: { joint: "nearToe" } }],
    track: "nearAnkle",
    tempo: 1.4,
  },
  ex_slr: {
    keys: [
      P(SUPINE, { pin: { farAnkle: [322, 215] }, hint: { legF: UP }, legF: { c: 0 } }),
      P(SUPINE, { pin: { farAnkle: [322, 215] }, hint: { legF: UP }, legF: { c: 0 }, legN: { a: 38, b: 38, c: 128 } }),
    ],
    track: "nearAnkle",
    glow: ["nearThigh"],
  },
  ex_short_arc_quad: {
    keys: [
      P(SUPINE, { legN: { a: 15, b: -24, c: 66 } }),
      P(SUPINE, { legN: { a: 15, b: 14, c: 104 } }),
    ],
    props: [{ kind: "roll", at: [286, 211], r: 9 }],
    track: "nearAnkle",
    glow: ["nearThigh"],
  },
  ex_heel_prop: {
    keys: [P(SUPINE, { legN: { a: 13, b: -5, c: 85 } }), P(SUPINE, { legN: { a: 4, b: 4, c: 94 } })],
    props: [{ kind: "roll", at: [340, 213], r: 8 }],
    tempo: 2,
  },
  ex_gluteal_sets: { keys: [SUPINE, SUPINE], glow: ["glute"] },
  ex_seated_knee_flexion: {
    keys: [P(SIT, { pin: { nearAnkle: [244, 217] } }), P(SIT, { pin: { nearAnkle: [204, 217] }, legN: { c: -20 } })],
    props: [CHAIR],
    track: "nearAnkle",
    tempo: 1.4,
  },
  ex_wall_sit: {
    keys: [P(STAND, { root: [170, 138], pin: { nearAnkle: [218, 217], farAnkle: [218, 217] } }),
      P(STAND, { root: [170, 165], pin: { nearAnkle: [218, 217], farAnkle: [218, 217] } })],
    props: [{ kind: "wall", x: 160, side: "left" }],
    glow: ["nearThigh"],
    track: "hip",
  },
  ex_sit_to_stand: {
    keys: [
      P(SIT, { armN: { a: -10, b: 5 }, armF: { a: -12, b: 3 } }),
      P(SIT, { trunk: 55, neck: 55, armN: { a: -10, b: 5 }, armF: { a: -12, b: 3 } }),
      P(SIT, { root: [238, 118], trunk: 90, neck: 90, armN: { a: -60, b: -40 }, armF: { a: -62, b: -42 } }),
    ],
    props: [CHAIR],
    track: "hip",
    tempo: 1.3,
  },
  ex_step_up: {
    keys: [
      P(STAND, { root: [190, 127], trunk: 84, pin: { nearAnkle: [240, 197], farAnkle: [180, 217] } }),
      P(STAND, { root: [238, 97], pin: { nearAnkle: [240, 197], farAnkle: [232, 180] } }),
    ],
    props: [{ kind: "box", x: 212, w: 90, h: 20 }],
    track: "hip",
  },
  ex_step_down: {
    keys: [
      P(STAND, { root: [204, 98], pin: { nearAnkle: [205, 197], farAnkle: [222, 190] } }),
      P(STAND, { root: [195, 135], trunk: 80, pin: { nearAnkle: [205, 197], farAnkle: [245, 212] } }),
    ],
    props: [{ kind: "box", x: 150, w: 70, h: 20 }],
    track: "farAnkle",
    tempo: 1.4,
  },
  ex_split_squat: {
    keys: [
      P(STAND, { root: [195, 135], pin: { nearAnkle: [240, 217], farAnkle: undefined, farToe: [155, 221] }, legF: { c: -40 }, hint: { legF: [0.3, 1] } }),
      P(STAND, { root: [193, 170], pin: { nearAnkle: [240, 217], farAnkle: undefined, farToe: [155, 221] }, legF: { c: -40 }, hint: { legF: [0.3, 1] } }),
    ],
    track: "hip",
  },
  ex_single_leg_squat: {
    keys: [
      P(STAND, { root: [212, 120], pin: { nearAnkle: [215, 217], farAnkle: undefined }, legF: { a: -55, b: -80, c: 10 }, armN: { a: -20, b: -15 }, armF: { a: -25, b: -20 } }),
      P(STAND, { root: [180, 168], trunk: 65, neck: 70, pin: { nearAnkle: [215, 217], farAnkle: undefined }, legF: { a: 5, b: -15, c: 70 }, armN: { a: -10, b: -5 }, armF: { a: -15, b: -10 } }),
    ],
    props: [{ kind: "box", x: 118, w: 56, h: 50 }],
    track: "hip",
    tempo: 1.4,
  },
  ex_terminal_knee_ext: {
    keys: [P(STAND, { root: [196, 122], pin: { nearAnkle: [205, 217], farAnkle: [195, 217] } }),
      P(STAND, { root: [203, 117.5], pin: { nearAnkle: [205, 217], farAnkle: [195, 217] } })],
    props: [{ kind: "post", at: [320, 160] }, { kind: "band", from: [320, 165], to: { joint: "nearKnee" } }],
    glow: ["nearThigh"],
  },
  ex_spanish_squat: {
    keys: [P(STAND, { root: [205, 122], pin: { nearAnkle: [218, 217], farAnkle: [218, 217] } }),
      P(STAND, { root: [165, 160], trunk: 78, neck: 82, pin: { nearAnkle: [218, 217], farAnkle: [218, 217] }, armN: { a: -20, b: -10 }, armF: { a: -22, b: -12 } })],
    props: [{ kind: "post", at: [330, 165] }, { kind: "band", from: [330, 170], to: { joint: "nearKnee" } }],
    track: "hip",
    glow: ["nearThigh"],
  },

  /* Hip */
  ex_glute_bridge: { keys: [HOOK, bridgeUp()], track: "hip", glow: ["glute"] },
  ex_single_leg_bridge: {
    keys: [
      P(HOOK, { pin: { farAnkle: undefined }, legF: { a: 28, b: 28, c: 118 } }),
      bridgeUp({ pin: { farAnkle: undefined }, legF: { a: 2, b: 2, c: 92 } }),
    ],
    track: "hip",
    glow: ["glute"],
  },
  ex_glute_med_sidelying: {
    view: "front", head: "front",
    keys: [SIDE_LYING, P(SIDE_LYING, { legN: { a: 28, b: 28, c: 28 } })],
    track: "nearAnkle",
    glow: ["glute"],
  },
  ex_glute_med_bridge: {
    view: "front", head: "front",
    keys: [
      P(SIDE_LYING, { legN: { a: -15, b: 195 }, legF: { a: -10, b: 185 }, len: { nearThigh: 0.55, nearShin: 0.55, farThigh: 0.55, farShin: 0.55, nearFoot: 0.5, farFoot: 0.5 } }),
      P(SIDE_LYING, { legN: { a: 40, b: 238 }, legF: { a: -10, b: 185 }, len: { nearThigh: 0.55, nearShin: 0.8, farThigh: 0.55, farShin: 0.55, nearFoot: 0.5, farFoot: 0.5 } }),
    ],
    props: [{ kind: "band", from: { joint: "nearKnee" }, to: { joint: "farKnee" } }],
    track: "nearKnee",
    glow: ["glute"],
    zoom: { scale: 1.8, at: [250, 195] },
  },
  ex_side_plank_knees: {
    head: "front",
    keys: [
      P(SIDE_PLANK_BASE, { trunk: 151, neck: 151, legN: { a: -2, b: -35 }, legF: { a: -2, b: -35 }, len: { nearForearm: 0.25, nearShin: 0.25, farShin: 0.25 } }),
      P(SIDE_PLANK_BASE, { trunk: 163.5, neck: 163.5, legN: { a: -16.5, b: -35 }, legF: { a: -16.5, b: -35 }, len: { nearForearm: 0.25, nearShin: 0.25, farShin: 0.25 } }),
    ],
    track: "hip",
  },
  ex_side_plank: {
    head: "front",
    keys: [
      P(SIDE_PLANK_BASE, { trunk: 151, neck: 151, pin: { nearAnkle: [322, 216], farAnkle: [322, 216] }, hint: { legN: UP, legF: UP } }),
      P(SIDE_PLANK_BASE, { trunk: 167.7, neck: 167.7, pin: { nearAnkle: [322, 216], farAnkle: [322, 216] }, hint: { legN: UP, legF: UP } }),
    ],
    track: "hip",
  },
  ex_copenhagen_short: {
    head: "front",
    keys: [
      P(SIDE_PLANK_BASE, { trunk: 163, neck: 163, legN: { a: 22, b: -80 }, legF: { a: -10, b: -10 }, len: { nearForearm: 0.25, nearShin: 0.2 } }),
      P(SIDE_PLANK_BASE, { trunk: 178, neck: 178, legN: { a: 2, b: -80 }, legF: { a: 2, b: 2 }, len: { nearForearm: 0.25, nearShin: 0.2 } }),
    ],
    props: [{ kind: "box", x: 262, w: 90, h: 40 }],
    track: "hip",
  },
  ex_monster_walk: {
    view: "front", head: "front", mode: "cycle",
    keys: [
      P(STAND_FRONT, { root: [203, 128], pin: { nearAnkle: [232, 217], farAnkle: [175, 217] } }),
      P(STAND_FRONT, { root: [218, 126], pin: { nearAnkle: [232, 217], farAnkle: [205, 217] } }),
    ],
    props: [{ kind: "band", from: { joint: "nearAnkle", dy: -10 }, to: { joint: "farAnkle", dy: -10 } }],
    glow: ["glute"],
    tempo: 1.2,
  },
  ex_hip_hinge: {
    keys: [P(STAND, { pin: { nearAnkle: [205, 217], farAnkle: [205, 217] } }),
      P(STAND, { root: [178, 121], trunk: 32, neck: 30, pin: { nearAnkle: [205, 217], farAnkle: [205, 217] } })],
    props: [{ kind: "dowel" }],
    track: "shoulder",
    tempo: 1.3,
  },
  ex_hip_90_90: {
    view: "front", head: "front",
    keys: [
      P(STAND_FRONT, { root: [200, 199], pin: NO_LEG_PINS, legN: { a: -8, b: -40, c: -10 }, legF: { a: 205, b: 178, c: 178 }, len: { nearThigh: 0.75, nearShin: 0.35, farThigh: 0.5, farShin: 0.9, nearFoot: 0.3, farFoot: 0.4 }, armN: { a: -60, b: -80 }, armF: { a: -120, b: -100 } }),
      P(STAND_FRONT, { root: [200, 199], pin: NO_LEG_PINS, legN: { a: -25, b: 2, c: 2 }, legF: { a: 188, b: 220, c: 190 }, len: { nearThigh: 0.5, nearShin: 0.9, farThigh: 0.75, farShin: 0.35, nearFoot: 0.4, farFoot: 0.3 }, armN: { a: -60, b: -80 }, armF: { a: -120, b: -100 } }),
    ],
    tempo: 1.5,
  },
  ex_hip_mobility: {
    keys: [P(HALF_KNEEL, { anchor: { joint: "farKnee", at: [200, 214] } }),
      P(HALF_KNEEL, { anchor: { joint: "farKnee", at: [200, 214] }, legF: { a: -112 }, trunk: 92 })],
    glow: ["farThigh"],
    track: "hip",
    tempo: 1.6,
  },

  /* Low back */
  ex_curl_up: {
    keys: [
      P(HOOK, { pin: { farAnkle: undefined, nearWrist: [232, 215], farWrist: [232, 215] }, legF: { c: 85 }, hint: { armN: UP, armF: UP } }),
      P(HOOK, { anchor: { joint: "hip", at: [240, LYING] }, trunk: 171, neck: 165, curve: 2, pin: { farAnkle: undefined, nearWrist: [232, 215], farWrist: [232, 215] }, legF: { c: 85 }, hint: { armN: UP, armF: UP } }),
    ],
    glow: ["trunk"],
  },
  ex_bird_dog: {
    face: -1,
    keys: [QUAD, P(QUAD, { armN: { a: -176, b: -176 }, legF: { a: 2, b: 2, c: -20 } })],
    alt: [QUAD, P(QUAD, { armF: { a: -176, b: -176 }, legN: { a: 2, b: 2, c: -20 } })],
    track: "nearWrist",
  },
  ex_cat_camel: {
    face: -1, mode: "cycle",
    keys: [P(QUAD, { curve: 8, nod: 25 }), P(QUAD, { curve: -6, nod: -15 })],
    glow: ["trunk"],
    tempo: 1.5,
  },
  ex_prone_press_up: {
    face: -1,
    keys: [
      P(PRONE, { pin: { nearWrist: [194, 218], farWrist: [194, 218] }, hint: { armN: [1, -1], armF: [1, -1] } }),
      P(PRONE, { trunk: 145, neck: 140, curve: -5, pin: { nearWrist: [194, 218], farWrist: [194, 218] }, hint: { armN: [1, -1], armF: [1, -1] } }),
    ],
    track: "shoulder",
    tempo: 1.3,
  },
  ex_knee_to_chest: {
    keys: [
      P(HOOK, { pin: { nearWrist: { joint: "nearKnee", dx: 4, dy: -4 } }, hint: { armN: [1, -1] } }),
      P(HOOK, { pin: { nearAnkle: [252, 173], nearWrist: { joint: "nearKnee", dx: 4, dy: -4 } }, hint: { legN: [-1, -1.2], armN: [1, -1] }, legN: { c: -10 } }),
    ],
    track: "nearKnee",
    tempo: 1.4,
  },
  ex_pelvic_tilt: {
    keys: [P(HOOK, { curve: -2 }), P(HOOK, { curve: 3, trunk: 178 })],
    glow: ["trunk"],
  },
  ex_dead_bug: {
    keys: [
      P(SUPINE, { legN: { a: 90, b: 0, c: 0 }, legF: { a: 90, b: 0, c: 0 }, armN: { a: 90, b: 90 }, armF: { a: 90, b: 90 } }),
      P(SUPINE, { legN: { a: 90, b: 0, c: 0 }, legF: { a: 14, b: 14, c: 90 }, armN: { a: 168, b: 168 }, armF: { a: 90, b: 90 } }),
    ],
    alt: [
      P(SUPINE, { legN: { a: 90, b: 0, c: 0 }, legF: { a: 90, b: 0, c: 0 }, armN: { a: 90, b: 90 }, armF: { a: 90, b: 90 } }),
      P(SUPINE, { legN: { a: 14, b: 14, c: 90 }, legF: { a: 90, b: 0, c: 0 }, armN: { a: 90, b: 90 }, armF: { a: 168, b: 168 } }),
    ],
    tempo: 1.5,
  },
  ex_sciatic_slider: {
    mode: "cycle",
    keys: [
      P(SIT, { pin: { nearAnkle: undefined }, legN: { a: 0, b: -90, c: 0 }, nod: 25 }),
      P(SIT, { pin: { nearAnkle: undefined }, legN: { a: 0, b: -8, c: 75 }, nod: -25 }),
    ],
    props: [CHAIR],
    track: "nearAnkle",
    tempo: 1.4,
  },
  ex_walking_program: {
    mode: "cycle",
    keys: [
      P(STAND, { root: [200, 121], pin: NO_LEG_PINS, legN: { a: -70, b: -95, c: 5 }, legF: { a: -110, b: -125, c: -30 }, armN: { a: -115, b: -100 }, armF: { a: -65, b: -40 } }),
      P(STAND, { root: [200, 121], pin: NO_LEG_PINS, legF: { a: -70, b: -95, c: 5 }, legN: { a: -110, b: -125, c: -30 }, armF: { a: -115, b: -100 }, armN: { a: -65, b: -40 } }),
    ],
    tempo: 0.6,
  },

  /* Neck */
  ex_dnf: {
    keys: [SUPINE, P(SUPINE, { nod: 16 })],
    glow: ["neck"],
    zoom: { scale: 2.4, at: [180, 200] },
  },
  ex_dnf_head_lift: {
    keys: [SUPINE, P(SUPINE, { nod: 16 }), P(SUPINE, { nod: 24, neck: 156 })],
    glow: ["neck"],
    zoom: { scale: 2.4, at: [180, 200] },
  },
  ex_cervical_rotation: {
    view: "front", head: "front",
    keys: [STAND_FRONT, P(STAND_FRONT, { yaw: 0.9 })],
    alt: [STAND_FRONT, P(STAND_FRONT, { yaw: -0.9 })],
    glow: ["neck"],
    zoom: { scale: 2.6, at: [200, 52] },
  },
  ex_scap_retraction: {
    keys: [STAND, P(STAND, { scap: 6 })],
    glow: ["scapula"],
    zoom: { scale: 1.7, at: [200, 80] },
  },
  ex_upper_trap_stretch: {
    view: "front", head: "front",
    keys: [P(STAND_FRONT, { armN: { a: -75, b: -80 } }), P(STAND_FRONT, { neck: 122, armN: { a: -75, b: -80 } })],
    glow: ["neck"],
    zoom: { scale: 2, at: [200, 70] },
    tempo: 1.5,
  },
  ex_neck_isometrics: {
    view: "front", head: "front",
    keys: [
      P(STAND_FRONT, { pin: { nearWrist: { joint: "head", dx: 2, dy: -8 } }, hint: { armN: [1, 0.2] } }),
      P(STAND_FRONT, { pin: { nearWrist: { joint: "head", dx: 2, dy: -8 } }, hint: { armN: [1, 0.2] } }),
    ],
    glow: ["neck"],
    zoom: { scale: 2, at: [200, 65] },
  },
  ex_median_nerve_slider: {
    view: "front", head: "front", mode: "cycle",
    keys: [
      P(STAND_FRONT, { neck: 106, armN: { a: 0, b: 95 } }),
      P(STAND_FRONT, { neck: 74, armN: { a: 0, b: 2 } }),
    ],
    track: "nearWrist",
    zoom: { scale: 1.7, at: [215, 70] },
    tempo: 1.4,
  },

  /* Shoulder */
  ex_pendulum: {
    mode: "cycle",
    keys: [
      P(STAND, { root: [172, 120], trunk: 35, neck: 30, pin: { nearAnkle: [180, 217], farAnkle: [180, 217], farWrist: [262, 130] }, armN: { a: -102, b: -100 } }),
      P(STAND, { root: [172, 120], trunk: 35, neck: 30, pin: { nearAnkle: [180, 217], farAnkle: [180, 217], farWrist: [262, 130] }, armN: { a: -78, b: -80 } }),
    ],
    props: [{ kind: "box", x: 240, w: 100, h: FLOOR - 130 }],
    track: "nearWrist",
    tempo: 1.2,
  },
  ex_shoulder_flexion_aaro: {
    keys: [
      P(HOOK, { armN: { a: 80, b: 80 }, armF: { a: 80, b: 80 } }),
      P(HOOK, { armN: { a: 165, b: 165 }, armF: { a: 165, b: 165 } }),
    ],
    props: [{ kind: "stick", from: { joint: "nearWrist" }, to: { joint: "farWrist" } }],
    track: "nearWrist",
    tempo: 1.5,
  },
  ex_ext_rotation: {
    view: "front", head: "top", backdrop: "floor",
    keys: [P(TOP, { armN: { b: -90 } }), P(TOP, { armN: { b: -90 } })],
    props: [{ kind: "wall", x: 226, side: "right" }],
    glow: ["nearUpperArm"],
    zoom: { scale: 2, at: [210, 135] },
  },
  ex_er_band: {
    view: "front", head: "top", backdrop: "floor",
    keys: [P(TOP, { armN: { b: 180 } }), P(TOP, { armN: { b: 360 } })],
    props: [{ kind: "roll", at: [150, 150], r: 5 }, { kind: "band", from: [150, 150], to: { joint: "nearWrist" } }],
    track: "nearWrist",
    zoom: { scale: 2, at: [205, 140] },
  },
  ex_ir_band: {
    view: "front", head: "top", backdrop: "floor",
    keys: [P(TOP, { armN: { b: 360 } }), P(TOP, { armN: { b: 180 } })],
    props: [{ kind: "roll", at: [265, 150], r: 5 }, { kind: "band", from: [265, 150], to: { joint: "nearWrist" } }],
    track: "nearWrist",
    zoom: { scale: 2, at: [205, 140] },
  },
  ex_sidelying_er: {
    view: "front", head: "top",
    keys: [
      P(TOP, { root: [200, 196], trunk: 180, armN: { a: 180, b: -70 }, armF: { a: 180, b: 200 }, len: { farForearm: 0.3 } }),
      P(TOP, { root: [200, 196], trunk: 180, armN: { a: 180, b: 80 }, armF: { a: 180, b: 200 }, len: { farForearm: 0.3 } }),
    ],
    props: [{ kind: "weight", at: { joint: "nearWrist" } }],
    track: "nearWrist",
    zoom: { scale: 1.8, at: [200, 180] },
  },
  ex_row_band: {
    keys: [
      P(STAND, { pin: { nearAnkle: [200, 217], farAnkle: [195, 217], nearWrist: [264, 64], farWrist: [264, 64] }, hint: { armN: [-1, 0.3], armF: [-1, 0.3] } }),
      P(STAND, { scap: 4, pin: { nearAnkle: [200, 217], farAnkle: [195, 217], nearWrist: [206, 76], farWrist: [206, 76] }, hint: { armN: [-1, 0.3], armF: [-1, 0.3] } }),
    ],
    props: [{ kind: "post", at: [335, 60] }, { kind: "band", from: [335, 64], to: { joint: "nearWrist" } }],
    track: "nearElbow",
    glow: ["scapula"],
  },
  ex_prone_t: {
    view: "front", head: "top",
    keys: [
      P(TOP, { root: [200, 206], armN: { a: 0, b: 0 }, armF: { a: 180, b: 180 }, len: { nearUpperArm: 1, farUpperArm: 1, nearForearm: 1, farForearm: 1 } }),
      P(TOP, { root: [200, 206], armN: { a: 16, b: 16 }, armF: { a: 164, b: 164 }, len: { nearUpperArm: 1, farUpperArm: 1, nearForearm: 1, farForearm: 1 } }),
    ],
    zoom: { scale: 1.5, at: [200, 190] },
  },
  ex_cross_body_stretch: {
    view: "front", head: "front",
    keys: [
      P(STAND_FRONT, { armN: { a: 275, b: 270 }, armF: { a: -100, b: -95 } }),
      P(STAND_FRONT, { armN: { a: 182, b: 182 }, armF: { a: -80, b: 95 } }),
    ],
    track: "nearWrist",
    zoom: { scale: 1.6, at: [200, 75] },
    tempo: 1.4,
  },
  ex_wall_pushup_plus: {
    keys: [
      P(STAND, { root: [234, 123], trunk: 70, neck: 70, pin: { nearAnkle: [200, 217], farAnkle: [200, 217], nearWrist: [320, 66], farWrist: [320, 66] }, hint: { armN: [0, 1], armF: [0, 1] } }),
      P(STAND, { root: [247, 129], trunk: 62, neck: 62, pin: { nearAnkle: [200, 217], farAnkle: [200, 217], nearWrist: [320, 66], farWrist: [320, 66] }, hint: { armN: [0, 1], armF: [0, 1] } }),
      P(STAND, { root: [234, 123], trunk: 70, neck: 70, scap: -5, pin: { nearAnkle: [200, 217], farAnkle: [200, 217], nearWrist: [320, 66], farWrist: [320, 66] }, hint: { armN: [0, 1], armF: [0, 1] } }),
    ],
    props: [{ kind: "wall", x: 326, side: "right" }],
    track: "shoulder",
    glow: ["scapula"],
    tempo: 1.4,
  },
  ex_scap_control: {
    keys: [
      P(STAND, { pin: { nearAnkle: [205, 217], farAnkle: [205, 217], nearWrist: [234, 42], farWrist: [234, 42] }, hint: { armN: [0, 1], armF: [0, 1] } }),
      P(STAND, { pin: { nearAnkle: [205, 217], farAnkle: [205, 217], nearWrist: [232, 6], farWrist: [232, 6] }, hint: { armN: [0, 1], armF: [0, 1] } }),
    ],
    props: [{ kind: "wall", x: 240, side: "right" }],
    track: "nearWrist",
    glow: ["scapula"],
    tempo: 1.4,
  },

  /* Ankle and foot */
  ex_ankle_alphabet: {
    keys: [60, 110, 75, 120, 55, 100, 85].map((c) => P(LONG_SIT, { legN: { c } })),
    track: "nearToe",
    zoom: { scale: 1.8, at: [250, 190] },
    tempo: 2.4,
  },
  ex_ankle_band_4way: {
    keys: [
      P(LONG_SIT, { trunk: 85, pin: { nearWrist: [222, 168] }, hint: { armN: [0, 1] } }),
      P(LONG_SIT, { trunk: 85, legN: { c: 35 }, pin: { nearWrist: [222, 168] }, hint: { armN: [0, 1] } }),
    ],
    props: [{ kind: "band", from: { joint: "nearWrist" }, to: { joint: "nearToe" } }],
    track: "nearToe",
    zoom: { scale: 1.6, at: [250, 185] },
  },
  ex_calf_raise: {
    keys: [
      P(STAND, { root: [200, 119], pin: { nearAnkle: undefined, farAnkle: undefined, nearToe: [215, 221], farToe: [215, 221] }, legN: { c: -8 }, legF: { c: -8 } }),
      P(STAND, { root: [203.5, 111.4], pin: { nearAnkle: undefined, farAnkle: undefined, nearToe: [215, 221], farToe: [215, 221] }, legN: { c: -40 }, legF: { c: -40 } }),
    ],
    track: "nearAnkle",
    glow: ["nearShin"],
  },
  ex_soleus_raise: {
    keys: [
      P(STAND, { root: [192, 126], pin: { nearAnkle: undefined, farAnkle: undefined, nearToe: [215, 221], farToe: [215, 221] }, legN: { c: -8 }, legF: { c: -8 } }),
      P(STAND, { root: [195, 118], pin: { nearAnkle: undefined, farAnkle: undefined, nearToe: [215, 221], farToe: [215, 221] }, legN: { c: -40 }, legF: { c: -40 } }),
    ],
    track: "nearAnkle",
    glow: ["nearShin"],
  },
  ex_eccentric_heel_drop: {
    keys: [
      P(STAND, { root: [199.4, 94.4], pin: { nearAnkle: undefined, farAnkle: undefined, nearToe: [210, 205], farToe: [210, 205] }, legN: { c: -45 }, legF: { c: -45 } }),
      P(STAND, { root: [196.4, 111.3], pin: { nearAnkle: undefined, farAnkle: undefined, nearToe: [210, 205], farToe: [210, 205] }, legN: { c: 25 }, legF: { c: 25 } }),
    ],
    props: [{ kind: "box", x: 140, w: 75, h: 16 }],
    track: "nearAnkle",
    glow: ["nearShin"],
    tempo: 1.8,
  },
  ex_plantar_fascia_stretch: {
    keys: [
      P(LONG_SIT, { trunk: 45, neck: 40, armF: { a: -30, b: -10 }, pin: { nearWrist: { joint: "nearToe" } }, hint: { armN: [0, 1] } }),
      P(LONG_SIT, { trunk: 45, neck: 40, armF: { a: -30, b: -10 }, legN: { c: 112 }, pin: { nearWrist: { joint: "nearToe" } }, hint: { armN: [0, 1] } }),
    ],
    glow: ["nearFoot"],
    zoom: { scale: 1.7, at: [245, 185] },
  },
  ex_short_foot: {
    keys: [SIT, P(SIT, { len: { nearFoot: 0.84 } })],
    props: [CHAIR],
    glow: ["nearFoot"],
    zoom: { scale: 1.8, at: [245, 200] },
  },
  ex_ankle_balance: {
    keys: [
      P(STAND, { armN: { a: -60, b: -50 }, armF: { a: -120, b: -130 } }),
      P(STAND, { pin: { farAnkle: [188, 185] }, armN: { a: -60, b: -50 }, armF: { a: -120, b: -130 } }),
    ],
    track: "farAnkle",
  },
  ex_balance_reach: {
    keys: [
      P(STAND, { root: [200, 125], pin: { nearAnkle: [205, 217], farAnkle: [210, 200] } }),
      P(STAND, { root: [182, 150], trunk: 82, pin: { nearAnkle: [205, 217], farAnkle: [255, 214] }, armN: { a: -40, b: -20 }, armF: { a: -45, b: -25 } }),
    ],
    alt: [
      P(STAND, { root: [200, 125], pin: { nearAnkle: [205, 217], farAnkle: [210, 200] } }),
      P(STAND, { root: [205, 148], trunk: 70, neck: 75, pin: { nearAnkle: [205, 217], farAnkle: [130, 214] }, armN: { a: -30, b: -15 }, armF: { a: -35, b: -20 } }),
    ],
    track: "farAnkle",
    tempo: 1.4,
  },
  ex_hop_progression: {
    mode: "cycle",
    keys: [
      P(STAND, { root: [192, 132], trunk: 75, pin: { nearAnkle: [200, 217], farAnkle: [200, 217] }, armN: { a: -120, b: -110 }, armF: { a: -118, b: -108 } }),
      P(STAND, { root: [200, 96], pin: { nearAnkle: [200, 196], farAnkle: [200, 196] }, legN: { c: -30 }, legF: { c: -30 }, armN: { a: -40, b: -20 }, armF: { a: -42, b: -22 } }),
    ],
    track: "hip",
    tempo: 0.45,
  },
};

export function motionFor(id: string): Motion | undefined {
  return motions[id];
}
