/*
 * A small 2D articulated figure for illustrative exercise animations.
 *
 * Poses are joint angles in degrees (0 = right, 90 = up), so they can be
 * interpolated directly. Limbs can be pinned to a point (a foot on the floor,
 * a hand on a wall) and are then solved with two-link IK, which keeps planted
 * feet and hands still while the body moves. Everything here is pure: the
 * React component only draws the shapes returned by `drawFigure`.
 */

export type Pt = [number, number];

export const VIEW_W = 400;
export const VIEW_H = 240;
export const FLOOR = 222;

export const L = {
  trunk: 60,
  neck: 19,
  head: 12,
  thigh: 52,
  shin: 48,
  foot: 15,
  upperArm: 34,
  forearm: 32,
} as const;

export type SegName =
  | "trunk" | "neck"
  | "nearThigh" | "nearShin" | "nearFoot" | "farThigh" | "farShin" | "farFoot"
  | "nearUpperArm" | "nearForearm" | "farUpperArm" | "farForearm";

export type JointName =
  | "hip" | "shoulder" | "head"
  | "nearHip" | "farHip" | "nearShoulder" | "farShoulder"
  | "nearKnee" | "nearAnkle" | "nearToe" | "farKnee" | "farAnkle" | "farToe"
  | "nearElbow" | "nearWrist" | "farElbow" | "farWrist";

export type PinName = "nearAnkle" | "farAnkle" | "nearToe" | "farToe" | "nearWrist" | "farWrist";
export type LimbName = "legN" | "legF" | "armN" | "armF";
/** A fixed point, or a joint to follow with an optional offset. */
export type Target = Pt | { joint: JointName; dx?: number; dy?: number };

export interface LimbPose {
  /** Upper segment angle (thigh / upper arm). */
  a: number;
  /** Lower segment angle (shin / forearm). */
  b: number;
  /** Foot angle (legs only). */
  c?: number;
}

export interface Pose {
  root: Pt;
  /** Place the figure so this joint (from the angles alone) sits here. */
  anchor?: { joint: JointName; at: Pt };
  trunk: number;
  neck: number;
  /** Chin-to-chest nod of the face, degrees. */
  nod?: number;
  /** Head retraction (chin tuck), px. */
  tuck?: number;
  /** Front view: head turn, -1 … 1. */
  yaw?: number;
  /** Spine bend in px; positive rounds the back (flexion). */
  curve?: number;
  /** Shoulder-blade shift backward, px. */
  scap?: number;
  legN: LimbPose;
  legF: LimbPose;
  armN: LimbPose;
  armF: LimbPose;
  pin?: Partial<Record<PinName, Target>>;
  /** Preferred direction of the knee / elbow when a limb is pinned. */
  hint?: Partial<Record<LimbName, Pt>>;
  /** Length multipliers, used for foreshortening. */
  len?: Partial<Record<SegName, number>>;
}

export interface FigureOptions {
  view: "side" | "front";
  /** +1: belly toward the right of the trunk direction's left normal (see belly()). */
  face: 1 | -1;
}

export interface Skeleton {
  joints: Record<JointName, Pt>;
  /** Point the spine bends through (quadratic control point). */
  spineControl: Pt;
  faceAngle: number;
  pose: Pose;
}

const rad = (deg: number) => (deg * Math.PI) / 180;
export const dir = (deg: number): Pt => [Math.cos(rad(deg)), -Math.sin(rad(deg))];
const add = (p: Pt, q: Pt, k = 1): Pt => [p[0] + q[0] * k, p[1] + q[1] * k];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpPt = (a: Pt, b: Pt, t: number): Pt => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
export const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/* ── Interpolation ─────────────────────────────────────────────── */

function lerpLimb(a: LimbPose, b: LimbPose, t: number): LimbPose {
  return { a: lerp(a.a, b.a, t), b: lerp(a.b, b.b, t), c: lerp(a.c ?? 0, b.c ?? 0, t) };
}

function lerpTarget(a: Target, b: Target, t: number): Target {
  if (Array.isArray(a) && Array.isArray(b)) return lerpPt(a, b, t);
  if (!Array.isArray(a) && !Array.isArray(b) && a.joint === b.joint) {
    return { joint: a.joint, dx: lerp(a.dx ?? 0, b.dx ?? 0, t), dy: lerp(a.dy ?? 0, b.dy ?? 0, t) };
  }
  return t < 0.5 ? a : b;
}

function lerpRecord<K extends string, V>(
  a: Partial<Record<K, V>> | undefined,
  b: Partial<Record<K, V>> | undefined,
  t: number,
  fn: (x: V, y: V, t: number) => V
): Partial<Record<K, V>> | undefined {
  if (!a && !b) return undefined;
  const out: Partial<Record<K, V>> = {};
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]) as Set<K>;
  for (const key of keys) {
    const x = a?.[key];
    const y = b?.[key];
    out[key] = x !== undefined && y !== undefined ? fn(x, y, t) : (x ?? y);
  }
  return out;
}

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return {
    root: lerpPt(a.root, b.root, t),
    anchor:
      a.anchor && b.anchor && a.anchor.joint === b.anchor.joint
        ? { joint: a.anchor.joint, at: lerpPt(a.anchor.at, b.anchor.at, t) }
        : (t < 0.5 ? a.anchor : b.anchor),
    trunk: lerp(a.trunk, b.trunk, t),
    neck: lerp(a.neck, b.neck, t),
    nod: lerp(a.nod ?? 0, b.nod ?? 0, t),
    tuck: lerp(a.tuck ?? 0, b.tuck ?? 0, t),
    yaw: lerp(a.yaw ?? 0, b.yaw ?? 0, t),
    curve: lerp(a.curve ?? 0, b.curve ?? 0, t),
    scap: lerp(a.scap ?? 0, b.scap ?? 0, t),
    legN: lerpLimb(a.legN, b.legN, t),
    legF: lerpLimb(a.legF, b.legF, t),
    armN: lerpLimb(a.armN, b.armN, t),
    armF: lerpLimb(a.armF, b.armF, t),
    pin: lerpRecord(a.pin, b.pin, t, lerpTarget),
    hint: lerpRecord(a.hint, b.hint, t, lerpPt),
    len: lerpRecord(a.len, b.len, t, lerp),
  };
}

/** Pose at progress p (0 … 1) along a sequence of keyframes. */
export function poseAt(keys: readonly Pose[], p: number): Pose {
  if (keys.length === 1) return keys[0];
  const x = Math.min(1, Math.max(0, p)) * (keys.length - 1);
  const i = Math.min(keys.length - 2, Math.floor(x));
  return lerpPose(keys[i], keys[i + 1], x - i);
}

/* ── Kinematics ────────────────────────────────────────────────── */

/** Two-link IK: the middle joint for a chain from `base` to `end`. */
export function solveTwoLink(base: Pt, end: Pt, a: number, b: number, hint: Pt): { mid: Pt; end: Pt } {
  const dx = end[0] - base[0];
  const dy = end[1] - base[1];
  const reach = Math.hypot(dx, dy);
  const ang = Math.atan2(dy, dx);
  if (reach >= a + b - 1e-6 || reach < 1e-6) {
    // Out of reach: point straight at the target.
    const u: Pt = reach < 1e-6 ? [1, 0] : [dx / reach, dy / reach];
    return { mid: add(base, u, a), end: add(base, u, a + b) };
  }
  const d = Math.max(Math.abs(a - b) + 1e-6, reach);
  const alpha = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))));
  const m1: Pt = [base[0] + a * Math.cos(ang - alpha), base[1] + a * Math.sin(ang - alpha)];
  const m2: Pt = [base[0] + a * Math.cos(ang + alpha), base[1] + a * Math.sin(ang + alpha)];
  const score = (m: Pt) => (m[0] - base[0]) * hint[0] + (m[1] - base[1]) * hint[1];
  return { mid: score(m1) >= score(m2) ? m1 : m2, end };
}

const DEFAULT_HINT: Record<LimbName, Pt> = { legN: [1, 0], legF: [1, 0], armN: [0, 1], armF: [0, 1] };

/** Direction from the spine toward the belly. */
export function belly(trunk: number, face: 1 | -1): Pt {
  return dir(trunk - 90 * face);
}

function fk(pose: Pose, opts: FigureOptions, origin: Pt): Record<JointName, Pt> {
  const len = (seg: SegName) => pose.len?.[seg] ?? 1;
  const hip = origin;
  const td = dir(pose.trunk);
  const back = belly(pose.trunk, opts.face).map((v) => -v) as Pt;
  const shoulder = add(add(hip, td, L.trunk * len("trunk")), back, pose.scap ?? 0);
  // Front view: hips and shoulders spread across the trunk.
  const across = dir(pose.trunk - 90);
  const hw = opts.view === "front" ? 8 : 0;
  const sw = opts.view === "front" ? 15 : 0;
  const nearHip = add(hip, across, hw);
  const farHip = add(hip, across, -hw);
  const nearShoulder = add(shoulder, across, sw);
  const farShoulder = add(shoulder, across, -sw);
  const faceDir = dir(pose.neck - 90 * opts.face - (pose.nod ?? 0) * opts.face);
  const head = add(add(shoulder, dir(pose.neck), L.neck * len("neck")), faceDir, -(pose.tuck ?? 0));
  const leg = (h: Pt, limb: LimbPose, s: "near" | "far") => {
    const knee = add(h, dir(limb.a), L.thigh * len(`${s}Thigh`));
    const ankle = add(knee, dir(limb.b), L.shin * len(`${s}Shin`));
    const toe = add(ankle, dir(limb.c ?? 0), L.foot * len(`${s}Foot`));
    return { knee, ankle, toe };
  };
  const arm = (sh: Pt, limb: LimbPose, s: "near" | "far") => {
    const elbow = add(sh, dir(limb.a), L.upperArm * len(`${s}UpperArm`));
    const wrist = add(elbow, dir(limb.b), L.forearm * len(`${s}Forearm`));
    return { elbow, wrist };
  };
  const ln = leg(nearHip, pose.legN, "near");
  const lf = leg(farHip, pose.legF, "far");
  const an = arm(nearShoulder, pose.armN, "near");
  const af = arm(farShoulder, pose.armF, "far");
  return {
    hip, shoulder, head, nearHip, farHip, nearShoulder, farShoulder,
    nearKnee: ln.knee, nearAnkle: ln.ankle, nearToe: ln.toe,
    farKnee: lf.knee, farAnkle: lf.ankle, farToe: lf.toe,
    nearElbow: an.elbow, nearWrist: an.wrist, farElbow: af.elbow, farWrist: af.wrist,
  };
}

function resolveTarget(target: Target, joints: Record<JointName, Pt>): Pt {
  if (Array.isArray(target)) return target;
  const p = joints[target.joint];
  return [p[0] + (target.dx ?? 0), p[1] + (target.dy ?? 0)];
}

export function solve(pose: Pose, opts: FigureOptions): Skeleton {
  let joints = fk(pose, opts, pose.root);
  if (pose.anchor) {
    const at = joints[pose.anchor.joint];
    joints = fk(pose, opts, [pose.root[0] + pose.anchor.at[0] - at[0], pose.root[1] + pose.anchor.at[1] - at[1]]);
  }
  const len = (seg: SegName) => pose.len?.[seg] ?? 1;
  const pin = pose.pin ?? {};
  const hint = (limb: LimbName) => pose.hint?.[limb] ?? DEFAULT_HINT[limb];
  // Legs first, so hands can follow knees or feet.
  for (const s of ["near", "far"] as const) {
    const limb: LimbName = s === "near" ? "legN" : "legF";
    const toePin = pin[`${s}Toe`];
    const anklePin = pin[`${s}Ankle`];
    if (!toePin && !anklePin) continue;
    const footLen = L.foot * len(`${s}Foot`);
    const footAngle = pose[limb].c ?? 0;
    const ankleTarget = toePin
      ? add(resolveTarget(toePin, joints), dir(footAngle), -footLen)
      : resolveTarget(anklePin!, joints);
    const { mid, end } = solveTwoLink(
      joints[`${s}Hip`], ankleTarget, L.thigh * len(`${s}Thigh`), L.shin * len(`${s}Shin`), hint(limb)
    );
    joints[`${s}Knee`] = mid;
    joints[`${s}Ankle`] = end;
    joints[`${s}Toe`] = add(end, dir(footAngle), footLen);
  }
  for (const s of ["near", "far"] as const) {
    const limb: LimbName = s === "near" ? "armN" : "armF";
    const wristPin = pin[`${s}Wrist`];
    if (!wristPin) continue;
    const { mid, end } = solveTwoLink(
      joints[`${s}Shoulder`], resolveTarget(wristPin, joints),
      L.upperArm * len(`${s}UpperArm`), L.forearm * len(`${s}Forearm`), hint(limb)
    );
    joints[`${s}Elbow`] = mid;
    joints[`${s}Wrist`] = end;
  }
  const mid = lerpPt(joints.hip, joints.shoulder, 0.5);
  const back = belly(pose.trunk, opts.face).map((v) => -v) as Pt;
  return {
    joints,
    spineControl: add(mid, back, 2 * (pose.curve ?? 0)),
    faceAngle: pose.neck - 90 * opts.face - (pose.nod ?? 0) * opts.face,
    pose,
  };
}

/* ── Shapes ────────────────────────────────────────────────────── */

export type Layer = "far" | "body" | "near";
export type Tone = "figure" | "moving" | "ghost";

export type Shape =
  | { kind: "line"; from: Pt; to: Pt; width: number; tone: Tone; layer: Layer; seg: SegName; part?: "shoulders" | "pelvis" }
  | { kind: "spine"; from: Pt; control: Pt; to: Pt; width: number; tone: Tone }
  | { kind: "head"; at: Pt; r: number; faceAngle: number; view: "side" | "front"; yaw: number; tone: Tone };

const SEGMENTS: { seg: SegName; from: JointName; to: JointName; width: number; layer: Layer }[] = [
  { seg: "farUpperArm", from: "farShoulder", to: "farElbow", width: 7, layer: "far" },
  { seg: "farForearm", from: "farElbow", to: "farWrist", width: 6, layer: "far" },
  { seg: "farThigh", from: "farHip", to: "farKnee", width: 12, layer: "far" },
  { seg: "farShin", from: "farKnee", to: "farAnkle", width: 10, layer: "far" },
  { seg: "farFoot", from: "farAnkle", to: "farToe", width: 6, layer: "far" },
  { seg: "neck", from: "shoulder", to: "head", width: 7, layer: "body" },
  { seg: "nearThigh", from: "nearHip", to: "nearKnee", width: 12, layer: "near" },
  { seg: "nearShin", from: "nearKnee", to: "nearAnkle", width: 10, layer: "near" },
  { seg: "nearFoot", from: "nearAnkle", to: "nearToe", width: 6, layer: "near" },
  { seg: "nearUpperArm", from: "nearShoulder", to: "nearElbow", width: 7, layer: "near" },
  { seg: "nearForearm", from: "nearElbow", to: "nearWrist", width: 6, layer: "near" },
];

export const SEGMENT_JOINTS: Record<SegName, [JointName, JointName]> = {
  trunk: ["hip", "shoulder"],
  ...Object.fromEntries(SEGMENTS.map((s) => [s.seg, [s.from, s.to]])),
} as Record<SegName, [JointName, JointName]>;

export function drawFigure(
  skeleton: Skeleton,
  opts: FigureOptions,
  moving: ReadonlySet<SegName>,
  ghost = false
): Shape[] {
  const j = skeleton.joints;
  const tone = (seg: SegName): Tone => (ghost ? "ghost" : moving.has(seg) ? "moving" : "figure");
  const shapes: Shape[] = [];
  const front = opts.view === "front";
  for (const s of SEGMENTS) {
    if (s.layer !== "far") continue;
    shapes.push({ kind: "line", from: j[s.from], to: j[s.to], width: s.width, tone: tone(s.seg), layer: s.layer, seg: s.seg });
  }
  if (front) {
    // Shoulder and pelvis lines, so the figure reads from the front or above.
    const t = ghost ? "ghost" : "figure";
    shapes.push({ kind: "line", from: j.farShoulder, to: j.nearShoulder, width: 10, tone: t, layer: "body", seg: "trunk", part: "shoulders" });
    shapes.push({ kind: "line", from: j.farHip, to: j.nearHip, width: 12, tone: t, layer: "body", seg: "trunk", part: "pelvis" });
  }
  shapes.push({
    kind: "spine", from: j.hip, control: skeleton.spineControl, to: j.shoulder,
    width: front ? 22 : 16, tone: ghost ? "ghost" : moving.has("trunk") ? "moving" : "figure",
  });
  for (const s of SEGMENTS) {
    if (s.layer === "far") continue;
    shapes.push({ kind: "line", from: j[s.from], to: j[s.to], width: s.width, tone: tone(s.seg), layer: s.layer, seg: s.seg });
  }
  shapes.push({
    kind: "head", at: j.head, r: L.head, faceAngle: skeleton.faceAngle, view: opts.view,
    yaw: skeleton.pose.yaw ?? 0, tone: ghost ? "ghost" : "figure",
  });
  return shapes;
}

/** Segments that visibly move between the first and last keyframe. */
export function movingSegments(keys: readonly Pose[], opts: FigureOptions, threshold = 6): Set<SegName> {
  const samples = [0, 0.25, 0.5, 0.75, 1].map((p) => solve(poseAt(keys, p), opts).joints);
  const moved = (name: JointName) =>
    samples.some((s) => dist(s[name], samples[0][name]) > threshold);
  const out = new Set<SegName>();
  for (const [seg, [a, b]] of Object.entries(SEGMENT_JOINTS) as [SegName, [JointName, JointName]][]) {
    // A segment counts as moving when its distal joint moves relative to its proximal one.
    const rel = samples.some((s) => {
      const d0: Pt = [samples[0][b][0] - samples[0][a][0], samples[0][b][1] - samples[0][a][1]];
      const d1: Pt = [s[b][0] - s[a][0], s[b][1] - s[a][1]];
      return dist(d0, d1) > threshold;
    });
    if (rel || (seg === "trunk" && (moved("shoulder") || moved("hip")))) out.add(seg);
  }
  return out;
}
