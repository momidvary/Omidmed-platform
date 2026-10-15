"use client";

import { useMemo, useState } from "react";
import { describeDosage } from "@/lib/clinical/dosage";
import { exercises } from "@/lib/data/exercises";
import { laddersFor } from "@/lib/data/exerciseCatalog";
import { bodyRegions } from "@/lib/data/bodyRegions";
import { regionLabel } from "@/lib/data/bodyRegionsFa";
import { localizeExercise } from "@/lib/data/exerciseLibraryFa";
import { useText } from "@/lib/i18n/text";
import { useLocale } from "@/lib/store/LocaleContext";
import { EXERCISE_CATEGORIES } from "@/lib/types";
import type { BodyRegionId, Difficulty, Exercise, ExerciseCategory, Stage } from "@/lib/types";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { BulletList, EmptyState, PageIntro } from "@/components/ui/Misc";
import { cn } from "@/lib/utils";
import { exerciseLibraryText } from "./text";

const difficultyTone: Record<Difficulty, "success" | "warn" | "danger"> = {
  beginner: "success",
  intermediate: "warn",
  advanced: "danger",
};

export default function ExerciseLibraryPage() {
  const { locale } = useLocale();
  const t = useText(exerciseLibraryText);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<BodyRegionId | "">("");
  const [category, setCategory] = useState<ExerciseCategory | "">("");
  const [review, setReview] = useState<Exercise["review"] | "">("");
  const [difficulty, setDifficulty] = useState<Difficulty | "">("");
  const [stage, setStage] = useState<Stage | "">("");
  const [openId, setOpenId] = useState<string | null>(null);

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

  // Ladder steps may be hidden by the current filters: clear them, open the
  // step and bring it into view.
  function openExercise(id: string) {
    clearFilters();
    setOpenId(id);
    requestAnimationFrame(() => {
      const card = document.getElementById(`exercise-${id}`);
      card?.scrollIntoView({ behavior: "smooth", block: "start" });
      card?.querySelector<HTMLButtonElement>("button[aria-expanded]")?.focus({ preventScroll: true });
    });
  }

  return (
    <div className="space-y-6">
      <PageIntro
        title={t.title}
        description={t.intro(exercises.length, approvedCount)}
      />

      {/* Filters */}
      <Card>
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="relative sm:col-span-2 lg:col-span-1">
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
          <Select aria-label={t.allRegions} value={region} onChange={(e) => setRegion(e.target.value as BodyRegionId | "")}>
            <option value="">{t.allRegions}</option>
            {bodyRegions.map((r) => (
              <option key={r.id} value={r.id}>{regionLabel(r.id, locale)}</option>
            ))}
          </Select>
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
        </CardBody>
      </Card>

      {/* Results */}
      {filtered.length === 0 ? (
        <EmptyState
          title={t.noMatchTitle}
          description={t.noMatchBody}
          action={
            hasFilters ? (
              <Button variant="secondary" onClick={clearFilters}>
                {t.clearFilters}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map((ex) => (
            <ExerciseCard
              key={ex.id}
              exercise={ex}
              open={openId === ex.id}
              onToggle={() => setOpenId(openId === ex.id ? null : ex.id)}
              onOpenExercise={openExercise}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ExerciseCard({
  exercise,
  open,
  onToggle,
  onOpenExercise,
}: {
  exercise: Exercise;
  open: boolean;
  onToggle: () => void;
  onOpenExercise: (id: string) => void;
}) {
  const { locale } = useLocale();
  const t = useText(exerciseLibraryText);
  const ex = localizeExercise(exercise, locale);
  const pending = ex.review === "pending";
  return (
    <div id={`exercise-${ex.id}`} className="scroll-mt-4">
      <Card className={cn("transition-shadow", open && "shadow-md")}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="w-full px-5 py-4 text-start"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--color-ink)]">{ex.name}</h3>
              <p className="mt-1 text-xs text-[var(--color-ink-soft)]">{ex.purpose}</p>
            </div>
            <span
              className={cn(
                "mt-1 shrink-0 text-[var(--color-ink-faint)] transition-transform",
                open ? "rotate-90" : "rtl:rotate-180"
              )}
            >
              <Icon name="arrow" width={16} height={16} />
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {pending && <Badge tone="warn">{t.pendingBadge}</Badge>}
            <Badge tone="primary">{regionLabel(ex.region, locale)}</Badge>
            <Badge>{t.category[ex.category]}</Badge>
            <Badge>{ex.goal}</Badge>
            <Badge tone={difficultyTone[ex.difficulty]}>{t.difficulty[ex.difficulty]}</Badge>
            <Badge tone="accent">{ex.equipment}</Badge>
          </div>
        </button>

        {open && (
          <CardBody className="space-y-4 border-t border-[var(--color-border)]">
            {pending && (
              <p className="rounded-lg bg-[var(--color-warn-soft)] px-3 py-2 text-sm text-[var(--color-warn)]">
                {t.pendingNote}
              </p>
            )}
            <Section label={t.howTo}>
              <ol className="list-decimal space-y-1.5 ps-5 text-sm text-[var(--color-ink-soft)]">
                {ex.howTo.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </Section>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Section label={t.startingDose}>
                <ul className="space-y-0.5 text-sm font-medium text-[var(--color-primary-strong)]">
                  {describeDosage(ex.defaultDosage, locale === "fa" ? "fa" : "en").map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-[var(--color-ink-faint)]">{t.startingDoseNote}</p>
              </Section>
              <Section label={t.stages}>
                <div className="flex flex-wrap gap-1.5">
                  {ex.stage.map((s) => (
                    <Badge key={s}>{t.stage[s]}</Badge>
                  ))}
                </div>
              </Section>
            </div>
            <Section label={t.mistakes}>
              <BulletList items={ex.commonMistakes} tone="warn" />
            </Section>
            {ex.precautions && (
              <Section label={t.precautions}>
                <p className="rounded-lg bg-[var(--color-warn-soft)] px-3 py-2 text-sm text-[var(--color-warn)]">
                  {ex.precautions}
                </p>
              </Section>
            )}
            <Section label={t.whenToStop}>
              <p className="rounded-lg bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">
                {ex.whenToStop}
              </p>
            </Section>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Section label={t.progression}>
                <p className="text-sm text-[var(--color-ink-soft)]">{ex.progression}</p>
              </Section>
              <Section label={t.regression}>
                <p className="text-sm text-[var(--color-ink-soft)]">{ex.regression}</p>
              </Section>
            </div>
            {laddersFor(ex.id).map((ladder) => (
              <Section key={ladder.id} label={`${t.ladder} · ${locale === "fa" ? ladder.label.fa : ladder.label.en}`}>
                <p className="mb-2 text-xs text-[var(--color-ink-faint)]">{t.ladderHint}</p>
                <ol className="flex flex-wrap items-center gap-1.5">
                  {ladder.steps.map((stepId, index) => {
                    const step = exercises.find((candidate) => candidate.id === stepId);
                    if (!step) return null;
                    const name = localizeExercise(step, locale).name;
                    const current = stepId === ex.id;
                    return (
                      <li key={stepId} className="flex items-center gap-1.5">
                        {index > 0 && (
                          <span aria-hidden className="text-[var(--color-ink-faint)] rtl:rotate-180">
                            <Icon name="arrow" width={12} height={12} />
                          </span>
                        )}
                        {current ? (
                          <span
                            aria-current="step"
                            className="rounded-full bg-[var(--color-primary)] px-2.5 py-1 text-xs font-semibold text-white"
                          >
                            {name}
                            <span className="sr-only"> ({t.currentStep})</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onOpenExercise(stepId)}
                            className="rounded-full border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-ink-soft)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary-strong)] focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]"
                          >
                            <span className="me-1 text-[10px] font-semibold text-[var(--color-ink-faint)]">
                              {(index + 1).toLocaleString(locale === "fa" ? "fa-IR" : "en")}
                            </span>
                            {name}
                            {step.review === "pending" && (
                              <>
                                <span className="ms-1 text-[var(--color-warn)]" aria-hidden>•</span>
                                <span className="sr-only"> ({t.pendingBadge})</span>
                              </>
                            )}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </Section>
            ))}
          </CardBody>
        )}
      </Card>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]">
        {label}
      </h4>
      {children}
    </div>
  );
}
