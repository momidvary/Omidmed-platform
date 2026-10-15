"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FLOOR, dir, type Pt, type SegName, type Shape } from "@/lib/animation/figure";
import { motionFor, type Motion } from "@/lib/animation/motions";
import { buildScene, type GlowShape, type PropShape, type Scene } from "@/lib/animation/scene";
import { cn } from "@/lib/utils";

/*
 * "Coach in the gym" rendering of the shared animation engine: the same
 * keyframes drive every exercise, drawn as an athlete in a gym (or seen from
 * above on the gym floor for rotation exercises). Colours are fixed rather
 * than themed because the stage is its own dark-framed scene.
 */

type Lang = "fa" | "en";

const text = {
  fa: {
    play: "پخش نمایش", pause: "توقف نمایش", slow: "آهسته ۰٫۵×", normal: "عادی ۱×", speed: "سرعت نمایش",
    guide: "خط راهنما", endPose: "وضعیت پایانی",
    phases: ["۱ · انجام حرکت", "۲ · نگه دارید", "۳ · آرام برگردید"],
    pause2: "۲ · مکث کوتاه",
    flow: "حرکت آرام و پیوسته",
    rep: "تکرار فعلی",
    of: (n: number) => `از ${n.toLocaleString("fa-IR")}`,
    num: (n: number) => n.toLocaleString("fa-IR"),
    otherSide: "طرف دیگر",
    hold: (s: number) => `نگه‌داشتن ${s.toLocaleString("fa-IR")} ثانیه`,
    view: { side: "نمای نیم‌رخ", front: "نمای روبه‌رو", top: "نمای از بالا" },
    simulated: "شبیه‌سازی گرافیکی",
    label: (name: string) => `نمایش متحرک تمرین ${name}`,
    note: "این نمایش برای یادآوری شکل کلی حرکت است؛ دامنه، دوز و روش دقیق را طبق دستور درمانگر انجام دهید.",
  },
  en: {
    play: "Play", pause: "Pause", slow: "Slow 0.5×", normal: "Normal 1×", speed: "Playback speed",
    guide: "Guide line", endPose: "End position",
    phases: ["1 · Move", "2 · Hold", "3 · Return slowly"],
    pause2: "2 · Brief pause",
    flow: "Slow, continuous movement",
    rep: "Current rep",
    of: (n: number) => `of ${n}`,
    num: (n: number) => String(n),
    otherSide: "other side",
    hold: (s: number) => `hold ${s} s`,
    view: { side: "Side view", front: "Front view", top: "Seen from above" },
    simulated: "graphic simulation",
    label: (name: string) => `Animated demonstration of ${name}`,
    note: "The animation shows the general movement only; follow your clinician's range, dose and technique.",
  },
};

/* ── Palette ───────────────────────────────────────────────────── */

const C = {
  skin: "#C08460", skinFar: "#9E6848", hair: "#1E1A17",
  shirt: "#1F3A34", shorts: "#20242A", shortsFar: "#121418",
  shoe: "#F4F4F2", shoeFar: "#D2D4D2", shoeEdge: "#C9CCD0",
  wallTop: "#ECE8E1", wallBottom: "#DCD6CC", wood: "#C49A6C", woodLine: "#B08559",
  frame: "#2B3035", glassTop: "#FBFDFD", glassBottom: "#D5E5E7", bars: "#B68A5C", rungs: "#CFA779",
  floorTop: "#4C5157", floorBottom: "#2C3035", floorLine: "#575C62",
  mat: "#127A66", matEdge: "#0A5446", box: "#3B3F44", boxTop: "#5A6066",
  band: "#E4572E", glow: "#F08A3C", guide: "#0E7C66", track: "#F2A541",
};

const fmt = (p: Pt) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
const along = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

const SEG_STYLE: Partial<Record<SegName, { width: number; color: string; cover?: { color: string; to: number; extra: number } }>> = {
  farThigh: { width: 14, color: C.skinFar, cover: { color: C.shortsFar, to: 0.5, extra: 2 } },
  farShin: { width: 11, color: C.skinFar },
  farFoot: { width: 7, color: C.shoeFar },
  farUpperArm: { width: 9, color: C.skinFar, cover: { color: C.shirt, to: 0.42, extra: 2 } },
  farForearm: { width: 8, color: C.skinFar },
  neck: { width: 8, color: C.skin },
  nearThigh: { width: 15, color: C.skin, cover: { color: C.shorts, to: 0.5, extra: 2 } },
  nearShin: { width: 12, color: C.skin },
  nearFoot: { width: 8, color: C.shoe },
  nearUpperArm: { width: 10, color: C.skin, cover: { color: C.shirt, to: 0.42, extra: 2 } },
  nearForearm: { width: 9, color: C.skin },
};

/* ── Scenery ───────────────────────────────────────────────────── */

function Backdrop({ scene, ids }: { scene: Scene; ids: Record<string, string> }) {
  const [x0, y0, w, h] = scene.box;
  const bottom = y0 + h + 4;
  if (scene.backdrop === "floor") {
    const lines = Array.from({ length: 8 }, (_, i) => y0 + ((i + 1) * h) / 8);
    return (
      <g aria-hidden="true">
        <rect x={x0 - 4} y={y0 - 4} width={w + 8} height={h + 8} fill={`url(#${ids.floor})`} />
        {lines.map((y) => <line key={y} x1={x0 - 4} y1={y} x2={x0 + w + 4} y2={y} stroke={C.floorLine} strokeWidth={0.6} />)}
      </g>
    );
  }
  const s = w / 400; // decor scale
  const pos = (v: number) => Math.max(0, v);
  const barTop = Math.max(y0, FLOOR - 150 * s);
  const winX = x0 + w * 0.05;
  const winY = Math.max(y0 + h * 0.06, FLOOR - 190 * s);
  const winW = 92 * s;
  const winH = Math.min(84 * s, FLOOR - winY - 40 * s);
  const barX = x0 + w * 0.62;
  const panelX = x0 + w * 0.82;
  return (
    <g aria-hidden="true">
      <rect x={x0 - 4} y={y0 - 4} width={w + 8} height={pos(Math.min(FLOOR, y0 + h) - y0 + 8)} fill={`url(#${ids.wall})`} />
      <rect x={panelX} y={y0 - 4} width={w * 0.18 + 4} height={pos(Math.min(FLOOR, y0 + h) - y0 + 8)} fill={C.wood} />
      {[0.2, 0.4, 0.6, 0.8].map((t) => (
        <line key={t} x1={panelX + w * 0.18 * t} y1={y0 - 4} x2={panelX + w * 0.18 * t} y2={FLOOR} stroke={C.woodLine} strokeWidth={0.8 * s} />
      ))}
      {winH > 20 * s && winY + winH < y0 + h && (
        <>
          <rect x={winX} y={winY} width={winW} height={winH} rx={2 * s} fill={C.frame} />
          <rect x={winX + 3 * s} y={winY + 3 * s} width={winW / 2 - 4.5 * s} height={winH - 6 * s} fill={`url(#${ids.glass})`} />
          <rect x={winX + winW / 2 + 1.5 * s} y={winY + 3 * s} width={winW / 2 - 4.5 * s} height={winH - 6 * s} fill={`url(#${ids.glass})`} />
        </>
      )}
      <rect x={barX} y={barTop} width={3.5 * s} height={pos(FLOOR - barTop)} fill={C.bars} />
      <rect x={barX + 34 * s} y={barTop} width={3.5 * s} height={pos(FLOOR - barTop)} fill={C.bars} />
      {Array.from({ length: 6 }, (_, i) => FLOOR - 18 * s - i * 22 * s)
        .filter((y) => y > y0)
        .map((y) => <rect key={y} x={barX + 3.5 * s} y={y} width={30.5 * s} height={2.5 * s} fill={C.rungs} />)}
      <rect x={x0 - 4} y={FLOOR - 1.5} width={w + 8} height={3} fill={C.frame} />
      <rect x={x0 - 4} y={FLOOR + 1.5} width={w + 8} height={pos(bottom - FLOOR)} fill={`url(#${ids.floor})`} />
      {[0.35, 0.75].map((t) => (
        <line key={t} x1={x0 - 4} y1={FLOOR + 1.5 + (bottom - FLOOR) * t} x2={x0 + w + 4} y2={FLOOR + 1.5 + (bottom - FLOOR) * t} stroke={C.floorLine} strokeWidth={0.6} />
      ))}
      {scene.mat && (
        <>
          <polygon
            points={`${scene.mat.x0 + 6},${FLOOR - 2} ${scene.mat.x1 - 6},${FLOOR - 2} ${scene.mat.x1},${FLOOR + 6} ${scene.mat.x0},${FLOOR + 6}`}
            fill={C.mat}
          />
          <rect x={scene.mat.x0} y={FLOOR + 6} width={scene.mat.x1 - scene.mat.x0} height={2} fill={C.matEdge} />
        </>
      )}
    </g>
  );
}

function Props({ shapes }: { shapes: PropShape[] }) {
  return (
    <>
      {shapes.map((s, i) => {
        if (s.kind === "rect") {
          if (s.tone === "wall") {
            return <rect key={i} x={s.x} y={s.y - 400} width={s.w} height={s.h + 400} fill="#D3CCC1" stroke="#B9B1A5" strokeWidth={1} />;
          }
          return (
            <g key={i}>
              <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={2} fill={C.box} />
              <rect x={s.x} y={s.y} width={s.w} height={Math.min(4, s.h)} rx={2} fill={C.boxTop} />
            </g>
          );
        }
        if (s.kind === "circle") {
          if (s.tone === "weight") return <circle key={i} cx={s.at[0]} cy={s.at[1]} r={s.r} fill="#1C1F23" stroke="#5A6066" strokeWidth={1.5} />;
          return (
            <g key={i}>
              <circle cx={s.at[0]} cy={s.at[1]} r={s.r} fill={C.mat} />
              <circle cx={s.at[0]} cy={s.at[1]} r={s.r * 0.45} fill="none" stroke="#3FA48E" strokeWidth={1.2} />
            </g>
          );
        }
        const stroke = s.tone === "band" ? C.band : s.tone === "stick" ? C.bars : C.frame;
        return (
          <line key={i} x1={s.from[0]} y1={s.from[1]} x2={s.to[0]} y2={s.to[1]}
            stroke={stroke} strokeWidth={s.tone === "band" ? 3.5 : s.width} strokeLinecap="round" />
        );
      })}
    </>
  );
}

/* ── The athlete ───────────────────────────────────────────────── */

function Head({ shape, view }: { shape: Extract<Shape, { kind: "head" }>; view: "side" | "front" | "top" }) {
  const { at, r, faceAngle, yaw } = shape;
  if (view === "top") {
    const f = dir(faceAngle - 90);
    return (
      <g>
        <circle cx={at[0] + f[0] * (r - 1)} cy={at[1] + f[1] * (r - 1)} r={3.4} fill={C.skin} />
        <circle cx={at[0]} cy={at[1]} r={r} fill={C.hair} />
      </g>
    );
  }
  const f = dir(faceAngle);
  const up = dir(faceAngle + 90);
  if (view === "side") {
    const back: Pt = [at[0] - f[0] * 2.5 + up[0] * 2, at[1] - f[1] * 2.5 + up[1] * 2];
    const tip: Pt = [at[0] + f[0] * (r + 3.5) + up[0] * 1, at[1] + f[1] * (r + 3.5) + up[1] * 1];
    const n1: Pt = [at[0] + f[0] * (r - 2) + up[0] * 4, at[1] + f[1] * (r - 2) + up[1] * 4];
    const n2: Pt = [at[0] + f[0] * (r - 2) - up[0] * 2, at[1] + f[1] * (r - 2) - up[1] * 2];
    const ear: Pt = [at[0] - f[0] * 1.5, at[1] - f[1] * 1.5];
    return (
      <g>
        <circle cx={back[0]} cy={back[1]} r={r + 0.5} fill={C.hair} />
        <circle cx={at[0] + f[0] * 1.5} cy={at[1] + f[1] * 1.5} r={r - 0.5} fill={C.skin} />
        <polygon points={`${fmt(n1)} ${fmt(tip)} ${fmt(n2)}`} fill={C.skin} />
        <ellipse cx={ear[0]} cy={ear[1]} rx={2.6} ry={3.2} fill="#A86E4C" />
        <circle cx={at[0] + f[0] * 6 + up[0] * 3.5} cy={at[1] + f[1] * 6 + up[1] * 3.5} r={1.4} fill={C.hair} />
      </g>
    );
  }
  const pt = (x: number, y: number): Pt => [at[0] + f[0] * x + up[0] * y, at[1] + f[1] * x + up[1] * y];
  const cap = pt(0, 3);
  const e1 = pt(yaw * 6 - 4.5, 1);
  const e2 = pt(yaw * 6 + 4.5, 1);
  const n1 = pt(yaw * 8, -1);
  const n2 = pt(yaw * 9, -4);
  return (
    <g>
      <circle cx={cap[0]} cy={cap[1]} r={r + 0.5} fill={C.hair} />
      <circle cx={at[0]} cy={at[1] } r={r - 0.5} fill={C.skin} />
      <circle cx={e1[0]} cy={e1[1]} r={1.5} fill={C.hair} />
      <circle cx={e2[0]} cy={e2[1]} r={1.5} fill={C.hair} />
      <line x1={n1[0]} y1={n1[1]} x2={n2[0]} y2={n2[1]} stroke="#A86E4C" strokeWidth={1.4} strokeLinecap="round" />
    </g>
  );
}

function Athlete({ shapes, headView }: { shapes: Shape[]; headView: "side" | "front" | "top" }) {
  return (
    <g>
      {shapes.map((s, i) => {
        if (s.kind === "head") return <Head key={i} shape={s} view={headView} />;
        if (s.kind === "spine") {
          return (
            <path key={i} d={`M${fmt(s.from)} Q${fmt(s.control)} ${fmt(s.to)}`} fill="none"
              stroke={C.shirt} strokeWidth={s.width + 4} strokeLinecap="round" />
          );
        }
        if (s.from[0] === s.to[0] && s.from[1] === s.to[1]) return null;
        if (s.part) {
          return (
            <line key={i} x1={s.from[0]} y1={s.from[1]} x2={s.to[0]} y2={s.to[1]}
              stroke={s.part === "shoulders" ? C.shirt : C.shorts} strokeWidth={s.width + 4} strokeLinecap="round" />
          );
        }
        const style = SEG_STYLE[s.seg];
        if (!style) return null;
        const isFoot = s.seg === "nearFoot" || s.seg === "farFoot";
        const isForearm = s.seg === "nearForearm" || s.seg === "farForearm";
        return (
          <g key={i}>
            <line x1={s.from[0]} y1={s.from[1]} x2={s.to[0]} y2={s.to[1]}
              stroke={style.color} strokeWidth={style.width} strokeLinecap="round" />
            {isFoot && s.seg === "nearFoot" && (
              <line x1={s.from[0]} y1={s.from[1]} x2={s.to[0]} y2={s.to[1]}
                stroke={C.shoeEdge} strokeWidth={1.2} strokeLinecap="round" opacity={0.9} />
            )}
            {style.cover && (() => {
              const end = along(s.from, s.to, style.cover.to);
              return <line x1={s.from[0]} y1={s.from[1]} x2={end[0]} y2={end[1]}
                stroke={style.cover.color} strokeWidth={style.width + style.cover.extra} strokeLinecap="round" />;
            })()}
            {isForearm && <circle cx={s.to[0]} cy={s.to[1]} r={style.width / 2 + 0.8} fill={style.color} />}
          </g>
        );
      })}
    </g>
  );
}

function Guide({ scene }: { scene: Scene }) {
  return (
    <g aria-hidden="true" opacity={0.85}>
      {scene.track.length > 1 && (
        <polyline points={scene.track.map(fmt).join(" ")} fill="none" stroke={C.track}
          strokeWidth={2.2} strokeDasharray="1 6" strokeLinecap="round" />
      )}
      {scene.ghost.map((s, i) => {
        if (s.kind === "head") return <circle key={i} cx={s.at[0]} cy={s.at[1]} r={s.r} fill="none" stroke={C.guide} strokeWidth={1.8} strokeDasharray="3 4" />;
        if (s.kind === "spine") return <path key={i} d={`M${fmt(s.from)} Q${fmt(s.control)} ${fmt(s.to)}`} fill="none" stroke={C.guide} strokeWidth={1.8} strokeDasharray="3 4" />;
        if (s.from[0] === s.to[0] && s.from[1] === s.to[1]) return null;
        return <line key={i} x1={s.from[0]} y1={s.from[1]} x2={s.to[0]} y2={s.to[1]} stroke={C.guide} strokeWidth={1.8} strokeDasharray="3 4" strokeLinecap="round" />;
      })}
    </g>
  );
}

function Glow({ glow, level, filter }: { glow: GlowShape[]; level: number; filter: string }) {
  return (
    <g filter={`url(#${filter})`} aria-hidden="true">
      {glow.map((g, i) => (
        <line key={i} x1={g.from[0]} y1={g.from[1]} x2={g.to[0]} y2={g.to[1]}
          stroke={C.glow} strokeWidth={g.width + 4} strokeLinecap="round" opacity={(0.1 + 0.7 * level).toFixed(2)} />
      ))}
    </g>
  );
}

/** One still frame of the coach in the gym; also used for library thumbnails. */
export function ExerciseFigureSvg({
  motion, p, alternate = false, glow = 0.5, guide = true, label, className,
}: {
  motion: Motion;
  p: number;
  alternate?: boolean;
  glow?: number;
  guide?: boolean;
  label?: string;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ids = { wall: `w${uid}`, glass: `g${uid}`, floor: `f${uid}`, blur: `b${uid}` };
  const scene = buildScene(motion, p, alternate);
  return (
    <svg
      viewBox={scene.viewBox}
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id={ids.wall} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.wallTop} /><stop offset="1" stopColor={C.wallBottom} /></linearGradient>
        <linearGradient id={ids.glass} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.glassTop} /><stop offset="1" stopColor={C.glassBottom} /></linearGradient>
        <linearGradient id={ids.floor} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.floorTop} /><stop offset="1" stopColor={C.floorBottom} /></linearGradient>
        <filter id={ids.blur} filterUnits="userSpaceOnUse" x="-1000" y="-1000" width="3000" height="3000"><feGaussianBlur stdDeviation="3.5" /></filter>
      </defs>
      <Backdrop scene={scene} ids={ids} />
      <Props shapes={scene.props} />
      {guide && <Guide scene={scene} />}
      <Athlete shapes={scene.figure} headView={scene.headView} />
      <Glow glow={scene.glow} level={glow} filter={ids.blur} />
      <Props shapes={scene.dynamic} />
    </svg>
  );
}

/* ── Player ────────────────────────────────────────────────────── */

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export interface Frame {
  p: number;
  alternate: boolean;
  /** 0 ready, 1 move, 2 hold, 3 return; -1 continuous. */
  phase: number;
  rep: number;
  /** Progress through the current repetition, 0 … 1. */
  progress: number;
}

export function frameAt(motion: Motion, clock: number, holdSeconds: number | undefined): Frame {
  const moveMs = 1600 * (motion.tempo ?? 1);
  if (motion.mode === "cycle") {
    const period = moveMs * 2;
    const phase = (clock % period) / period;
    return { p: (1 - Math.cos(phase * 2 * Math.PI)) / 2, alternate: false, phase: -1, rep: Math.floor(clock / period) + 1, progress: phase };
  }
  const holdMs = holdSeconds && holdSeconds > 0 ? Math.min(holdSeconds, 3) * 1000 : 500;
  const phases = [700, moveMs, holdMs, moveMs];
  const cycle = phases.reduce((a, b) => a + b, 0);
  const rep = Math.floor(clock / cycle);
  const alternate = Boolean(motion.alt) && rep % 2 === 1;
  let local = clock % cycle;
  const progress = local / cycle;
  const base = { alternate, rep: rep + 1, progress };
  if (local < phases[0]) return { ...base, p: 0, phase: 0 };
  local -= phases[0];
  if (local < phases[1]) return { ...base, p: ease(local / phases[1]), phase: 1 };
  local -= phases[1];
  if (local < phases[2]) return { ...base, p: 1, phase: 2 };
  local -= phases[2];
  return { ...base, p: 1 - ease(local / phases[3]), phase: 3 };
}

/**
 * Looping coach animation for one exercise. Starts paused for reduced-motion
 * users, pauses while scrolled out of view, and offers half speed, a guide
 * line (end position and movement path) and an end-position view. Renders
 * nothing for an exercise without a motion.
 */
export function ExerciseAnimation({
  exerciseId, name, lang, holdSeconds, reps, className,
}: {
  exerciseId: string;
  name: string;
  lang: Lang;
  holdSeconds?: number;
  /** Target repetitions, shown as "rep n of N" when known. */
  reps?: number;
  className?: string;
}) {
  const motion = motionFor(exerciseId);
  const t = text[lang];
  const [playing, setPlaying] = useState(
    () => typeof window === "undefined" || !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
  const [slow, setSlow] = useState(false);
  const [guide, setGuide] = useState(true);
  const [visible, setVisible] = useState(true);
  const [clock, setClock] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = box.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!playing || !visible) return;
    let last: number | null = null;
    let raf = requestAnimationFrame(function tick(now) {
      if (last !== null) {
        const delta = Math.min(100, now - last) * (slow ? 0.5 : 1);
        setClock((c) => c + delta);
      }
      last = now;
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [playing, visible, slow]);

  if (!motion) return null;
  const frame = frameAt(motion, clock, holdSeconds);
  const hold = holdSeconds && holdSeconds > 0 ? holdSeconds : 0;
  const view = motion.head === "top" && motion.backdrop === "floor" ? "top" : motion.view ?? "side";
  const repShown = reps ? ((frame.rep - 1) % reps) + 1 : frame.rep;

  function showEnd() {
    setPlaying(false);
    const moveMs = 1600 * (motion!.tempo ?? 1);
    // Land inside the hold phase (or the cycle's far point).
    setClock(motion!.mode === "cycle" ? moveMs : 700 + moveMs + 10);
  }

  const chips = motion.mode === "cycle" ? [t.flow] : [t.phases[0], hold ? t.phases[1] : t.pause2, t.phases[2]];
  const activeChip = motion.mode === "cycle" ? 0 : frame.phase - 1;

  return (
    <div ref={box} className={cn("space-y-3", className)}>
      <div className="relative overflow-hidden rounded-2xl bg-[#14211D]">
        <ExerciseFigureSvg
          motion={motion}
          p={frame.p}
          alternate={frame.alternate}
          glow={frame.p}
          guide={guide}
          label={t.label(name)}
          className="block aspect-[5/3] h-auto w-full"
        />
        <div className="absolute inset-x-2.5 top-2.5 flex gap-1 rounded-full bg-[#14211D]/80 p-1" aria-hidden="true">
          {chips.map((chip, i) => (
            <span
              key={chip}
              className={cn(
                "flex-1 truncate rounded-full px-2 py-1 text-center text-[11px] font-semibold transition-colors sm:text-xs",
                i === activeChip ? "bg-white text-[#14211D]" : "bg-white/10 text-white"
              )}
            >
              {chip}
            </span>
          ))}
        </div>
        <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20" aria-hidden="true">
          <div className="h-1 bg-[#F2A541] ltr:origin-left rtl:origin-right" style={{ transform: `scaleX(${frame.progress.toFixed(3)})` }} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setPlaying((v) => !v)}
          aria-label={playing ? t.pause : t.play}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#14211D] text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
        >
          {playing ? (
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" /><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" /></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="rtl:-scale-x-100"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
          )}
        </button>
        <div className="me-auto min-w-24 leading-tight">
          <span className="block text-xs text-[var(--color-ink-soft)]">
            {t.rep}{frame.alternate ? ` · ${t.otherSide}` : ""}
          </span>
          <span className="text-base font-bold text-[var(--color-ink)]">
            {t.num(repShown)}{reps ? ` ${t.of(reps)}` : ""}
          </span>
          {hold > 0 && motion.mode !== "cycle" && (
            <span className="ms-2 text-xs text-[var(--color-ink-soft)]">{t.hold(hold)}</span>
          )}
        </div>
        <div role="group" aria-label={t.speed} className="flex rounded-xl bg-[var(--color-surface-muted)] p-1">
          {([[true, t.slow], [false, t.normal]] as const).map(([value, label]) => (
            <button
              key={label}
              type="button"
              aria-pressed={slow === value}
              onClick={() => setSlow(value)}
              className={cn(
                "min-h-9 rounded-lg px-3 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]",
                slow === value ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-sm" : "text-[var(--color-ink-soft)]"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={guide}
          onClick={() => setGuide((v) => !v)}
          className={cn(
            "min-h-11 rounded-xl border px-3 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
            guide ? "border-[#F2A541] bg-[#FFF4E3] text-[#14211D]" : "border-[var(--color-border)] text-[var(--color-ink-soft)]"
          )}
        >
          {t.guide}
        </button>
        <button
          type="button"
          onClick={showEnd}
          className="min-h-11 rounded-xl border border-[var(--color-border)] px-3 text-xs font-semibold text-[var(--color-ink-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
        >
          {t.endPose}
        </button>
      </div>
      <p className="text-[11px] leading-relaxed text-[var(--color-ink-faint)]">
        {t.view[view]} · {t.simulated}. {t.note}
      </p>
    </div>
  );
}
