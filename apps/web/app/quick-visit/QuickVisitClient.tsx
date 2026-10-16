"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Input } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Misc";
import { buildTreatmentPlan } from "@/lib/ai/engine";
import { buildTreatmentPlanFa } from "@/lib/ai/treatmentPlanFa";
import { describeDosage, dosagePayload } from "@/lib/clinical/dosage";
import { addPhaseExercises } from "@/lib/clinical/protocolPrefill";
import { postOpProtocolsFor, protocolLinkFor, type Protocol } from "@/lib/clinical/protocols";
import {
  irritabilityForPain,
  nextQuestion,
  nextTest,
  quickResult,
  quickSafetyItems,
  stageForDuration,
  type Duration,
} from "@/lib/clinical/quickVisit";
import { POST_OP_QUESTION, emptyFindings, type ClinicalFindings } from "@/lib/clinical/reasoning/findings";
import { KNOWLEDGE_VERSION } from "@/lib/clinical/reasoning/knowledge";
import { rankHypotheses } from "@/lib/clinical/reasoning/rank";
import { localized } from "@/lib/clinical/reasoning/strings";
import { evaluateSafetyScreen } from "@/lib/clinical/safety";
import {
  defaultPrecautions,
  defaultStopRules,
  defaultWeekdays,
  WEEK_ORDER_EN,
  WEEK_ORDER_FA,
} from "@/lib/clinical/scheduleDefaults";
import { isMockMode } from "@/lib/config";
import { regionLabel } from "@/lib/data/bodyRegionsFa";
import { exerciseFa } from "@/lib/data/exerciseFa";
import { exercises } from "@/lib/data/exercises";
import { localizeExercise } from "@/lib/data/exerciseLibraryFa";
import { localizedRedFlag } from "@/lib/data/redFlags";
import { useText } from "@/lib/i18n/text";
import { formatJalali } from "@/lib/jalali";
import { useAuth } from "@/lib/store/AuthContext";
import { useCases } from "@/lib/store/CaseContext";
import { useLocale } from "@/lib/store/LocaleContext";
import {
  createPatientEpisode,
  fetchPatientRegistry,
  publishPrescription,
  recordCaseFindings,
  reviewTreatmentPlan,
  savePrescriptionDraft,
  saveTreatmentPlanDraft,
} from "@/lib/supabase/db";
import type {
  BodyRegionId,
  Irritability,
  PatientCase,
  PatientRegistryItem,
  PrescriptionItemInput,
  TreatmentPlan,
  TreatmentPlanInput,
} from "@/lib/types";
import { cn, isUuid, localDateValue, uuid } from "@/lib/utils";
import { redFlagsText } from "@/app/red-flags/text";
import { quickVisitText } from "./text";

type Step = "patient" | "safety" | "surgery" | "questions" | "tests" | "result" | "review" | "done" | "stopped";

const REGIONS: BodyRegionId[] = ["neck", "shoulder", "low-back", "hip", "knee", "ankle-foot"];
const DURATIONS: Duration[] = ["under6w", "6to12w", "over12w"];

/** Progress-bar index of each step. */
const STEP_INDEX: Record<Step, number> = {
  patient: 0, safety: 1, surgery: 1, stopped: 1, questions: 2, tests: 3, result: 4, review: 5, done: 5,
};

interface ReviewDraft {
  input: TreatmentPlanInput;
  plan: TreatmentPlan;
  protocol: Protocol;
  phaseId: string;
  items: PrescriptionItemInput[];
  pending: string[];
}

function plusDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localDateValue(date);
}

/* ── Large, finger-friendly choices ───────────────────────────────── */

function Choice({
  children,
  onClick,
  active,
  tone = "neutral",
  disabled,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  tone?: "neutral" | "primary" | "danger";
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "min-h-16 rounded-2xl border-2 px-5 py-3 text-lg font-semibold transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-primary)]/30 disabled:opacity-45",
        active
          ? tone === "danger"
            ? "border-[var(--color-danger)] bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
            : "border-[var(--color-primary)] bg-[var(--color-primary-tint)] text-[var(--color-primary-strong)]"
          : tone === "primary"
            ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-strong)]"
            : "border-[var(--color-border)] bg-white text-[var(--color-ink)] hover:border-[var(--color-primary)]/60",
        className
      )}
    >
      {children}
    </button>
  );
}

/** A fresh visit for the next patient remounts the steps with empty state. */
export function QuickVisitClient() {
  const [round, setRound] = useState(0);
  return <QuickVisitSteps key={round} onRestart={() => setRound((value) => value + 1)} />;
}

function QuickVisitSteps({ onRestart }: { onRestart: () => void }) {
  const t = useText(quickVisitText);
  const safetyCopy = useText(redFlagsText).copy;
  const { locale } = useLocale();
  const lang = locale === "fa" ? "fa" : "en";
  const router = useRouter();
  const patientParam = useSearchParams().get("patient");
  const { profile, activeClinicId } = useAuth();
  const { addCase, setCurrentCase } = useCases();

  const [step, setStep] = useState<Step>("patient");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Patient
  const [mode, setMode] = useState<"new" | "existing">(isUuid(patientParam) ? "existing" : "new");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<PatientRegistryItem[] | null>(null);
  const [patient, setPatient] = useState<PatientRegistryItem | null>(null);
  const [age, setAge] = useState("");
  const [region, setRegion] = useState<BodyRegionId | null>(null);
  const [duration, setDuration] = useState<Duration | null>(null);
  const [pain, setPain] = useState(5);
  const [complaint, setComplaint] = useState("");

  // Safety
  const [warnings, setWarnings] = useState<string[]>([]);
  const [risks, setRisks] = useState<string[]>([]);
  const [showAllFlags, setShowAllFlags] = useState(false);
  const [patientCase, setPatientCase] = useState<PatientCase | null>(null);

  // History and exam
  const [findings, setFindings] = useState<ClinicalFindings>(emptyFindings);
  const [skippedQuestions, setSkippedQuestions] = useState<string[]>([]);
  const [skippedTests, setSkippedTests] = useState<string[]>([]);
  const [thorough, setThorough] = useState(false);
  const [history, setHistory] = useState<{ findings: ClinicalFindings; skippedQuestions: string[]; skippedTests: string[]; step: Step }[]>([]);
  const [findingsSaved, setFindingsSaved] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [saveAttempt, setSaveAttempt] = useState(0);

  // Review
  const [review, setReview] = useState<ReviewDraft | null>(null);
  const [irritability, setIrritability] = useState<Irritability>("moderate");
  const [reviewDate, setReviewDate] = useState(plusDays(14));
  const [attested, setAttested] = useState(false);
  const [published, setPublished] = useState<"program" | "plan" | null>(null);

  const ageNumber = Number(age);
  const validAge = Number.isInteger(ageNumber) && ageNumber >= 1 && ageNumber <= 120;
  const canWrite = profile?.role === "clinic_owner" || profile?.role === "therapist";

  // A patient opened from their record: load them once.
  const loadedParam = useRef(false);
  useEffect(() => {
    if (loadedParam.current || isMockMode || !activeClinicId || !isUuid(patientParam)) return;
    loadedParam.current = true;
    fetchPatientRegistry({ clinicId: activeClinicId, patientId: patientParam, pageSize: 1 }).then((result) => {
      const row = result?.patients.find((candidate) => candidate.id === patientParam) ?? null;
      if (row) choosePatient(row);
    });
  }, [activeClinicId, patientParam]);

  function choosePatient(row: PatientRegistryItem) {
    setPatient(row);
    if (row.birthYear) setAge(String(new Date().getFullYear() - row.birthYear));
  }

  async function runSearch(event: React.FormEvent) {
    event.preventDefault();
    if (!activeClinicId || !search.trim()) return;
    setBusy("search");
    const result = await fetchPatientRegistry({ clinicId: activeClinicId, search: search.trim(), page: 1, pageSize: 8 });
    setBusy(null);
    setResults(result?.patients ?? []);
  }

  const safety = quickSafetyItems(region);
  const allWarnings = quickSafetyItems(undefined).warnings;
  const shownWarnings = showAllFlags ? allWarnings : safety.warnings;

  const ranking = useMemo(
    () => (region ? rankHypotheses(region, findings, validAge ? ageNumber : null) : null),
    [region, findings, validAge, ageNumber]
  );
  const result = quickResult(ranking);
  const skippedQ = useMemo(() => new Set(skippedQuestions), [skippedQuestions]);
  const skippedT = useMemo(() => new Set(skippedTests), [skippedTests]);
  const currentQuestion =
    step === "questions" && region ? nextQuestion(region, findings, validAge ? ageNumber : null, skippedQ, thorough) : null;
  const currentTest =
    step === "tests" && region ? nextTest(region, findings, validAge ? ageNumber : null, skippedT, thorough) : null;
  const postOp = findings.intake.answers[POST_OP_QUESTION] === "yes";

  // Each step starts at the top of the page.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  /* ── Step transitions ─────────────────────────────────────────── */

  function snapshot() {
    setHistory((previous) => [...previous, { findings, skippedQuestions, skippedTests, step }]);
  }

  function undo() {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((previous) => previous.slice(0, -1));
    setFindings(last.findings);
    setSkippedQuestions(last.skippedQuestions);
    setSkippedTests(last.skippedTests);
    setStep(last.step);
  }

  /** The step after the history, given the latest findings. */
  function afterHistory(next: ClinicalFindings, skippedQ2: Set<string>, skippedT2: Set<string>, deep: boolean): Step {
    if (!region) return "result";
    const years = validAge ? ageNumber : null;
    if (nextQuestion(region, next, years, skippedQ2, deep)) return "questions";
    if (nextTest(region, next, years, skippedT2, deep)) return "tests";
    return "result";
  }

  async function submitPatient() {
    setError(null);
    if (!isMockMode && mode === "existing" && !patient) return setError(t.needPatient);
    if (mode === "new" && fullName.trim().length < 2) return setError(t.needPatient);
    if (!validAge) return setError(t.needAge);
    if (!region) return setError(t.needRegion);
    if (!duration) return setError(t.needDuration);
    if (isMockMode || mode === "existing") {
      setStep("safety");
      return;
    }
    if (!activeClinicId || !profile) return;
    setBusy("patient");
    const created = await createPatientEpisode({
      clinicId: activeClinicId,
      fullName,
      phone: phone.trim() || null,
      birthYear: new Date().getFullYear() - ageNumber,
      gender: null,
      titleFa: `درمان ${regionLabel(region, "fa")}`,
      weeklyTarget: 5,
      assignedTherapistId: profile.role === "therapist" ? profile.id : null,
    });
    const row = created?.patientId
      ? (await fetchPatientRegistry({ clinicId: activeClinicId, patientId: created.patientId, pageSize: 1 }))?.patients.find(
          (candidate) => candidate.id === created.patientId
        ) ?? null
      : null;
    setBusy(null);
    if (!row) {
      setError(t.createFailed);
      return;
    }
    setPatient(row);
    setMode("existing");
    setStep("safety");
  }

  async function saveCase(postOpAnswer: "yes" | "no") {
    if (!region || !duration) return;
    setError(null);
    const selected = [...warnings, ...risks];
    const disposition = evaluateSafetyScreen(selected, true);
    const name = isMockMode ? fullName.trim() : patient?.fullName ?? fullName.trim();
    const newCase: PatientCase = {
      id: uuid(),
      createdAt: new Date().toISOString(),
      name,
      age: ageNumber,
      gender: null,
      mainComplaint: complaint.trim() || regionLabel(region, locale),
      painLocation: regionLabel(region, locale),
      painIntensity: pain,
      duration: t.durations[duration],
      mechanism: "",
      aggravating: "",
      easing: "",
      medicalHistory: "",
      surgicalHistory: postOpAnswer === "yes" ? t.surgeryTitle : "",
      imaging: "",
      medications: "",
      functionalLimitations: "",
      patientGoal: "",
      region,
      patientId: isMockMode ? undefined : patient?.id,
      episodeId: isMockMode ? undefined : patient?.activeEpisode?.id,
      safetyScreen: {
        screenedAt: new Date().toISOString(),
        selectedFlagIds: warnings,
        riskFactorIds: risks,
        disposition,
      },
    };
    setBusy("case");
    const ok = await addCase(newCase);
    setBusy(null);
    if (!ok) {
      setError(t.caseFailed);
      return;
    }
    setPatientCase(newCase);
    setIrritability(irritabilityForPain(pain));
    if (disposition !== "clear") {
      setStep("stopped");
      return;
    }
    const start = { ...emptyFindings(), intake: { answers: { [POST_OP_QUESTION]: postOpAnswer }, irritability: irritabilityForPain(pain) } };
    setFindings(start);
    setStep(postOpAnswer === "yes" ? "result" : afterHistory(start, new Set(), new Set(), false));
  }

  function answerQuestion(answer: "yes" | "no" | "unknown") {
    if (!currentQuestion) return;
    snapshot();
    let next = findings;
    let nextSkipped = skippedQuestions;
    if (answer === "unknown") {
      nextSkipped = [...skippedQuestions, currentQuestion.id];
      setSkippedQuestions(nextSkipped);
    } else {
      next = { ...findings, intake: { ...findings.intake, answers: { ...findings.intake.answers, [currentQuestion.id]: answer } } };
      setFindings(next);
    }
    setStep(afterHistory(next, new Set(nextSkipped), skippedT, thorough));
  }

  function recordTest(answer: "positive" | "negative" | "skip") {
    if (!currentTest) return;
    snapshot();
    let next = findings;
    let nextSkipped = skippedTests;
    if (answer === "skip") {
      nextSkipped = [...skippedTests, currentTest.id];
      setSkippedTests(nextSkipped);
    } else {
      next = { ...findings, exam: { ...findings.exam, tests: { ...findings.exam.tests, [currentTest.id]: answer } } };
      setFindings(next);
    }
    const years = validAge ? ageNumber : null;
    setStep(region && nextTest(region, next, years, new Set(nextSkipped), thorough) ? "tests" : "result");
  }

  function askMore() {
    snapshot();
    setThorough(true);
    setStep(afterHistory(findings, skippedQ, skippedT, true));
  }

  // The result is saved as the case's structured findings (append-only).
  const savedFor = useRef<string | null>(null);
  useEffect(() => {
    if (step !== "result" || !patientCase || isMockMode) return;
    const key = `${saveAttempt}:${JSON.stringify(findings)}`;
    if (savedFor.current === key) return;
    savedFor.current = key;
    let cancelled = false;
    setFindingsSaved("saving");
    recordCaseFindings({
      caseId: patientCase.id,
      supersedesId: null,
      knowledgeVersion: KNOWLEDGE_VERSION,
      findings,
    }).then((saved) => {
      if (cancelled) return;
      if (!saved.ok && saved.reason === "stale") {
        // A version already exists for this case (result revisited): keep it.
        setFindingsSaved("saved");
        return;
      }
      setFindingsSaved(saved.ok ? "saved" : "failed");
    });
    return () => {
      cancelled = true;
    };
  }, [step, patientCase, findings, saveAttempt]);

  function retryFindings() {
    setSaveAttempt((value) => value + 1);
  }

  /* ── Review: plan and program drafts ──────────────────────────── */

  const patientReady = useMemo(
    () => exercises.filter((exercise) => exercise.review === "approved" && Boolean(exerciseFa[exercise.id])),
    []
  );

  function buildReview(protocol: Protocol) {
    if (!region || !duration || !patientCase) return;
    const phase = protocol.phases[0];
    const input: TreatmentPlanInput = {
      region,
      stage: stageForDuration(duration),
      painSeverity: pain,
      irritability,
      mainImpairment: patientCase.mainComplaint,
      patientGoal: "",
      safetyConfirmed: true,
    };
    const guide = { protocol, phase };
    const plan = lang === "fa" ? buildTreatmentPlanFa(input, guide) : buildTreatmentPlan(input, guide);
    const newRow = (): PrescriptionItemInput => ({ exerciseId: "", dosageFa: "", daysPerWeek: 0, scheduledWeekdays: [] });
    const prefill = addPhaseExercises([], phase.exercises, patientReady, newRow);
    const items = prefill.items
      .filter((item) => item.exerciseId)
      .map((item) => {
        const days = defaultWeekdays(exercises.find((exercise) => exercise.id === item.exerciseId)?.category);
        return { ...item, scheduledWeekdays: days, daysPerWeek: days.length };
      });
    setReview({ input, plan, protocol, phaseId: phase.id, items, pending: prefill.pending });
    setAttested(false);
    setStep("review");
  }

  async function publish() {
    if (!review || !patientCase || !attested || busy) return;
    setError(null);
    const input = { ...review.input, irritability };
    setBusy(t.stepPlan);
    const draft = await saveTreatmentPlanDraft({ caseId: patientCase.id, input, plan: review.plan });
    if (!draft) return fail();
    setBusy(t.stepApprove);
    const approved = await reviewTreatmentPlan({ planId: draft.id, decision: "approved" });
    if (!approved) return fail();
    if (review.items.length === 0) {
      setBusy(null);
      setPublished("plan");
      setStep("done");
      return;
    }
    setBusy(t.stepProgram);
    const program = await savePrescriptionDraft({
      treatmentPlanId: approved.id,
      startDate: localDateValue(),
      endDate: plusDays(42),
      precautions: defaultPrecautions("fa"),
      stopRules: defaultStopRules("fa"),
      reviewDate,
      scheduleTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tehran",
      items: review.items.map((item) => ({
        targetSets: item.targetSets,
        targetReps: item.targetReps,
        targetDurationSeconds: item.targetDurationSeconds,
        scheduledWeekdays: item.scheduledWeekdays,
        exerciseId: item.exerciseId,
        dosageFa: item.dosageFa.trim(),
        daysPerWeek: item.daysPerWeek,
        ...dosagePayload(item),
      })),
    });
    if (!program) return fail();
    setBusy(t.stepPublish);
    const done = await publishPrescription(program.id);
    if (!done) return fail();
    setBusy(null);
    setPublished("program");
    setStep("done");
  }

  function fail() {
    setBusy(null);
    setError(t.publishFailed);
  }

  function openFull(href: string) {
    if (patientCase) setCurrentCase(patientCase.id);
    router.push(href);
  }

  /* ── Render ───────────────────────────────────────────────────── */

  if (!isMockMode && !canWrite) {
    return <p className="text-sm text-[var(--color-ink-soft)]">{t.needPatient}</p>;
  }

  const order = lang === "fa" ? WEEK_ORDER_FA : WEEK_ORDER_EN;
  const daysText = (days: number[] = []) =>
    days.length === 7 || days.length === 0
      ? t.everyDay
      : order.filter((day) => days.includes(day)).map((day) => t.weekdays[day]).join("، ");
  const exerciseName = (id: string) => {
    const exercise = exercises.find((candidate) => candidate.id === id);
    return exercise ? localizeExercise(exercise, locale).name : id;
  };
  const leadingProtocol = result.leading ? protocolLinkFor(result.leading) : undefined;
  const answeredCount = Object.keys(findings.intake.answers).filter((id) => id !== POST_OP_QUESTION).length;
  const testedCount = Object.keys(findings.exam.tests).length;

  return (
    <div className="mx-auto max-w-2xl space-y-5 text-base">
      <header className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-extrabold text-[var(--color-ink)]">{t.title}</h2>
          {patientCase && step !== "done" && (
            <button type="button" onClick={() => openFull("/case-analysis")} className="text-sm text-[var(--color-ink-soft)] underline">
              {t.fullMode}
            </button>
          )}
        </div>
        <ol className="grid grid-cols-6 gap-1.5" aria-label={t.title}>
          {t.steps.map((label, index) => (
            <li key={label} className="space-y-1">
              <div
                className={cn(
                  "h-2 rounded-full",
                  index < STEP_INDEX[step]
                    ? "bg-[var(--color-primary)]"
                    : index === STEP_INDEX[step]
                      ? "bg-[var(--color-primary)]/60"
                      : "bg-[var(--color-border)]"
                )}
              />
              <span
                className={cn(
                  "block text-center text-xs",
                  index === STEP_INDEX[step] ? "font-bold text-[var(--color-primary-strong)]" : "text-[var(--color-ink-faint)]"
                )}
                aria-current={index === STEP_INDEX[step] ? "step" : undefined}
              >
                {label}
              </span>
            </li>
          ))}
        </ol>
      </header>

      {error && (
        <p role="alert" className="rounded-xl bg-[var(--color-danger-soft)] px-4 py-3 text-base text-[var(--color-danger)]">
          {error}
        </p>
      )}

      {step === "patient" && (
        <Card>
          <CardBody className="space-y-6">
            {!isMockMode && !patient && (
              <div className="grid grid-cols-2 gap-3">
                <Choice active={mode === "new"} onClick={() => setMode("new")}>{t.newPatient}</Choice>
                <Choice active={mode === "existing"} onClick={() => setMode("existing")}>{t.existingPatient}</Choice>
              </div>
            )}

            {patient ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--color-primary-tint)] px-4 py-3">
                <span className="text-lg font-bold text-[var(--color-ink)]" dir="auto">{patient.fullName}</span>
                <button type="button" className="text-sm underline" onClick={() => { setPatient(null); setResults(null); }}>
                  {t.change}
                </button>
                {!patient.activeEpisode && (
                  <p className="w-full text-sm text-[var(--color-danger)]">
                    {t.noEpisode} <Link href="/patients" className="font-semibold underline">{t.toPatients}</Link>
                  </p>
                )}
              </div>
            ) : mode === "new" || isMockMode ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-base font-semibold">{t.fullName}</span>
                  <Input value={fullName} onChange={(event) => setFullName(event.target.value)} className="min-h-14 text-lg" maxLength={120} autoFocus />
                </label>
                {!isMockMode && (
                  <label className="space-y-1.5">
                    <span className="text-base font-semibold">{t.phone}</span>
                    <Input value={phone} onChange={(event) => setPhone(event.target.value)} className="min-h-14 text-lg" inputMode="tel" dir="ltr" maxLength={20} />
                  </label>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <form onSubmit={runSearch} className="flex gap-2">
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.searchPlaceholder} className="min-h-14 flex-1 text-lg" autoFocus />
                  <Button type="submit" size="lg" disabled={busy === "search"}>{t.search}</Button>
                </form>
                {results && results.length === 0 && <p className="text-base text-[var(--color-ink-soft)]">{t.noResults}</p>}
                {results && results.length > 0 && (
                  <ul className="space-y-2">
                    {results.map((row) => (
                      <li key={row.id}>
                        <Choice onClick={() => choosePatient(row)} className="w-full text-start">
                          <span dir="auto">{row.fullName}</span>
                        </Choice>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <label className="block max-w-40 space-y-1.5">
              <span className="text-base font-semibold">{t.age}</span>
              <Input value={age} onChange={(event) => setAge(event.target.value.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))))} inputMode="numeric" maxLength={3} className="min-h-14 text-lg" dir="ltr" />
            </label>

            <fieldset className="space-y-2">
              <legend className="mb-2 text-base font-semibold">{t.region}</legend>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {REGIONS.map((id) => (
                  <Choice key={id} active={region === id} onClick={() => setRegion(id)}>
                    {regionLabel(id, locale)}
                  </Choice>
                ))}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="mb-2 text-base font-semibold">{t.duration}</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                {DURATIONS.map((id) => (
                  <Choice key={id} active={duration === id} onClick={() => setDuration(id)}>
                    {t.durations[id]}
                  </Choice>
                ))}
              </div>
            </fieldset>

            <label className="block space-y-2">
              <span className="text-base font-semibold">{t.pain(pain)}</span>
              <input
                type="range"
                min={0}
                max={10}
                value={pain}
                onChange={(event) => setPain(Number(event.target.value))}
                className="h-3 w-full cursor-pointer appearance-none rounded-full bg-gradient-to-r from-[var(--color-success)] via-[var(--color-warn)] to-[var(--color-danger)] rtl:bg-gradient-to-l"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-base font-semibold">{t.complaint}</span>
              <Input value={complaint} onChange={(event) => setComplaint(event.target.value)} className="min-h-14 text-lg" maxLength={200} dir="auto" />
            </label>

            <Button size="lg" className="w-full min-h-14 text-lg" disabled={Boolean(busy) || Boolean(patient && !patient.activeEpisode)} onClick={() => void submitPatient()}>
              {busy === "patient" ? t.creating : t.next}
            </Button>
          </CardBody>
        </Card>
      )}

      {step === "safety" && (
        <Card>
          <CardBody className="space-y-5">
            <div>
              <h3 className="text-xl font-bold text-[var(--color-ink)]">{t.safetyTitle}</h3>
              <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{t.safetyHint}</p>
            </div>
            <ul className="grid gap-2">
              {shownWarnings.map((flag) => {
                const item = localizedRedFlag(flag, locale);
                const on = warnings.includes(flag.id);
                return (
                  <li key={flag.id}>
                    <Choice
                      active={on}
                      tone="danger"
                      className="w-full text-start text-base"
                      onClick={() => setWarnings((previous) => (on ? previous.filter((id) => id !== flag.id) : [...previous, flag.id]))}
                    >
                      <span className="block">{item.label}</span>
                      <span className="block text-sm font-normal text-[var(--color-ink-soft)]">{item.detail}</span>
                    </Choice>
                  </li>
                );
              })}
            </ul>
            {!showAllFlags && safety.hidden > 0 && (
              <button type="button" className="text-sm font-semibold text-[var(--color-primary-strong)] underline" onClick={() => setShowAllFlags(true)}>
                {t.showAll(safety.hidden)}
              </button>
            )}
            <details className="rounded-xl border border-[var(--color-border)] px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-[var(--color-ink-soft)]">{t.risks}</summary>
              <div className="mt-3 flex flex-wrap gap-2">
                {safety.risks.map((flag) => {
                  const on = risks.includes(flag.id);
                  return (
                    <Choice
                      key={flag.id}
                      active={on}
                      className="min-h-12 text-sm"
                      onClick={() => setRisks((previous) => (on ? previous.filter((id) => id !== flag.id) : [...previous, flag.id]))}
                    >
                      {localizedRedFlag(flag, locale).label}
                    </Choice>
                  );
                })}
              </div>
            </details>
            <div className="grid gap-3 sm:grid-cols-2">
              {warnings.length === 0 ? (
                <Choice tone="primary" onClick={() => setStep("surgery")}>{t.none}</Choice>
              ) : (
                <Choice tone="primary" onClick={() => setStep("surgery")}>{t.someSelected(warnings.length)}</Choice>
              )}
              <Button variant="ghost" size="lg" onClick={() => setStep("patient")}>{t.back}</Button>
            </div>
          </CardBody>
        </Card>
      )}

      {step === "surgery" && (
        <Card>
          <CardBody className="space-y-5">
            <h3 className="text-xl font-bold text-[var(--color-ink)]">{t.surgeryTitle}</h3>
            <div className="grid grid-cols-2 gap-3">
              <Choice disabled={Boolean(busy)} onClick={() => void saveCase("yes")}>{t.yes}</Choice>
              <Choice disabled={Boolean(busy)} onClick={() => void saveCase("no")}>{t.no}</Choice>
            </div>
            {busy === "case" && <Spinner label={t.saving} />}
            <Button variant="ghost" onClick={() => setStep("safety")} disabled={Boolean(busy)}>{t.back}</Button>
          </CardBody>
        </Card>
      )}

      {step === "stopped" && patientCase && (
        <Card>
          <CardBody className="space-y-4">
            <h3 className="text-xl font-bold text-[var(--color-danger)]">{t.stoppedTitle}</h3>
            {(() => {
              const disposition = patientCase.safetyScreen?.disposition;
              const copy = disposition && disposition !== "not-screened" ? safetyCopy[disposition] : null;
              return copy ? (
                <div role="alert" className="rounded-xl bg-[var(--color-danger-soft)] px-4 py-3 text-[var(--color-danger)]">
                  <p className="text-lg font-bold">{copy.title}</p>
                  <p className="mt-1 text-base">{copy.detail}</p>
                </div>
              ) : null;
            })()}
            <div>
              <p className="text-sm font-semibold">{t.stoppedSigns}</p>
              <ul className="mt-1 list-disc ps-5 text-base">
                {warnings.map((id) => {
                  const flag = allWarnings.find((candidate) => candidate.id === id);
                  return <li key={id}>{flag ? localizedRedFlag(flag, locale).label : id}</li>;
                })}
              </ul>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="lg" onClick={() => openFull("/red-flags")}>{t.toSafety}</Button>
              {patient && (
                <ButtonLink size="lg" variant="secondary" href={`/workspace?patient=${encodeURIComponent(patient.id)}`}>
                  {t.toWorkspace}
                </ButtonLink>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      {step === "questions" && currentQuestion && (
        <Card>
          <CardBody className="space-y-6">
            <p className="text-sm text-[var(--color-ink-faint)]">
              {t.question(answeredCount + skippedQuestions.length + 1)}
              {thorough && ` · ${t.thoroughNote}`}
            </p>
            <h3 className="text-2xl font-bold leading-relaxed text-[var(--color-ink)]">{localized(currentQuestion, locale)}</h3>
            <div className="grid grid-cols-3 gap-3">
              <Choice tone="primary" onClick={() => answerQuestion("yes")}>{t.yes}</Choice>
              <Choice onClick={() => answerQuestion("no")}>{t.no}</Choice>
              <Choice onClick={() => answerQuestion("unknown")} className="text-base text-[var(--color-ink-soft)]">{t.unknown}</Choice>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button variant="ghost" onClick={undo} disabled={history.length === 0}>{t.back}</Button>
              <Button
                variant="secondary"
                onClick={() => {
                  snapshot();
                  const years = validAge ? ageNumber : null;
                  setStep(region && nextTest(region, findings, years, skippedT, thorough) ? "tests" : "result");
                }}
              >
                {t.enough}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {step === "tests" && currentTest && (
        <Card>
          <CardBody className="space-y-6">
            <p className="text-sm text-[var(--color-ink-faint)]">{t.test(testedCount + skippedTests.length + 1)}</p>
            <h3 className="text-2xl font-bold leading-relaxed text-[var(--color-ink)]">{localized(currentTest, locale)}</h3>
            {currentTest.accuracy && (
              <p className="text-sm text-[var(--color-ink-soft)]" dir="ltr">
                {currentTest.accuracy.target}
                {currentTest.accuracy.sensitivity !== undefined && ` · Sn ${Math.round(currentTest.accuracy.sensitivity * 100)}%`}
                {currentTest.accuracy.specificity !== undefined && ` · Sp ${Math.round(currentTest.accuracy.specificity * 100)}%`}
                {` — ${currentTest.accuracy.source}`}
              </p>
            )}
            {(() => {
              const informs = ranking?.nextTests.find((candidate) => candidate.test.id === currentTest.id)?.informs ?? [];
              return informs.length > 0 ? (
                <p className="text-base text-[var(--color-ink-soft)]">
                  {t.informs}: {informs.map((label) => localized(label, locale)).join("، ")}
                </p>
              ) : null;
            })()}
            <div className="grid grid-cols-3 gap-3">
              <Choice tone="primary" onClick={() => recordTest("positive")}>{t.positive}</Choice>
              <Choice onClick={() => recordTest("negative")}>{t.negative}</Choice>
              <Choice onClick={() => recordTest("skip")} className="text-base text-[var(--color-ink-soft)]">{t.notDone}</Choice>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button variant="ghost" onClick={undo} disabled={history.length === 0}>{t.back}</Button>
              <Button variant="secondary" onClick={() => { snapshot(); setStep("result"); }}>{t.toResult}</Button>
            </div>
          </CardBody>
        </Card>
      )}

      {step === "result" && (
        <Card>
          <CardBody className="space-y-5">
            {findingsSaved === "saving" && <Spinner label={t.savingFindings} />}
            {findingsSaved === "failed" && (
              <p role="alert" className="flex flex-wrap items-center gap-2 text-base text-[var(--color-danger)]">
                {t.findingsFailed}
                <Button size="sm" variant="secondary" onClick={retryFindings}>{t.retry}</Button>
              </p>
            )}

            {postOp ? (
              <section className="space-y-3">
                <h3 className="text-xl font-bold text-[var(--color-warn)]">{t.postOpTitle}</h3>
                <p className="text-base">{t.postOpBody}</p>
                <div className="grid gap-2">
                  {postOpProtocolsFor(region).map((protocol) => (
                    <Choice
                      key={protocol.id}
                      className="text-start"
                      onClick={() => openFull(`/treatment-planner?protocol=${protocol.id}&phase=${protocol.phases[0].id}&stage=post-op`)}
                    >
                      {protocol.title[lang]}
                    </Choice>
                  ))}
                  <Button variant="ghost" size="lg" onClick={() => openFull("/treatment-planner?stage=post-op")}>{t.postOpOther}</Button>
                </div>
              </section>
            ) : result.medicalReview.length > 0 ? (
              <section role="alert" className="space-y-2 rounded-2xl bg-[var(--color-danger-soft)] p-4 text-[var(--color-danger)]">
                <h3 className="text-xl font-bold">{t.medicalTitle}</h3>
                <p className="text-base">{t.medicalBody}</p>
                <p className="text-lg font-semibold">{result.medicalReview.map((h) => localized(h.label, locale)).join("، ")}</p>
              </section>
            ) : result.leading ? (
              <section className="space-y-4">
                <div>
                  <p className="text-sm text-[var(--color-ink-faint)]">{t.resultTitle}</p>
                  <h3 className="mt-1 text-2xl font-extrabold text-[var(--color-ink)]">{localized(result.leading.label, locale)}</h3>
                  <Badge tone={result.certainty === "strong" ? "success" : result.certainty === "moderate" ? "primary" : "warn"}>
                    {t.certainty[result.certainty]}
                  </Badge>
                </div>
                {result.leading.supporting.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold">{t.why}</p>
                    <ul className="mt-1 list-disc space-y-0.5 ps-5 text-base">
                      {result.leading.supporting
                        .filter((reason) => reason.kind !== "base")
                        .slice(0, 4)
                        .map((reason) => (
                          <li key={`${reason.kind}-${reason.label.en}`}>
                            {localized(reason.label, locale)}: {localized(reason.detail, locale)}
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
                {result.leading.against.length > 0 && (
                  <p className="text-sm text-[var(--color-ink-soft)]">
                    {t.against}: {result.leading.against.map((reason) => localized(reason.label, locale)).join("، ")}
                  </p>
                )}
                {result.runnerUp && (
                  <p className="rounded-xl bg-[var(--color-warn-soft)] px-4 py-3 text-base text-[var(--color-ink)]">
                    {t.orRunnerUp(localized(result.runnerUp.label, locale))}
                  </p>
                )}
                {result.certainty === "low" && !result.runnerUp && (
                  <p className="rounded-xl bg-[var(--color-warn-soft)] px-4 py-3 text-base text-[var(--color-ink)]">{t.lowCertainty}</p>
                )}
                <Button variant={result.certainty === "strong" ? "ghost" : "secondary"} size="lg" onClick={askMore}>
                  {t.more}
                </Button>

                {leadingProtocol ? (
                  <div className="space-y-3 rounded-2xl border border-[var(--color-primary)]/30 bg-[var(--color-primary-tint)] p-4">
                    <p className="text-base">
                      <span className="text-[var(--color-ink-soft)]">{t.protocol}: </span>
                      <strong>{leadingProtocol.title[lang]}</strong>
                      <span className="text-[var(--color-ink-soft)]"> · {t.phaseOne}: {leadingProtocol.phases[0].name[lang]}</span>
                    </p>
                    <Button
                      size="lg"
                      className="min-h-14 w-full text-lg"
                      disabled={!isMockMode && findingsSaved !== "saved"}
                      onClick={() => buildReview(leadingProtocol)}
                    >
                      {t.build}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-base text-[var(--color-ink-soft)]">{t.noProtocol}</p>
                    <Button size="lg" onClick={() => openFull("/treatment-planner")}>{t.toPlanner}</Button>
                  </div>
                )}
              </section>
            ) : null}

            <p className="text-xs text-[var(--color-ink-faint)]">{t.provisional}</p>
            <Button variant="ghost" onClick={undo} disabled={history.length === 0}>{t.back}</Button>
          </CardBody>
        </Card>
      )}

      {step === "review" && review && (
        <Card>
          <CardBody className="space-y-5">
            <h3 className="text-xl font-bold text-[var(--color-ink)]">{t.reviewTitle}</h3>
            <p className="text-base">
              <span className="text-[var(--color-ink-soft)]">{t.protocol}: </span>
              <strong>{review.protocol.title[lang]}</strong>
              {" · "}
              {review.protocol.phases[0].name[lang]}
            </p>

            <section className="space-y-2">
              <h4 className="text-base font-bold">{t.programTitle}</h4>
              {review.items.length === 0 ? (
                <p className="rounded-xl bg-[var(--color-warn-soft)] px-4 py-3 text-base">{t.noExercises}</p>
              ) : (
                <ol className="space-y-2">
                  {review.items.map((item, index) => (
                    <li key={item.exerciseId} className="rounded-2xl border border-[var(--color-border)] px-4 py-3">
                      <p className="text-lg font-bold">
                        {(index + 1).toLocaleString(lang === "fa" ? "fa-IR" : "en-US")}. {exerciseName(item.exerciseId)}
                      </p>
                      <p className="text-base text-[var(--color-primary-strong)]">{describeDosage(item, lang).join(" · ")}</p>
                      <p className="text-sm text-[var(--color-ink-soft)]">{t.days}: {daysText(item.scheduledWeekdays)}</p>
                    </li>
                  ))}
                </ol>
              )}
              {review.pending.length > 0 && (
                <p className="text-sm text-[var(--color-ink-faint)]">{t.pending(review.pending.map(exerciseName).join("، "))}</p>
              )}
            </section>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-sm font-semibold">{t.irritability}</span>
                <div className="grid grid-cols-3 gap-2">
                  {(["low", "moderate", "high"] as const).map((level) => (
                    <Choice key={level} active={irritability === level} className="min-h-12 text-base" onClick={() => setIrritability(level)}>
                      {t.irritabilityLevels[level]}
                    </Choice>
                  ))}
                </div>
              </label>
              <div className="space-y-1.5">
                <span className="text-sm font-semibold">{t.reviewDate}</span>
                <div className="flex flex-wrap gap-2">
                  {[7, 14, 28].map((days) => {
                    const value = plusDays(days);
                    return (
                      <Choice key={days} active={reviewDate === value} className="min-h-12 text-base" onClick={() => setReviewDate(value)}>
                        {lang === "fa" ? formatJalali(value) : value}
                      </Choice>
                    );
                  })}
                </div>
              </div>
            </div>

            <details className="rounded-xl border border-[var(--color-border)] px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-[var(--color-ink-soft)]">{t.planTitle}</summary>
              <ul className="mt-2 list-disc space-y-1 ps-5 text-sm">
                {[...review.plan.exerciseTherapy, ...review.plan.education, ...review.plan.progression].slice(0, 12).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </details>
            <details className="rounded-xl border border-[var(--color-border)] px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-[var(--color-ink-soft)]">{t.safetyText}</summary>
              <p className="mt-2 text-sm">{defaultPrecautions("fa")}</p>
              <p className="mt-2 text-sm">{defaultStopRules("fa")}</p>
            </details>

            {isMockMode ? (
              <p className="rounded-xl bg-[var(--color-warn-soft)] px-4 py-3 text-base">{t.demo}</p>
            ) : (
              <>
                <label className="flex items-start gap-3 rounded-2xl border-2 border-[var(--color-border)] p-4 text-base">
                  <input type="checkbox" className="mt-1 h-6 w-6" checked={attested} onChange={(event) => setAttested(event.target.checked)} />
                  <span>{t.attest}</span>
                </label>
                <Button size="lg" className="min-h-14 w-full text-lg" disabled={!attested || Boolean(busy)} onClick={() => void publish()}>
                  {busy ?? (review.items.length > 0 ? t.publish : t.approveOnly)}
                </Button>
              </>
            )}
            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="ghost" onClick={() => setStep("result")} disabled={Boolean(busy)}>{t.back}</Button>
              <Button
                variant="ghost"
                disabled={Boolean(busy)}
                onClick={() => openFull(`/treatment-planner?protocol=${review.protocol.id}&phase=${review.phaseId}#home-program`)}
              >
                {t.editFull}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {step === "done" && (
        <Card>
          <CardBody className="space-y-4 text-center">
            <Icon name="check" width={40} height={40} className="mx-auto text-[var(--color-success)]" />
            <h3 className="text-2xl font-bold text-[var(--color-ink)]">{t.doneTitle}</h3>
            <p className="text-base">{published === "program" ? t.doneBody : t.donePlanOnly}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {published === "program" && patient && (
                <ButtonLink size="lg" href={`/workspace/print?patient=${encodeURIComponent(patient.id)}`}>{t.print}</ButtonLink>
              )}
              {published === "plan" && (
                <Button size="lg" onClick={() => openFull("/treatment-planner#home-program")}>{t.toBuilder}</Button>
              )}
              {patient && (
                <ButtonLink size="lg" variant="secondary" href={`/workspace?patient=${encodeURIComponent(patient.id)}`}>{t.toWorkspace}</ButtonLink>
              )}
              <Button size="lg" variant="ghost" onClick={onRestart}>{t.nextPatient}</Button>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
