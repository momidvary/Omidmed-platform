"use client";

import { useState } from "react";
import { useCases } from "@/lib/store/CaseContext";
import { buildTreatmentPlan, delay } from "@/lib/ai/engine";
import { bodyRegions, getRegion } from "@/lib/data/bodyRegions";
import type {
  BodyRegionId,
  Irritability,
  Stage,
  TreatmentPlan,
} from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { BulletList, Disclaimer, PageIntro, Spinner } from "@/components/ui/Misc";

const stages: { value: Stage; label: string }[] = [
  { value: "acute", label: "Acute" },
  { value: "subacute", label: "Subacute" },
  { value: "chronic", label: "Chronic" },
  { value: "post-op", label: "Post-operative" },
  { value: "return-to-sport", label: "Return to sport" },
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
  const { currentCase } = useCases();

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
  const [error, setError] = useState<string | null>(null);

  const [plan, setPlan] = useState<TreatmentPlan | null>(null);
  const [loading, setLoading] = useState(false);

  async function generate() {
    if (!region) {
      setError("Select a body region first.");
      return;
    }
    setError(null);
    setLoading(true);
    setPlan(null);
    // 🔌 REAL AI API INTEGRATION POINT — replace with an async AI call
    // that returns a TreatmentPlan JSON (see lib/ai/engine.ts).
    const result = await delay(
      buildTreatmentPlan({
        region,
        stage,
        painSeverity,
        irritability,
        mainImpairment,
        patientGoal,
      })
    );
    setPlan(result);
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <PageIntro
        title="Treatment Plan Builder"
        description="Set the clinical parameters and generate a structured, stage-appropriate starting plan you can adapt to the patient."
      />

      <Card>
        <CardHeader
          title="Plan Parameters"
          subtitle={
            currentCase
              ? `Pre-filled from case: ${currentCase.name}`
              : "No active case — set parameters manually"
          }
          icon={<Icon name="treatment" width={18} height={18} />}
        />
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Body region" required error={error ?? undefined}>
            <Select
              value={region}
              onChange={(e) => {
                setRegion(e.target.value as BodyRegionId);
                setError(null);
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
              onChange={(e) => setStage(e.target.value as Stage)}
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
              onChange={(e) => setIrritability(e.target.value as Irritability)}
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
              onChange={(e) => setPainSeverity(Number(e.target.value))}
              className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-gradient-to-r from-[var(--color-success)] via-[var(--color-warn)] to-[var(--color-danger)]"
            />
          </Field>
          <Field label="Main impairment">
            <Input
              value={mainImpairment}
              onChange={(e) => setMainImpairment(e.target.value)}
              placeholder="e.g. Hip abductor weakness"
            />
          </Field>
          <Field label="Patient goal">
            <Input
              value={patientGoal}
              onChange={(e) => setPatientGoal(e.target.value)}
              placeholder="e.g. Return to running 5km"
            />
          </Field>
        </CardBody>
        <div className="border-t border-[var(--color-border)] px-5 py-4">
          <Button onClick={generate} disabled={loading}>
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

      {plan && !loading && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-[var(--color-ink)]">
              Plan for {region ? getRegion(region)?.label : ""} —{" "}
              {stages.find((s) => s.value === stage)?.label}
            </span>
            <span className="rounded-full bg-[var(--color-primary-tint)] px-3 py-1 text-xs font-medium text-[var(--color-primary-strong)]">
              {plan.frequency}
            </span>
          </div>

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
        </>
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
