"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ExerciseFigureSvg } from "@/components/clinical/ExerciseAnimation";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/Misc";
import { motionFor } from "@/lib/animation/motions";
import { hypothesisLabel, protocolById } from "@/lib/clinical/protocols";
import { exercises } from "@/lib/data/exercises";
import { localizeExercise } from "@/lib/data/exerciseLibraryFa";
import { isMockMode } from "@/lib/config";
import { useText } from "@/lib/i18n/text";
import { useCases } from "@/lib/store/CaseContext";
import { useLocale } from "@/lib/store/LocaleContext";
import { protocolText } from "../text";

export default function ProtocolDetailPage() {
  const params = useParams<{ id: string }>();
  const { locale } = useLocale();
  const t = useText(protocolText);
  const lang = locale === "fa" ? "fa" : "en";
  const protocol = protocolById(params.id);
  const { currentCase } = useCases();
  // The builder needs a patient with an open episode (and, there, an approved
  // plan and a clear safety screen). Show whose program the button would start.
  const patient = !isMockMode && currentCase?.patientId && currentCase.episodeId ? currentCase : null;

  if (!protocol) {
    return (
      <EmptyState
        title={t.notFoundTitle}
        description={t.notFoundBody}
        action={<Link href="/protocols" className="text-sm font-semibold text-[var(--color-primary-strong)] underline">{t.back}</Link>}
      />
    );
  }

  return (
    <div className="space-y-6">
      <nav aria-label={t.breadcrumb}>
        <ol className="flex flex-wrap items-center gap-1.5 text-sm text-[var(--color-ink-soft)]">
          <li><Link href="/protocols" className="hover:text-[var(--color-primary-strong)] hover:underline">{t.title}</Link></li>
          <li aria-hidden="true">/</li>
          <li>{t.regionShort[protocol.region]}</li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="font-semibold text-[var(--color-ink)]">{protocol.title[lang]}</li>
        </ol>
      </nav>

      <header className="space-y-3">
        <h1 className="text-2xl font-extrabold tracking-tight text-[var(--color-ink)]">{protocol.title[lang]}</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-[var(--color-ink-soft)]">{protocol.summary[lang]}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[var(--color-ink-faint)]">{t.linked}:</span>
          {protocol.hypotheses.map((id) => (
            <Badge key={id} tone="primary">{hypothesisLabel(id)?.[lang] ?? id}</Badge>
          ))}
        </div>
        <p role="note" className="rounded-xl bg-[var(--color-warn-soft)] px-4 py-3 text-sm text-[var(--color-warn)]">
          <span className="font-semibold">{t.draft}. </span>{t.draftNote}
        </p>
      </header>

      <section aria-labelledby="principles" className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 id="principles" className="mb-2 text-base font-bold text-[var(--color-ink)]">{t.principles}</h2>
        <ul className="space-y-1.5">
          {protocol.principles.map((p) => (
            <li key={p.en} className="flex gap-2 text-sm text-[var(--color-ink)]">
              <span className="mt-0.5 shrink-0 text-[var(--color-primary)]"><Icon name="check" width={16} height={16} /></span>
              {p[lang]}
            </li>
          ))}
        </ul>
      </section>

      <ol className="space-y-4">
        {protocol.phases.map((phase, index) => (
          <li key={phase.id} aria-labelledby={`phase-${phase.id}`} className="relative rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#14211D] text-sm font-bold text-white">
                {(index + 1).toLocaleString(lang === "fa" ? "fa-IR" : "en")}
              </span>
              <div className="min-w-0">
                <span className="block text-xs text-[var(--color-ink-faint)]">{t.phase(index + 1)} · {phase.typical[lang]}</span>
                <h2 id={`phase-${phase.id}`} className="text-base font-bold text-[var(--color-ink)]">{phase.name[lang]}</h2>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <div>
                  <h3 className="mb-1 text-xs font-semibold text-[var(--color-ink-faint)]">{t.goals}</h3>
                  <ul className="list-disc space-y-1 ps-5 text-sm text-[var(--color-ink)]">
                    {phase.goals.map((g) => <li key={g.en}>{g[lang]}</li>)}
                  </ul>
                </div>
                {phase.other.length > 0 && (
                  <div>
                    <h3 className="mb-1 text-xs font-semibold text-[var(--color-ink-faint)]">{t.other}</h3>
                    <ul className="list-disc space-y-1 ps-5 text-sm text-[var(--color-ink)]">
                      {phase.other.map((o) => <li key={o.en}>{o[lang]}</li>)}
                    </ul>
                  </div>
                )}
                <div className="rounded-xl border border-dashed border-[var(--color-border)] p-3">
                  {patient ? (
                    <>
                      <Link
                        href={`/treatment-planner?protocol=${protocol.id}&phase=${phase.id}#home-program`}
                        className="inline-flex min-h-11 items-center rounded-xl bg-[var(--color-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--color-primary-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
                      >
                        {t.startPhase}
                      </Link>
                      <p className="mt-1.5 text-xs text-[var(--color-ink-soft)]">{t.startFor(patient.name)}</p>
                    </>
                  ) : (
                    <>
                      <span className="block text-sm font-semibold text-[var(--color-ink-soft)]">{t.startPhase}</span>
                      <p className="mt-1 text-xs text-[var(--color-ink-soft)]">{isMockMode ? t.startDemo : t.startNeedsPatient}</p>
                      {!isMockMode && (
                        <Link href="/patients" className="mt-1.5 inline-block text-xs font-semibold text-[var(--color-primary-strong)] underline">
                          {t.choosePatient}
                        </Link>
                      )}
                    </>
                  )}
                </div>
                {phase.progressWhen.length > 0 && (
                  <div className="rounded-xl bg-[var(--color-primary-soft)] p-3">
                    <h3 className="mb-1 text-xs font-bold text-[var(--color-primary-strong)]">{t.progressWhen}</h3>
                    <ul className="space-y-1">
                      {phase.progressWhen.map((c) => (
                        <li key={c.en} className="flex gap-2 text-sm text-[var(--color-ink)]">
                          <span className="mt-0.5 shrink-0 text-[var(--color-primary-strong)]"><Icon name="check" width={14} height={14} /></span>
                          {c[lang]}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-xs font-semibold text-[var(--color-ink-faint)]">{t.exercises}</h3>
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {phase.exercises.map((id) => {
                    const source = exercises.find((exercise) => exercise.id === id);
                    if (!source) return null;
                    const ex = localizeExercise(source, locale);
                    const motion = motionFor(id);
                    return (
                      <li key={id}>
                        <Link
                          href={`/exercise-library/${id}`}
                          className="group block overflow-hidden rounded-xl border border-[var(--color-border)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
                        >
                          <div className="bg-[#14211D]">
                            {motion && <ExerciseFigureSvg motion={motion} p={0.8} glow={0} guide={false} className="block aspect-[5/3] h-auto w-full" />}
                          </div>
                          <span className="block px-2 py-1.5 text-xs font-semibold leading-snug text-[var(--color-ink)] group-hover:text-[var(--color-primary-strong)]">
                            {ex.name}
                            {ex.review === "pending" && (
                              <span className="ms-1 font-normal text-[var(--color-warn)]">· {t.pending}</span>
                            )}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section aria-labelledby="outcomes" className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 id="outcomes" className="mb-2 text-base font-bold text-[var(--color-ink)]">{t.outcomes}</h2>
          <dl className="space-y-2">
            {protocol.outcomes.map((o) => (
              <div key={o.name}>
                <dt className="text-sm font-semibold text-[var(--color-ink)]" dir="ltr">{o.name}</dt>
                <dd className="text-sm leading-relaxed text-[var(--color-ink-soft)]">{o.detail[lang]}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section aria-labelledby="watch" className="rounded-2xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] p-4">
          <h2 id="watch" className="mb-2 flex items-center gap-2 text-base font-bold text-[var(--color-danger)]">
            <Icon name="alert" width={18} height={18} />{t.watchFor}
          </h2>
          <ul className="list-disc space-y-1 ps-5 text-sm text-[var(--color-ink)]">
            {protocol.watchFor.map((w) => <li key={w.en}>{w[lang]}</li>)}
          </ul>
        </section>
      </div>

      <section aria-labelledby="refs">
        <h2 id="refs" className="mb-2 text-base font-bold text-[var(--color-ink)]">{t.references}</h2>
        <ol className="list-decimal space-y-1.5 ps-5 text-xs leading-relaxed text-[var(--color-ink-soft)]" dir="ltr">
          {protocol.references.map((r) => <li key={r} className="text-left">{r}</li>)}
        </ol>
      </section>
    </div>
  );
}
