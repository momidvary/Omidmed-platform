"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { pickText } from "@/lib/i18n/text";
import type { Locale } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";
import { COACH_STILL_POSES, coachDemoKind, type CoachPose, type CoachTone } from "./coachPoses";
import { coachDemoText } from "./coachDemoText";
import styles from "./CoachDemo.module.css";

const SKIN = "#C08460";
const SKIN_FAR = "#9E6848";
const SHIRT = "#1F3A34";
const SHORTS = "#20242A";
const SHOE = "#F4F4F2";
const CUE = "#F2A541";

const TONES: Record<CoachTone, string> = {
  skin: SKIN,
  skinFar: SKIN_FAR,
  shirt: SHIRT,
  shorts: SHORTS,
  shoe: SHOE,
  shoeFar: "#D2D4D2",
};

/**
 * Coach demonstration for an exercise: a looping animation where one exists,
 * otherwise a still of the key position, otherwise nothing. It is an
 * illustration only; it never observes or analyses the patient.
 */
export function CoachDemo({
  exerciseId,
  name,
  locale,
  className,
}: {
  exerciseId: string;
  name: string;
  locale: Locale;
  className?: string;
}) {
  const kind = coachDemoKind(exerciseId);
  if (kind === "animated") return <AnimatedBridge name={name} locale={locale} className={className} />;
  if (kind === "still") {
    return (
      <StillPose pose={COACH_STILL_POSES[exerciseId]} name={name} locale={locale} className={className} />
    );
  }
  return null;
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION).matches,
    () => false
  );
}

function AnimatedBridge({ name, locale, className }: { name: string; locale: Locale; className?: string }) {
  const t = pickText(coachDemoText, locale);
  const reducedMotion = usePrefersReducedMotion();
  // Until the viewer chooses, play unless they asked the system for less motion.
  const [choice, setChoice] = useState<boolean | null>(null);
  const playing = choice ?? !reducedMotion;
  const [slow, setSlow] = useState(false);
  const [guide, setGuide] = useState(true);
  const [reps, setReps] = useState(0);
  const ids = useSvgIds();

  return (
    <section aria-label={t.region(name)} className={cn("space-y-2", className)}>
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl bg-[#14211D]",
          !playing && styles.paused,
          slow && styles.slow,
          !guide && styles.noGuide
        )}
      >
        <svg viewBox="0 0 800 450" className="block h-auto w-full" role="img" aria-label={t.sceneAlt(name)}>
          <GymBackdrop ids={ids} />
          <BridgeCoach guideLine={t.guideLine} />
        </svg>
        <div
          aria-hidden="true"
          className="absolute inset-x-2 top-2 flex justify-center gap-1 rounded-full bg-[#14211D]/80 p-1 sm:inset-x-auto sm:start-3 sm:top-3"
        >
          {t.phases.map((label, i) => (
            <span
              key={label}
              className={cn(
                styles.anim,
                styles.chip,
                [styles.phase1, styles.phase2, styles.phase3][i],
                "flex-1 rounded-full px-2.5 py-1 text-center text-[11px] font-semibold whitespace-nowrap sm:flex-none sm:text-xs"
              )}
            >
              {label}
            </span>
          ))}
        </div>
        <span className="absolute bottom-3 end-3 hidden rounded-full bg-[#14211D]/80 px-2.5 py-1 text-[11px] font-medium text-white sm:block">
          {t.simulated}
        </span>
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
          <div
            className={cn(styles.anim, styles.progress, "h-1 bg-[#F2A541]")}
            onAnimationIteration={() => setReps((n) => n + 1)}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
        <button
          type="button"
          onClick={() => setChoice(!playing)}
          aria-label={playing ? t.pause : t.play}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--color-ink)] text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            {playing ? (
              <>
                <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
                <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
              </>
            ) : (
              <path d="M8 5v14l11-7z" fill="currentColor" />
            )}
          </svg>
        </button>
        <span className="text-sm font-semibold text-[var(--color-ink)]" aria-live="off">
          {t.repetition(reps + 1)}
        </span>
        <span className="flex-1" />
        <div role="group" aria-label={t.speed} className="flex gap-1 rounded-lg bg-[var(--color-surface-muted)] p-1">
          {[
            { label: t.slow, active: slow, value: true },
            { label: t.normal, active: !slow, value: false },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              aria-pressed={option.active}
              onClick={() => setSlow(option.value)}
              className={cn(
                "min-h-9 rounded-md px-2.5 text-xs font-semibold text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]",
                option.active && "bg-[var(--color-surface)] shadow-sm"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={guide}
          onClick={() => setGuide(!guide)}
          className={cn(
            "flex min-h-11 items-center gap-2 rounded-lg border px-3 text-xs font-semibold text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]",
            guide ? "border-[#F2A541] bg-[#FFF4E3]" : "border-[var(--color-border)] bg-[var(--color-surface)]"
          )}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 19 L20 5" strokeDasharray="3 3" />
            <circle cx="4" cy="19" r="2" />
            <circle cx="20" cy="5" r="2" />
          </svg>
          {t.guide}
        </button>
      </div>
      <p className="text-xs text-[var(--color-ink-faint)]">{t.note}</p>
    </section>
  );
}

function useSvgIds() {
  const base = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return { wall: `${base}-wall`, window: `${base}-win`, beam: `${base}-beam`, floor: `${base}-floor` };
}

const SLATS = Array.from({ length: 14 }, (_, i) => 574 + i * 16);
const RUNGS = Array.from({ length: 10 }, (_, i) => 84 + i * 24);

function GymBackdrop({ ids }: { ids: ReturnType<typeof useSvgIds> }) {
  return (
    <g>
      <defs>
        <linearGradient id={ids.wall} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ECE8E1" />
          <stop offset="1" stopColor="#DCD6CC" />
        </linearGradient>
        <linearGradient id={ids.window} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FBFDFD" />
          <stop offset="1" stopColor="#D5E5E7" />
        </linearGradient>
        <linearGradient id={ids.beam} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.5" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={ids.floor} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4C5157" />
          <stop offset="1" stopColor="#2C3035" />
        </linearGradient>
      </defs>

      <rect width="800" height="330" fill={`url(#${ids.wall})`} />
      <rect x="560" width="240" height="330" fill="#C49A6C" />
      <g stroke="#B08559" strokeWidth="2">
        {SLATS.map((x) => (
          <line key={x} x1={x} y1="0" x2={x} y2="330" />
        ))}
      </g>

      <rect x="36" y="34" width="262" height="206" rx="4" fill="#2B3035" />
      <rect x="44" y="42" width="120" height="190" fill={`url(#${ids.window})`} />
      <rect x="170" y="42" width="120" height="190" fill={`url(#${ids.window})`} />
      <g opacity="0.7">
        <circle cx="78" cy="214" r="34" fill="#BCD3CB" />
        <circle cx="126" cy="222" r="28" fill="#A9C6BC" />
        <circle cx="214" cy="218" r="36" fill="#BCD3CB" />
        <circle cx="262" cy="226" r="26" fill="#A9C6BC" />
      </g>
      <rect x="44" y="134" width="246" height="5" fill="#2B3035" />

      <rect x="342" y="64" width="9" height="262" rx="2" fill="#B68A5C" />
      <rect x="433" y="64" width="9" height="262" rx="2" fill="#B68A5C" />
      <g fill="#CFA779">
        {RUNGS.map((y) => (
          <rect key={y} x="351" y={y} width="82" height="6" rx="3" />
        ))}
      </g>

      <rect x="490" y="286" width="40" height="42" rx="4" fill="#F1EDE6" />
      <g fill="#5E8C6A">
        <ellipse cx="500" cy="250" rx="9" ry="34" transform="rotate(-22 500 250)" />
        <ellipse cx="520" cy="246" rx="9" ry="36" transform="rotate(18 520 246)" />
        <ellipse cx="510" cy="238" rx="8" ry="40" />
      </g>
      <g fill="#4A7A58">
        <ellipse cx="496" cy="268" rx="7" ry="20" transform="rotate(-40 496 268)" />
        <ellipse cx="526" cy="266" rx="7" ry="20" transform="rotate(38 526 266)" />
      </g>

      <g fill="#2B3035">
        <rect x="596" y="236" width="180" height="8" rx="2" />
        <rect x="596" y="282" width="180" height="8" rx="2" />
        <rect x="602" y="236" width="7" height="94" />
        <rect x="763" y="236" width="7" height="94" />
      </g>
      <g fill="#1C1F23">
        <rect x="614" y="220" width="7" height="16" rx="2" />
        <rect x="638" y="220" width="7" height="16" rx="2" />
        <rect x="656" y="217" width="8" height="19" rx="2" />
        <rect x="683" y="217" width="8" height="19" rx="2" />
        <rect x="700" y="214" width="9" height="22" rx="2" />
        <rect x="730" y="214" width="9" height="22" rx="2" />
        <rect x="616" y="262" width="10" height="20" rx="2" />
        <rect x="648" y="262" width="10" height="20" rx="2" />
        <rect x="672" y="258" width="11" height="24" rx="2" />
        <rect x="708" y="258" width="11" height="24" rx="2" />
        <rect x="728" y="260" width="10" height="22" rx="2" />
        <rect x="752" y="260" width="10" height="22" rx="2" />
      </g>
      <g fill="#8A9096">
        <rect x="621" y="226" width="17" height="4" />
        <rect x="664" y="225" width="19" height="4" />
        <rect x="709" y="223" width="21" height="4" />
        <rect x="626" y="270" width="22" height="4" />
        <rect x="683" y="268" width="25" height="4" />
        <rect x="738" y="269" width="14" height="4" />
      </g>

      <rect y="326" width="800" height="6" fill="#2B3035" />
      <rect y="332" width="800" height="118" fill={`url(#${ids.floor})`} />
      <g stroke="#575C62" strokeWidth="1">
        <line x1="0" y1="356" x2="800" y2="356" />
        <line x1="0" y1="388" x2="800" y2="388" />
        <line x1="0" y1="428" x2="800" y2="428" />
        <line x1="160" y1="332" x2="110" y2="450" />
        <line x1="320" y1="332" x2="300" y2="450" />
        <line x1="480" y1="332" x2="500" y2="450" />
        <line x1="640" y1="332" x2="690" y2="450" />
      </g>
      <polygon points="44,42 290,42 520,450 110,450" fill={`url(#${ids.beam})`} opacity="0.45" />

      <path d="M690 330 Q690 306 702 306 Q714 306 714 330 Z" fill="#1C1F23" />
      <path d="M693 312 Q702 290 711 312" fill="none" stroke="#1C1F23" strokeWidth="5" />
      <path d="M724 330 Q724 312 734 312 Q744 312 744 330 Z" fill="#0E7C66" />
      <path d="M727 316 Q734 298 741 316" fill="none" stroke="#0E7C66" strokeWidth="4" />

      <polygon points="172,380 652,380 672,412 152,412" fill="#127A66" />
      <polygon points="152,412 672,412 672,417 152,417" fill="#0A5446" />
      <ellipse cx="420" cy="398" rx="200" ry="7" fill="#000000" opacity="0.16" />
      <rect x="66" y="398" width="72" height="20" rx="10" fill="#8FA3B0" />
      <ellipse cx="72" cy="408" rx="6" ry="10" fill="#7A8E9B" />
      <rect x="696" y="362" width="14" height="34" rx="4" fill="#DCE6EA" />
      <rect x="698" y="355" width="10" height="9" rx="2" fill="#0E7C66" />
      <rect x="626" y="388" width="38" height="10" rx="3" fill="#F3EFE8" />
    </g>
  );
}

/** Leg chain in the start position; CSS rotates each joint (see the module). */
function BridgeLeg({ skin, shorts, shoe, detailed }: { skin: string; shorts: string; shoe: string; detailed?: boolean }) {
  return (
    <g className={cn(styles.anim, styles.thigh)}>
      <polygon points="383,369 300.9,281.3 284.1,295.5 357,391" fill={skin} />
      <circle cx="292.5" cy="288.4" r="11.5" fill={skin} />
      <polygon points="384.5,367.7 347.3,328.5 322.9,349.1 355.5,392.3" fill={shorts} />
      {detailed && (
        <>
          <circle cx="370" cy="380" r="19" fill={shorts} />
          <line x1="347.3" y1="328.5" x2="322.9" y2="349.1" stroke="#33383F" strokeWidth="3" />
        </>
      )}
      <g className={cn(styles.anim, styles.shin)}>
        <polygon points="301.7,294.4 286.8,328.5 235.9,388.8 224.1,381.2 283.3,282.4" fill={skin} />
        <circle cx="230" cy="385" r="8" fill={detailed ? SHOE : "#D9D9D6"} />
        <g className={cn(styles.anim, styles.foot)}>
          <path
            d="M242 394 L188 394 Q180 393 182 386 Q188 379 210 377 L232 374 Q246 378 242 394 Z"
            fill={shoe}
            stroke={detailed ? "#C9CCD0" : undefined}
            strokeWidth={detailed ? 1.5 : undefined}
          />
          {detailed && (
            <>
              <rect x="182" y="391" width="61" height="4" rx="2" fill="#0E7C66" />
              <line x1="205" y1="380" x2="222" y2="377" stroke="#C9CCD0" strokeWidth="2" />
            </>
          )}
        </g>
      </g>
    </g>
  );
}

function BridgeCoach({ guideLine }: { guideLine: string }) {
  return (
    <g transform="translate(30 0)">
      <g transform="translate(9 -5)">
        <g className={cn(styles.anim, styles.torso)}>
          <BridgeLeg skin={SKIN_FAR} shorts="#121418" shoe="#D2D4D2" />
        </g>
        <line x1="522" y1="386" x2="452" y2="391" stroke={SKIN_FAR} strokeWidth="16" strokeLinecap="round" />
        <line x1="452" y1="391" x2="392" y2="392" stroke={SKIN_FAR} strokeWidth="13" strokeLinecap="round" />
      </g>

      <line x1="528" y1="378" x2="546" y2="374" stroke={SKIN} strokeWidth="15" strokeLinecap="round" />

      <g className={cn(styles.anim, styles.torso)}>
        <path d="M404 393 L528 393 Q541 384 534 368 Q524 356 500 354 Q470 352 440 357 Q418 361 404 365 Z" fill={SHIRT} />
        <path d="M352 386 Q352 368 372 364 L410 362 L410 393 L366 393 Q354 393 352 386 Z" fill={SHORTS} />
        <line x1="410" y1="363" x2="410" y2="393" stroke="#16302A" strokeWidth="2" />
        <ellipse className={cn(styles.anim, styles.glute)} cx="374" cy="386" rx="26" ry="14" fill="#F08A3C" />
        <BridgeLeg skin={SKIN} shorts={SHORTS} shoe={SHOE} detailed />
      </g>

      <circle cx="557" cy="369" r="19" fill={SKIN} />
      <path d="M540 357 Q552 346 568 352 Q579 360 576 378 Q572 386 566 388 Q570 372 560 362 Q550 356 540 357 Z" fill="#1E1A17" />
      <ellipse cx="558" cy="374" rx="4" ry="5" fill="#A86E4C" />
      <path d="M546 352 L550 344 L554 352 Z" fill={SKIN} />
      <line x1="522" y1="386" x2="495" y2="388" stroke={SHIRT} strokeWidth="21" strokeLinecap="round" />
      <line x1="500" y1="388" x2="452" y2="391" stroke={SKIN} strokeWidth="16" strokeLinecap="round" />
      <line x1="452" y1="391" x2="394" y2="392" stroke={SKIN} strokeWidth="13" strokeLinecap="round" />
      <circle cx="388" cy="392" r="8" fill={SKIN} />

      <g className={styles.guide}>
        <g className={cn(styles.anim, styles.guideLine)}>
          <line x1="534" y1="380" x2="262" y2="272" stroke={CUE} strokeWidth="3" strokeDasharray="9 8" strokeLinecap="round" />
          <rect x="165" y="214" width="370" height="44" rx="22" fill="#14211D" opacity="0.88" />
          <text x="350" y="243" textAnchor="middle" fontSize="22" fontWeight="600" fill="#FFFFFF" style={{ fontFamily: "inherit" }}>
            {guideLine}
          </text>
        </g>
        <path d="M358 372 Q350 346 368 318" fill="none" stroke={CUE} strokeWidth="3" strokeDasharray="6 6" strokeLinecap="round" />
        <path d="M360 318 L370 312 L373 324 Z" fill={CUE} />
      </g>
    </g>
  );
}

const BAR_RUNGS = [38, 58, 78, 98, 118, 138, 158];

function StillPose({ pose, name, locale, className }: { pose: CoachPose; name: string; locale: Locale; className?: string }) {
  const t = pickText(coachDemoText, locale);
  const { scene } = pose;
  return (
    <figure className={cn("space-y-1.5", className)}>
      <svg viewBox="0 0 320 200" className="block h-auto w-full max-w-md rounded-2xl" role="img" aria-label={t.stillAlt(name)}>
        <rect width="320" height="200" fill="#E9E5DE" />
        <rect x="18" y="20" width="96" height="104" rx="3" fill="#2B3035" />
        <rect x="23" y="25" width="41" height="94" fill="#F4F8F8" />
        <rect x="68" y="25" width="41" height="94" fill="#F4F8F8" />
        {scene.pillar && (
          <>
            <rect x="236" width="84" height="188" fill="#D3CCC0" />
            <rect x="236" width="4" height="188" fill="#BDB5A8" />
          </>
        )}
        {scene.bars && (
          <>
            <rect x="252" y="20" width="5" height="168" fill="#B68A5C" />
            <rect x="292" y="20" width="5" height="168" fill="#B68A5C" />
            <g fill="#CFA779">
              {BAR_RUNGS.map((y) => (
                <rect key={y} x="257" y={y} width="35" height="3" />
              ))}
            </g>
          </>
        )}
        <rect y="188" width="320" height="12" fill="#3B3F44" />
        {scene.mat && <rect x={scene.mat.x} y="185" width={scene.mat.width} height="5" rx="2" fill="#127A66" />}
        {scene.shadow !== undefined && <ellipse cx={scene.shadow} cy="186" rx="30" ry="3" fill="#000000" opacity="0.2" />}
        <g strokeLinecap="round" fill="none">
          <g transform={`translate(${pose.far.shift[0]} ${pose.far.shift[1]})`}>
            {pose.far.segments.map(([x1, y1, x2, y2, width, tone], i) => (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={TONES[tone]} strokeWidth={width} />
            ))}
          </g>
          {pose.near.map(([x1, y1, x2, y2, width, tone], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={TONES[tone]} strokeWidth={width} />
          ))}
          {pose.cue && <path d={pose.cue} stroke={CUE} strokeWidth="2.5" />}
        </g>
        <circle cx={pose.head[0]} cy={pose.head[1]} r="9" fill={SKIN} />
        <path d={pose.hair} fill="#1E1A17" />
      </svg>
      <figcaption className="text-xs text-[var(--color-ink-faint)]">{t.still}</figcaption>
    </figure>
  );
}
