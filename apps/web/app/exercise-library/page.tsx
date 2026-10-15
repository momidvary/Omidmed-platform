"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ExerciseFigureSvg } from "@/components/clinical/ExerciseAnimation";
import { describeDosage } from "@/lib/clinical/dosage";
import { motionFor } from "@/lib/animation/motions";
import { exercises } from "@/lib/data/exercises";
import { localizeExercise } from "@/lib/data/exerciseLibraryFa";
import { useText } from "@/lib/i18n/text";
import { useLocale } from "@/lib/store/LocaleContext";
import { EXERCISE_CATEGORIES } from "@/lib/types";
import type { BodyRegionId, Difficulty, Exercise, ExerciseCategory, Stage } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, PageIntro } from "@/components/ui/Misc";
import { cn } from "@/lib/utils";
import { exerciseLibraryText } from "./text";

/** Regions that have at least one exercise, in a clinical order. */
const REGIONS: BodyRegionId[] = (["low-back", "neck", "shoulder", "hip", "knee", "ankle-foot", "post-op"] as const)
  .filter((id) => exercises.some((exercise) => exercise.region === id));

export default function ExerciseLibraryPage() {
  const { locale } = useLocale();
  const t = useText(exerciseLibraryText);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<BodyRegionId | "">("");
  const [category, setCategory] = useState<ExerciseCategory | "">("");
  const [review, setReview] = useState<Exercise["review"] | "">("");
  const [difficulty, setDifficulty] = useState<Difficulty | "">("");
  const [stage, setStage] = useState<Stage | "">("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exercises.filter((ex) => {
      const local = localizeExercise(ex, locale);
      const haystack = `${ex.name} ${ex.purpose} ${ex.goal} ${ex.equipment} ${local.name} ${local.purpose} ${local.goal} ${local.equipment}`;
      if (q && !haystack.toLowerCase().includes(q)) return false;
      if (region && ex.region !== region) return false;
      if (category && ex.category !== category) return false;
      if (review && ex.review !== review) return false;
      if (difficulty && ex.difficulty !== difficulty) return false;
      if (stage && !ex.stage.includes(stage)) return false;
      return true;
    });
  }, [query, region, category, review, difficulty, stage, locale]);

  const hasFilters = query || region || category || review || difficulty || stage;
  const clearFilters = () => {
    setQuery(""); setRegion(""); setCategory(""); setReview(""); setDifficulty(""); setStage("");
  };
  const approvedCount = exercises.filter((ex) => ex.review === "approved").length;

  return (
    <div className="space-y-5">
      <PageIntro title={t.title} description={t.intro(exercises.length, approvedCount)} />

      <div className="space-y-3">
        <div className="relative max-w-xl">
          <span className="pointer-events-none absolute inset-y-0 start-3 grid place-items-center text-[var(--color-ink-faint)]">
            <Icon name="search" width={16} height={16} />
          </span>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.search}
            aria-label={t.searchAria}
            className="ps-9"
          />
        </div>

        <div role="group" aria-label={t.regionFilter} className="flex flex-wrap gap-2">
          {(["", ...REGIONS] as const).map((id) => (
            <button
              key={id || "all"}
              type="button"
              aria-pressed={region === id}
              onClick={() => setRegion(id)}
              className={cn(
                "min-h-10 rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
                region === id
                  ? "border-[#14211D] bg-[#14211D] text-white"
                  : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink-soft)] hover:border-[var(--color-ink-faint)]"
              )}
            >
              {id ? t.regionShort[id] : t.all}
            </button>
          ))}
        </div>

        <details className="group rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          <summary className="cursor-pointer list-none px-4 py-2.5 text-sm font-medium text-[var(--color-ink-soft)]">
            {t.moreFilters}
          </summary>
          <div className="grid grid-cols-1 gap-3 border-t border-[var(--color-border)] p-3 sm:grid-cols-2 lg:grid-cols-4">
            <Select aria-label={t.allCategories} value={category} onChange={(e) => setCategory(e.target.value as ExerciseCategory | "")}>
              <option value="">{t.allCategories}</option>
              {EXERCISE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{t.category[c]}</option>
              ))}
            </Select>
            <Select aria-label={t.allReview} value={review} onChange={(e) => setReview(e.target.value as Exercise["review"] | "")}>
              <option value="">{t.allReview}</option>
              <option value="approved">{t.reviewApproved}</option>
              <option value="pending">{t.reviewPending}</option>
            </Select>
            <Select aria-label={t.allDifficulties} value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty | "")}>
              <option value="">{t.allDifficulties}</option>
              <option value="beginner">{t.difficulty.beginner}</option>
              <option value="intermediate">{t.difficulty.intermediate}</option>
              <option value="advanced">{t.difficulty.advanced}</option>
            </Select>
            <Select aria-label={t.allStages} value={stage} onChange={(e) => setStage(e.target.value as Stage | "")}>
              <option value="">{t.allStages}</option>
              {Object.entries(t.stage).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </div>
        </details>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={t.noMatchTitle}
          description={t.noMatchBody}
          action={hasFilters ? <Button variant="secondary" onClick={clearFilters}>{t.clearFilters}</Button> : undefined}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((ex) => (
            <li key={ex.id}>
              <ExerciseTile exercise={ex} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ExerciseTile({ exercise }: { exercise: Exercise }) {
  const { locale } = useLocale();
  const t = useText(exerciseLibraryText);
  const ex = localizeExercise(exercise, locale);
  const motion = motionFor(ex.id);
  const dose = describeDosage(ex.defaultDosage, locale === "fa" ? "fa" : "en")[0];
  return (
    <Link
      href={`/exercise-library/${ex.id}`}
      aria-label={t.open(ex.name)}
      className="group block h-full overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
    >
      <div className="relative bg-[#14211D]">
        {motion && (
          <ExerciseFigureSvg motion={motion} p={0.8} glow={0} guide={false} className="block aspect-[5/3] h-auto w-full" />
        )}
        <span className="absolute start-2.5 top-2.5 rounded-full bg-[#14211D]/80 px-2.5 py-1 text-[11px] font-semibold text-white">
          {t.animated}
        </span>
        {ex.review === "pending" && (
          <span className="absolute end-2.5 top-2.5 rounded-full bg-[var(--color-warn-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-warn)]">
            {t.pendingBadge}
          </span>
        )}
      </div>
      <div className="space-y-1.5 p-4">
        <h3 className="text-base font-bold text-[var(--color-ink)] group-hover:text-[var(--color-primary-strong)]">{ex.name}</h3>
        <p className="text-xs text-[var(--color-ink-soft)]">
          {t.regionShort[ex.region]} · {t.difficulty[ex.difficulty]} · {ex.equipment}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {dose && <Badge tone="primary">{dose}</Badge>}
          <Badge>{t.category[ex.category]}</Badge>
        </div>
      </div>
    </Link>
  );
}
