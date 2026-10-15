import {
  FLOOR, L, VIEW_H, VIEW_W, belly, dir, drawFigure, movingSegments, poseAt, solve,
  type FigureOptions, type JointName, type Pose, type Pt, type SegName, type Shape, type Skeleton, type Target,
} from "@/lib/animation/figure";
import type { Glow, Motion, Prop } from "@/lib/animation/motions";

export type PropShape =
  | { kind: "rect"; x: number; y: number; w: number; h: number; tone: "prop" | "wall" }
  | { kind: "line"; from: Pt; to: Pt; width: number; tone: "prop" | "band" | "stick" }
  | { kind: "circle"; at: Pt; r: number; tone: "prop" | "weight" };

export interface GlowShape { kind: "glow"; from: Pt; to: Pt; width: number }

export interface Scene {
  viewBox: string;
  floor: boolean;
  props: PropShape[];
  ghost: Shape[];
  figure: Shape[];
  dynamic: PropShape[];
  glow: GlowShape[];
  track: Pt[];
  headView: "side" | "front" | "top";
}

export function figureOptions(motion: Motion): FigureOptions {
  return { view: motion.view ?? "side", face: motion.face ?? 1 };
}

function staticProp(prop: Prop): PropShape[] {
  switch (prop.kind) {
    case "wall":
      return [{ kind: "rect", x: prop.side === "left" ? prop.x - 14 : prop.x, y: 0, w: 14, h: FLOOR, tone: "wall" }];
    case "box":
      return [{ kind: "rect", x: prop.x, y: FLOOR - prop.h, w: prop.w, h: prop.h, tone: "prop" }];
    case "chair":
      return [
        { kind: "rect", x: prop.x, y: FLOOR - 47, w: 48, h: 5, tone: "prop" },
        { kind: "line", from: [prop.x + 3, FLOOR - 42], to: [prop.x + 3, FLOOR], width: 4, tone: "prop" },
        { kind: "line", from: [prop.x + 45, FLOOR - 42], to: [prop.x + 45, FLOOR], width: 4, tone: "prop" },
        { kind: "line", from: [prop.x + 2, FLOOR - 47], to: [prop.x - 4, FLOOR - 112], width: 5, tone: "prop" },
      ];
    case "roll":
      return [{ kind: "circle", at: prop.at, r: prop.r, tone: "prop" }];
    case "post":
      return [{ kind: "line", from: [prop.at[0], prop.at[1] - 12], to: [prop.at[0], FLOOR], width: 6, tone: "prop" }];
    default:
      return [];
  }
}

function resolve(target: Target, joints: Record<JointName, Pt>): Pt {
  if (Array.isArray(target)) return target;
  const p = joints[target.joint];
  return [p[0] + (target.dx ?? 0), p[1] + (target.dy ?? 0)];
}

function dynamicProps(props: readonly Prop[], sk: Skeleton, opts: FigureOptions): PropShape[] {
  const out: PropShape[] = [];
  const j = sk.joints;
  for (const prop of props) {
    if (prop.kind === "band") out.push({ kind: "line", from: resolve(prop.from, j), to: resolve(prop.to, j), width: 3, tone: "band" });
    if (prop.kind === "stick") {
      const a = resolve(prop.from, j);
      const b = resolve(prop.to, j);
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 4) out.push({ kind: "circle", at: a, r: 5, tone: "weight" });
      else out.push({ kind: "line", from: a, to: b, width: 5, tone: "stick" });
    }
    if (prop.kind === "weight") out.push({ kind: "circle", at: resolve(prop.at, j), r: 6, tone: "weight" });
    if (prop.kind === "dowel") {
      const back = belly(sk.pose.trunk, opts.face).map((v) => -v) as Pt;
      const td = dir(sk.pose.trunk);
      const from: Pt = [j.hip[0] + back[0] * 11 - td[0] * 14, j.hip[1] + back[1] * 11 - td[1] * 14];
      const to: Pt = [j.head[0] + back[0] * 13 + td[0] * 10, j.head[1] + back[1] * 13 + td[1] * 10];
      out.push({ kind: "line", from, to, width: 4, tone: "stick" });
    }
  }
  return out;
}

function glowShapes(glow: readonly Glow[], sk: Skeleton, opts: FigureOptions): GlowShape[] {
  const j = sk.joints;
  const back = belly(sk.pose.trunk, opts.face).map((v) => -v) as Pt;
  const td = dir(sk.pose.trunk);
  const segs: Record<SegName, [JointName, JointName]> = {
    trunk: ["hip", "shoulder"], neck: ["shoulder", "head"],
    nearThigh: ["nearHip", "nearKnee"], nearShin: ["nearKnee", "nearAnkle"], nearFoot: ["nearAnkle", "nearToe"],
    farThigh: ["farHip", "farKnee"], farShin: ["farKnee", "farAnkle"], farFoot: ["farAnkle", "farToe"],
    nearUpperArm: ["nearShoulder", "nearElbow"], nearForearm: ["nearElbow", "nearWrist"],
    farUpperArm: ["farShoulder", "farElbow"], farForearm: ["farElbow", "farWrist"],
  };
  return glow.map((g) => {
    if (g === "glute") {
      const c: Pt = [j.hip[0] + back[0] * 6, j.hip[1] + back[1] * 6];
      return { kind: "glow", from: [c[0] - td[0] * 4, c[1] - td[1] * 4], to: [c[0] + td[0] * 10, c[1] + td[1] * 10], width: 12 };
    }
    if (g === "scapula") {
      const s = j.shoulder;
      return { kind: "glow", from: [s[0] + back[0] * 5 - td[0] * 22, s[1] + back[1] * 5 - td[1] * 22], to: [s[0] + back[0] * 5 - td[0] * 4, s[1] + back[1] * 5 - td[1] * 4], width: 9 };
    }
    const [a, b] = segs[g];
    const pa = j[a];
    const pb = j[b];
    // The neck ends at the head centre; stop short so the face stays visible.
    const [t0, t1] = g === "neck" ? [0.1, 0.45] : [0.15, 0.85];
    return { kind: "glow", from: [pa[0] + (pb[0] - pa[0]) * t0, pa[1] + (pb[1] - pa[1]) * t0], to: [pa[0] + (pb[0] - pa[0]) * t1, pa[1] + (pb[1] - pa[1]) * t1], width: 6 };
  });
}

const fitCache = new WeakMap<Motion, string>();

/**
 * Crop to the area the movement actually uses (figure, props and a strip of
 * floor), keeping the 5:3 frame, so a lying exercise is not a thin line at
 * the bottom of an empty box.
 */
function fittedViewBox(motion: Motion): string {
  const cached = fitCache.get(motion);
  if (cached) return cached;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const sk of sampleSkeletons(motion, 8)) {
    for (const p of Object.values(sk.joints)) {
      xs.push(p[0]);
      ys.push(p[1]);
    }
    xs.push(sk.joints.head[0] - L.head, sk.joints.head[0] + L.head);
    ys.push(sk.joints.head[1] - L.head - 4);
  }
  for (const shape of (motion.props ?? []).flatMap(staticProp)) {
    if (shape.kind === "rect" && shape.tone !== "wall") {
      xs.push(shape.x, shape.x + shape.w);
      ys.push(shape.y);
    }
    if (shape.kind === "circle") {
      xs.push(shape.at[0] - shape.r, shape.at[0] + shape.r);
      ys.push(shape.at[1] - shape.r);
    }
    if (shape.kind === "line") {
      xs.push(shape.from[0], shape.to[0]);
      ys.push(Math.min(shape.from[1], shape.to[1]));
    }
  }
  const pad = 16;
  let x0 = Math.min(...xs) - pad;
  let x1 = Math.max(...xs) + pad;
  let y0 = Math.min(...ys) - pad;
  const y1 = FLOOR + 10;
  let w = x1 - x0;
  let h = y1 - y0;
  const ratio = VIEW_W / VIEW_H;
  if (w < 180) {
    x0 -= (180 - w) / 2;
    x1 += (180 - w) / 2;
    w = 180;
  }
  if (w / h > ratio) {
    y0 = y1 - w / ratio;
    h = y1 - y0;
  } else {
    const nw = h * ratio;
    x0 -= (nw - w) / 2;
    w = nw;
  }
  const box = `${x0.toFixed(1)} ${y0.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`;
  fitCache.set(motion, box);
  return box;
}

function viewBox(motion: Motion): string {
  if (!motion.zoom) return fittedViewBox(motion);
  const w = VIEW_W / motion.zoom.scale;
  const h = VIEW_H / motion.zoom.scale;
  const x = Math.min(VIEW_W - w, Math.max(0, motion.zoom.at[0] - w / 2));
  const y = Math.min(VIEW_H - h, Math.max(0, motion.zoom.at[1] - h / 2));
  return `${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`;
}

export function keysFor(motion: Motion, alternate: boolean): readonly Pose[] {
  return alternate && motion.alt ? motion.alt : motion.keys;
}

const movingCache = new WeakMap<readonly Pose[], Set<SegName>>();
const trackCache = new WeakMap<readonly Pose[], Pt[]>();

/** Everything needed to draw one frame at progress p (0 = start, 1 = end). */
export function buildScene(motion: Motion, p: number, alternate = false): Scene {
  const opts = figureOptions(motion);
  const keys = keysFor(motion, alternate);
  let moving = movingCache.get(keys);
  if (!moving) {
    moving = movingSegments(keys, opts);
    movingCache.set(keys, moving);
  }
  const current = solve(poseAt(keys, p), opts);
  const end = solve(keys[keys.length - 1], opts);
  let track: Pt[] = [];
  if (motion.track) {
    const cached = trackCache.get(keys);
    if (cached) track = cached;
    else {
      track = Array.from({ length: 33 }, (_, i) => solve(poseAt(keys, i / 32), opts).joints[motion.track!]);
      trackCache.set(keys, track);
    }
  }
  const props = motion.props ?? [];
  return {
    viewBox: viewBox(motion),
    floor: true,
    props: props.flatMap(staticProp),
    ghost: moving.size > 0 ? drawFigure(end, opts, moving, true) : [],
    figure: drawFigure(current, opts, moving),
    dynamic: dynamicProps(props, current, opts),
    glow: glowShapes(motion.glow ?? [], current, opts),
    track,
    headView: motion.head ?? (opts.view === "front" ? "front" : "side"),
  };
}

/** All joints over a sampled movement, for bounds checks in tests. */
export function sampleSkeletons(motion: Motion, steps = 16): Skeleton[] {
  const opts = figureOptions(motion);
  const out: Skeleton[] = [];
  for (const keys of motion.alt ? [motion.keys, motion.alt] : [motion.keys]) {
    for (let i = 0; i <= steps; i++) out.push(solve(poseAt(keys, i / steps), opts));
  }
  return out;
}
