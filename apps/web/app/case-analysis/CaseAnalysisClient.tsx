"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useCases } from "@/lib/store/CaseContext";
import { buildReasoning, delay } from "@/lib/ai/engine";
import { bodyRegions, getRegion } from "@/lib/data/bodyRegions";
import type { BodyRegionId, ClinicalReasoning } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Select } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import {
  BulletList,
  Disclaimer,
  EmptyState,
  PageIntro,
  Spinner,
} from "@/components/ui/Misc";

export function CaseAnalysisClient() {
  const { cases, currentCase, setCurrentCase, hydrated } = useCases();
  const searchParams = useSearchParams();
  const regionParam = searchParams.get("region") as BodyRegionId | null;

  // Reasoning is tagged with the case id it was generated for, so
  // "loading" is derived state rather than set synchronously in the effect.
  const [reasoning, setReasoning] = useState<{
    caseId: string;
    data: ClinicalReasoning;
  } | null>(null);
  const loading =
    !!currentCase && reasoning?.caseId !== currentCase.id;

  // Region browser can be used stand-alone (from dashboard module links).
  // The URL param provides the default; a manual selection overrides it.
  const [manualRegion, setManualRegion] = useState<BodyRegionId | "" | null>(
    null
  );
  const browseRegion = manualRegion ?? regionParam ?? "";
  const setBrowseRegion = (r: BodyRegionId | "") => setManualRegion(r);

  // Regenerate reasoning whenever the selected case changes.
  useEffect(() => {
    if (!currentCase) return;
    let cancelled = false;
    const caseId = currentCase.id;
    // 🔌 REAL AI API INTEGRATION POINT — replace buildReasoning + delay
    // with an async call to your AI provider (see lib/ai/engine.ts).
    delay(buildReasoning(currentCase)).then((data) => {
      if (!cancelled) setReasoning({ caseId, data });
    });
    return () => {
      cancelled = true;
    };
  }, [currentCase]);

  const regionModule = useMemo(
    () => (browseRegion ? getRegion(browseRegion) : undefined),
    [browseRegion]
  );

  if (!hydrated) return <Spinner label="Loading cases…" />;

  return (
    <div className="space-y-6">
      <PageIntro
        title="Case Analysis"
        description="Structured clinical reasoning generated from the intake — organised as possible clinical hypotheses to confirm with your examination."
        action={
          cases.length > 0 ? (
            <Select
              value={currentCase?.id ?? ""}
              onChange={(e) => setCurrentCase(e.target.value || null)}
              className="w-64"
            >
              <option value="">Select a case…</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || "Unnamed"} — {c.mainComplaint.slice(0, 40)}
                </option>
              ))}
            </Select>
          ) : undefined
        }
      />

      {!currentCase && (
        <EmptyState
          icon="analysis"
          title="No case selected"
          description="Create a new patient case or pick a recent one to generate a clinical reasoning summary."
          action={<ButtonLink href="/new-case">New Patient Case</ButtonLink>}
        />
      )}

      {currentCase && (
        <>
          {/* Case summary strip */}
          <Card>
            <CardBody className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--color-primary-tint)] text-sm font-semibold text-[var(--color-primary-strong)]">
                  {currentCase.name.charAt(0).toUpperCase()}
                </span>
                <div>
                  <p className="text-sm font-semibold text-[var(--color-ink)]">
                    {currentCase.name}
                    {currentCase.age ? `, ${currentCase.age}` : ""}
                  </p>
                  <p className="text-xs text-[var(--color-ink-faint)]">
                    {currentCase.mainComplaint}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={currentCase.painIntensity >= 7 ? "danger" : currentCase.painIntensity >= 4 ? "warn" : "success"}>
                  Pain {currentCase.painIntensity}/10
                </Badge>
                {currentCase.duration && <Badge>{currentCase.duration}</Badge>}
                {currentCase.region && (
                  <Badge tone="primary">
                    {getRegion(currentCase.region)?.label}
                  </Badge>
                )}
              </div>
              <div className="ms-auto flex gap-2">
                <ButtonLink href="/treatment-planner" variant="secondary" size="sm">
                  Plan treatment
                </ButtonLink>
                <ButtonLink href="/patient-education" variant="secondary" size="sm">
                  Patient handout
                </ButtonLink>
              </div>
            </CardBody>
          </Card>

          {loading && (
            <Card>
              <Spinner label="Organising clinical reasoning…" />
            </Card>
          )}

          {!loading && reasoning && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ReasonCard title="Subjective Findings" icon="user" items={reasoning.data.subjective} />
              <ReasonCard title="Objective Findings (to examine)" icon="analysis" items={reasoning.data.objective} />
              <ReasonCard
                title="Possible Clinical Hypotheses"
                icon="sparkle"
                items={reasoning.data.hypotheses}
                tone="primary"
                footer="These are hypotheses, not a diagnosis — confirm with clinical examination."
              />
              <ReasonCard title="Differential Diagnosis Ideas" icon="analysis" items={reasoning.data.differentials} />
              <ReasonCard title="Yellow Flags (psychosocial)" icon="flag" items={reasoning.data.yellowFlags} tone="warn" />
              <ReasonCard title="Red Flags (safety)" icon="alert" items={reasoning.data.redFlags} tone="danger" footer="Refer to physician / emergency care if clinically indicated." />
              <ReasonCard title="Missing Information to Ask" icon="search" items={reasoning.data.missingInfo} />
              <ReasonCard title="Suggested Physical Tests" icon="check" items={reasoning.data.suggestedTests} tone="primary" />
              <div className="lg:col-span-2">
                <ReasonCard title="Suggested Outcome Measures" icon="clock" items={reasoning.data.outcomeMeasures} />
              </div>
            </div>
          )}
        </>
      )}

      {/* Body region reference browser */}
      <Card>
        <CardHeader
          title="Body Region Modules"
          subtitle="Reference: conditions, tests, treatment ideas and education per region"
          icon={<Icon name="analysis" width={18} height={18} />}
          action={
            <Select
              value={browseRegion}
              onChange={(e) => setBrowseRegion(e.target.value as BodyRegionId | "")}
              className="w-52"
            >
              <option value="">Browse a region…</option>
              {bodyRegions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </Select>
          }
        />
        {regionModule ? (
          <CardBody className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            <ModuleList label="Common conditions" items={regionModule.commonConditions} />
            <ModuleList label="Assessment questions" items={regionModule.assessmentQuestions} />
            <ModuleList label="Special tests" items={regionModule.specialTests} />
            <ModuleList label="Functional tests" items={regionModule.functionalTests} />
            <ModuleList label="Treatment ideas" items={regionModule.treatmentIdeas} />
            <ModuleList label="Exercise suggestions" items={regionModule.exerciseSuggestions} />
            <div className="md:col-span-2 lg:col-span-3">
              <ModuleList label="Patient education points" items={regionModule.educationPoints} />
            </div>
          </CardBody>
        ) : (
          <CardBody>
            <p className="text-sm text-[var(--color-ink-faint)]">
              Select a region above to view its assessment and treatment reference.
            </p>
          </CardBody>
        )}
      </Card>

      <Disclaimer />
    </div>
  );
}

function ReasonCard({
  title,
  icon,
  items,
  tone = "neutral",
  footer,
}: {
  title: string;
  icon: React.ComponentProps<typeof Icon>["name"];
  items: string[];
  tone?: "neutral" | "primary" | "danger" | "warn";
  footer?: string;
}) {
  return (
    <Card>
      <CardHeader title={title} icon={<Icon name={icon} width={18} height={18} />} />
      <CardBody>
        <BulletList items={items} tone={tone} />
        {footer && (
          <p className="mt-3 rounded-lg bg-[var(--color-surface-muted)] px-3 py-2 text-[11px] text-[var(--color-ink-soft)]">
            {footer}
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function ModuleList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]">
        {label}
      </h4>
      <BulletList items={items} />
    </div>
  );
}
