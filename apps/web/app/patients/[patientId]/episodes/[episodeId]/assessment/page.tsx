"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useLocale } from "@/lib/store/LocaleContext";
import { useAuth } from "@/lib/store/AuthContext";
import { isMockMode } from "@/lib/config";
import {
  getEpisode,
  saveAssessment,
  type AssessmentRow,
  type EpisodeRow,
} from "@/lib/supabase/clinical";
import {
  assessmentTemplates,
  commonAssessmentFields,
  type AssessmentSection,
  type FieldDef,
} from "@/lib/data/clinicalTemplates";
import { PageState, StatusBadge, type LoadState } from "@/components/patients/shared";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { PageIntro } from "@/components/ui/Misc";

type SectionData = Record<string, unknown>;

export default function AssessmentPage({
  params,
}: {
  params: Promise<{ patientId: string; episodeId: string }>;
}) {
  const { episodeId } = use(params);
  const { t, locale } = useLocale();
  const { session, loading: authLoading, profile } = useAuth();
  const [episode, setEpisode] = useState<EpisodeRow | null>(null);
  const [existing, setExisting] = useState<AssessmentRow | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [data, setData] = useState<Record<AssessmentSection, SectionData>>({
    subjective: {}, safety: {}, objective: {}, clinical_summary: {},
  });
  const [reassessDate, setReassessDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getEpisode(episodeId).then((res) => {
      if (!res) {
        setState("error");
        return;
      }
      setEpisode(res.episode);
      const initial = res.assessments.find((a) => a.kind === "initial") ?? null;
      setExisting(initial);
      if (initial) {
        setData({
          subjective: initial.subjective ?? {},
          safety: initial.safety ?? {},
          objective: initial.objective ?? {},
          clinical_summary: initial.clinical_summary ?? {},
        });
        setReassessDate(initial.planned_reassessment_date ?? "");
      }
      setState("ready");
    });
  }, [episodeId]);

  useEffect(() => {
    if (isMockMode || authLoading || !session) return;
    load();
  }, [session, authLoading, load]);

  if (!isMockMode && !authLoading && !session) {
    return <PageState state="denied" t={t} />;
  }
  if (state !== "ready" || !episode) {
    return <PageState state={state as Exclude<LoadState, "ready">} t={t} />;
  }
  const canClinical = profile && !["patient", "clinic_staff"].includes(profile.role);
  const readOnly = !canClinical;
  const template =
    assessmentTemplates.find((tpl) => tpl.key === (episode.body_region ?? "general")) ??
    assessmentTemplates[assessmentTemplates.length - 1];

  const sections: { key: AssessmentSection; title: string; fields: FieldDef[] }[] = [
    { key: "subjective", title: t("as.subjective"), fields: commonAssessmentFields.subjective },
    { key: "safety", title: t("as.safety"), fields: commonAssessmentFields.safety },
    { key: "objective", title: t("as.objective"),
      fields: [...commonAssessmentFields.objective, ...template.extraObjective] },
    { key: "clinical_summary", title: t("as.summary"), fields: commonAssessmentFields.clinical_summary },
  ];

  const redFlags = String(data.safety["red_flags"] ?? "").trim();

  function setField(section: AssessmentSection, key: string, value: unknown) {
    setData((d) => ({ ...d, [section]: { ...d[section], [key]: value } }));
  }

  async function persist(finalise: boolean) {
    if (!episode || !profile) return;
    if (finalise && !window.confirm(t("as.finaliseConfirm"))) return;
    setBusy(true);
    setError(null);
    const saved = await saveAssessment(
      {
        clinic_id: episode.clinic_id,
        patient_id: episode.patient_id,
        care_episode_id: episode.id,
        kind: "initial",
        template_key: template.key,
        subjective: data.subjective,
        safety: data.safety,
        objective: data.objective,
        clinical_summary: data.clinical_summary,
        planned_reassessment_date: reassessDate || null,
        status: finalise ? "finalised" : "draft",
        ...(existing ? { updated_by: profile.id } : { created_by: profile.id }),
      },
      existing?.id
    );
    setBusy(false);
    if (!saved) {
      setError(t("pm.saveFailedKeep"));
      return;
    }
    load();
  }

  return (
    <div className="space-y-5">
      <PageIntro
        title={t("as.title")}
        description={`${t("as.template")}: ${template.label[locale]}`}
        action={existing ? <StatusBadge status={existing.status} t={t} /> : undefined}
      />

      {redFlags && (
        <p className="flex items-start gap-2 rounded-xl bg-[var(--color-danger-soft)] px-4 py-3 text-sm font-medium text-[var(--color-danger)]">
          <Icon name="alert" width={18} height={18} className="mt-0.5 shrink-0" />
          {t("as.redFlagAlert")}
        </p>
      )}

      {sections.map((section) => (
        <Card key={section.key}>
          <CardHeader title={section.title} icon={<Icon name="analysis" width={18} height={18} />} />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {section.fields.map((field) => {
              const value = data[section.key][field.key];
              const label = field.label[locale];
              if (field.type === "boolean") {
                return (
                  <label key={field.key} className="flex items-center gap-2 text-sm text-[var(--color-ink-soft)]">
                    <input
                      type="checkbox"
                      disabled={readOnly}
                      checked={Boolean(value)}
                      onChange={(e) => setField(section.key, field.key, e.target.checked)}
                    />
                    {label}
                  </label>
                );
              }
              if (field.type === "number") {
                return (
                  <Field key={field.key} label={label}>
                    <Input type="number" dir="ltr" disabled={readOnly}
                      value={value === undefined || value === null ? "" : String(value)}
                      onChange={(e) =>
                        setField(section.key, field.key,
                          e.target.value === "" ? null : Number(e.target.value))
                      } />
                  </Field>
                );
              }
              if (field.type === "text") {
                return (
                  <Field key={field.key} label={label} required={field.required}>
                    <Input disabled={readOnly} value={String(value ?? "")}
                      onChange={(e) => setField(section.key, field.key, e.target.value)} />
                  </Field>
                );
              }
              return (
                <Field key={field.key} label={label} required={field.required}>
                  <Textarea className="min-h-16" disabled={readOnly} value={String(value ?? "")}
                    onChange={(e) => setField(section.key, field.key, e.target.value)} />
                </Field>
              );
            })}
          </CardBody>
        </Card>
      ))}

      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <Field label={t("as.reassessDate")}>
            <Input type="date" dir="ltr" disabled={readOnly} value={reassessDate}
              onChange={(e) => setReassessDate(e.target.value)} className="w-44" />
          </Field>
          {canClinical && (
            <>
              <Button variant="secondary" disabled={busy} onClick={() => persist(false)}>
                {t("as.saveDraft")}
              </Button>
              <Button disabled={busy} onClick={() => persist(true)}>
                {busy ? t("status.saving") : t("as.finalise")}
              </Button>
            </>
          )}
          {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        </CardBody>
      </Card>
    </div>
  );
}
