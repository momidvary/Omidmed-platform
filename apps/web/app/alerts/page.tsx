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

function formatDateTime(value: string | number | null): string {
  if (value === null) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown time"
    : date.toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

function alertSummary(alert: ClinicalAlert): string {
  if (alert.alertType === "ticket-emergency") {
    return "Emergency language in patient ticket";
  }
  if (alert.alertType === "ticket-urgent") {
    return "Urgent language in patient ticket";
  }
  return `High pain reported${
    alert.metricValue === null ? "" : `: ${alert.metricValue}/10`
  }`;
}

function alertDetail(alert: ClinicalAlert): string {
  if (alert.alertType === "ticket-emergency") {
    return "The patient ticket was classified as emergency. Contact the patient now and follow the clinic emergency pathway; never wait for an inbox response.";
  }
  if (alert.alertType === "ticket-urgent") {
    return "The patient ticket was classified as urgent. Review it now and document same-day contact and escalation.";
  }
  return `Patient reported high pain${
    alert.metricValue === null ? "" : ` (${alert.metricValue}/10)`
  }. The linked prescription was paused by the same database transaction.`;
}

export default function ClinicalAlertsPage() {
  const { profile, activeClinicId } = useAuth();
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
          error:
            "Alert refresh failed. Visible data may be stale; retry before making a safety decision.",
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
        "Switch alerts and discard the unsaved resolution note on this screen?"
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
      setFeedback("Acknowledgement was not saved. Check assignment and retry.");
      return;
    }
    setQueue((previous) => ({
      ...previous,
      alerts: previous.alerts.map((item) =>
        item.id === alert.id ? { ...item, status: "acknowledged" } : item
      ),
    }));
    setFeedback("Alert acknowledged with your authenticated identity.");
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
          ? "Resume was rejected. Record a newer clear safety screen and verify the current plan, dates, and other open alerts."
          : "Resolution was not saved. Check assignment and connection, then retry."
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
        ? "Alert resolved and the reviewed prescription resumed."
        : "Alert resolved; any suspended prescription remains paused."
    );
  }

  if (isMockMode) {
    return (
      <div className="space-y-6">
        <PageIntro
          title="Clinical Alerts"
          description="Operational alerts are disabled in mock mode. No real clinician notification is sent."
        />
        <EmptyState
          icon="alert"
          title="Demo mode has no safety queue"
          description="Connect Supabase and apply migration 014 to test attributed acknowledgement and reviewed resume."
        />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <EmptyState
        icon="shield"
        title="Clinical alert access required"
        description="Only clinic owners and assigned therapists can load this queue."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageIntro
        title="Clinical Alerts"
        description="Oldest unresolved safety events are shown first. Acknowledgement is not resolution, and a paused prescription resumes only after a newer clear screen."
        action={
          <Button variant="secondary" size="sm" onClick={refresh}>
            <Icon name="clock" width={15} height={15} />
            Refresh
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardBody><p className="text-2xl font-bold text-[var(--color-danger)]">{unresolvedCount}</p><p className="text-xs text-[var(--color-ink-faint)]">Unresolved</p></CardBody></Card>
        <Card><CardBody><p className="text-2xl font-bold text-[var(--color-warn)]">{ordered.filter((item) => item.status === "acknowledged").length}</p><p className="text-xs text-[var(--color-ink-faint)]">Acknowledged</p></CardBody></Card>
        <Card><CardBody><p className="text-sm font-semibold text-[var(--color-ink)]">{formatDateTime(scopedQueue.updatedAt)}</p><p className="text-xs text-[var(--color-ink-faint)]">Last refresh</p></CardBody></Card>
      </div>

      {scopedQueue.error && (
        <div role="alert" className="rounded-xl border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]">
          {scopedQueue.error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(["unresolved", "open", "acknowledged", "resolved", "all"] as AlertFilter[]).map((value) => (
          <Button key={value} size="sm" variant={filter === value ? "primary" : "secondary"} onClick={() => setFilter(value)}>
            {value}
          </Button>
        ))}
      </div>

      {scopedQueue.loading && ordered.length === 0 ? (
        <div className="grid min-h-48 place-items-center"><Spinner /></div>
      ) : visible.length === 0 ? (
        <EmptyState icon="shield" title="No alerts in this view" description="The database has no matching clinician-visible safety events." />
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
                    <p className="mt-1 text-xs text-[var(--color-ink-soft)]">{alertSummary(alert)}</p>
                  </div>
                  <Badge tone={statusTone[alert.status]}>{alert.status}</Badge>
                </div>
                <p className="mt-3 text-[11px] text-[var(--color-ink-faint)]">Created {formatDateTime(alert.createdAt)}</p>
              </button>
            ))}
          </div>

          {selected && (
            <Card>
              <CardBody className="space-y-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-[var(--color-ink)]">{selected.patientName}</h2>
                    <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{alertDetail(selected)}</p>
                  </div>
                  <Badge tone={statusTone[selected.status]}>{selected.status}</Badge>
                </div>

                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs text-[var(--color-ink-faint)]">Patient report date</dt><dd>{formatDateTime(selected.sourceRecordedAt)}</dd></div>
                  <div><dt className="text-xs text-[var(--color-ink-faint)]">Queue created</dt><dd>{formatDateTime(selected.createdAt)}</dd></div>
                  <div><dt className="text-xs text-[var(--color-ink-faint)]">Acknowledged</dt><dd>{formatDateTime(selected.acknowledgedAt)}</dd></div>
                  <div><dt className="text-xs text-[var(--color-ink-faint)]">Resolved</dt><dd>{formatDateTime(selected.resolvedAt)}</dd></div>
                </dl>

                {selected.status === "open" && (
                  <Button onClick={() => acknowledge(selected)} disabled={submitting === selected.id}>
                    Acknowledge alert
                  </Button>
                )}

                {selected.status !== "resolved" ? (
                  <div className="space-y-3 border-t border-[var(--color-border)] pt-4">
                    <Field label="Resolution note">
                      <Textarea
                        value={resolutionNote}
                        onChange={(event) => setResolution({ alertId: selected.id, note: event.target.value })}
                        maxLength={2000}
                        rows={4}
                        placeholder="Assessment, contact, advice and follow-up completed"
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
                      <span>Resume the paused prescription. The database will reject this unless a newer clear safety screen, current approved plan and valid dates all exist.</span>
                    </label>
                    <Button
                      variant="secondary"
                      onClick={() => resolve(selected)}
                      disabled={submitting === selected.id || resolutionNote.trim().length < 3}
                    >
                      {resumePrescription ? "Resolve and resume" : "Resolve; keep program paused"}
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-xl bg-[var(--color-success-soft)] px-4 py-3 text-sm text-[var(--color-ink-soft)]">
                    {selected.resolutionNote ?? "Resolved without a visible note."}
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
        This in-app queue polls every 30 seconds while open. Production rollout still requires an external delivery channel, retry/dead-letter handling and an on-call escalation policy.
      </div>
    </div>
  );
}
