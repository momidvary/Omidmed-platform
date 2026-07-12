"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/store/LocaleContext";
import { useAuth } from "@/lib/store/AuthContext";
import { isMockMode } from "@/lib/config";
import { createEpisode } from "@/lib/supabase/clinical";
import { assessmentTemplates } from "@/lib/data/clinicalTemplates";
import { PageState } from "@/components/patients/shared";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { PageIntro } from "@/components/ui/Misc";

const sides = ["right", "left", "bilateral", "central", "not_applicable"] as const;

export default function NewEpisodePage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = use(params);
  const { t, locale } = useLocale();
  const { profile } = useAuth();
  const router = useRouter();

  const [form, setForm] = useState({
    title: "", body_region: "general", side: "not_applicable",
    referral_diagnosis: "", therapist_diagnosis: "", referring_physician: "",
    injury_date: "", surgery_date: "", planned_session_count: "",
    short_term_goals: "", long_term_goals: "", precautions: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const clinicId = profile?.clinicIds[0];
  if (isMockMode || !profile) return <PageState state={isMockMode ? "error" : "loading"} t={t} />;
  if (profile.role === "patient" || profile.role === "clinic_staff" || !clinicId) {
    // Creating an episode is clinical work — staff are read-only here.
    return <PageState state="denied" t={t} />;
  }

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      setError(t("pm.required"));
      return;
    }
    setError(null);
    setBusy(true);
    const created = await createEpisode({
      clinic_id: clinicId!,
      patient_id: patientId,
      created_by: profile!.id,
      primary_therapist_id: profile!.role === "therapist" ? profile!.id : null,
      title: form.title.trim(),
      body_region: form.body_region,
      side: form.side,
      referral_diagnosis: form.referral_diagnosis.trim() || null,
      therapist_diagnosis: form.therapist_diagnosis.trim() || null,
      referring_physician: form.referring_physician.trim() || null,
      injury_date: form.injury_date || null,
      surgery_date: form.surgery_date || null,
      planned_session_count: form.planned_session_count
        ? Number(form.planned_session_count)
        : null,
      short_term_goals: form.short_term_goals.trim() || null,
      long_term_goals: form.long_term_goals.trim() || null,
      precautions: form.precautions.trim() || null,
      status: "active",
    });
    setBusy(false);
    if (!created) {
      setError(t("pm.saveFailedKeep"));
      return;
    }
    router.push(`/patients/${patientId}/episodes/${created.id}`);
  }

  return (
    <div className="space-y-5">
      <PageIntro title={t("ep.new")} description="" />
      <form onSubmit={submit} className="space-y-5">
        <Card>
          <CardHeader title={t("ep.new")} icon={<Icon name="treatment" width={18} height={18} />} />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="sm:col-span-2">
              <Field label={t("ep.title")} required error={error ?? undefined}>
                <Input value={form.title} onChange={(e) => set("title", e.target.value)}
                  placeholder="Post-TKA right knee" />
              </Field>
            </div>
            <Field label={t("ep.bodyRegion")}>
              <Select value={form.body_region} onChange={(e) => set("body_region", e.target.value)}>
                {assessmentTemplates.map((tpl) => (
                  <option key={tpl.key} value={tpl.key}>{tpl.label[locale]}</option>
                ))}
              </Select>
            </Field>
            <Field label={t("ep.side")}>
              <Select value={form.side} onChange={(e) => set("side", e.target.value)}>
                {sides.map((s) => <option key={s} value={s}>{t(`ep.side.${s}`)}</option>)}
              </Select>
            </Field>
            <Field label={t("ep.refDx")}>
              <Input value={form.referral_diagnosis} onChange={(e) => set("referral_diagnosis", e.target.value)} />
            </Field>
            <Field label={t("ep.thDx")}>
              <Input value={form.therapist_diagnosis} onChange={(e) => set("therapist_diagnosis", e.target.value)} />
            </Field>
            <Field label={t("ep.injuryDate")}>
              <Input type="date" dir="ltr" value={form.injury_date} onChange={(e) => set("injury_date", e.target.value)} />
            </Field>
            <Field label={t("ep.surgeryDate")}>
              <Input type="date" dir="ltr" value={form.surgery_date} onChange={(e) => set("surgery_date", e.target.value)} />
            </Field>
            <Field label={t("ep.referringPhysician")}>
              <Input value={form.referring_physician} onChange={(e) => set("referring_physician", e.target.value)} />
            </Field>
            <Field label={t("ep.plannedSessions")}>
              <Input type="number" dir="ltr" min={1} max={200} value={form.planned_session_count}
                onChange={(e) => set("planned_session_count", e.target.value)} />
            </Field>
            <Field label={t("ep.stGoals")}>
              <Textarea className="min-h-16" value={form.short_term_goals} onChange={(e) => set("short_term_goals", e.target.value)} />
            </Field>
            <Field label={t("ep.ltGoals")}>
              <Textarea className="min-h-16" value={form.long_term_goals} onChange={(e) => set("long_term_goals", e.target.value)} />
            </Field>
            <Field label={t("pm.precautions")}>
              <Textarea className="min-h-16" value={form.precautions} onChange={(e) => set("precautions", e.target.value)} />
            </Field>
          </CardBody>
        </Card>
        <div className="flex justify-end">
          <Button type="submit" disabled={busy}>
            {busy ? t("status.saving") : t("pm.save")}
          </Button>
        </div>
      </form>
    </div>
  );
}
