"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ExerciseAnimation } from "@/components/clinical/ExerciseAnimation";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/Misc";
import { protocolsUsingExercise } from "@/lib/clinical/protocols";
import { laddersFor } from "@/lib/data/exerciseCatalog";
import { exercises } from "@/lib/data/exercises";
import { localizeExercise } from "@/lib/data/exerciseLibraryFa";
import { useText } from "@/lib/i18n/text";
import { useLocale } from "@/lib/store/LocaleContext";
import type { Exercise } from "@/lib/types";
import { exerciseLibraryText } from "../text";

type T = (typeof exerciseLibraryText)["en"];

function doseTiles(ex: Exercise, t: T, lang: "fa" | "en"): { label: string; value: string }[] {
  const d = ex.defaultDosage;
  const n = (v: number) => v.toLocaleString(lang === "fa" ? "fa-IR" : "en");
  const tiles: { label: string; value: string }[] = [];
  if (d.targetSets !== undefined && d.targetReps !== undefined) {
    tiles.push({ label: t.sets, value: n(d.targetSets) });
    tiles.push({ label: t.reps, value: n(d.targetReps) });
  } else if (d.targetDurationSeconds !== undefined) {
    tiles.push({ label: t.total, value: t.seconds(d.targetDurationSeconds) });
  }
  if (d.holdSeconds) tiles.push({ label: t.hold, value: t.seconds(d.holdSeconds) });
  if (d.restSeconds !== undefined) tiles.push({ label: t.rest, value: t.seconds(d.restSeconds) });
  if (d.targetRpe) tiles.push({ label: t.rpe, value: t.outOf10(d.targetRpe) });
  if (d.painLimit !== undefined) tiles.push({ label: t.pain, value: t.outOf10(d.painLimit) });
  if (d.timesPerDay && d.timesPerDay > 1) tiles.push({ label: t.perDay, value: t.times(d.timesPerDay) });
  return tiles;
}

export default function ExerciseDetailPage() {
  const params = useParams<{ id: string }>();
  const { locale } = useLocale();
  const t = useText(exerciseLibraryText);
  const source = exercises.find((exercise) => exercise.id === params.id);

  if (!source) {
    return (
      <EmptyState
        title={t.notFoundTitle}
        description={t.notFoundBody}
        action={<Link href="/exercise-library" className="text-sm font-semibold text-[var(--color-primary-strong)] underline">{t.back}</Link>}
      />
    );
  }

  const ex = localizeExercise(source, locale);
  const lang = locale === "fa" ? "fa" : "en";
  const pending = ex.review === "pending";
  const d = ex.defaultDosage;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label={t.breadcrumb}>
          <ol className="flex flex-wrap items-center gap-1.5 text-sm text-[var(--color-ink-soft)]">
            <li><Link href="/exercise-library" className="hover:text-[var(--color-primary-strong)] hover:underline">{t.title}</Link></li>
            <li aria-hidden="true">/</li>
            <li>{t.regionShort[ex.region]}</li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="font-semibold text-[var(--color-ink)]">{ex.name}</li>
          </ol>
        </nav>
        {!pending && (
          <Link
            href="/patients"
            title={t.prescribeHint}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--color-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--color-primary-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
          >
            {t.prescribe}
          </Link>
        )}
      </div>

      {pending && (
        <p role="note" className="rounded-xl bg-[var(--color-warn-soft)] px-4 py-3 text-sm text-[var(--color-warn)]">
          <span className="font-semibold">{t.pendingBadge}. </span>{t.pendingNote}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Card className="h-fit lg:sticky lg:top-4">
          <CardBody>
            <ExerciseAnimation
              exerciseId={ex.id}
              name={ex.name}
              lang={lang}
              holdSeconds={d.holdSeconds}
              reps={d.targetReps}
            />
          </CardBody>
        </Card>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={ex.difficulty === "beginner" ? "success" : ex.difficulty === "intermediate" ? "warn" : "danger"}>
              {t.difficulty[ex.difficulty]}
            </Badge>
            <Badge tone="primary">{t.regionShort[ex.region]}</Badge>
            <Badge>{t.category[ex.category]}</Badge>
            <Badge tone="accent">{ex.equipment}</Badge>
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[var(--color-ink)]">{ex.name}</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-ink-soft)]">{ex.purpose}</p>
          </div>

          <section aria-labelledby="dose-heading" className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <h2 id="dose-heading" className="mb-3 text-sm font-bold text-[var(--color-ink)]">{t.startingDose}</h2>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {doseTiles(ex, t, lang).map((tile) => (
                <div key={tile.label} className="rounded-xl bg-[var(--color-surface-muted)] px-3 py-2">
                  <dt className="text-xs text-[var(--color-ink-soft)]">{tile.label}</dt>
                  <dd className="text-lg font-bold text-[var(--color-ink)]">{tile.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-[var(--color-ink-faint)]">{t.doseNote}</p>
          </section>

          <div>
            <h2 className="mb-1.5 text-xs font-semibold text-[var(--color-ink-faint)]">{t.stages}</h2>
            <div className="flex flex-wrap gap-1.5">
              {ex.stage.map((s) => <Badge key={s}>{t.stage[s]}</Badge>)}
            </div>
          </div>

          <div role="note" className="flex gap-3 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-4 py-3">
            <span className="mt-0.5 shrink-0 text-[var(--color-danger)]"><Icon name="alert" width={18} height={18} /></span>
            <div>
              <h2 className="text-sm font-bold text-[var(--color-danger)]">{t.whenToStop}</h2>
              <p className="mt-0.5 text-sm text-[var(--color-ink)]">{ex.whenToStop}</p>
            </div>
          </div>

          {ex.precautions && (
            <div className="rounded-xl bg-[var(--color-warn-soft)] px-4 py-3">
              <h2 className="text-sm font-bold text-[var(--color-warn)]">{t.precautions}</h2>
              <p className="mt-0.5 text-sm text-[var(--color-ink)]">{ex.precautions}</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section aria-labelledby="steps-heading">
          <h2 id="steps-heading" className="mb-3 text-base font-bold text-[var(--color-ink)]">{t.steps}</h2>
          <ol className="space-y-2">
            {ex.howTo.map((step, i) => (
              <li key={i} className="flex gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#14211D] text-xs font-bold text-white">
                  {(i + 1).toLocaleString(locale === "fa" ? "fa-IR" : "en")}
                </span>
                <span className="text-sm leading-relaxed text-[var(--color-ink)]">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <div className="space-y-6">
          <section aria-labelledby="mistakes-heading">
            <h2 id="mistakes-heading" className="mb-3 text-base font-bold text-[var(--color-ink)]">{t.mistakes}</h2>
            <ul className="space-y-2">
              {ex.commonMistakes.map((mistake) => (
                <li key={mistake} className="flex items-start gap-2 text-sm text-[var(--color-ink)]">
                  <span className="mt-0.5 shrink-0 text-[var(--color-warn)]"><Icon name="alert" width={16} height={16} /></span>
                  {mistake}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="level-heading">
            <h2 id="level-heading" className="mb-3 text-base font-bold text-[var(--color-ink)]">{t.harderEasier}</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <h3 className="text-xs font-semibold text-[var(--color-success)]">{t.progression}</h3>
                <p className="mt-1 text-sm text-[var(--color-ink)]">{ex.progression}</p>
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <h3 className="text-xs font-semibold text-[var(--color-ink-soft)]">{t.regression}</h3>
                <p className="mt-1 text-sm text-[var(--color-ink)]">{ex.regression}</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-[var(--color-ink-faint)]">{t.changeLevel}</p>
          </section>

          {protocolsUsingExercise(ex.id).length > 0 && (
            <section aria-labelledby="protocols-heading">
              <h2 id="protocols-heading" className="mb-2 text-base font-bold text-[var(--color-ink)]">{t.usedInProtocols}</h2>
              <ul className="flex flex-wrap gap-1.5">
                {protocolsUsingExercise(ex.id).map((protocol) => (
                  <li key={protocol.id}>
                    <Link
                      href={`/protocols/${protocol.id}`}
                      className="inline-flex min-h-8 items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-ink-soft)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary-strong)] focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]"
                    >
                      {protocol.title[lang]}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {laddersFor(ex.id).map((ladder) => (
            <section key={ladder.id} aria-label={`${t.ladder} · ${lang === "fa" ? ladder.label.fa : ladder.label.en}`}>
              <h2 className="mb-1 text-base font-bold text-[var(--color-ink)]">
                {t.ladder} · {lang === "fa" ? ladder.label.fa : ladder.label.en}
              </h2>
              <p className="mb-2 text-xs text-[var(--color-ink-faint)]">{t.ladderHint}</p>
              <ol className="flex flex-wrap items-center gap-1.5">
                {ladder.steps.map((stepId, index) => {
                  const step = exercises.find((candidate) => candidate.id === stepId);
                  if (!step) return null;
                  const name = localizeExercise(step, locale).name;
                  return (
                    <li key={stepId} className="flex items-center gap-1.5">
                      {index > 0 && (
                        <span aria-hidden className="text-[var(--color-ink-faint)] rtl:rotate-180">
                          <Icon name="arrow" width={12} height={12} />
                        </span>
                      )}
                      {stepId === ex.id ? (
                        <span aria-current="step" className="rounded-full bg-[#14211D] px-3 py-1.5 text-xs font-semibold text-white">
                          {name}<span className="sr-only"> ({t.currentStep})</span>
                        </span>
                      ) : (
                        <Link
                          href={`/exercise-library/${stepId}`}
                          className="inline-flex min-h-8 items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-ink-soft)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary-strong)] focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]"
                        >
                          <span className="me-1 text-xs font-semibold text-[var(--color-ink-faint)]">
                            {(index + 1).toLocaleString(locale === "fa" ? "fa-IR" : "en")}
                          </span>
                          {name}
                          {step.review === "pending" && (
                            <>
                              <span className="ms-1 text-[var(--color-warn)]" aria-hidden>•</span>
                              <span className="sr-only"> ({t.pendingBadge})</span>
                            </>
                          )}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      </div>

      <p className="rounded-xl bg-[var(--color-surface-muted)] px-4 py-3 text-xs leading-relaxed text-[var(--color-ink-soft)]">
        {t.disclaimer}
      </p>
    </div>
  );
}
