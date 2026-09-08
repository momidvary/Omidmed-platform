"use client";

import { useEffect, useRef, useState } from "react";
import { useCases } from "@/lib/store/CaseContext";
import { buildTreatmentPlan, delay } from "@/lib/ai/engine";
import { bodyRegions, getRegion } from "@/lib/data/bodyRegions";
import { hasClinicalSafetyClearance } from "@/lib/clinical/safety";
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

const stages: { value: Stage; label: string }[] = [
  { value: "acute", label: "Acute" },
  { value: "subacute", label: "Subacute" },
  { value: "chronic", label: "Chronic" },
  { value: "post-op", label: "Post-operative" },
  { value: "return-to-sport", label: "Return to sport" },
];

type PlanListKey = Exclude<keyof TreatmentPlan, "frequency">;

const editablePlanSections: { key: PlanListKey; label: string }[] = [
  { key: "manualTherapy", label: "Manual therapy" },
  { key: "exerciseTherapy", label: "Exercise therapy" },
  { key: "mobility", label: "Mobility" },
  { key: "strengthening", label: "Strengthening" },
  { key: "motorControl", label: "Motor control" },
  { key: "balance", label: "Balance and proprioception" },
  { key: "education", label: "Education" },
  { key: "homeProgram", label: "Home exercise program" },
  { key: "progression", label: "Progression rules" },
];

export default function TreatmentPlannerPage() {
  const { currentCase, hydrated } = useCases();

  // The form captures its initial values from the active case, so it must
  // not mount until cases have hydrated from localStorage. Keying by case
  // id re-seeds the form if the active case changes.
  if (!hydrated) return <Spinner label="Loading…" />;
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

  const [region, setRegion] = useState<BodyRegionId | "">(
    currentCase?.region ?? ""
  );
  const [stage, setStage] = useState<Stage>("subacute");
  const [painSeverity, setPainSeverity] = useState(
    currentCase?.painIntensity ?? 5
  );
  const [irritability, setIrritability] = useState<Irritability>("moderate");
  const [mainImpairment, setMainImpairment] = useState("");
  const [patientGoal, setPatientGoal] = useState(
    currentCase?.patientGoal ?? ""
  );
  const [procedure, setProcedure] = useState("");
  const [surgeryDate, setSurgeryDate] = useState("");
  const [precautions, setPrecautions] = useState("");
  const [weightBearingStatus, setWeightBearingStatus] = useState("");
  const [protocolConfirmed, setProtocolConfirmed] = useState(false);
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
        "Switch patient cases and discard the unsaved treatment-plan work on this screen?"
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
            ? "Saved plan history could not be loaded. Check the connection and retry."
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
      setError(
        "Select a patient case with a completed structured safety screen before planning treatment."
      );
      setPlan(null);
      return;
    }
    if (!safetyCleared) {
      setError(
        "Treatment planning is blocked until the active case has a completed, clear safety screen and all concerns are resolved."
      );
      setPlan(null);
      return;
    }
    if (!region) {
      setError("Select a body region first.");
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
        setError(
          "For post-operative planning, enter the procedure, surgery date, precautions and weight-bearing status. Use an explicit value such as “none documented” rather than leaving a field blank."
        );
        setPlan(null);
        return;
      }
      if (surgeryDate > new Date().toISOString().slice(0, 10)) {
        setError("Surgery date cannot be in the future.");
        setPlan(null);
        return;
      }
      if (!protocolConfirmed) {
        setError(
          "Confirm that the operating team's protocol and restrictions were reviewed."
        );
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
      setError("The plan parameters are incomplete.");
      return;
    }

    try {
      // 🔌 REAL AI API INTEGRATION POINT — replace with an authenticated,
      // server-side call that preserves the same safety gate.
      const result = await delay(buildTreatmentPlan(input));
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
            : "The treatment plan could not be generated safely."
        );
      }
    } finally {
      if (requestToken === generationToken.current) setLoading(false);
    }
  }

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
      setWorkflowError(
        "A linked case, editable unsaved draft, and current clear safety screen are required before saving."
      );
      return;
    }

    const parsedPlan = TreatmentPlanSchema.safeParse(
      normalizeTreatmentPlan(plan)
    );
    if (!parsedPlan.success) {
      setWorkflowError(
        "Complete every required plan section, keep one item per line and remove blank or oversized items before saving."
      );
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
      setWorkflowError(
        "The draft was not saved. Re-check assignment, safety status and connection; the generated text remains on this screen."
      );
      return;
    }
    setPlan(parsedPlan.data);
    setStoredPlan(saved);
    setHistoryRetry((value) => value + 1);
  }

  async function reviewDraft(decision: "approved" | "rejected") {
    if (workflowBusy || !storedPlan || storedPlan.status !== "draft") return;
    if (decision === "approved" && !reviewConfirmed) {
      setWorkflowError(
        "Confirm that you reviewed the original case, current safety screen and every plan item before signing."
      );
      return;
    }
    if (decision === "approved" && !safetyCleared) {
      setWorkflowError(
        "Approval is blocked because the current case safety screen is no longer clear."
      );
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
      setWorkflowError(
        "The review decision was not stored. The draft remains unsigned. Refresh the case safety status and retry."
      );
      return;
    }
    setStoredPlan(reviewed);
    setHistoryRetry((value) => value + 1);
  }

  return (
    <div className="space-y-6">
      <PageIntro
        title="Treatment Plan Builder"
        description="Generate a draft only after the active case has a completed, clear safety screen. Every input change invalidates the previous draft."
        action={
          cases.length > 0 ? (
            <Select
              aria-label="Patient case for treatment planning"
              value={currentCase?.id ?? ""}
              onChange={(event) => changeCase(event.target.value)}
              className="w-64"
            >
              <option value="">Select a case…</option>
              {cases.map((patientCase) => (
                <option key={patientCase.id} value={patientCase.id}>
                  {patientCase.name || "Unnamed"}
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
            Patient cases could not be loaded securely. Treatment planning is
            locked; this is not an empty case list.
          </p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="mt-3"
            onClick={reloadCases}
          >
            Retry case list
          </Button>
        </div>
      )}

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
            ? "Safety gate passed for this case"
            : "Treatment planning locked"}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--color-ink-soft)]">
          {safetyCleared
            ? `Structured screen completed ${currentCase?.safetyScreen?.screenedAt ? new Date(currentCase.safetyScreen.screenedAt).toLocaleString() : ""}. Continue clinical monitoring; this is not a diagnosis or blanket clearance.`
            : loadError
              ? "Case and safety status are unavailable. Retry the case list before planning treatment."
            : currentCase
              ? `Current safety disposition: ${safetyDisposition}. Resolve and document the appropriate escalation before generating advice.`
              : "Select or create a case and complete its structured red-flag screen first. Manual planning without a case is disabled."}
        </p>
      </div>

      <Card>
        <CardHeader
          title="Plan Parameters"
          subtitle={
            currentCase
              ? `Pre-filled from case: ${currentCase.name}`
              : "No active case — treatment planning is disabled"
          }
          icon={<Icon name="treatment" width={18} height={18} />}
        />
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Body region" required>
            <Select
              value={region}
              disabled={loading}
              onChange={(e) => {
                setRegion(e.target.value as BodyRegionId);
                invalidatePlan();
              }}
            >
              <option value="">Select…</option>
              {bodyRegions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Stage">
            <Select
              value={stage}
              disabled={loading}
              onChange={(e) => {
                setStage(e.target.value as Stage);
                invalidatePlan();
              }}
            >
              {stages.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Irritability">
            <Select
              value={irritability}
              disabled={loading}
              onChange={(e) => {
                setIrritability(e.target.value as Irritability);
                invalidatePlan();
              }}
            >
              <option value="low">Low</option>
              <option value="moderate">Moderate</option>
              <option value="high">High</option>
            </Select>
          </Field>
          <Field label={`Pain severity — ${painSeverity}/10`}>
            <input
              type="range"
              min={0}
              max={10}
              value={painSeverity}
              disabled={loading}
              onChange={(e) => {
                setPainSeverity(Number(e.target.value));
                invalidatePlan();
              }}
              className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-gradient-to-r from-[var(--color-success)] via-[var(--color-warn)] to-[var(--color-danger)]"
            />
          </Field>
          <Field label="Main impairment">
            <Input
              value={mainImpairment}
              disabled={loading}
              onChange={(e) => {
                setMainImpairment(e.target.value);
                invalidatePlan();
              }}
              placeholder="e.g. Hip abductor weakness"
            />
          </Field>
          <Field label="Patient goal">
            <Input
              value={patientGoal}
              disabled={loading}
              onChange={(e) => {
                setPatientGoal(e.target.value);
                invalidatePlan();
              }}
              placeholder="e.g. Return to running 5km"
            />
          </Field>

          {stage === "post-op" && (
            <div className="grid grid-cols-1 gap-4 rounded-xl border border-[var(--color-warn)]/30 bg-[var(--color-warn-soft)]/40 p-4 sm:col-span-2 sm:grid-cols-2 lg:col-span-3">
              <div className="sm:col-span-2">
                <p className="text-sm font-semibold text-[var(--color-warn)]">
                  Required post-operative protocol details
                </p>
                <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                  The planner cannot infer restrictions from the operation name.
                  Enter the operating team&apos;s documented instructions.
                </p>
              </div>
              <Field label="Procedure" required>
                <Input
                  value={procedure}
                  disabled={loading}
                  onChange={(event) => {
                    setProcedure(event.target.value);
                    invalidatePlan();
                  }}
                  placeholder="e.g. Right rotator-cuff repair"
                />
              </Field>
              <Field label="Surgery date" required>
                <Input
                  type="date"
                  max={new Date().toISOString().slice(0, 10)}
                  value={surgeryDate}
                  disabled={loading}
                  onChange={(event) => {
                    setSurgeryDate(event.target.value);
                    invalidatePlan();
                  }}
                />
              </Field>
              <Field label="Weight-bearing / loading status" required>
                <Input
                  value={weightBearingStatus}
                  disabled={loading}
                  onChange={(event) => {
                    setWeightBearingStatus(event.target.value);
                    invalidatePlan();
                  }}
                  placeholder="e.g. NWB, WBAT, or upper-limb loading restriction"
                />
              </Field>
              <Field
                label="Precautions and prohibited movements"
                required
                hint="Enter “none documented” only after checking the protocol."
              >
                <Textarea
                  value={precautions}
                  disabled={loading}
                  onChange={(event) => {
                    setPrecautions(event.target.value);
                    invalidatePlan();
                  }}
                  className="min-h-20"
                  placeholder="Document range, load, wound or tissue-healing restrictions"
                />
              </Field>
              <label className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] bg-white p-3 text-sm text-[var(--color-ink-soft)] sm:col-span-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={protocolConfirmed}
                  disabled={loading}
                  onChange={(event) => {
                    setProtocolConfirmed(event.target.checked);
                    invalidatePlan();
                  }}
                />
                <span>
                  I reviewed the current operating-team protocol, precautions
                  and loading status for this patient.
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
            {loading ? "Generating…" : "Generate treatment plan"}
          </Button>
        </div>
      </Card>

      {loading && (
        <Card>
          <Spinner label="Building a stage-appropriate plan…" />
        </Card>
      )}

      {plan && !loading && safetyCleared && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-[var(--color-ink)]">
              Plan for {region ? getRegion(region)?.label : ""} —{" "}
              {stages.find((s) => s.value === stage)?.label}
            </span>
            <span className="rounded-full bg-[var(--color-primary-tint)] px-3 py-1 text-xs font-medium text-[var(--color-primary-strong)]">
              {plan.frequency}
            </span>
            {planEdited && !storedPlan && (
              <Badge tone="warn">Clinician-edited draft</Badge>
            )}
          </div>

          <Card>
            <CardHeader
              title="Edit clinical draft"
              subtitle="Review and edit the generated template before saving. Use one item per line; the exact edited structure is stored in the new version."
              icon={<Icon name="edit" width={18} height={18} />}
            />
            <CardBody className="space-y-4">
              {storedPlan && (
                <p className="rounded-xl bg-[var(--color-surface-muted)] px-4 py-3 text-sm text-[var(--color-ink-soft)]">
                  This saved version is immutable. Generate again to create and
                  edit a new version instead of rewriting the audit trail.
                </p>
              )}
              <Field label="Recommended frequency" required>
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
                    key={section.key}
                    label={section.label}
                    required={
                      section.key === "exerciseTherapy" ||
                      section.key === "education" ||
                      section.key === "homeProgram" ||
                      section.key === "progression"
                    }
                    hint="One item per line; maximum 12 items."
                  >
                    <Textarea
                      value={plan[section.key].join("\n")}
                      maxLength={12_000}
                      disabled={workflowBusy || Boolean(storedPlan)}
                      onChange={(event) =>
                        updatePlanSection(section.key, event.target.value)
                      }
                      className="min-h-32"
                    />
                  </Field>
                ))}
              </div>
            </CardBody>
          </Card>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <PlanCard title="Manual Therapy" items={plan.manualTherapy} />
            <PlanCard title="Exercise Therapy" items={plan.exerciseTherapy} />
            <PlanCard title="Mobility" items={plan.mobility} />
            <PlanCard title="Strengthening" items={plan.strengthening} />
            <PlanCard title="Motor Control" items={plan.motorControl} />
            <PlanCard title="Balance & Proprioception" items={plan.balance} />
            <PlanCard title="Education" items={plan.education} />
            <PlanCard title="Home Exercise Program" items={plan.homeProgram} />
            <PlanCard title="Progression Rules" items={plan.progression} highlight />
          </div>

          <Card>
            <CardHeader
              title="Clinical record and sign-off"
              subtitle="Generation never publishes a plan. Save a versioned draft, re-check the source record, then explicitly approve or reject it."
              icon={<Icon name="shield" width={18} height={18} />}
            />
            <CardBody className="space-y-4">
              {isMockMode ? (
                <p className="rounded-xl bg-[var(--color-warn-soft)] px-4 py-3 text-sm text-[var(--color-warn)]">
                  Demo mode: this sample is not a clinical record and cannot be signed or published.
                </p>
              ) : !currentCase?.patientId || !currentCase.episodeId ? (
                <p role="alert" className="rounded-xl bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]">
                  This legacy case is not linked to a patient and care episode. Link or archive it before saving a plan.
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
                        ? `Version ${storedPlan.version} · ${storedPlan.status}`
                        : "Unsaved generated draft"}
                    </Badge>
                    {storedPlan && (
                      <span className="text-xs text-[var(--color-ink-faint)]">
                        Server timestamp: {new Date(storedPlan.timestamp).toLocaleString()}
                      </span>
                    )}
                  </div>

                  {!storedPlan ? (
                    <Button
                      onClick={saveDraft}
                      disabled={workflowBusy || !generatedInput}
                    >
                      {workflowBusy ? "Saving…" : "Save versioned draft"}
                    </Button>
                  ) : storedPlan.status === "draft" ? (
                    <div className="space-y-4">
                      <Field
                        label="Review note"
                        hint="Optional for approval; record the reason when rejecting or changing clinical direction."
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
                          I reviewed the original patient record, current safety
                          screen, missing information, precautions and every item
                          in this draft. I take clinical responsibility for this
                          sign-off.
                        </span>
                      </label>
                      <div className="flex flex-wrap gap-3">
                        <Button
                          onClick={() => reviewDraft("approved")}
                          disabled={workflowBusy || !reviewConfirmed}
                        >
                          {workflowBusy ? "Saving decision…" : "Approve and sign"}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => reviewDraft("rejected")}
                          disabled={workflowBusy}
                        >
                          Reject draft
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
                      This version is {storedPlan.status}. A new generation must
                      be saved as a new version; signed records are never edited
                      in place.
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
        <Card>
          <CardHeader
            title="Plan version history"
            subtitle="Append-only drafts and clinician review decisions for the active case."
            icon={<Icon name="clock" width={18} height={18} />}
          />
          <CardBody>
            {historyLoading ? (
              <Spinner label="Loading saved plans…" />
            ) : historyForCurrentCase.error ? (
              <div role="alert" className="space-y-3 text-sm text-[var(--color-danger)]">
                <p>{historyForCurrentCase.error}</p>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setHistoryRetry((value) => value + 1)}
                >
                  Retry
                </Button>
              </div>
            ) : historyForCurrentCase.plans.length === 0 ? (
              <p className="text-sm text-[var(--color-ink-faint)]">
                No saved treatment-plan versions for this case.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {historyForCurrentCase.plans.map((record) => (
                  <li
                    key={record.id}
                    className="flex flex-wrap items-center gap-3 py-3 text-sm"
                  >
                    <span className="font-medium text-[var(--color-ink)]">
                      Version {record.version}
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
                      {record.status}
                    </Badge>
                    <span className="ms-auto text-xs text-[var(--color-ink-faint)]">
                      {new Date(record.createdAt).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      {!isMockMode &&
        currentCase?.episodeId &&
        approvedPlanId && (
          <PrescriptionBuilder
            key={`${currentCase.episodeId}:${approvedPlanId}`}
            treatmentPlanId={approvedPlanId}
            episodeId={currentCase.episodeId}
            region={currentCase.region}
            safetyCleared={safetyCleared}
          />
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
