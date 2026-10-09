"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Field, Textarea } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, PageIntro, Spinner } from "@/components/ui/Misc";
import { isMockMode } from "@/lib/config";
import { useAuth } from "@/lib/store/AuthContext";
import {
  acknowledgeClinicalAlert,
  fetchClinicalAlerts,
  resolveClinicalAlert,
} from "@/lib/supabase/db";
import type { ClinicalAlert, ClinicalAlertStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useLocale } from "@/lib/store/LocaleContext";
import { intlLocale, useText } from "@/lib/i18n/text";
import { alertsText, type AlertsText } from "./text";

const POLL_INTERVAL_MS = 30_000;

type AlertFilter = "unresolved" | ClinicalAlertStatus | "all";

interface QueueState {
  clinicId: string | null;
  alerts: ClinicalAlert[];
  loading: boolean;
  error: string | null;
  updatedAt: number | null;
}

const emptyQueue: QueueState = {
  clinicId: null,
  alerts: [],
  loading: false,
  error: null,
  updatedAt: null,
};

const statusTone: Record<
  ClinicalAlertStatus,
  "danger" | "warn" | "success"
> = {
  open: "danger",
  acknowledged: "warn",
  resolved: "success",
};

function formatDateTime(value: string | number | null, locale: string, t: AlertsText): string {
  if (value === null) return t.notRecorded;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? t.unknownTime
    : date.toLocaleString(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

function alertSummary(alert: ClinicalAlert, t: AlertsText): string {
  if (alert.alertType === "ticket-emergency") return t.summaryEmergency;
  if (alert.alertType === "ticket-urgent") return t.summaryUrgent;
  return t.summaryPain(alert.metricValue);
}

function alertDetail(alert: ClinicalAlert, t: AlertsText): string {
  if (alert.alertType === "ticket-emergency") return t.detailEmergency;
  if (alert.alertType === "ticket-urgent") return t.detailUrgent;
  return t.detailPain(alert.metricValue);
}

export default function ClinicalAlertsPage() {
  const { profile, activeClinicId } = useAuth();
  const t = useText(alertsText);
  const { locale } = useLocale();
  const fmt = (value: string | number | null) => formatDateTime(value, intlLocale(locale), t);
  const canAccess =
    profile?.role === "clinic_owner" || profile?.role === "therapist";
  const [queue, setQueue] = useState<QueueState>(emptyQueue);
  const [filter, setFilter] = useState<AlertFilter>("unresolved");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resolution, setResolution] = useState({ alertId: "", note: "" });
  const [resumePrescription, setResumePrescription] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const activeClinicRef = useRef(activeClinicId);

  useEffect(() => {
    activeClinicRef.current = activeClinicId;
  }, [activeClinicId]);

  useEffect(() => {
    if (isMockMode || !canAccess || !activeClinicId) return;
    const clinicId = activeClinicId;
    let cancelled = false;
    let inFlight = false;

    async function load() {
      if (inFlight) return;
      inFlight = true;
      const rows = await fetchClinicalAlerts(clinicId);
      inFlight = false;
      if (cancelled) return;
      if (!rows) {
        setQueue((previous) => ({
          clinicId,
          alerts: previous.clinicId === clinicId ? previous.alerts : [],
          loading: false,
          error: "refresh_failed",
          updatedAt: previous.clinicId === clinicId ? previous.updatedAt : null,
        }));
        return;
      }
      setQueue({
        clinicId,
        alerts: rows,
        loading: false,
        error: null,
        updatedAt: Date.now(),
      });
    }

    void load();
    const timer = window.setInterval(() => void load(), POLL_INTERVAL_MS);
    const refreshVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [activeClinicId, canAccess, retryToken]);

  const scopedQueue =
    activeClinicId && queue.clinicId === activeClinicId
      ? queue
      : {
          clinicId: activeClinicId,
          alerts: [],
          loading: Boolean(activeClinicId && canAccess && !isMockMode),
          error: null,
          updatedAt: null,
        };

  const ordered = useMemo(
    () =>
      [...scopedQueue.alerts].sort((left, right) => {
        const statusRank = { open: 0, acknowledged: 1, resolved: 2 };
        const byStatus = statusRank[left.status] - statusRank[right.status];
        if (byStatus !== 0) return byStatus;
        if (left.severity !== right.severity) {
          return left.severity === "emergency" ? -1 : 1;
        }
        return left.createdAt.localeCompare(right.createdAt);
      }),
    [scopedQueue.alerts]
  );
  const visible = ordered.filter((alert) => {
    if (filter === "all") return true;
    if (filter === "unresolved") return alert.status !== "resolved";
    return alert.status === filter;
  });
  const selected =
    visible.find((alert) => alert.id === selectedId) ?? visible[0] ?? null;
  const resolutionNote =
    selected && resolution.alertId === selected.id ? resolution.note : "";
  const unresolvedCount = ordered.filter(
    (alert) => alert.status !== "resolved"
  ).length;

  function refresh() {
    if (!activeClinicId) return;
    setQueue((previous) => ({ ...previous, loading: true, error: null }));
    setRetryToken((value) => value + 1);
  }

  function choose(alert: ClinicalAlert) {
    if (alert.id === selected?.id) return;
    if (
      (resolutionNote.trim().length > 0 || resumePrescription) &&
      !window.confirm(
        t.switchConfirm
      )
    ) {
      return;
    }
    setSelectedId(alert.id);
    setResolution({ alertId: alert.id, note: "" });
    setResumePrescription(false);
    setFeedback(null);
  }

  async function acknowledge(alert: ClinicalAlert) {
    if (submitting || alert.status !== "open" || !activeClinicId) return;
    const clinicId = activeClinicId;
    setSubmitting(alert.id);
    setFeedback(null);
    const ok = await acknowledgeClinicalAlert(alert.id);
    setSubmitting(null);
    if (activeClinicRef.current !== clinicId) return;
    if (!ok) {
      setFeedback(t.ackFailed);
      return;
    }
    setQueue((previous) => ({
      ...previous,
      alerts: previous.alerts.map((item) =>
        item.id === alert.id ? { ...item, status: "acknowledged" } : item
      ),
    }));
    setFeedback(t.ackSaved);
  }

  async function resolve(alert: ClinicalAlert) {
    if (
      submitting ||
      alert.status === "resolved" ||
      resolutionNote.trim().length < 3 ||
      !activeClinicId
    ) {
      return;
    }
    const clinicId = activeClinicId;
    setSubmitting(alert.id);
    setFeedback(null);
    const ok = await resolveClinicalAlert({
      alertId: alert.id,
      resolutionNote,
      resumePrescription,
    });
    setSubmitting(null);
    if (activeClinicRef.current !== clinicId) return;
    if (!ok) {
      setFeedback(
        resumePrescription
          ? t.resumeRejected
          : t.resolveFailed
      );
      return;
    }
    setQueue((previous) => ({
      ...previous,
      alerts: previous.alerts.map((item) =>
        item.id === alert.id
          ? {
              ...item,
              status: "resolved",
              resolutionNote: resolutionNote.trim(),
              resolvedAt: new Date().toISOString(),
            }
          : item
      ),
    }));
    setResumePrescription(false);
    setFeedback(
      resumePrescription
        ? t.resolvedResumed
        : t.resolvedPaused
    );
  }

  if (isMockMode) {
    return (
      <div className="space-y-6">
        <PageIntro
          title={t.title}
          description={t.demoIntro}
        />
        <EmptyState
          icon="alert"
          title={t.demoTitle}
          description={t.demoBody}
        />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <EmptyState
        icon="shield"
        title={t.accessTitle}
        description={t.accessBody}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageIntro
        title={t.title}
        description={t.intro}
        action={
          <Button variant="secondary" size="sm" onClick={refresh}>
            <Icon name="clock" width={15} height={15} />
            {t.refresh}
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardBody><p className="text-2xl font-bold text-[var(--color-danger)]">{unresolvedCount}</p><p className="text-xs text-[var(--color-ink-faint)]">{t.unresolved}</p></CardBody></Card>
        <Card><CardBody><p className="text-2xl font-bold text-[var(--color-warn)]">{ordered.filter((item) => item.status === "acknowledged").length}</p><p className="text-xs text-[var(--color-ink-faint)]">{t.acknowledged}</p></CardBody></Card>
        <Card><CardBody><p className="text-sm font-semibold text-[var(--color-ink)]">{fmt(scopedQueue.updatedAt)}</p><p className="text-xs text-[var(--color-ink-faint)]">{t.lastRefresh}</p></CardBody></Card>
      </div>

      {scopedQueue.error && (
        <div role="alert" className="rounded-xl border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]">
          {t.refreshFailed}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(["unresolved", "open", "acknowledged", "resolved", "all"] as AlertFilter[]).map((value) => (
          <Button key={value} size="sm" variant={filter === value ? "primary" : "secondary"} onClick={() => setFilter(value)}>
            {t.filters[value]}
          </Button>
        ))}
      </div>

      {scopedQueue.loading && ordered.length === 0 ? (
        <div className="grid min-h-48 place-items-center"><Spinner /></div>
      ) : visible.length === 0 ? (
        <EmptyState icon="shield" title={t.emptyTitle} description={t.emptyBody} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="space-y-2">
            {visible.map((alert) => (
              <button
                key={alert.id}
                type="button"
                onClick={() => choose(alert)}
                aria-pressed={selected?.id === alert.id}
                className={cn(
                  "w-full rounded-2xl border p-4 text-start transition-colors",
                  selected?.id === alert.id
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-tint)]"
                    : "border-[var(--color-border)] bg-white hover:bg-[var(--color-surface-muted)]"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[var(--color-ink)]">{alert.patientName}</p>
                    <p className="mt-1 text-xs text-[var(--color-ink-soft)]">{alertSummary(alert, t)}</p>
                  </div>
                  <Badge tone={statusTone[alert.status]}>{t.statuses[alert.status]}</Badge>
                </div>
                <p className="mt-3 text-[11px] text-[var(--color-ink-faint)]">{t.created(fmt(alert.createdAt))}</p>
              </button>
            ))}
          </div>

          {selected && (
            <Card>
              <CardBody className="space-y-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-[var(--color-ink)]">{selected.patientName}</h2>
                    <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{alertDetail(selected, t)}</p>
                  </div>
                  <Badge tone={statusTone[selected.status]}>{t.statuses[selected.status]}</Badge>
                </div>

                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs text-[var(--color-ink-faint)]">{t.reportDate}</dt><dd>{fmt(selected.sourceRecordedAt)}</dd></div>
                  <div><dt className="text-xs text-[var(--color-ink-faint)]">{t.queueCreated}</dt><dd>{fmt(selected.createdAt)}</dd></div>
                  <div><dt className="text-xs text-[var(--color-ink-faint)]">{t.acknowledgedAt}</dt><dd>{fmt(selected.acknowledgedAt)}</dd></div>
                  <div><dt className="text-xs text-[var(--color-ink-faint)]">{t.resolvedAt}</dt><dd>{fmt(selected.resolvedAt)}</dd></div>
                </dl>

                {selected.status === "open" && (
                  <Button onClick={() => acknowledge(selected)} disabled={submitting === selected.id}>
                    {t.acknowledge}
                  </Button>
                )}

                {selected.status !== "resolved" ? (
                  <div className="space-y-3 border-t border-[var(--color-border)] pt-4">
                    <Field label={t.resolutionNote}>
                      <Textarea
                        value={resolutionNote}
                        onChange={(event) => setResolution({ alertId: selected.id, note: event.target.value })}
                        maxLength={2000}
                        rows={4}
                        placeholder={t.resolutionPlaceholder}
                      />
                    </Field>
                    <label className="flex items-start gap-2 text-sm text-[var(--color-ink-soft)]">
                      <input
                        type="checkbox"
                        checked={resumePrescription}
                        disabled={!selected.prescriptionId}
                        onChange={(event) => setResumePrescription(event.target.checked)}
                        className="mt-1"
                      />
                      <span>{t.resumeLabel}</span>
                    </label>
                    <Button
                      variant="secondary"
                      onClick={() => resolve(selected)}
                      disabled={submitting === selected.id || resolutionNote.trim().length < 3}
                    >
                      {resumePrescription ? t.resolveResume : t.resolveKeep}
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-xl bg-[var(--color-success-soft)] px-4 py-3 text-sm text-[var(--color-ink-soft)]">
                    {selected.resolutionNote ?? t.noNote}
                  </div>
                )}

                {feedback && (
                  <p role="status" className="text-sm text-[var(--color-ink-soft)]">{feedback}</p>
                )}
              </CardBody>
            </Card>
          )}
        </div>
      )}

      <div className="rounded-xl border border-[var(--color-warn)]/40 bg-[var(--color-warn-soft)] px-4 py-3 text-xs leading-relaxed text-[var(--color-ink-soft)]">
        {t.pollNotice}
      </div>
    </div>
  );
}
