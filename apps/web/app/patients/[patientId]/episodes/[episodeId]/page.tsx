"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/lib/store/LocaleContext";
import { useAuth } from "@/lib/store/AuthContext";
import { isMockMode } from "@/lib/config";
import {
  getEpisode,
  updateEpisode,
  type AssessmentRow,
  type EpisodeRow,
  type SessionRow,
} from "@/lib/supabase/clinical";
import { sessionCounts } from "@/lib/clinical/calc";
import { PageState, StatusBadge, type LoadState } from "@/components/patients/shared";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/Badge";
import { PageIntro } from "@/components/ui/Misc";

const statuses = ["draft", "active", "paused", "completed", "discharged", "referred", "archived"];

export default function EpisodePage({
  params,
}: {
  params: Promise<{ patientId: string; episodeId: string }>;
}) {
  const { patientId, episodeId } = use(params);
  const { t } = useLocale();
  const { session, loading: authLoading, profile } = useAuth();
  const [episode, setEpisode] = useState<EpisodeRow | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [assessments, setAssessments] = useState<AssessmentRow[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [newStatus, setNewStatus] = useState("");
  const [reason, setReason] = useState("");
  const [statusError, setStatusError] = useState<string | null>(null);

  const load = useCallback(() => {
    getEpisode(episodeId).then((data) => {
      if (!data) {
        setState("error");
        return;
      }
      setEpisode(data.episode);
      setSessions(data.sessions);
      setAssessments(data.assessments);
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

  const counts = sessionCounts(sessions, episode.planned_session_count);
  const canClinical = profile && !["patient", "clinic_staff"].includes(profile.role);
  const base = `/patients/${patientId}/episodes/${episodeId}`;
  const initialAssessment = assessments.find((a) => a.kind === "initial");
  const wasFinished = ["completed", "discharged"].includes(episode.status);

  async function changeStatus() {
    if (!newStatus || !episode) return;
    setStatusError(null);
    const patch: Partial<EpisodeRow> = { status: newStatus };
    if (newStatus === "discharged") {
      if (!reason.trim()) {
        setStatusError(t("pm.required"));
        return;
      }
      patch.discharge_reason = reason.trim();
      patch.discharge_date = new Date().toISOString().slice(0, 10);
    }
    // Reopening a finished episode requires a reason (DB enforces too).
    if (wasFinished && ["active", "paused"].includes(newStatus)) {
      if (!reason.trim()) {
        setStatusError(t("ep.reopenNeedsNote"));
        return;
      }
      patch.reopen_note = reason.trim();
    }
    const ok = await updateEpisode(episode.id, patch);
    if (!ok) {
      setStatusError(t("pm.saveFailedKeep"));
      return;
    }
    setNewStatus("");
    setReason("");
    load();
  }

  return (
    <div className="space-y-5">
      <PageIntro
        title={episode.title ?? ""}
        description={`${episode.body_region ?? ""} · ${t(`ep.side.${episode.side ?? "not_applicable"}`)}`}
        action={<StatusBadge status={episode.status} t={t} />}
      />

      {/* Session stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [t("ep.plannedSessions"), counts.planned ?? "—"],
          [t("st.completed"), counts.completed],
          [t("pm.remaining"), counts.remaining ?? "—"],
          [t("pm.overPlan"), counts.overPlan > 0 ? `+${counts.overPlan}` : "0"],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardBody className="px-3 py-4 text-center">
              <p className="text-lg font-bold text-[var(--color-ink)]">{String(value)}</p>
              <p className="mt-1 text-[11px] text-[var(--color-ink-faint)]">{String(label)}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      {episode.precautions && (
        <p className="rounded-xl bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]">
          <strong>{t("pm.precautions")}:</strong> {episode.precautions}
        </p>
      )}

      {/* Quick links */}
      <div className="flex flex-wrap gap-2">
        <ButtonLink href={`${base}/assessment`} variant="secondary" size="sm">
          <Icon name="analysis" width={14} height={14} />
          {t("as.title")}
          {initialAssessment && (
            <Badge tone={initialAssessment.status === "finalised" ? "primary" : "warn"} className="ms-1">
              {t(`st.${initialAssessment.status}`)}
            </Badge>
          )}
        </ButtonLink>
        <ButtonLink href={`${base}/progress`} variant="secondary" size="sm">
          <Icon name="analysis" width={14} height={14} />
          {t("pr.title")}
        </ButtonLink>
        {canClinical && (
          <ButtonLink href={`${base}/sessions/new`} size="sm">
            <Icon name="plus" width={14} height={14} />
            {t("se.new")}
          </ButtonLink>
        )}
      </div>

      {/* Sessions list */}
      <Card>
        <CardHeader title={t("se.list")} icon={<Icon name="clock" width={18} height={18} />} />
        <CardBody className="p-0">
          {sessions.length === 0 ? (
            <p className="px-5 py-6 text-sm text-[var(--color-ink-faint)]">—</p>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {sessions.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`${base}/sessions/${s.id}`}
                    className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-[var(--color-surface-muted)]"
                  >
                    <span className="w-10 font-mono text-[var(--color-ink-faint)]">
                      #{s.session_number ?? "—"}
                    </span>
                    <span className="flex-1 text-[var(--color-ink-soft)]" dir="ltr">
                      {s.session_date ?? "—"}
                    </span>
                    {s.pain_during_activity !== null && (
                      <span className="text-xs text-[var(--color-ink-faint)]">
                        {t("se.painActivity").split(" (")[0]}: {s.pain_during_activity}
                      </span>
                    )}
                    <StatusBadge status={s.status} t={t} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* Status management (clinical roles only) */}
      {canClinical && (
        <Card>
          <CardHeader title={t("ep.changeStatus")} icon={<Icon name="settings" width={18} height={18} />} />
          <CardBody className="flex flex-wrap items-end gap-3">
            <Field label={t("ep.changeStatus")}>
              <Select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} className="w-44">
                <option value="">—</option>
                {statuses.filter((s) => s !== episode.status).map((s) => (
                  <option key={s} value={s}>{t(`st.${s}`)}</option>
                ))}
              </Select>
            </Field>
            {(newStatus === "discharged" ||
              (wasFinished && ["active", "paused"].includes(newStatus))) && (
              <Field
                label={newStatus === "discharged" ? t("ep.dischargeReason") : t("ep.reopenNote")}
                error={statusError ?? undefined}
              >
                <Input value={reason} onChange={(e) => setReason(e.target.value)} className="w-64" />
              </Field>
            )}
            <Button size="sm" disabled={!newStatus} onClick={changeStatus}>
              {t("pm.save")}
            </Button>
            {statusError && !newStatus && (
              <p className="text-xs text-[var(--color-danger)]">{statusError}</p>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
