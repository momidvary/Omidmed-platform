"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/store/LocaleContext";
import { useAuth } from "@/lib/store/AuthContext";
import { saveSession, type EpisodeRow, type SessionRow } from "@/lib/supabase/clinical";
import { StatusBadge } from "@/components/patients/shared";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";

const textFields = [
  "subjective_report", "medication_changes", "functional_complaints",
  "exercise_adherence", "objective_findings", "interventions",
  "patient_response", "adverse_reactions", "home_exercise_updates",
  "next_session_plan", "patient_visible_summary", "therapist_private_notes",
] as const;
type TextField = (typeof textFields)[number];

const labels: Record<TextField, string> = {
  subjective_report: "se.subjective",
  medication_changes: "se.medChanges",
  functional_complaints: "se.functional",
  exercise_adherence: "se.adherence",
  objective_findings: "se.objective",
  interventions: "se.interventions",
  patient_response: "se.response",
  adverse_reactions: "se.adverse",
  home_exercise_updates: "se.home",
  next_session_plan: "se.nextPlan",
  patient_visible_summary: "se.visibleSummary",
  therapist_private_notes: "se.privateNotes",
};

/** Quick daily documentation form. Draft is the default save; Finalise
 *  (status → completed) requires explicit confirmation and is the only
 *  path that counts the session as delivered. */
export function SessionForm({
  episode,
  existing,
  previous,
  backHref,
}: {
  episode: EpisodeRow;
  existing: SessionRow | null;
  previous: SessionRow | null;
  backHref: string;
}) {
  const { t } = useLocale();
  const { profile } = useAuth();
  const router = useRouter();

  const [form, setForm] = useState<Record<TextField, string>>(() => {
    const init = {} as Record<TextField, string>;
    for (const f of textFields) init[f] = (existing?.[f] as string) ?? "";
    return init;
  });
  const [sessionDate, setSessionDate] = useState(
    existing?.session_date ?? new Date().toISOString().slice(0, 10)
  );
  const [painRest, setPainRest] = useState<string>(
    existing?.pain_at_rest?.toString() ?? ""
  );
  const [painActivity, setPainActivity] = useState<string>(
    existing?.pain_during_activity?.toString() ?? ""
  );
  const [nightPain, setNightPain] = useState(existing?.night_pain ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finalised = existing?.status === "completed";
  const readOnly = !profile || ["patient", "clinic_staff"].includes(profile.role);

  const set = (k: TextField, v: string) => setForm((f) => ({ ...f, [k]: v }));

  /** Selective copy of the previous session's plan/interventions. */
  function copyPrevious() {
    if (!previous) return;
    setForm((f) => ({
      ...f,
      interventions: f.interventions || (previous.interventions ?? ""),
      next_session_plan: f.next_session_plan || (previous.next_session_plan ?? ""),
      home_exercise_updates:
        f.home_exercise_updates || (previous.home_exercise_updates ?? ""),
    }));
  }

  async function persist(finalise: boolean) {
    if (!profile) return;
    if (finalise && !window.confirm(t("se.finaliseConfirm"))) return;
    setBusy(true);
    setError(null);
    const payload: Partial<SessionRow> & Record<string, unknown> = {
      ...form,
      session_date: sessionDate || null,
      pain_at_rest: painRest === "" ? null : Number(painRest),
      pain_during_activity: painActivity === "" ? null : Number(painActivity),
      night_pain: nightPain,
      updated_by: profile.id,
    };
    if (!existing) {
      payload.clinic_id = episode.clinic_id;
      payload.patient_id = episode.patient_id;
      payload.care_episode_id = episode.id;
      payload.therapist_id = profile.id;
      payload.created_by = profile.id;
      payload.status = finalise ? "completed" : "draft";
    } else if (finalise) {
      payload.status = "completed";
    }
    const saved = await saveSession(payload, existing?.id);
    setBusy(false);
    if (!saved) {
      // Nothing typed is lost on failure.
      setError(t("pm.saveFailedKeep"));
      return;
    }
    router.push(backHref);
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title={existing ? `${t("se.date")} #${existing.session_number ?? ""}` : t("se.new")}
          subtitle={episode.title ?? undefined}
          icon={<Icon name="clock" width={18} height={18} />}
          action={existing ? <StatusBadge status={existing.status} t={t} /> : undefined}
        />
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={t("se.date")}>
            <Input type="date" dir="ltr" disabled={readOnly} value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)} />
          </Field>
          <Field label={t("se.painRest")}>
            <Input type="number" dir="ltr" min={0} max={10} disabled={readOnly}
              value={painRest} onChange={(e) => setPainRest(e.target.value)} />
          </Field>
          <Field label={t("se.painActivity")}>
            <Input type="number" dir="ltr" min={0} max={10} disabled={readOnly}
              value={painActivity} onChange={(e) => setPainActivity(e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-[var(--color-ink-soft)]">
            <input type="checkbox" disabled={readOnly} checked={nightPain}
              onChange={(e) => setNightPain(e.target.checked)} />
            {t("se.nightPain")}
          </label>
          {previous && !readOnly && (
            <div className="sm:col-span-2 flex items-end justify-end">
              <Button size="sm" variant="secondary" onClick={copyPrevious}>
                {t("se.copyPrev")}
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {textFields.map((f) => (
            <Field
              key={f}
              label={t(labels[f])}
              hint={f === "therapist_private_notes" ? undefined : undefined}
            >
              <Textarea
                className={
                  f === "therapist_private_notes"
                    ? "min-h-16 border-[var(--color-warn)]/40 bg-[var(--color-warn-soft)]/20"
                    : "min-h-16"
                }
                disabled={readOnly}
                value={form[f]}
                onChange={(e) => set(f, e.target.value)}
              />
            </Field>
          ))}
        </CardBody>
      </Card>

      {error && (
        <p className="rounded-xl bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      {!readOnly && (
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="secondary" disabled={busy} onClick={() => persist(false)}>
            {t("as.saveDraft")}
          </Button>
          {!finalised && (
            <Button disabled={busy} onClick={() => persist(true)}>
              {busy ? t("status.saving") : t("as.finalise")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
