"use client";

import { useEffect, useMemo, useState } from "react";
import { isMockMode } from "@/lib/config";
import { useLocale } from "@/lib/store/LocaleContext";
import { hasClinicalSafetyClearance } from "@/lib/clinical/safety";
import {
  EXAM_NOTE_KEYS,
  emptyFindings,
  normalizeFindings,
  type CaseFindingsVersion,
  type ClinicalFindings,
  type Irritability,
} from "@/lib/clinical/reasoning/findings";
import {
  KNOWLEDGE_VERSION,
  getRegionKnowledge,
  type Answer,
  type ExamTest,
  type TestResult,
} from "@/lib/clinical/reasoning/knowledge";
import {
  rankHypotheses,
  type RankedHypothesis,
  type ReasoningResult,
  type SupportLevel,
} from "@/lib/clinical/reasoning/rank";
import { localized, reasoningStrings } from "@/lib/clinical/reasoning/strings";
import {
  fetchCaseFindings,
  recordCaseFindings,
  type RecordFindingsFailure,
} from "@/lib/supabase/db";
import type { PatientCase } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Select, Textarea } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Misc";

const CLINICAL_AI_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_CLINICAL_AI_DRAFTS === "true";

type LoadState =
  | { status: "loading"; requestKey: string }
  | { status: "failed"; requestKey: string }
  | { status: "ready"; requestKey: string; current: CaseFindingsVersion | null };

const LEVEL_TONE: Record<SupportLevel, "success" | "primary" | "neutral" | "danger"> = {
  stronger: "success",
  some: "primary",
  weak: "neutral",
  against: "danger",
};

function sameFindings(a: ClinicalFindings, b: ClinicalFindings): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Saved findings apply only while the case is still in the same region. */
function startingFindings(
  current: CaseFindingsVersion | null,
  patientCase: PatientCase
): ClinicalFindings {
  if (!current || current.region !== patientCase.region) return emptyFindings();
  return normalizeFindings(current.findings, patientCase.region);
}

export function StructuredFindingsPanel({ patientCase }: { patientCase: PatientCase }) {
  const { locale } = useLocale();
  const s = reasoningStrings[locale];
  const knowledge = getRegionKnowledge(patientCase.region);
  const safetyCleared = hasClinicalSafetyClearance(patientCase.safetyScreen);
  const requestKey = `${patientCase.id}:${patientCase.region ?? ""}`;

  const [load, setLoad] = useState<LoadState>(() =>
    isMockMode
      ? { status: "ready", requestKey, current: null }
      : { status: "loading", requestKey }
  );
  const [reloadToken, setReloadToken] = useState(0);
  const [draft, setDraft] = useState<ClinicalFindings>(emptyFindings);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<RecordFindingsFailure | null>(null);

  useEffect(() => {
    if (isMockMode || !knowledge) return;
    let cancelled = false;
    fetchCaseFindings(patientCase.id).then((current) => {
      if (cancelled) return;
      if (current === undefined) {
        setLoad({ status: "failed", requestKey });
        return;
      }
      setLoad({ status: "ready", requestKey, current });
      setDraft(startingFindings(current, patientCase));
      setFailure(null);
    });
    return () => {
      cancelled = true;
    };
    // patientCase identity changes on every context refresh; the request
    // key captures the only inputs that change what is loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, reloadToken, knowledge]);

  // Demo mode never persists, so it is always "ready" with nothing saved.
  const loadState: LoadState = isMockMode
    ? { status: "ready", requestKey, current: load.status === "ready" ? load.current : null }
    : load.requestKey === requestKey
      ? load
      : { status: "loading", requestKey };
  const current = loadState.status === "ready" ? loadState.current : null;
  const saved = useMemo(
    () => startingFindings(current, patientCase),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current, requestKey]
  );
  const normalizedDraft = useMemo(
    () => normalizeFindings(draft, patientCase.region),
    [draft, patientCase.region]
  );
  const dirty = !sameFindings(normalizedDraft, saved);

  const reasoning = useMemo(
    () => rankHypotheses(patientCase.region, normalizedDraft, patientCase.age),
    [patientCase.region, patientCase.age, normalizedDraft]
  );

  if (!knowledge) {
    return (
      <Card>
        <CardHeader
          title={s.title}
          icon={<Icon name="analysis" width={18} height={18} />}
        />
        <CardBody>
          <p className="text-sm text-[var(--color-ink-soft)]">{s.noModule}</p>
        </CardBody>
      </Card>
    );
  }

  if (loadState.status === "loading") {
    return (
      <Card>
        <Spinner label={s.title} />
      </Card>
    );
  }

  if (loadState.status === "failed") {
    return (
      <Card>
        <CardHeader title={s.title} icon={<Icon name="alert" width={18} height={18} />} />
        <CardBody className="space-y-3">
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {s.loadFailed}
          </p>
          <Button type="button" variant="secondary" size="sm" onClick={() => setReloadToken((n) => n + 1)}>
            {s.retry}
          </Button>
        </CardBody>
      </Card>
    );
  }

  const setAnswer = (id: string, answer: Answer) =>
    setDraft((previous) => ({
      ...previous,
      intake: {
        ...previous.intake,
        answers: { ...previous.intake.answers, [id]: answer },
      },
    }));
  const setTest = (id: string, result: TestResult | null) =>
    setDraft((previous) => {
      const tests = { ...previous.exam.tests };
      if (result) tests[id] = result;
      else delete tests[id];
      return { ...previous, exam: { ...previous.exam, tests } };
    });

  async function save() {
    if (isMockMode || saving || !dirty) return;
    setSaving(true);
    setFailure(null);
    const result = await recordCaseFindings({
      caseId: patientCase.id,
      supersedesId: current?.id ?? null,
      knowledgeVersion: KNOWLEDGE_VERSION,
      findings: normalizedDraft,
    });
    setSaving(false);
    if (!result.ok) {
      setFailure(result.reason);
      return;
    }
    setLoad({
      status: "ready",
      requestKey,
      current: {
        id: result.id,
        caseId: patientCase.id,
        version: result.version,
        region: patientCase.region!,
        knowledgeVersion: KNOWLEDGE_VERSION,
        findings: normalizedDraft,
        authoredBy: null,
        createdAt: result.createdAt,
      },
    });
  }

  const savedLabel = current
    ? s.savedVersion(current.version, formatWhen(current.createdAt, locale))
    : s.nothingSaved;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
      <Card className="xl:col-span-3">
        <CardHeader
          title={s.title}
          subtitle={s.subtitle}
          icon={<Icon name="check" width={18} height={18} />}
        />
        <CardBody className="space-y-6">
          {isMockMode && (
            <p className="rounded-xl bg-[var(--color-warn-soft)] px-3 py-2 text-xs text-[var(--color-warn)]">
              {s.demoMode}
            </p>
          )}

          <section aria-labelledby="findings-history" className="space-y-3">
            <div>
              <h3 id="findings-history" className="text-sm font-semibold text-[var(--color-ink)]">
                {s.history}
              </h3>
              <p className="text-xs text-[var(--color-ink-faint)]">{s.historyHint}</p>
            </div>
            <ul className="divide-y divide-[var(--color-border)] rounded-xl border border-[var(--color-border)]">
              {knowledge.questions.map((question) => (
                <li
                  key={question.id}
                  className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span id={`q-${question.id}`} className="text-sm text-[var(--color-ink)]">
                    {localized(question, locale)}
                  </span>
                  <Segmented
                    labelledBy={`q-${question.id}`}
                    value={draft.intake.answers[question.id] ?? "unknown"}
                    onChange={(value) => setAnswer(question.id, value as Answer)}
                    options={[
                      { value: "yes", label: s.yes, tone: "primary" },
                      { value: "no", label: s.no, tone: "neutral" },
                      { value: "unknown", label: s.notAsked, tone: "muted" },
                    ]}
                  />
                </li>
              ))}
            </ul>
            <label className="flex flex-col gap-1.5 sm:max-w-xs">
              <span className="text-xs font-medium text-[var(--color-ink-soft)]">{s.irritability}</span>
              <Select
                value={draft.intake.irritability ?? ""}
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    intake: {
                      ...previous.intake,
                      irritability: (event.target.value || null) as Irritability | null,
                    },
                  }))
                }
              >
                {(["", "low", "moderate", "high"] as const).map((level) => (
                  <option key={level} value={level}>
                    {s.irritabilityLevels[level]}
                  </option>
                ))}
              </Select>
            </label>
          </section>

          <section aria-labelledby="findings-exam" className="space-y-3">
            <div>
              <h3 id="findings-exam" className="text-sm font-semibold text-[var(--color-ink)]">
                {s.exam}
              </h3>
              <p className="text-xs text-[var(--color-ink-faint)]">{s.examHint}</p>
            </div>
            <ul className="divide-y divide-[var(--color-border)] rounded-xl border border-[var(--color-border)]">
              {knowledge.tests.map((test) => (
                <li
                  key={test.id}
                  className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <span id={`t-${test.id}`} className="text-sm text-[var(--color-ink)]">
                      {localized(test, locale)}
                    </span>
                    <AccuracyLine test={test} sn={s.sensitivity} sp={s.specificity} />
                  </div>
                  <Segmented
                    labelledBy={`t-${test.id}`}
                    value={draft.exam.tests[test.id] ?? "none"}
                    onChange={(value) =>
                      setTest(test.id, value === "none" ? null : (value as TestResult))
                    }
                    options={[
                      { value: "positive", label: s.positive, tone: "primary" },
                      { value: "negative", label: s.negative, tone: "neutral" },
                      { value: "equivocal", label: s.equivocal, tone: "neutral" },
                      { value: "none", label: s.notTested, tone: "muted" },
                    ]}
                  />
                </li>
              ))}
            </ul>
          </section>

          <details className="group rounded-xl border border-[var(--color-border)]">
            <summary className="cursor-pointer px-3 py-2.5 text-sm font-semibold text-[var(--color-ink)]">
              {s.notes}
            </summary>
            <div className="grid grid-cols-1 gap-3 border-t border-[var(--color-border)] p-3 md:grid-cols-2">
              {EXAM_NOTE_KEYS.map((key) => (
                <label key={key} className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-[var(--color-ink-soft)]">
                    {s.noteLabels[key]}
                  </span>
                  <Textarea
                    rows={2}
                    maxLength={2000}
                    className="min-h-16"
                    value={draft.exam.notes[key] ?? ""}
                    onChange={(event) =>
                      setDraft((previous) => ({
                        ...previous,
                        exam: {
                          ...previous.exam,
                          notes: { ...previous.exam.notes, [key]: event.target.value },
                        },
                      }))
                    }
                  />
                </label>
              ))}
            </div>
          </details>

          <div className="flex flex-wrap items-center gap-3 border-t border-[var(--color-border)] pt-4">
            <Button
              type="button"
              onClick={save}
              disabled={isMockMode || saving || !dirty}
            >
              {saving ? s.saving : s.save}
            </Button>
            <span className="text-xs text-[var(--color-ink-faint)]" aria-live="polite">
              {dirty ? s.unsaved : savedLabel}
            </span>
            {failure && (
              <p role="alert" className="w-full text-xs text-[var(--color-danger)]">
                {s.failures[failure]}
                {failure === "stale" && (
                  <>
                    {" "}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => setReloadToken((n) => n + 1)}
                    >
                      {s.retry}
                    </button>
                  </>
                )}
              </p>
            )}
          </div>
        </CardBody>
      </Card>

      <div className="xl:col-span-2">
        <RankingCard
          reasoning={reasoning}
          safetyCleared={safetyCleared}
          aiReady={CLINICAL_AI_ENABLED && !isMockMode && !dirty && current !== null}
          screeningRules={knowledge.screeningRules.map((rule) => ({
            text: localized(rule, locale),
            source: rule.source,
          }))}
        />
      </div>
    </div>
  );
}

function RankingCard({
  reasoning,
  safetyCleared,
  aiReady,
  screeningRules,
}: {
  reasoning: ReasoningResult | null;
  safetyCleared: boolean;
  aiReady: boolean;
  screeningRules: { text: string; source: string }[];
}) {
  const { locale } = useLocale();
  const s = reasoningStrings[locale];

  return (
    <Card className="xl:sticky xl:top-4">
      <CardHeader
        title={s.ranking}
        subtitle={s.rankingHint}
        icon={<Icon name="sparkle" width={18} height={18} />}
      />
      <CardBody className="space-y-4">
        {screeningRules.length > 0 && (
          <div className="rounded-xl border border-[var(--color-warn)]/30 bg-[var(--color-warn-soft)] px-3 py-2.5">
            <p className="text-xs font-semibold text-[var(--color-warn)]">{s.screening}</p>
            <ul className="mt-1 space-y-1">
              {screeningRules.map((rule) => (
                <li key={rule.text} className="text-xs text-[var(--color-ink)]">
                  {rule.text}{" "}
                  <span className="text-[10px] text-[var(--color-ink-faint)]">({rule.source})</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!safetyCleared || !reasoning ? (
          <p role="status" className="rounded-xl bg-[var(--color-danger-soft)] px-3 py-2.5 text-xs text-[var(--color-danger)]">
            {s.rankingLocked}
          </p>
        ) : (
          <>
            <p className="text-[11px] text-[var(--color-ink-faint)]">
              {s.progress(
                reasoning.answeredQuestions,
                reasoning.totalQuestions,
                reasoning.recordedTests,
                reasoning.totalTests
              )}
            </p>
            {reasoning.medicalReview.length > 0 && (
              <div role="alert" className="rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-3 py-2.5 text-xs text-[var(--color-danger)]">
                {s.medicalReview}{" "}
                <strong>
                  {reasoning.medicalReview.map((h) => localized(h.label, locale)).join("، ")}
                </strong>
              </div>
            )}
            {reasoning.limitedData && (
              <p className="rounded-xl bg-[var(--color-surface-muted)] px-3 py-2 text-xs text-[var(--color-ink-soft)]">
                {s.limitedData}
              </p>
            )}

            <ol className="space-y-2">
              {reasoning.hypotheses.map((hypothesis, index) => (
                <HypothesisRow
                  key={hypothesis.id}
                  hypothesis={hypothesis}
                  rank={index + 1}
                  maxScore={Math.max(1, ...reasoning.hypotheses.map((h) => h.score))}
                />
              ))}
            </ol>

            {reasoning.nextTests.length > 0 && (
              <div>
                <h4 className="mb-1.5 text-xs font-semibold text-[var(--color-ink)]">
                  {s.nextTests}
                </h4>
                <ul className="space-y-1.5">
                  {reasoning.nextTests.map(({ test, informs }) => (
                    <li key={test.id} className="text-xs text-[var(--color-ink)]">
                      <span className="font-medium">{localized(test, locale)}</span>
                      <span className="text-[var(--color-ink-faint)]">
                        {" "}— {s.informs}: {informs.map((label) => localized(label, locale)).join("، ")}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {CLINICAL_AI_ENABLED && (
              <div className="space-y-1.5 border-t border-[var(--color-border)] pt-3">
                {aiReady ? (
                  <ButtonLink href="/ai-assistant" variant="secondary" size="sm">
                    <Icon name="sparkle" width={14} height={14} />
                    {s.askAi}
                  </ButtonLink>
                ) : (
                  <p className="text-xs text-[var(--color-ink-faint)]">{s.aiSaveFirst}</p>
                )}
                <p className="text-[11px] text-[var(--color-ink-faint)]">{s.askAiHint}</p>
              </div>
            )}
          </>
        )}

        <p className="rounded-lg bg-[var(--color-surface-muted)] px-3 py-2 text-[11px] text-[var(--color-ink-soft)]">
          {s.disclaimer}
        </p>
      </CardBody>
    </Card>
  );
}

function HypothesisRow({
  hypothesis,
  rank,
  maxScore,
}: {
  hypothesis: RankedHypothesis;
  rank: number;
  maxScore: number;
}) {
  const { locale } = useLocale();
  const s = reasoningStrings[locale];
  const width = Math.max(4, Math.round((Math.max(0, hypothesis.score) / maxScore) * 100));
  const reasons = [...hypothesis.supporting, ...hypothesis.against];

  return (
    <li className="rounded-xl border border-[var(--color-border)] px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-[var(--color-ink)]">
          {rank}. {localized(hypothesis.label, locale)}
          {hypothesis.requiresMedicalReview && (
            <Icon name="alert" width={14} height={14} className="ms-1 inline text-[var(--color-danger)]" />
          )}
        </span>
        <Badge tone={LEVEL_TONE[hypothesis.level]} className="shrink-0">
          {s.levels[hypothesis.level]}
        </Badge>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-muted)]" aria-hidden="true">
        <div
          className={cn(
            "h-full rounded-full",
            hypothesis.level === "against"
              ? "bg-[var(--color-danger)]/40"
              : "bg-[var(--color-primary)]"
          )}
          style={{ width: `${width}%` }}
        />
      </div>
      <details className="mt-1.5">
        <summary className="cursor-pointer text-[11px] text-[var(--color-primary-strong)]">
          {s.why} ({hypothesis.score > 0 ? "+" : ""}
          {hypothesis.score})
        </summary>
        {reasons.length === 0 ? (
          <p className="mt-1 text-[11px] text-[var(--color-ink-faint)]">{s.noReasons}</p>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {reasons.map((reason, index) => (
              <li
                key={`${reason.kind}-${index}`}
                className={cn(
                  "text-[11px]",
                  reason.weight > 0 ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"
                )}
              >
                {reason.weight > 0 ? "+" : ""}
                {reason.weight} · {localized(reason.label, locale)} — {localized(reason.detail, locale)}
              </li>
            ))}
          </ul>
        )}
      </details>
    </li>
  );
}

function AccuracyLine({ test, sn, sp }: { test: ExamTest; sn: string; sp: string }) {
  const accuracy = test.accuracy;
  if (!accuracy) return null;
  const parts = [
    accuracy.sensitivity !== undefined ? `${sn} ${Math.round(accuracy.sensitivity * 100)}%` : null,
    accuracy.specificity !== undefined ? `${sp} ${Math.round(accuracy.specificity * 100)}%` : null,
  ].filter(Boolean);
  return (
    <span className="mt-0.5 block text-[10px] leading-snug text-[var(--color-ink-faint)]" dir="ltr">
      {accuracy.target}
      {parts.length > 0 ? ` · ${parts.join(" · ")}` : ""}
      {accuracy.note ? ` · ${accuracy.note}` : ""} — {accuracy.source}
    </span>
  );
}

function Segmented({
  value,
  options,
  onChange,
  labelledBy,
}: {
  value: string;
  options: { value: string; label: string; tone: "primary" | "neutral" | "muted" }[];
  onChange: (value: string) => void;
  labelledBy: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className="inline-flex shrink-0 overflow-hidden rounded-lg border border-[var(--color-border)]"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "px-2.5 py-1 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]/40",
              selected
                ? option.tone === "primary"
                  ? "bg-[var(--color-primary)] text-white"
                  : option.tone === "neutral"
                    ? "bg-[var(--color-ink)] text-white"
                    : "bg-[var(--color-surface-muted)] text-[var(--color-ink-soft)]"
                : "bg-white text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-muted)]"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function formatWhen(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale === "fa" ? "fa-IR" : locale === "ar" ? "ar" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
