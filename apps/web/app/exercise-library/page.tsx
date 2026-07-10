"use client";

import { useMemo, useState } from "react";
import { exercises, exerciseGoals } from "@/lib/data/exercises";
import { bodyRegions, getRegion } from "@/lib/data/bodyRegions";
import type { BodyRegionId, Difficulty, Exercise, Stage } from "@/lib/types";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { BulletList, EmptyState, PageIntro } from "@/components/ui/Misc";
import { cn } from "@/lib/utils";

const stageLabels: Record<Stage, string> = {
  acute: "Acute",
  subacute: "Subacute",
  chronic: "Chronic",
  "post-op": "Post-op",
  "return-to-sport": "Return to sport",
};

const difficultyTone: Record<Difficulty, "success" | "warn" | "danger"> = {
  beginner: "success",
  intermediate: "warn",
  advanced: "danger",
};

export default function ExerciseLibraryPage() {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<BodyRegionId | "">("");
  const [goal, setGoal] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty | "">("");
  const [stage, setStage] = useState<Stage | "">("");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exercises.filter((ex) => {
      if (q && !`${ex.name} ${ex.purpose} ${ex.goal} ${ex.equipment}`.toLowerCase().includes(q)) return false;
      if (region && ex.region !== region) return false;
      if (goal && ex.goal !== goal) return false;
      if (difficulty && ex.difficulty !== difficulty) return false;
      if (stage && !ex.stage.includes(stage)) return false;
      return true;
    });
  }, [query, region, goal, difficulty, stage]);

  const hasFilters = query || region || goal || difficulty || stage;

  return (
    <div className="space-y-6">
      <PageIntro
        title="Exercise Library"
        description={`${exercises.length} evidence-informed exercises with dosage, mistakes to watch for, and progression / regression options.`}
      />

      {/* Filters */}
      <Card>
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-[var(--color-ink-faint)]">
              <Icon name="search" width={16} height={16} />
            </span>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="pl-9"
            />
          </div>
          <Select value={region} onChange={(e) => setRegion(e.target.value as BodyRegionId | "")}>
            <option value="">All regions</option>
            {bodyRegions.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </Select>
          <Select value={goal} onChange={(e) => setGoal(e.target.value)}>
            <option value="">All goals</option>
            {exerciseGoals.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </Select>
          <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty | "")}>
            <option value="">All difficulties</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </Select>
          <Select value={stage} onChange={(e) => setStage(e.target.value as Stage | "")}>
            <option value="">All stages</option>
            {Object.entries(stageLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </CardBody>
      </Card>

      {/* Results */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No exercises match"
          description="Try removing a filter or using a broader search term."
          action={
            hasFilters ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery(""); setRegion(""); setGoal(""); setDifficulty(""); setStage("");
                }}
              >
                Clear all filters
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
  exercise: ex,
  open,
  onToggle,
}: {
  exercise: Exercise;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Card className={cn("transition-shadow", open && "shadow-md")}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-5 py-4 text-left"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-ink)]">{ex.name}</h3>
            <p className="mt-1 text-xs text-[var(--color-ink-soft)]">{ex.purpose}</p>
          </div>
          <span
            className={cn(
              "mt-1 shrink-0 text-[var(--color-ink-faint)] transition-transform",
              open && "rotate-90"
            )}
          >
            <Icon name="arrow" width={16} height={16} />
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge tone="primary">{getRegion(ex.region)?.label}</Badge>
          <Badge>{ex.goal}</Badge>
          <Badge tone={difficultyTone[ex.difficulty]}>{ex.difficulty}</Badge>
          <Badge tone="accent">{ex.equipment}</Badge>
        </div>
      </button>

      {open && (
        <CardBody className="space-y-4 border-t border-[var(--color-border)]">
          <Section label="How to do it">
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-[var(--color-ink-soft)]">
              {ex.howTo.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </Section>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Section label="Sets & reps">
              <p className="text-sm font-medium text-[var(--color-primary-strong)]">{ex.setsReps}</p>
            </Section>
            <Section label="Stages">
              <div className="flex flex-wrap gap-1.5">
                {ex.stage.map((s) => (
                  <Badge key={s}>{stageLabels[s]}</Badge>
                ))}
              </div>
            </Section>
          </div>
          <Section label="Common mistakes">
            <BulletList items={ex.commonMistakes} tone="warn" />
          </Section>
          <Section label="When to stop">
            <p className="rounded-lg bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">
              {ex.whenToStop}
            </p>
          </Section>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Section label="Progression">
              <p className="text-sm text-[var(--color-ink-soft)]">{ex.progression}</p>
            </Section>
            <Section label="Regression">
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
