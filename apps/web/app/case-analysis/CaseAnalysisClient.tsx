"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useCases } from "@/lib/store/CaseContext";
import { buildReasoning, delay } from "@/lib/ai/engine";
import { hasClinicalSafetyClearance } from "@/lib/clinical/safety";
import { getRegion } from "@/lib/data/bodyRegions";
import { localizeRegion, localizedRegions, regionLabel } from "@/lib/data/bodyRegionsFa";
import { buildReasoningFa } from "@/lib/ai/reasoningFa";
import { useLocale } from "@/lib/store/LocaleContext";
import { useText } from "@/lib/i18n/text";
import { caseAnalysisText } from "./text";
import type { BodyRegionId, ClinicalReasoning } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Select } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { CaseAssessmentHistory } from "@/components/clinical/CaseAssessmentHistory";
import { StructuredFindingsPanel } from "@/components/clinical/StructuredFindingsPanel";
import { getRegionKnowledge } from "@/lib/clinical/reasoning/knowledge";
import {
  BulletList,
  Disclaimer,
  EmptyState,
  PageIntro,
  Spinner,
} from "@/components/ui/Misc";

export function CaseAnalysisClient() {
  const {
    cases,
    currentCase,
    setCurrentCase,
    hydrated,
    loadError,
    reloadCases,
    applyAssessmentSnapshot,
  } = useCases();
  const searchParams = useSearchParams();
  const { locale } = useLocale();
  const t = useText(caseAnalysisText);
  const regionParam = searchParams.get("region") as BodyRegionId | null;

  // Reasoning is tagged with the case id it was generated for, so
  // "loading" is derived state rather than set synchronously in the effect.
  const [reasoning, setReasoning] = useState<{
    caseId: string;
    locale: string;
    data: ClinicalReasoning;
  } | null>(null);
  const loading =
    !!currentCase &&
    (reasoning?.caseId !== currentCase.id || reasoning.locale !== locale);
  const safetyCleared = hasClinicalSafetyClearance(
    currentCase?.safetyScreen
  );

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
    const reasoningLocale = locale;
    // Deterministic template (not AI); the audited AI draft lives in the
    // AI Assistant and in the structured findings panel.
    const data =
      locale === "fa" ? buildReasoningFa(currentCase) : buildReasoning(currentCase);
    delay(data, 300).then((result) => {
      if (!cancelled) setReasoning({ caseId, locale: reasoningLocale, data: result });
    });
    return () => {
      cancelled = true;
    };
  }, [currentCase, locale]);

  const regionModule = useMemo(
    () => {
      const regionModuleSource = browseRegion ? getRegion(browseRegion) : undefined;
      return regionModuleSource ? localizeRegion(regionModuleSource, locale) : undefined;
    },
    [browseRegion, locale]
  );

  if (!hydrated) return <Spinner label={t.loadingCases} />;

  if (loadError) {
    return (
      <EmptyState
        icon="alert"
        title={t.loadFailedTitle}
        description={t.loadFailedBody}
        action={
          <Button type="button" onClick={reloadCases}>
            {t.retry}
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageIntro
        title={t.title}
        description={t.intro}
        action={
          cases.length > 0 ? (
            <Select
              aria-label={t.caseLabel}
              value={currentCase?.id ?? ""}
              onChange={(e) => setCurrentCase(e.target.value || null)}
              className="w-64"
            >
              <option value="">{t.selectCase}</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || t.unnamed} — {c.mainComplaint.slice(0, 40)}
                </option>
              ))}
            </Select>
          ) : undefined
        }
      />

      {!currentCase && (
        <EmptyState
          icon="analysis"
          title={t.noCaseTitle}
          description={t.noCaseBody}
          action={<ButtonLink href="/new-case">{t.newCase}</ButtonLink>}
        />
      )}

      {currentCase && (
        <>
          <div
            role={safetyCleared ? "status" : "alert"}
            className={
              safetyCleared
                ? "rounded-2xl border border-[var(--color-success)]/30 bg-[var(--color-success-soft)] px-5 py-4 text-sm text-[var(--color-success)]"
                : "rounded-2xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-5 py-4 text-sm text-[var(--color-danger)]"
            }
          >
            {safetyCleared
              ? t.safetyClear
              : t.safetyAbsent(
                  t.dispositions[currentCase.safetyScreen?.disposition ?? "not-screened"] ??
                    currentCase.safetyScreen?.disposition ??
                    ""
                )}
          </div>

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
                  {t.pain(currentCase.painIntensity)}
                </Badge>
                {currentCase.duration && <Badge>{currentCase.duration}</Badge>}
                {currentCase.region && (
                  <Badge tone="primary">
                    {regionLabel(currentCase.region, locale)}
                  </Badge>
                )}
              </div>
              <div className="ms-auto flex gap-2">
                {safetyCleared ? (
                  <>
                    <ButtonLink href="/treatment-planner" variant="secondary" size="sm">
                      {t.planTreatment}
                    </ButtonLink>
                    <ButtonLink href="/patient-education" variant="secondary" size="sm">
                      {t.handout}
                    </ButtonLink>
                  </>
                ) : (
                  <span className="rounded-xl bg-[var(--color-danger-soft)] px-3 py-2 text-xs font-medium text-[var(--color-danger)]">
                    {t.locked}
                  </span>
                )}
              </div>
            </CardBody>
          </Card>

          <CaseAssessmentHistory
            key={currentCase.id}
            patientCase={currentCase}
            onSnapshotApplied={applyAssessmentSnapshot}
          />

          <StructuredFindingsPanel
            key={`${currentCase.id}:${currentCase.region ?? ""}`}
            patientCase={currentCase}
          />

          {loading && (
            <Card>
              <Spinner label={t.organising} />
            </Card>
          )}

          {!loading && reasoning && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {safetyCleared && (
                <>
                  <ReasonCard title={t.subjective} icon="user" items={reasoning.data.subjective} />
                  <ReasonCard title={t.objective} icon="analysis" items={reasoning.data.objective} />
                  {!getRegionKnowledge(currentCase.region) && (
                    <ReasonCard
                      title={t.hypotheses}
                      icon="sparkle"
                      items={reasoning.data.hypotheses}
                      tone="primary"
                      footer={t.hypothesesFooter}
                    />
                  )}
                  <ReasonCard title={t.differentials} icon="analysis" items={reasoning.data.differentials} />
                  <ReasonCard title={t.yellowFlags} icon="flag" items={reasoning.data.yellowFlags} tone="warn" />
                </>
              )}
              <ReasonCard title={t.redFlags} icon="alert" items={reasoning.data.redFlags} tone="danger" footer={t.redFlagsFooter} />
              <ReasonCard title={t.missing} icon="search" items={reasoning.data.missingInfo} />
              {safetyCleared && (
                <>
                  <ReasonCard title={t.tests} icon="check" items={reasoning.data.suggestedTests} tone="primary" />
                  <div className="lg:col-span-2">
                    <ReasonCard title={t.outcomes} icon="clock" items={reasoning.data.outcomeMeasures} />
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* Body region reference browser */}
      <Card>
        <CardHeader
          title={t.modules}
          subtitle={t.modulesHint}
          icon={<Icon name="analysis" width={18} height={18} />}
          action={
            <Select
              value={browseRegion}
              onChange={(e) => setBrowseRegion(e.target.value as BodyRegionId | "")}
              className="w-52"
            >
              <option value="">{t.browse}</option>
              {localizedRegions(locale).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </Select>
          }
        />
        {regionModule ? (
          <CardBody className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            <ModuleList label={t.conditions} items={regionModule.commonConditions} />
            <ModuleList label={t.questions} items={regionModule.assessmentQuestions} />
            <ModuleList label={t.specialTests} items={regionModule.specialTests} />
            <ModuleList label={t.functionalTests} items={regionModule.functionalTests} />
            <ModuleList label={t.treatmentIdeas} items={regionModule.treatmentIdeas} />
            <ModuleList label={t.exercises} items={regionModule.exerciseSuggestions} />
            <div className="md:col-span-2 lg:col-span-3">
              <ModuleList label={t.education} items={regionModule.educationPoints} />
            </div>
          </CardBody>
        ) : (
          <CardBody>
            <p className="text-sm text-[var(--color-ink-faint)]">
              {t.selectRegion}
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
