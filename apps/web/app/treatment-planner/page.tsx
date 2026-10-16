"use client";

import { DateInput } from "@/components/ui/DateInput";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useCases } from "@/lib/store/CaseContext";
import { buildTreatmentPlan, delay } from "@/lib/ai/engine";
import { localizedRegions, regionLabel } from "@/lib/data/bodyRegionsFa";
import { buildTreatmentPlanFa } from "@/lib/ai/treatmentPlanFa";
import { useLocale } from "@/lib/store/LocaleContext";
import { intlLocale, useText } from "@/lib/i18n/text";
import { plannerText } from "./text";
import { hasClinicalSafetyClearance } from "@/lib/clinical/safety";
import { RiskFactorNote } from "@/components/clinical/RiskFactorNote";
import { phaseForWeeks, protocolById, protocols, weeksSince } from "@/lib/clinical/protocols";
import type {
  BodyRegionId,
  Irritability,
  Stage,
  TreatmentPlan,
  TreatmentPlanInput,
  TreatmentPlanRecord,
} from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { BulletList, Disclaimer, PageIntro, Spinner } from "@/components/ui/Misc";
import { isMockMode } from "@/lib/config";
import { localDateValue } from "@/lib/utils";
import {
  fetchTreatmentPlans,
  reviewTreatmentPlan,
  saveTreatmentPlanDraft,
  type TreatmentPlanMutationResult,
} from "@/lib/supabase/db";
import { PrescriptionBuilder } from "@/components/clinical/PrescriptionBuilder";
import {
  normalizeTreatmentPlan,
  TreatmentPlanSchema,
} from "@/lib/clinical/treatmentPlanSchema";

const stages: Stage[] = ["acute", "subacute", "chronic", "post-op", "return-to-sport"];

type PlanListKey = Exclude<keyof TreatmentPlan, "frequency">;

const editablePlanSections: PlanListKey[] = [
  "manualTherapy",
  "exerciseTherapy",
  "mobility",
  "strengthening",
  "motorControl",
  "balance",
  "education",
  "homeProgram",
  "progression",
];

export default function TreatmentPlannerPage() {
  // useSearchParams (protocol links) needs a Suspense boundary.
  return (
    <Suspense fallback={<Spinner label="…" />}>
      <TreatmentPlanner />
    </Suspense>
  );
}

function TreatmentPlanner() {
  const { currentCase, hydrated } = useCases();
  const t = useText(plannerText);

  // The form captures its initial values from the active case, so it must
  // not mount until cases have hydrated from localStorage. Keying by case
  // id re-seeds the form if the active case changes.
  if (!hydrated) return <Spinner label={t.loading} />;
  return (
    <PlannerForm key={currentCase?.id ?? "no-case"} />
  );
}

function PlannerForm() {
  const {
    cases,
    currentCase,
    setCurrentCase,
    loadError,
    reloadCases,
  } = useCases();
  const { locale } = useLocale();
  const t = useText(plannerText);
  const when = (value: string) => new Date(value).toLocaleString(intlLocale(locale));

  const [region, setRegion] = useState<BodyRegionId | "">(
    currentCase?.region ?? ""
  );
  const searchParams = useSearchParams();
  // A post-operative protocol link opens the planner in the post-op stage.
  const linkedProtocol = protocolById(searchParams.get("protocol") ?? "");
  const [stage, setStage] = useState<Stage>(
    linkedProtocol?.postOp || searchParams.get("stage") === "post-op" ? "post-op" : "subacute"
  );
  const [painSeverity, setPainSeverity] = useState(
    currentCase?.painIntensity ?? 5
  );
  const [irritability, setIrritability] = useState<Irritability>("moderate");
  const [mainImpairment, setMainImpairment] = useState("");
  const [patientGoal, setPatientGoal] = useState(
    currentCase?.patientGoal ?? ""
  );
  const [procedure, setProcedure] = useState(
    () => linkedProtocol?.postOp?.procedure[locale === "fa" ? "fa" : "en"] ?? ""
  );
  const [surgeryDate, setSurgeryDate] = useState("");
  const [precautions, setPrecautions] = useState("");
  const [weightBearingStatus, setWeightBearingStatus] = useState("");
  const [protocolConfirmed, setProtocolConfirmed] = useState(false);
  const lang = locale === "fa" ? "fa" : "en";
  // Optional protocol phase that shapes the plan text. A phase link from a
  // protocol page (?protocol=&phase=) preselects it.
  // Read through the router: during client navigation the page renders before
  // window.location changes, so the link's ?protocol=&phase= would be missed.
  const [guideChoice, setGuideChoice] = useState(() => {
    const chosen = protocolById(searchParams.get("protocol") ?? "");
    const phase = chosen?.phases.find((item) => item.id === searchParams.get("phase"));
    return { protocol: chosen?.id ?? "", phase: phase?.id ?? chosen?.phases[0]?.id ?? "" };
  });
  const guideProtocol = protocolById(guideChoice.protocol);
  const guidePhase = guideProtocol?.phases.find((phase) => phase.id === guideChoice.phase);
  const weeksAfterSurgery =
    guideProtocol?.postOp && surgeryDate ? weeksSince(surgeryDate, localDateValue()) : null;
  const suggestedPhaseId =
    guideProtocol && weeksAfterSurgery !== null ? phaseForWeeks(guideProtocol, weeksAfterSurgery) : null;
  const suggestedPhase = guideProtocol?.phases.find((phase) => phase.id === suggestedPhaseId) ?? null;
  const protocolOptions = [...protocols].sort(
    (a, b) => Number(b.region === region) - Number(a.region === region)
  );
  const [error, setError] = useState<string | null>(null);

  const [plan, setPlan] = useState<TreatmentPlan | null>(null);
  const [planEdited, setPlanEdited] = useState(false);
  const [generatedInput, setGeneratedInput] =
    useState<TreatmentPlanInput | null>(null);
  const [storedPlan, setStoredPlan] =
    useState<TreatmentPlanMutationResult | null>(null);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [planHistory, setPlanHistory] = useState<{
    caseId: string | null;
    plans: TreatmentPlanRecord[];
    error: string | null;
  }>({ caseId: null, plans: [], error: null });
  const [historyRetry, setHistoryRetry] = useState(0);
  const [loading, setLoading] = useState(false);
  const generationToken = useRef(0);

  const safetyCleared = hasClinicalSafetyClearance(currentCase?.safetyScreen);
  // A locked planner must also look locked: no field is editable until a
  // case with a clear safety screen is selected.
  const formLocked = loading || !safetyCleared || !currentCase;
  const safetyDisposition =
    currentCase?.safetyScreen?.disposition ?? "not-screened";
  const historyForCurrentCase =
    currentCase && planHistory.caseId === currentCase.id
      ? planHistory
      : { caseId: currentCase?.id ?? null, plans: [], error: null };
  const historyLoading = Boolean(
    !isMockMode && currentCase && planHistory.caseId !== currentCase.id
  );
  const approvedPlanId =
    storedPlan?.status === "approved"
      ? storedPlan.id
      : historyForCurrentCase.plans.find((record) => record.status === "approved")
          ?.id ?? null;

  // With an approved plan, the parameters form collapses into a summary so
  // the page leads to the home program; "new plan version" reopens it.
  const [showPlanForm, setShowPlanForm] = useState(false);
  const approvedHistory = historyForCurrentCase.plans.find((record) => record.status === "approved");
  const approvedRecord =
    storedPlan?.status === "approved"
      ? { version: storedPlan.version, at: storedPlan.timestamp }
      : approvedHistory
        ? { version: approvedHistory.version, at: approvedHistory.reviewedAt ?? approvedHistory.createdAt }
        : null;
  const planCollapsed = Boolean(approvedPlanId) && !plan && !loading && !showPlanForm;


  const hasUnsavedPlannerWork = Boolean(
    (plan && !storedPlan) ||
      (storedPlan?.status === "draft" &&
        (reviewNote.trim().length > 0 || reviewConfirmed))
  );

  function changeCase(nextCaseId: string) {
    if (nextCaseId === (currentCase?.id ?? "")) return;
    if (
      hasUnsavedPlannerWork &&
      !window.confirm(
        t.switchConfirm
      )
    ) {
      return;
    }
    setCurrentCase(nextCaseId || null);
  }

  useEffect(() => {
    if (isMockMode || !currentCase?.id) return;
    const caseId = currentCase.id;
    let cancelled = false;

    async function loadHistory() {
      const records = await fetchTreatmentPlans(caseId);
      if (cancelled) return;
      setPlanHistory({
        caseId,
        plans: records ?? [],
        error:
          records === null
            ? "load_failed"
            : null,
      });
    }

    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [currentCase?.id, historyRetry]);

  function invalidatePlan() {
    generationToken.current += 1;
    setPlan(null);
    setPlanEdited(false);
    setGeneratedInput(null);
    setStoredPlan(null);
    setReviewConfirmed(false);
    setReviewNote("");
    setWorkflowError(null);
    setLoading(false);
    setError(null);
  }

  function plannerInput(): TreatmentPlanInput | null {
    if (!region) return null;
    return {
      region,
      stage,
      painSeverity,
      irritability,
      mainImpairment: mainImpairment.trim(),
      patientGoal: patientGoal.trim(),
      safetyConfirmed: safetyCleared,
      postOpDetails:
        stage === "post-op"
          ? {
              procedure: procedure.trim(),
              surgeryDate,
              precautions: precautions.trim(),
              weightBearingStatus: weightBearingStatus.trim(),
              protocolConfirmed,
            }
          : undefined,
    };
  }

  async function generate() {
    if (!currentCase) {
      setError(t.needCase);
      setPlan(null);
      return;
    }
    if (!safetyCleared) {
      setError(t.blocked);
      setPlan(null);
      return;
    }
    if (!region) {
      setError(t.needRegion);
      setPlan(null);
      return;
    }

    if (stage === "post-op") {
      if (
        !procedure.trim() ||
        !surgeryDate ||
        !precautions.trim() ||
        !weightBearingStatus.trim()
      ) {
        setError(t.postOpMissing);
        setPlan(null);
        return;
      }
      if (surgeryDate > localDateValue()) {
        setError(t.futureSurgery);
        setPlan(null);
        return;
      }
      if (!protocolConfirmed) {
        setError(t.confirmProtocol);
        setPlan(null);
        return;
      }
    }

    setError(null);
    setWorkflowError(null);
    setStoredPlan(null);
    setReviewConfirmed(false);
    setReviewNote("");
    setLoading(true);
    setPlan(null);
    setPlanEdited(false);
    setGeneratedInput(null);
    const requestToken = ++generationToken.current;
    const input = plannerInput();
    if (!input) {
      setLoading(false);
      setError(t.incomplete);
      return;
    }

    try {
      // 🔌 REAL AI API INTEGRATION POINT — replace with an authenticated,
      // server-side call that preserves the same safety gate.
      const guide =
        guideProtocol && guidePhase ? { protocol: guideProtocol, phase: guidePhase } : undefined;
      const result = await delay(
        locale === "fa" ? buildTreatmentPlanFa(input, guide) : buildTreatmentPlan(input, guide)
      );
      if (requestToken === generationToken.current) {
        setPlan(result);
        setPlanEdited(false);
        setGeneratedInput(input);
      }
    } catch (cause) {
      if (requestToken === generationToken.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : t.generateFailed
        );
      }
    } finally {
      if (requestToken === generationToken.current) setLoading(false);
    }
  }

  // Arriving from "start a home program from this phase" with no approved
  // plan: build the protocol-guided draft straight away. It is still only a
  // draft until the clinician ticks the review statement and approves it.
  const autoGenerated = useRef(false);
  useEffect(() => {
    if (
      autoGenerated.current ||
      !guideProtocol ||
      !safetyCleared ||
      !currentCase ||
      isMockMode ||
      historyLoading ||
      approvedPlanId ||
      plan ||
      loading ||
      stage === "post-op" ||
      !region
    ) {
      return;
    }
    autoGenerated.current = true;
    void generate();
    // generate reads the current form state; it runs once per page visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guideProtocol, safetyCleared, currentCase, historyLoading, approvedPlanId, plan, loading, stage, region]);

  function updatePlanSection(key: PlanListKey, rawValue: string) {
    if (storedPlan) return;
    setPlan((current) =>
      current
        ? {
            ...current,
            [key]: rawValue.split(/\r?\n/),
          }
        : current
    );
    setPlanEdited(true);
    setReviewConfirmed(false);
    setWorkflowError(null);
  }

  function updatePlanFrequency(value: string) {
    if (storedPlan) return;
    setPlan((current) => (current ? { ...current, frequency: value } : current));
    setPlanEdited(true);
    setReviewConfirmed(false);
    setWorkflowError(null);
  }

  async function saveDraft() {
    if (
      isMockMode ||
      workflowBusy ||
      !currentCase?.patientId ||
      !currentCase.episodeId ||
      !plan ||
      !generatedInput ||
      !safetyCleared
    ) {
      setWorkflowError(t.saveRequirements);
      return;
    }

    const parsedPlan = TreatmentPlanSchema.safeParse(
      normalizeTreatmentPlan(plan)
    );
    if (!parsedPlan.success) {
      setWorkflowError(t.sectionsInvalid);
      return;
    }

    setWorkflowBusy(true);
    setWorkflowError(null);
    const caseId = currentCase.id;
    const saved = await saveTreatmentPlanDraft({
      caseId,
      input: generatedInput,
      plan: parsedPlan.data,
    });
    setWorkflowBusy(false);
    if (!saved) {
      setWorkflowError(t.saveFailed);
      return;
    }
    setPlan(parsedPlan.data);
    setStoredPlan(saved);
    setHistoryRetry((value) => value + 1);
    return saved;
  }

  // One step for the usual case: the clinician has read the draft and ticks
  // the review statement, then the version is saved and signed together. The
  // two database steps stay separate, so a failed approval leaves a draft.
  async function saveAndApprove() {
    if (!reviewConfirmed) {
      setWorkflowError(t.confirmReview);
      return;
    }
    const saved = await saveDraft();
    if (!saved) return;
    if (!safetyCleared) {
      setWorkflowError(t.approvalBlocked);
      return;
    }
    setWorkflowBusy(true);
    const reviewed = await reviewTreatmentPlan({
      planId: saved.id,
      decision: "approved",
      note: reviewNote,
    });
    setWorkflowBusy(false);
    if (!reviewed) {
      setWorkflowError(t.reviewFailed);
      return;
    }
    setStoredPlan(reviewed);
    setHistoryRetry((value) => value + 1);
    setShowPlanForm(false);
    setPlan(null);
    setGeneratedInput(null);
    setReviewConfirmed(false);
    setReviewNote("");
    window.setTimeout(() => {
      document.getElementById("home-program")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 300);
  }

  // A saved draft must stay signable after a reload or on another day —
  // otherwise the only way forward is regenerating a new version.
  function openSavedDraft(record: TreatmentPlanRecord) {
    if (record.status !== "draft" || workflowBusy) return;
    if (
      hasUnsavedPlannerWork &&
      !window.confirm(
        t.openConfirm
      )
    ) {
      return;
    }
    generationToken.current += 1;
    setLoading(false);
    setError(null);
    setPlan(record.plan);
    setPlanEdited(false);
    setGeneratedInput(record.input);
    setStoredPlan({
      id: record.id,
      version: record.version,
      status: record.status,
      timestamp: record.createdAt,
    });
    setReviewConfirmed(false);
    setReviewNote("");
    setWorkflowError(null);
  }

  async function reviewDraft(decision: "approved" | "rejected") {
    if (workflowBusy || !storedPlan || storedPlan.status !== "draft") return;
    if (decision === "approved" && !reviewConfirmed) {
      setWorkflowError(t.confirmReview);
      return;
    }
    if (decision === "approved" && !safetyCleared) {
      setWorkflowError(t.approvalBlocked);
      return;
    }

    setWorkflowBusy(true);
    setWorkflowError(null);
    const reviewed = await reviewTreatmentPlan({
      planId: storedPlan.id,
      decision,
      note: reviewNote,
    });
    setWorkflowBusy(false);
    if (!reviewed) {
      setWorkflowError(t.reviewFailed);
      return;
    }
    setStoredPlan(reviewed);
    setHistoryRetry((value) => value + 1);
  }

  return (
    <div className="space-y-6">
      <PageIntro
        title={t.title}
        description={t.intro}
        action={
          cases.length > 0 ? (
            <Select
              aria-label={t.caseAria}
              value={currentCase?.id ?? ""}
              onChange={(event) => changeCase(event.target.value)}
              className="w-64"
            >
              <option value="">{t.selectCase}</option>
              {cases.map((patientCase) => (
                <option key={patientCase.id} value={patientCase.id}>
                  {patientCase.name || t.unnamed}
                </option>
              ))}
            </Select>
          ) : undefined
        }
      />

      {loadError && (
        <div
          role="alert"
          className="rounded-2xl border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] px-5 py-4 text-sm text-[var(--color-danger)]"
        >
          <p>
            {t.loadError}
          </p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="mt-3"
            onClick={reloadCases}
          >
            {t.retryCases}
          </Button>
        </div>
      )}

      {!safetyCleared && (
      <div
        role={safetyCleared ? "status" : "alert"}
        className={
          safetyCleared
            ? "rounded-2xl border border-[var(--color-success)]/30 bg-[var(--color-success-soft)] px-5 py-4"
            : "rounded-2xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-5 py-4"
        }
      >
        <p
          className={
            safetyCleared
              ? "text-sm font-semibold text-[var(--color-success)]"
              : "text-sm font-semibold text-[var(--color-danger)]"
          }
        >
          {safetyCleared
            ? t.gatePassed
            : t.gateLocked}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--color-ink-soft)]">
          {safetyCleared
            ? t.screenCompleted(
                currentCase?.safetyScreen?.screenedAt
                  ? when(currentCase.safetyScreen.screenedAt)
                  : ""
              )
            : loadError
              ? t.statusUnavailable
            : currentCase
              ? t.currentDisposition(t.dispositions[safetyDisposition] ?? safetyDisposition)
              : t.selectOrCreate}
        </p>
      </div>
      )}
      {safetyCleared && <RiskFactorNote screen={currentCase?.safetyScreen} />}

      {planCollapsed && approvedRecord ? (
        <Card>
          <CardBody className="flex flex-wrap items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--color-success-soft)] text-[var(--color-success)]">
              <Icon name="check" width={20} height={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[var(--color-ink)]">{t.approvedTitle}</p>
              <p className="text-sm text-[var(--color-ink-soft)]">
                {t.approvedBody(approvedRecord.version, when(approvedRecord.at))}
              </p>
            </div>
            <Button variant="secondary" onClick={() => setShowPlanForm(true)}>
              {t.newPlanVersion}
            </Button>
          </CardBody>
        </Card>
      ) : (
      <Card>
        <CardHeader
          title={t.parameters}
          subtitle={
            currentCase
              ? t.prefilled(currentCase.name)
              : t.noCase
          }
          icon={<Icon name="treatment" width={18} height={18} />}
        />
        <CardBody
          aria-disabled={formLocked || undefined}
          className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 ${!safetyCleared ? "opacity-60" : ""}`}
        >
          <Field label={t.region} required>
            <Select
              value={region}
              disabled={formLocked}
              onChange={(e) => {
                setRegion(e.target.value as BodyRegionId);
                invalidatePlan();
              }}
            >
              <option value="">{t.select}</option>
              {localizedRegions(locale).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.stage}>
            <Select
              value={stage}
              disabled={formLocked}
              onChange={(e) => {
                setStage(e.target.value as Stage);
                invalidatePlan();
              }}
            >
              {stages.map((s) => (
                <option key={s} value={s}>
                  {t.stages[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.irritability}>
            <Select
              value={irritability}
              disabled={formLocked}
              onChange={(e) => {
                setIrritability(e.target.value as Irritability);
                invalidatePlan();
              }}
            >
              <option value="low">{t.low}</option>
              <option value="moderate">{t.moderate}</option>
              <option value="high">{t.high}</option>
            </Select>
          </Field>
          <Field label={t.painSeverity(painSeverity)}>
            <input
              type="range"
              min={0}
              max={10}
              value={painSeverity}
              disabled={formLocked}
              onChange={(e) => {
                setPainSeverity(Number(e.target.value));
                invalidatePlan();
              }}
              className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-gradient-to-r rtl:bg-gradient-to-l from-[var(--color-success)] via-[var(--color-warn)] to-[var(--color-danger)]"
            />
          </Field>
          <Field label={t.impairment}>
            <Input
              value={mainImpairment}
              disabled={formLocked}
              onChange={(e) => {
                setMainImpairment(e.target.value);
                invalidatePlan();
              }}
              placeholder={t.impairmentPlaceholder}
            />
          </Field>
          <Field label={t.goal}>
            <Input
              value={patientGoal}
              disabled={formLocked}
              onChange={(e) => {
                setPatientGoal(e.target.value);
                invalidatePlan();
              }}
              placeholder={t.goalPlaceholder}
            />
          </Field>
          <Field label={t.protocolGuide} hint={t.protocolGuideHint}>
            <Select
              value={guideChoice.protocol}
              disabled={formLocked}
              onChange={(event) => {
                const next = protocolById(event.target.value);
                setGuideChoice({ protocol: next?.id ?? "", phase: next?.phases[0]?.id ?? "" });
                if (next?.postOp) {
                  setStage("post-op");
                  if (!procedure.trim()) setProcedure(next.postOp.procedure[lang]);
                }
                invalidatePlan();
              }}
            >
              <option value="">{t.protocolNone}</option>
              {protocolOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.title[lang]}
                </option>
              ))}
            </Select>
          </Field>
          {guideProtocol && (
            <Field label={t.protocolPhase}>
              <Select
                value={guideChoice.phase}
                disabled={formLocked}
                onChange={(event) => {
                  setGuideChoice((previous) => ({ ...previous, phase: event.target.value }));
                  invalidatePlan();
                }}
              >
                {guideProtocol.phases.map((phase, index) => (
                  <option key={phase.id} value={phase.id}>
                    {t.phaseOption(index + 1, phase.name[lang])}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {stage === "post-op" && (
            <div className="grid grid-cols-1 gap-4 rounded-xl border border-[var(--color-warn)]/30 bg-[var(--color-warn-soft)]/40 p-4 sm:col-span-2 sm:grid-cols-2 lg:col-span-3">
              <div className="sm:col-span-2">
                <p className="text-sm font-semibold text-[var(--color-warn)]">
                  {t.postOpTitle}
                </p>
                <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                  {t.postOpBody}
                </p>
              </div>
              <Field label={t.procedure} required>
                <Input
                  value={procedure}
                  disabled={formLocked}
                  onChange={(event) => {
                    setProcedure(event.target.value);
                    invalidatePlan();
                  }}
                  placeholder={t.procedurePlaceholder}
                />
              </Field>
              <Field label={t.surgeryDate} required>
                <DateInput
                  max={localDateValue()}
                  value={surgeryDate}
                  disabled={formLocked}
                  onChange={(event) => {
                    setSurgeryDate(event.target.value);
                    invalidatePlan();
                  }}
                />
              </Field>
              {suggestedPhase && (
                <div className="sm:col-span-2 flex flex-wrap items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm text-[var(--color-ink-soft)]">
                  <span>
                    {t.weeksSinceSurgery(weeksAfterSurgery as number, suggestedPhase.name[lang])}
                  </span>
                  {suggestedPhase.id !== guideChoice.phase && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={formLocked}
                      onClick={() => {
                        setGuideChoice((previous) => ({ ...previous, phase: suggestedPhase.id }));
                        invalidatePlan();
                      }}
                    >
                      {t.useSuggestedPhase}
                    </Button>
                  )}
                </div>
              )}
              <Field label={t.weightBearing} required>
                <Input
                  value={weightBearingStatus}
                  disabled={formLocked}
                  onChange={(event) => {
                    setWeightBearingStatus(event.target.value);
                    invalidatePlan();
                  }}
                  placeholder={t.weightBearingPlaceholder}
                />
              </Field>
              <Field
                label={t.precautions}
                required
                hint={t.precautionsHint}
              >
                <Textarea
                  value={precautions}
                  disabled={formLocked}
                  onChange={(event) => {
                    setPrecautions(event.target.value);
                    invalidatePlan();
                  }}
                  className="min-h-20"
                  placeholder={t.precautionsPlaceholder}
                />
              </Field>
              <label className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] bg-white p-3 text-sm text-[var(--color-ink-soft)] sm:col-span-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={protocolConfirmed}
                  disabled={formLocked}
                  onChange={(event) => {
                    setProtocolConfirmed(event.target.checked);
                    invalidatePlan();
                  }}
                />
                <span>
                  {t.protocolAttest}
                </span>
              </label>
            </div>
          )}
        </CardBody>
        <div className="border-t border-[var(--color-border)] px-5 py-4">
          {error && (
            <p role="alert" className="mb-3 text-sm text-[var(--color-danger)]">
              {error}
            </p>
          )}
          <Button onClick={generate} disabled={loading || !safetyCleared}>
            <Icon name="sparkle" width={16} height={16} />
            {loading ? t.generating : t.generate}
          </Button>
        </div>
      </Card>
      )}

      {loading && (
        <Card>
          <Spinner label={t.building} />
        </Card>
      )}

      {plan && !loading && safetyCleared && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-[var(--color-ink)]">
              {t.planFor(region ? regionLabel(region, locale) : "", t.stages[stage])}
            </span>
            <span className="rounded-full bg-[var(--color-primary-tint)] px-3 py-1 text-xs font-medium text-[var(--color-primary-strong)]">
              {plan.frequency}
            </span>
            {planEdited && !storedPlan && (
              <Badge tone="warn">{t.edited}</Badge>
            )}
          </div>

          {!storedPlan && (
          <Card>
            <CardHeader
              title={t.editTitle}
              subtitle={t.editSubtitle}
              icon={<Icon name="edit" width={18} height={18} />}
            />
            <CardBody className="space-y-4">
              {storedPlan && (
                <p className="rounded-xl bg-[var(--color-surface-muted)] px-4 py-3 text-sm text-[var(--color-ink-soft)]">
                  {t.immutable}
                </p>
              )}
              <Field label={t.frequency} required>
                <Input
                  value={plan.frequency}
                  maxLength={500}
                  disabled={workflowBusy || Boolean(storedPlan)}
                  onChange={(event) => updatePlanFrequency(event.target.value)}
                />
              </Field>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {editablePlanSections.map((section) => (
                  <Field
                    key={section}
                    label={t.sections[section]}
                    required={
                      section === "exerciseTherapy" ||
                      section === "education" ||
                      section === "homeProgram" ||
                      section === "progression"
                    }
                    hint={t.sectionHint}
                  >
                    <Textarea
                      value={plan[section].join("\n")}
                      maxLength={12_000}
                      disabled={workflowBusy || Boolean(storedPlan)}
                      onChange={(event) =>
                        updatePlanSection(section, event.target.value)
                      }
                      className="min-h-32"
                    />
                  </Field>
                ))}
              </div>
            </CardBody>
          </Card>

          )}

          {storedPlan && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {editablePlanSections.map((section) => (
              <PlanCard
                key={section}
                title={t.sections[section]}
                items={plan[section]}
                highlight={section === "progression"}
              />
            ))}
          </div>
          )}

          <Card>
            <CardHeader
              title={t.recordTitle}
              subtitle={t.recordSubtitle}
              icon={<Icon name="shield" width={18} height={18} />}
            />
            <CardBody className="space-y-4">
              {isMockMode ? (
                <p className="rounded-xl bg-[var(--color-warn-soft)] px-4 py-3 text-sm text-[var(--color-warn)]">
                  {t.demo}
                </p>
              ) : !currentCase?.patientId || !currentCase.episodeId ? (
                <p role="alert" className="rounded-xl bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]">
                  {t.legacy}
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      tone={
                        storedPlan?.status === "approved"
                          ? "success"
                          : storedPlan?.status === "rejected"
                            ? "danger"
                            : storedPlan?.status === "superseded"
                              ? "neutral"
                              : "warn"
                      }
                    >
                      {storedPlan
                        ? t.versionStatus(storedPlan.version, t.statuses[storedPlan.status] ?? storedPlan.status)
                        : t.unsaved}
                    </Badge>
                    {storedPlan && (
                      <span className="text-xs text-[var(--color-ink-faint)]">
                        {t.serverTime(when(storedPlan.timestamp))}
                      </span>
                    )}
                  </div>

                  {!storedPlan ? (
                    <div className="space-y-4">
                      <Field label={t.reviewNote} hint={t.reviewNoteHint}>
                        <Textarea
                          value={reviewNote}
                          maxLength={2000}
                          disabled={workflowBusy}
                          onChange={(event) => setReviewNote(event.target.value)}
                          className="min-h-20"
                        />
                      </Field>
                      <label className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] p-3 text-sm text-[var(--color-ink-soft)]">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={reviewConfirmed}
                          disabled={workflowBusy}
                          onChange={(event) => {
                            setReviewConfirmed(event.target.checked);
                            setWorkflowError(null);
                          }}
                        />
                        <span>{t.reviewAttest}</span>
                      </label>
                      <div className="flex flex-wrap items-center gap-3">
                        <Button
                          onClick={saveAndApprove}
                          disabled={workflowBusy || !generatedInput || !reviewConfirmed}
                        >
                          <Icon name="check" width={16} height={16} />
                          {workflowBusy ? t.savingDecision : t.approveAndSave}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => void saveDraft()}
                          disabled={workflowBusy || !generatedInput}
                        >
                          {t.saveDraftOnly}
                        </Button>
                      </div>
                    </div>
                  ) : storedPlan.status === "draft" ? (
                    <div className="space-y-4">
                      <Field
                        label={t.reviewNote}
                        hint={t.reviewNoteHint}
                      >
                        <Textarea
                          value={reviewNote}
                          maxLength={2000}
                          disabled={workflowBusy}
                          onChange={(event) => setReviewNote(event.target.value)}
                          className="min-h-20"
                        />
                      </Field>
                      <label className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] p-3 text-sm text-[var(--color-ink-soft)]">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={reviewConfirmed}
                          disabled={workflowBusy}
                          onChange={(event) => {
                            setReviewConfirmed(event.target.checked);
                            setWorkflowError(null);
                          }}
                        />
                        <span>
                          {t.reviewAttest}
                        </span>
                      </label>
                      <div className="flex flex-wrap gap-3">
                        <Button
                          onClick={() => reviewDraft("approved")}
                          disabled={workflowBusy || !reviewConfirmed}
                        >
                          {workflowBusy ? t.savingDecision : t.approve}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => reviewDraft("rejected")}
                          disabled={workflowBusy}
                        >
                          {t.reject}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p
                      role="status"
                      className={
                        storedPlan.status === "approved"
                          ? "rounded-xl bg-[var(--color-success-soft)] px-4 py-3 text-sm text-[var(--color-success)]"
                          : "rounded-xl bg-[var(--color-surface-muted)] px-4 py-3 text-sm text-[var(--color-ink-soft)]"
                      }
                    >
                      {t.finalStatus(t.statuses[storedPlan.status] ?? storedPlan.status)}
                    </p>
                  )}
                </>
              )}

              {workflowError && (
                <p role="alert" className="text-sm text-[var(--color-danger)]">
                  {workflowError}
                </p>
              )}
            </CardBody>
          </Card>
        </>
      )}

      {!isMockMode && currentCase && (
        <details className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          <summary className="flex cursor-pointer items-center gap-2 px-5 py-4 text-sm font-semibold text-[var(--color-ink)]">
            <Icon name="clock" width={16} height={16} />
            {historyLoading ? t.historyTitle : t.historyCount(historyForCurrentCase.plans.length)}
          </summary>
          <div className="border-t border-[var(--color-border)] px-5 py-3">
            {historyLoading ? (
              <Spinner label={t.loadingPlans} />
            ) : historyForCurrentCase.error ? (
              <div role="alert" className="space-y-3 text-sm text-[var(--color-danger)]">
                <p>{t.historyFailed}</p>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setHistoryRetry((value) => value + 1)}
                >
                  {t.retry}
                </Button>
              </div>
            ) : historyForCurrentCase.plans.length === 0 ? (
              <p className="text-sm text-[var(--color-ink-faint)]">
                {t.noPlans}
              </p>
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {historyForCurrentCase.plans.map((record) => (
                  <li
                    key={record.id}
                    className="flex flex-wrap items-center gap-3 py-3 text-sm"
                  >
                    <span className="font-medium text-[var(--color-ink)]">
                      {t.version(record.version)}
                    </span>
                    <Badge
                      tone={
                        record.status === "approved"
                          ? "success"
                          : record.status === "rejected"
                            ? "danger"
                            : record.status === "draft"
                              ? "warn"
                              : "neutral"
                      }
                    >
                      {t.statuses[record.status] ?? record.status}
                    </Badge>
                    <span className="ms-auto text-xs text-[var(--color-ink-faint)]">
                      {when(record.createdAt)}
                    </span>
                    {record.status === "draft" &&
                      storedPlan?.id !== record.id && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={workflowBusy || !safetyCleared}
                          onClick={() => openSavedDraft(record)}
                        >
                          {t.openForReview}
                        </Button>
                      )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      )}

      {!isMockMode &&
        currentCase?.episodeId &&
        approvedPlanId && (
          <div id="home-program" className="scroll-mt-24">
            <PrescriptionBuilder
              key={`${currentCase.episodeId}:${approvedPlanId}`}
              treatmentPlanId={approvedPlanId}
              episodeId={currentCase.episodeId}
              region={currentCase.region}
              safetyCleared={safetyCleared}
            />
          </div>
        )}

      <Disclaimer />
    </div>
  );
}

function PlanCard({
  title,
  items,
  highlight,
}: {
  title: string;
  items: string[];
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-[var(--color-primary)]/40 bg-[var(--color-primary-tint)]" : undefined}>
      <CardBody>
        <h4 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">{title}</h4>
        <BulletList items={items} tone={highlight ? "primary" : "neutral"} />
      </CardBody>
    </Card>
  );
}
