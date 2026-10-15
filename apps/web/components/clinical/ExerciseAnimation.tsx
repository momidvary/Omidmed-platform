"use client";

import { useEffect, useRef, useState } from "react";
import { FLOOR, VIEW_W, dir, type Pt, type Shape } from "@/lib/animation/figure";
import { motionFor, type Motion } from "@/lib/animation/motions";
import { buildScene, type PropShape } from "@/lib/animation/scene";
import { cn } from "@/lib/utils";

type Lang = "fa" | "en";

const text = {
  fa: {
    play: "پخش", pause: "توقف", slow: "آهسته", endPose: "وضعیت پایانی",
    ready: "آماده", move: "انجام حرکت", back: "برگشت آرام", flow: "حرکت آرام و پیوسته",
    hold: (s: number) => `نگه دارید · ${s.toLocaleString("fa-IR")} ثانیه`,
    rep: (n: number) => `تکرار ${n.toLocaleString("fa-IR")}`,
    otherSide: "طرف دیگر",
    label: (name: string) => `نمایش متحرک تمرین ${name}`,
    note: "تصویر متحرک فقط راهنمای کلی حرکت است؛ دامنه، دوز و روش دقیق را طبق دستور درمانگر انجام دهید.",
  },
  en: {
    play: "Play", pause: "Pause", slow: "Slow", endPose: "End position",
    ready: "Ready", move: "Move", back: "Return slowly", flow: "Slow, continuous movement",
    hold: (s: number) => `Hold · ${s} s`,
    rep: (n: number) => `Rep ${n}`,
    otherSide: "other side",
    label: (name: string) => `Animated demonstration of ${name}`,
    note: "The animation shows the general movement only; follow your clinician's range, dose and technique.",
  },
};

const fmt = (p: Pt) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;

const toneStroke: Record<Shape["tone"], string> = {
  figure: "var(--color-ink)",
  moving: "var(--color-primary)",
  ghost: "var(--color-ink-faint)",
};

function FigureShapes({ shapes, ghost, headView }: { shapes: Shape[]; ghost?: boolean; headView: "side" | "front" | "top" }) {
  const dash = ghost ? { strokeDasharray: "3 5", strokeWidth: 2 } : {};
  return (
    <g opacity={ghost ? 0.7 : 1}>
      {shapes.map((s, i) => {
        if (s.kind === "line") {
          if (s.from[0] === s.to[0] && s.from[1] === s.to[1]) return null;
          return (
            <line
              key={i}
              x1={s.from[0]} y1={s.from[1]} x2={s.to[0]} y2={s.to[1]}
              stroke={toneStroke[s.tone]}
              strokeWidth={s.width}
              strokeLinecap="round"
              opacity={!ghost && s.layer === "far" ? 0.38 : ghost ? 1 : 0.85}
              {...dash}
            />
          );
        }
        if (s.kind === "spine") {
          return (
            <path
              key={i}
              d={`M${fmt(s.from)} Q${fmt(s.control)} ${fmt(s.to)}`}
              fill="none"
              stroke={toneStroke[s.tone]}
              strokeWidth={s.width}
              strokeLinecap="round"
              opacity={ghost ? 1 : 0.85}
              {...dash}
            />
          );
        }
        return <Head key={i} shape={s} ghost={ghost} view={headView} />;
      })}
    </g>
  );
}

function Head({ shape, ghost, view }: { shape: Extract<Shape, { kind: "head" }>; ghost?: boolean; view: "side" | "front" | "top" }) {
  const { at, r, faceAngle, yaw } = shape;
  if (ghost) {
    return <circle cx={at[0]} cy={at[1]} r={r} fill="none" stroke="var(--color-ink-faint)" strokeWidth={2} strokeDasharray="3 5" />;
  }
  const fill = "var(--color-ink)";
  if (view === "side") {
    const f = dir(faceAngle);
    const side = dir(faceAngle + 90);
    const tip: Pt = [at[0] + f[0] * (r + 4), at[1] + f[1] * (r + 4)];
    const a: Pt = [at[0] + f[0] * (r - 2) + side[0] * 4, at[1] + f[1] * (r - 2) + side[1] * 4];
    const b: Pt = [at[0] + f[0] * (r - 2) - side[0] * 3, at[1] + f[1] * (r - 2) - side[1] * 3];
    const eye: Pt = [at[0] + f[0] * 6 + side[0] * 4, at[1] + f[1] * 6 + side[1] * 4];
    return (
      <g opacity={0.85}>
        <circle cx={at[0]} cy={at[1]} r={r} fill={fill} />
        <polygon points={`${fmt(a)} ${fmt(tip)} ${fmt(b)}`} fill={fill} />
        <circle cx={eye[0]} cy={eye[1]} r={1.6} fill="var(--color-surface)" />
      </g>
    );
  }
  if (view === "top") {
    const f = dir(faceAngle - 90);
    const tip: Pt = [at[0] + f[0] * (r + 3), at[1] + f[1] * (r + 3)];
    return (
      <g opacity={0.85}>
        <circle cx={tip[0]} cy={tip[1]} r={3} fill={fill} />
        <circle cx={at[0]} cy={at[1]} r={r} fill={fill} />
        <circle cx={at[0] - f[0] * 2} cy={at[1] - f[1] * 2} r={r - 4} fill="var(--color-surface)" opacity={0.18} />
      </g>
    );
  }
  // Front: eyes and nose shift with the head turn.
  const across = dir(faceAngle);
  const up = dir(faceAngle + 90);
  const pt = (x: number, y: number): Pt => [at[0] + across[0] * x + up[0] * y, at[1] + across[1] * x + up[1] * y];
  const e1 = pt(yaw * 6 - 4.5, 2);
  const e2 = pt(yaw * 6 + 4.5, 2);
  const n1 = pt(yaw * 8, 0);
  const n2 = pt(yaw * 9.5, -3.5);
  return (
    <g opacity={0.85}>
      <circle cx={at[0]} cy={at[1]} r={r} fill={fill} />
      <circle cx={e1[0]} cy={e1[1]} r={1.6} fill="var(--color-surface)" />
      <circle cx={e2[0]} cy={e2[1]} r={1.6} fill="var(--color-surface)" />
      <line x1={n1[0]} y1={n1[1]} x2={n2[0]} y2={n2[1]} stroke="var(--color-surface)" strokeWidth={1.4} strokeLinecap="round" opacity={0.7} />
    </g>
  );
}

function PropShapes({ shapes }: { shapes: PropShape[] }) {
  return (
    <>
      {shapes.map((s, i) => {
        if (s.kind === "rect") {
          return (
            <rect
              key={i} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.tone === "wall" ? 0 : 3}
              fill={s.tone === "wall" ? "var(--color-border)" : "var(--color-surface-muted)"}
              stroke="var(--color-border)" strokeWidth={1.5}
            />
          );
        }
        if (s.kind === "circle") {
          return (
            <circle
              key={i} cx={s.at[0]} cy={s.at[1]} r={s.r}
              fill={s.tone === "weight" ? "var(--color-ink-soft)" : "var(--color-surface-muted)"}
              stroke="var(--color-border)" strokeWidth={1.5}
            />
          );
        }
        const stroke = s.tone === "band" ? "var(--color-warn)" : s.tone === "stick" ? "var(--color-ink-soft)" : "var(--color-border)";
        return (
          <line
            key={i} x1={s.from[0]} y1={s.from[1]} x2={s.to[0]} y2={s.to[1]}
            stroke={stroke} strokeWidth={s.width} strokeLinecap="round"
          />
        );
      })}
    </>
  );
}

/** One still frame; pure, so it can also be rendered on the server or in tests. */
export function ExerciseFigureSvg({
  motion, p, alternate = false, glow = 0.5, label, className,
}: {
  motion: Motion;
  p: number;
  alternate?: boolean;
  glow?: number;
  label?: string;
  className?: string;
}) {
  const scene = buildScene(motion, p, alternate);
  return (
    <svg
      viewBox={scene.viewBox}
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <rect x={-200} y={FLOOR} width={VIEW_W + 400} height={40} fill="var(--color-surface-muted)" />
      <line x1={-200} y1={FLOOR} x2={VIEW_W + 200} y2={FLOOR} stroke="var(--color-border)" strokeWidth={2} />
      <PropShapes shapes={scene.props} />
      {scene.track.length > 1 && (
        <polyline
          points={scene.track.map(fmt).join(" ")}
          fill="none" stroke="var(--color-primary)" strokeWidth={2} strokeDasharray="1 6"
          strokeLinecap="round" opacity={0.6}
        />
      )}
      <FigureShapes shapes={scene.ghost} ghost headView={scene.headView} />
      <FigureShapes shapes={scene.figure} headView={scene.headView} />
      {scene.glow.map((g, i) => (
        <line
          key={i} x1={g.from[0]} y1={g.from[1]} x2={g.to[0]} y2={g.to[1]}
          stroke="var(--color-accent)" strokeWidth={g.width} strokeLinecap="round"
          opacity={(0.15 + 0.7 * glow).toFixed(2)}
        />
      ))}
      <PropShapes shapes={scene.dynamic} />
    </svg>
  );
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

interface Frame { p: number; alternate: boolean; cue: string; rep: number }

function frameAt(motion: Motion, clock: number, holdSeconds: number | undefined, t: (typeof text)[Lang]): Frame {
  const moveMs = 1600 * (motion.tempo ?? 1);
  if (motion.mode === "cycle") {
    const period = moveMs * 2;
    const phase = (clock % period) / period;
    return { p: (1 - Math.cos(phase * 2 * Math.PI)) / 2, alternate: false, cue: t.flow, rep: Math.floor(clock / period) + 1 };
  }
  const hold = holdSeconds && holdSeconds > 0 ? holdSeconds : 0;
  const holdMs = hold ? Math.min(hold, 3) * 1000 : 500;
  const phases = [700, moveMs, holdMs, moveMs];
  const cycle = phases.reduce((a, b) => a + b, 0);
  const rep = Math.floor(clock / cycle);
  const alternate = Boolean(motion.alt) && rep % 2 === 1;
  let local = clock % cycle;
  const side = alternate ? ` · ${t.otherSide}` : "";
  if (local < phases[0]) return { p: 0, alternate, cue: t.ready + side, rep: rep + 1 };
  local -= phases[0];
  if (local < phases[1]) return { p: ease(local / phases[1]), alternate, cue: t.move + side, rep: rep + 1 };
  local -= phases[1];
  if (local < phases[2]) return { p: 1, alternate, cue: hold ? t.hold(hold) : t.move + side, rep: rep + 1 };
  local -= phases[2];
  return { p: 1 - ease(local / phases[3]), alternate, cue: t.back + side, rep: rep + 1 };
}

/**
 * Looping illustrative animation for one exercise. Respects reduced-motion
 * (starts paused), pauses while scrolled out of view, and offers slow-motion
 * and an end-position view. Renders nothing for an exercise without a motion.
 */
export function ExerciseAnimation({
  exerciseId, name, lang, holdSeconds, className,
}: {
  exerciseId: string;
  name: string;
  lang: Lang;
  holdSeconds?: number;
  className?: string;
}) {
  const motion = motionFor(exerciseId);
  const t = text[lang];
  const [playing, setPlaying] = useState(
    () => typeof window === "undefined" || !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
  const [slow, setSlow] = useState(false);
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
  const frame = frameAt(motion, clock, holdSeconds, t);

  function showEnd() {
    setPlaying(false);
    const moveMs = 1600 * (motion!.tempo ?? 1);
    // Land inside the hold phase (or the cycle's far point).
    setClock(motion!.mode === "cycle" ? moveMs : 700 + moveMs + 10);
  }

  return (
    <div ref={box} className={cn("rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3", className)}>
      <ExerciseFigureSvg
        motion={motion}
        p={frame.p}
        alternate={frame.alternate}
        glow={frame.p}
        label={t.label(name)}
        className="mx-auto block h-auto w-full max-w-md"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="min-h-5 text-sm font-medium text-[var(--color-primary-strong)]">
          {frame.cue}
          <span className="ms-2 text-xs font-normal text-[var(--color-ink-faint)]">{t.rep(frame.rep)}</span>
        </p>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setPlaying((v) => !v)}
            className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
          >
            {playing ? t.pause : t.play}
          </button>
          <button
            type="button"
            aria-pressed={slow}
            onClick={() => setSlow((v) => !v)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
              slow
                ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]"
                : "border-[var(--color-border)] text-[var(--color-ink-soft)]"
            )}
          >
            {t.slow}
          </button>
          <button
            type="button"
            onClick={showEnd}
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
          >
            {t.endPose}
          </button>
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-ink-faint)]">{t.note}</p>
    </div>
  );
}
