"use client";

import { useMemo, useState } from "react";
import { exercises, exerciseGoals } from "@/lib/data/exercises";
import { bodyRegions } from "@/lib/data/bodyRegions";
import { regionLabel } from "@/lib/data/bodyRegionsFa";
import { exerciseGoalFa, localizeExercise } from "@/lib/data/exerciseLibraryFa";
import { useText } from "@/lib/i18n/text";
import { useLocale } from "@/lib/store/LocaleContext";
import type { BodyRegionId, Difficulty, Exercise, Stage } from "@/lib/types";
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
  const [goal, setGoal] = useState("");
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
      if (goal && ex.goal !== goal) return false;
      if (difficulty && ex.difficulty !== difficulty) return false;
      if (stage && !ex.stage.includes(stage)) return false;
      return true;
    });
  }, [query, region, goal, difficulty, stage, locale]);

  const hasFilters = query || region || goal || difficulty || stage;

  return (
    <div className="space-y-6">
      <PageIntro
        title={t.title}
        description={t.intro(exercises.length)}
      />

      {/* Filters */}
      <Card>
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
          <Select value={region} onChange={(e) => setRegion(e.target.value as BodyRegionId | "")}>
            <option value="">{t.allRegions}</option>
            {bodyRegions.map((r) => (
              <option key={r.id} value={r.id}>{regionLabel(r.id, locale)}</option>
            ))}
          </Select>
          <Select value={goal} onChange={(e) => setGoal(e.target.value)}>
            <option value="">{t.allGoals}</option>
            {exerciseGoals.map((g) => (
              <option key={g} value={g}>
                {locale === "fa" ? exerciseGoalFa[g] ?? g : g}
              </option>
            ))}
          </Select>
          <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty | "")}>
            <option value="">{t.allDifficulties}</option>
            <option value="beginner">{t.difficulty.beginner}</option>
            <option value="intermediate">{t.difficulty.intermediate}</option>
            <option value="advanced">{t.difficulty.advanced}</option>
          </Select>
          <Select value={stage} onChange={(e) => setStage(e.target.value as Stage | "")}>
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
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery(""); setRegion(""); setGoal(""); setDifficulty(""); setStage("");
                }}
              >
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
}: {
  exercise: Exercise;
  open: boolean;
  onToggle: () => void;
}) {
  const { locale } = useLocale();
  const t = useText(exerciseLibraryText);
  const ex = localizeExercise(exercise, locale);
  return (
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
          <Badge tone="primary">{regionLabel(ex.region, locale)}</Badge>
          <Badge>{ex.goal}</Badge>
          <Badge tone={difficultyTone[ex.difficulty]}>{t.difficulty[ex.difficulty]}</Badge>
          <Badge tone="accent">{ex.equipment}</Badge>
        </div>
      </button>

      {open && (
        <CardBody className="space-y-4 border-t border-[var(--color-border)]">
          <Section label={t.howTo}>
            <ol className="list-decimal space-y-1.5 ps-5 text-sm text-[var(--color-ink-soft)]">
              {ex.howTo.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </Section>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Section label={t.setsReps}>
              <p className="text-sm font-medium text-[var(--color-primary-strong)]">{ex.setsReps}</p>
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
        </CardBody>
      )}
    </Card>
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
