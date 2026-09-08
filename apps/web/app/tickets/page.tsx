"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, PageIntro, Spinner } from "@/components/ui/Misc";
import { detectSafetySignals } from "@/lib/clinical/safety";
import { isMockMode } from "@/lib/config";
import { useAuth } from "@/lib/store/AuthContext";
import {
  acknowledgeClinicianTicket,
  closeClinicianTicket,
  fetchClinicianTickets,
  replyToClinicianTicket,
} from "@/lib/supabase/db";
import type { ClinicianTicket, TicketReply } from "@/lib/types";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 30_000;
const SLA_WARNING_HOURS = 4;
const SLA_OVERDUE_HOURS = 24;

type InboxFilter = "all" | "open" | "unread";

interface InboxState {
  clinicId: string | null;
  tickets: ClinicianTicket[];
  loading: boolean;
  error: string | null;
  updatedAt: number | null;
}

interface TicketView {
  ticket: ClinicianTicket;
  emergency: boolean;
  urgent: boolean;
  ageMs: number;
  sla: {
    label: string;
    tone: "neutral" | "success" | "warn" | "danger";
  };
}

const emptyInbox: InboxState = {
  clinicId: null,
  tickets: [],
  loading: false,
  error: null,
  updatedAt: null,
};

function ticketSignals(ticket: ClinicianTicket) {
  const patientText = [
    ticket.subject,
    ticket.message,
    ...ticket.replies
      .filter((reply) => reply.from === "patient")
      .map((reply) => reply.content),
  ].join("\n");
  return detectSafetySignals(patientText);
}

function ageInMs(iso: string, now: number): number {
  const created = Date.parse(iso);
  return Number.isFinite(created) ? Math.max(0, now - created) : 0;
}

function formatAge(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function formatDateTime(value: string | number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function describeSla(
  ticket: ClinicianTicket,
  ageMs: number,
  emergency: boolean
): TicketView["sla"] {
  if (emergency) return { label: "Escalate now", tone: "danger" };
  if (!ticket.unread && ticket.status === "answered") {
    return { label: "Answered", tone: "neutral" };
  }

  const hours = ageMs / 3_600_000;
  if (hours < SLA_WARNING_HOURS) {
    return { label: "Within 4h target", tone: "success" };
  }
  if (hours < SLA_OVERDUE_HOURS) {
    return { label: "Review due", tone: "warn" };
  }
  return { label: "Overdue >24h", tone: "danger" };
}

function senderLabel(reply: TicketReply): string {
  if (reply.from === "therapist") return "Clinician";
  if (reply.from === "patient") return "Patient";
  return "AI acknowledgement";
}

export default function ClinicianTicketInboxPage() {
  const { profile, activeClinicId } = useAuth();
  const [inbox, setInbox] = useState<InboxState>(emptyInbox);
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ ticketId: "", text: "" });
  const [closureDraft, setClosureDraft] = useState({
    ticketId: "",
    text: "",
  });
  const [submittingTicketId, setSubmittingTicketId] = useState<string | null>(
    null
  );
  const [feedback, setFeedback] = useState<{
    ticketId: string;
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const activeClinicRef = useRef(activeClinicId);
  const submitInFlight = useRef(false);

  const canAccess =
    profile?.role === "clinic_owner" || profile?.role === "therapist";

  useEffect(() => {
    activeClinicRef.current = activeClinicId;
  }, [activeClinicId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isMockMode || !canAccess || !activeClinicId) return;

    const clinicId = activeClinicId;
    let cancelled = false;
    let requestInFlight = false;

    async function loadTickets() {
      if (requestInFlight) return;
      requestInFlight = true;
      const rows = await fetchClinicianTickets(clinicId);
      requestInFlight = false;
      if (cancelled) return;

      if (!rows) {
        setInbox((previous) => ({
          clinicId,
          tickets:
            previous.clinicId === clinicId ? previous.tickets : [],
          loading: false,
          error:
            "Ticket refresh failed. Check the connection and try again; any visible rows may be stale.",
          updatedAt:
            previous.clinicId === clinicId ? previous.updatedAt : null,
        }));
        return;
      }

      setInbox({
        clinicId,
        tickets: rows,
        loading: false,
        error: null,
        updatedAt: Date.now(),
      });
    }

    void loadTickets();
    const timer = window.setInterval(() => void loadTickets(), POLL_INTERVAL_MS);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void loadTickets();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [activeClinicId, canAccess, retryToken]);

  const scopedInbox: InboxState =
    activeClinicId && inbox.clinicId === activeClinicId
      ? inbox
      : {
          clinicId: activeClinicId,
          tickets: [],
          loading: Boolean(activeClinicId && canAccess && !isMockMode),
          error: null,
          updatedAt: null,
        };

  const ticketViews = useMemo<TicketView[]>(() => {
    return scopedInbox.tickets
      .map((ticket) => {
        const signals = ticketSignals(ticket);
        const emergency =
          ticket.priority === "emergency" ||
          signals.some((signal) => signal.disposition === "emergency");
        const urgent =
          ticket.priority === "urgent" ||
          signals.some((signal) => signal.disposition === "urgent");
        const ageMs = ageInMs(ticket.lastPatientActivityAt, now);
        return {
          ticket,
          emergency,
          urgent,
          ageMs,
          sla: describeSla(ticket, ageMs, emergency),
        };
      })
      .sort((a, b) => {
        if (a.emergency !== b.emergency) return a.emergency ? -1 : 1;
        if (a.ticket.unread !== b.ticket.unread) {
          return a.ticket.unread ? -1 : 1;
        }
        const activeStatus = (status: ClinicianTicket["status"]) =>
          status === "open" || status === "acknowledged";
        if (activeStatus(a.ticket.status) !== activeStatus(b.ticket.status)) {
          return activeStatus(a.ticket.status) ? -1 : 1;
        }
        return b.ticket.lastPatientActivityAt.localeCompare(
          a.ticket.lastPatientActivityAt
        );
      });
  }, [scopedInbox.tickets, now]);

  const visibleTickets = ticketViews.filter(({ ticket }) => {
    if (filter === "open") {
      return ticket.status === "open" || ticket.status === "acknowledged";
    }
    if (filter === "unread") return ticket.unread;
    return true;
  });
  const selectedView =
    visibleTickets.find(({ ticket }) => ticket.id === selectedTicketId) ??
    visibleTickets[0] ??
    null;
  const selectedTicket = selectedView?.ticket ?? null;
  const replyText =
    selectedTicket && draft.ticketId === selectedTicket.id ? draft.text : "";
  const closureText =
    selectedTicket && closureDraft.ticketId === selectedTicket.id
      ? closureDraft.text
      : "";
  const selectedCanReply = Boolean(
    selectedTicket &&
      profile &&
      (profile.role === "clinic_owner" ||
        (profile.role === "therapist" &&
          selectedTicket.assignedTherapistIds.includes(profile.id)))
  );

  const openCount = ticketViews.filter(
    ({ ticket }) =>
      ticket.status === "open" || ticket.status === "acknowledged"
  ).length;
  const unreadCount = ticketViews.filter(({ ticket }) => ticket.unread).length;
  const overdueCount = ticketViews.filter(
    ({ ticket, ageMs }) =>
      ticket.unread && ageMs >= SLA_OVERDUE_HOURS * 3_600_000
  ).length;

  function chooseTicket(ticketId: string) {
    if (submitInFlight.current) return;
    setSelectedTicketId(ticketId);
    setDraft({ ticketId, text: "" });
    setClosureDraft({ ticketId, text: "" });
    setFeedback(null);
  }

  function retry() {
    if (!activeClinicId) return;
    setInbox((previous) =>
      previous.clinicId === activeClinicId
        ? { ...previous, loading: true, error: null }
        : previous
    );
    setRetryToken((value) => value + 1);
  }

  async function submitReply(event: React.FormEvent) {
    event.preventDefault();
    if (
      submitInFlight.current ||
      !selectedTicket ||
      !selectedCanReply ||
      !profile ||
      !activeClinicId ||
      !replyText.trim()
    ) {
      return;
    }

    const clinicId = activeClinicId;
    const ticketId = selectedTicket.id;
    const content = replyText.trim();
    submitInFlight.current = true;
    setSubmittingTicketId(ticketId);
    setFeedback(null);

    const ok = await replyToClinicianTicket({
      ticketId,
      content,
    });

    submitInFlight.current = false;
    setSubmittingTicketId((current) =>
      current === ticketId ? null : current
    );
    if (activeClinicRef.current !== clinicId) return;

    if (!ok) {
      setFeedback({
        ticketId,
        tone: "error",
        message:
          "Reply was not saved. Your text is still here; check assignment and connection, then retry.",
      });
      return;
    }

    const createdAt = new Date().toISOString();
    setInbox((previous) => ({
      ...previous,
      tickets: previous.tickets.map((ticket) =>
        ticket.id === ticketId
          ? {
              ...ticket,
              status: "answered",
              unread: false,
              acknowledgedBy: ticket.acknowledgedBy ?? profile.id,
              acknowledgedAt: ticket.acknowledgedAt ?? createdAt,
              lastClinicianActivityAt: createdAt,
              replies: [
                ...ticket.replies,
                {
                  id: `local-${createdAt}`,
                  from: "therapist",
                  senderUserId: profile.id,
                  content,
                  createdAt,
                },
              ],
            }
          : ticket
      ),
      updatedAt: Date.now(),
    }));
    setDraft({ ticketId, text: "" });
    setFeedback({
      ticketId,
      tone: "success",
      message: "Reply saved and ticket marked answered.",
    });

    const refreshed = await fetchClinicianTickets(clinicId);
    if (activeClinicRef.current !== clinicId || !refreshed) return;
    setInbox({
      clinicId,
      tickets: refreshed,
      loading: false,
      error: null,
      updatedAt: Date.now(),
    });
  }

  async function acknowledgeSelected() {
    if (
      submitInFlight.current ||
      !selectedTicket ||
      !selectedCanReply ||
      !profile ||
      !activeClinicId
    ) {
      return;
    }
    const clinicId = activeClinicId;
    const ticketId = selectedTicket.id;
    submitInFlight.current = true;
    setSubmittingTicketId(ticketId);
    setFeedback(null);
    const ok = await acknowledgeClinicianTicket(ticketId);
    submitInFlight.current = false;
    setSubmittingTicketId(null);
    if (activeClinicRef.current !== clinicId) return;
    if (!ok) {
      setFeedback({
        ticketId,
        tone: "error",
        message: "Acknowledgement was not saved. Check access and retry.",
      });
      return;
    }
    const acknowledgedAt = new Date().toISOString();
    setInbox((previous) => ({
      ...previous,
      tickets: previous.tickets.map((ticket) =>
        ticket.id === ticketId
          ? {
              ...ticket,
              status: "acknowledged",
              acknowledgedBy: profile.id,
              acknowledgedAt,
            }
          : ticket
      ),
      updatedAt: Date.now(),
    }));
    setFeedback({
      ticketId,
      tone: "success",
      message: "Ticket acknowledged with your authenticated identity.",
    });
  }

  async function closeSelected() {
    if (
      submitInFlight.current ||
      !selectedTicket ||
      !selectedCanReply ||
      !profile ||
      !activeClinicId ||
      closureText.trim().length < 3
    ) {
      return;
    }
    const clinicId = activeClinicId;
    const ticketId = selectedTicket.id;
    const note = closureText.trim();
    submitInFlight.current = true;
    setSubmittingTicketId(ticketId);
    setFeedback(null);
    const ok = await closeClinicianTicket({ ticketId, closureNote: note });
    submitInFlight.current = false;
    setSubmittingTicketId(null);
    if (activeClinicRef.current !== clinicId) return;
    if (!ok) {
      setFeedback({
        ticketId,
        tone: "error",
        message:
          "Ticket was not closed. Resolve any linked clinical alert first, then retry; your note is still here.",
      });
      return;
    }
    const closedAt = new Date().toISOString();
    setInbox((previous) => ({
      ...previous,
      tickets: previous.tickets.map((ticket) =>
        ticket.id === ticketId
          ? {
              ...ticket,
              status: "closed",
              closedBy: profile.id,
              closedAt,
              closureNote: note,
            }
          : ticket
      ),
      updatedAt: Date.now(),
    }));
    setClosureDraft({ ticketId, text: "" });
    setFeedback({
      ticketId,
      tone: "success",
      message: "Ticket closed with an attributed closure note.",
    });
  }

  if (isMockMode) {
    return (
      <div className="space-y-6">
        <PageIntro
          title="Clinical Ticket Inbox"
          description="Patient messages that need clinician review and a documented response."
        />
        <EmptyState
          icon="chat"
          title="Demo inbox is empty"
          description="Mock mode does not load or fabricate patient messages. Connect an authenticated clinic database to use the inbox."
        />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="space-y-6">
        <PageIntro
          title="Clinical Ticket Inbox"
          description="Patient messages that need clinician review and a documented response."
        />
        <Card>
          <CardBody>
            <div role="alert" className="flex items-start gap-3">
              <Icon name="shield" className="mt-0.5 text-[var(--color-danger)]" />
              <div>
                <h2 className="text-sm font-semibold text-[var(--color-ink)]">
                  Clinical access required
                </h2>
                <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                  Ticket PHI is available only to clinic owners and therapists.
                  Clinic staff and other roles cannot open this inbox.
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  if (!activeClinicId) {
    return (
      <div className="space-y-6">
        <PageIntro
          title="Clinical Ticket Inbox"
          description="Patient messages that need clinician review and a documented response."
        />
        <EmptyState
          icon="search"
          title="Select an active clinic"
          description="Choose a clinic from the top bar. Tickets are loaded only for that active tenant."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageIntro
        title="Clinical Ticket Inbox"
        description="Review patient messages, triage time-sensitive language and keep replies in the clinical thread."
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={retry}
            disabled={scopedInbox.loading}
          >
            <Icon name="clock" width={14} height={14} />
            Refresh
          </Button>
        }
      />

      <div className="flex items-start gap-3 rounded-2xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]">
        <Icon name="alert" className="mt-0.5 shrink-0" width={18} height={18} />
        <p>
          <strong>Safety triage support only.</strong> Automated text detection
          can miss or misclassify symptoms. This inbox is not an emergency
          service; follow the clinic&apos;s direct-contact and emergency escalation
          protocol whenever serious symptoms are suspected.
        </p>
      </div>

      {scopedInbox.loading && scopedInbox.tickets.length === 0 ? (
        <Card>
          <Spinner label="Loading clinic tickets…" />
        </Card>
      ) : scopedInbox.error && scopedInbox.tickets.length === 0 ? (
        <Card>
          <CardBody className="text-center">
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {scopedInbox.error}
            </p>
            <Button className="mt-4" variant="secondary" onClick={retry}>
              Try again
            </Button>
          </CardBody>
        </Card>
      ) : scopedInbox.tickets.length === 0 ? (
        <EmptyState
          icon="chat"
          title="No tickets for this clinic"
          description="New patient messages will appear here and refresh automatically every 30 seconds."
        />
      ) : (
        <>
          {scopedInbox.error && (
            <p
              role="alert"
              className="rounded-xl bg-[var(--color-warn-soft)] px-4 py-3 text-sm text-[var(--color-warn)]"
            >
              {scopedInbox.error}
            </p>
          )}

          <section aria-label="Inbox summary" className="grid grid-cols-3 gap-3">
            <SummaryCard label="Open" value={openCount} tone="neutral" />
            <SummaryCard label="Unread / needs response" value={unreadCount} tone="warn" />
            <SummaryCard label="Overdue >24h" value={overdueCount} tone="danger" />
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex rounded-xl bg-[var(--color-surface-muted)] p-1">
              {(
                [
                  ["all", "All"],
                  ["open", "Active"],
                  ["unread", "Unread"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  aria-pressed={filter === value}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium",
                    filter === value
                      ? "bg-white text-[var(--color-ink)] shadow-sm"
                      : "text-[var(--color-ink-soft)]"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {scopedInbox.updatedAt && (
              <p aria-live="polite" className="text-xs text-[var(--color-ink-soft)]">
                Updated {formatDateTime(scopedInbox.updatedAt)} · polling every
                30s
              </p>
            )}
          </div>

          {visibleTickets.length === 0 ? (
            <EmptyState
              icon="search"
              title={`No ${filter} tickets`}
              description="Choose another filter to see the remaining clinic tickets."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
              <section
                aria-label="Ticket list"
                className="space-y-2 lg:col-span-2"
              >
                {visibleTickets.map((view) => {
                  const { ticket } = view;
                  const selected = selectedView?.ticket.id === ticket.id;
                  return (
                    <button
                      key={ticket.id}
                      type="button"
                      disabled={Boolean(submittingTicketId)}
                      onClick={() => chooseTicket(ticket.id)}
                      aria-current={selected ? "true" : undefined}
                      className={cn(
                        "w-full rounded-2xl border bg-white p-4 text-start transition-colors",
                        selected
                          ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/10"
                          : "border-[var(--color-border)] hover:bg-[var(--color-surface-muted)]"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-[var(--color-primary-strong)]">
                            {ticket.patientName}
                          </p>
                          <h2 className="mt-0.5 truncate text-sm font-semibold text-[var(--color-ink)]">
                            {ticket.subject}
                          </h2>
                        </div>
                        <span className="shrink-0 text-[11px] text-[var(--color-ink-soft)]">
                          {formatAge(view.ageMs)}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[var(--color-ink-soft)]">
                        {ticket.message}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {view.emergency && <Badge tone="danger">Emergency text</Badge>}
                        {!view.emergency && view.urgent && (
                          <Badge tone="warn">Urgent text</Badge>
                        )}
                        {ticket.unread && <Badge tone="accent">Unread</Badge>}
                        <Badge
                          tone={
                            ticket.status === "open" ||
                            ticket.status === "acknowledged"
                              ? "warn"
                              : "success"
                          }
                        >
                          {ticket.status}
                        </Badge>
                        <Badge tone={view.sla.tone}>{view.sla.label}</Badge>
                      </div>
                    </button>
                  );
                })}
              </section>

              {selectedView && (
                <TicketDetail
                  view={selectedView}
                  canReply={selectedCanReply}
                  replyText={replyText}
                  closureText={closureText}
                  submitting={submittingTicketId === selectedView.ticket.id}
                  feedback={
                    feedback?.ticketId === selectedView.ticket.id
                      ? feedback
                      : null
                  }
                  onReplyChange={(text) =>
                    setDraft({ ticketId: selectedView.ticket.id, text })
                  }
                  onClosureChange={(text) =>
                    setClosureDraft({
                      ticketId: selectedView.ticket.id,
                      text,
                    })
                  }
                  onSubmit={submitReply}
                  onAcknowledge={acknowledgeSelected}
                  onClose={closeSelected}
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "warn" | "danger";
}) {
  const color =
    tone === "danger"
      ? "text-[var(--color-danger)]"
      : tone === "warn"
        ? "text-[var(--color-warn)]"
        : "text-[var(--color-ink)]";
  return (
    <Card>
      <CardBody className="px-3 py-4 text-center">
        <p className={cn("text-xl font-bold", color)}>{value}</p>
        <p className="mt-1 text-xs text-[var(--color-ink-soft)]">{label}</p>
      </CardBody>
    </Card>
  );
}

function TicketDetail({
  view,
  canReply,
  replyText,
  closureText,
  submitting,
  feedback,
  onReplyChange,
  onClosureChange,
  onSubmit,
  onAcknowledge,
  onClose,
}: {
  view: TicketView;
  canReply: boolean;
  replyText: string;
  closureText: string;
  submitting: boolean;
  feedback: {
    tone: "success" | "error";
    message: string;
  } | null;
  onReplyChange: (text: string) => void;
  onClosureChange: (text: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  onAcknowledge: () => void;
  onClose: () => void;
}) {
  const { ticket } = view;
  const needsReply =
    ticket.status === "open" ||
    ticket.status === "acknowledged" ||
    ticket.unread;

  return (
    <Card className="self-start lg:sticky lg:top-24 lg:col-span-3">
      <CardBody className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-[var(--color-primary-strong)]">
              {ticket.patientName}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-[var(--color-ink)]">
              {ticket.subject}
            </h2>
            <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
              Opened {formatDateTime(ticket.createdAt)} · latest patient activity {formatAge(view.ageMs)} ago
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ticket.unread && <Badge tone="accent">Unread</Badge>}
            <Badge
              tone={
                ticket.status === "open" || ticket.status === "acknowledged"
                  ? "warn"
                  : "success"
              }
            >
              {ticket.status}
            </Badge>
            <Badge tone={view.sla.tone}>{view.sla.label}</Badge>
          </div>
        </div>

        {view.emergency && (
          <div
            role="alert"
            className="rounded-xl border border-[var(--color-danger)] bg-[var(--color-danger-soft)] px-4 py-3 text-sm leading-relaxed text-[var(--color-danger)]"
          >
            <strong>Emergency language detected.</strong> This inbox is not an
            emergency service — این صندوق جای اورژانس نیست. Contact the patient
            immediately and follow the clinic&apos;s emergency protocol; do not
            wait for an inbox reply.
          </div>
        )}
        {!view.emergency && view.urgent && (
          <div
            role="alert"
            className="rounded-xl border border-[var(--color-warn)]/40 bg-[var(--color-warn-soft)] px-4 py-3 text-sm leading-relaxed text-[var(--color-warn)]"
          >
            <strong>Urgent language detected.</strong> Review now, contact the
            patient and follow the clinic&apos;s same-day escalation pathway.
          </div>
        )}

        <section aria-labelledby={`ticket-message-${ticket.id}`}>
          <h3
            id={`ticket-message-${ticket.id}`}
            className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]"
          >
            Patient message
          </h3>
          <p className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-[var(--color-surface-muted)] px-4 py-3 text-sm leading-relaxed text-[var(--color-ink)]">
            {ticket.message}
          </p>
        </section>

        <section aria-labelledby={`ticket-thread-${ticket.id}`}>
          <h3
            id={`ticket-thread-${ticket.id}`}
            className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]"
          >
            Reply thread
          </h3>
          {ticket.replies.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
              No replies yet.
            </p>
          ) : (
            <ol className="mt-2 space-y-2">
              {ticket.replies.map((reply) => (
                <li
                  key={reply.id}
                  className={cn(
                    "rounded-xl border px-4 py-3",
                    reply.from === "therapist"
                      ? "border-[var(--color-primary)]/30 bg-[var(--color-primary-tint)]"
                      : reply.from === "ai"
                        ? "border-[var(--color-accent)]/20 bg-[var(--color-accent-soft)]/40"
                        : "border-[var(--color-border)] bg-white"
                  )}
                >
                  <div className="flex items-center justify-between gap-3 text-[11px] text-[var(--color-ink-soft)]">
                    <span className="font-semibold">{senderLabel(reply)}</span>
                    <time dateTime={reply.createdAt}>
                      {formatDateTime(reply.createdAt)}
                    </time>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--color-ink)]">
                    {reply.content}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>

        {feedback && (
          <p
            role={feedback.tone === "error" ? "alert" : "status"}
            className={cn(
              "rounded-xl px-4 py-3 text-sm",
              feedback.tone === "error"
                ? "bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
                : "bg-[var(--color-success-soft)] text-[var(--color-success)]"
            )}
          >
            {feedback.message}
          </p>
        )}

        {ticket.status === "open" && canReply && (
          <Button
            type="button"
            variant="secondary"
            onClick={onAcknowledge}
            disabled={submitting}
          >
            <Icon name="check" width={15} height={15} />
            {submitting ? "Saving…" : "Acknowledge review"}
          </Button>
        )}

        {needsReply && canReply ? (
          <form onSubmit={onSubmit} className="space-y-3">
            <label
              htmlFor={`ticket-reply-${ticket.id}`}
              className="block text-sm font-semibold text-[var(--color-ink)]"
            >
              Reply as clinician
            </label>
            <Textarea
              id={`ticket-reply-${ticket.id}`}
              value={replyText}
              onChange={(event) => onReplyChange(event.target.value)}
              maxLength={4000}
              required
              placeholder="Write a clear, patient-safe response and document the next action…"
              className="min-h-32"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-[var(--color-ink-soft)]">
                {replyText.length.toLocaleString("en-US")} / 4,000
              </span>
              <Button
                type="submit"
                disabled={submitting || !replyText.trim()}
              >
                <Icon name="send" width={15} height={15} />
                {submitting ? "Saving reply…" : "Send reply & mark answered"}
              </Button>
            </div>
          </form>
        ) : needsReply ? (
          <p className="rounded-xl bg-[var(--color-warn-soft)] px-4 py-3 text-sm text-[var(--color-warn)]">
            Only the assigned therapist or clinic owner can reply to this
            patient. Ask the owner to update the assignment when needed.
          </p>
        ) : ticket.status === "answered" && canReply ? (
          <form
            className="space-y-3 border-t border-[var(--color-border)] pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              onClose();
            }}
          >
            <label
              htmlFor={`ticket-close-${ticket.id}`}
              className="block text-sm font-semibold text-[var(--color-ink)]"
            >
              Closure note
            </label>
            <Textarea
              id={`ticket-close-${ticket.id}`}
              value={closureText}
              onChange={(event) => onClosureChange(event.target.value)}
              minLength={3}
              maxLength={2000}
              required
              placeholder="Document contact, outcome and follow-up before closing…"
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={submitting || closureText.trim().length < 3}
            >
              <Icon name="check" width={15} height={15} />
              {submitting ? "Closing…" : "Close ticket"}
            </Button>
          </form>
        ) : ticket.status === "closed" ? (
          <p className="rounded-xl bg-[var(--color-surface-muted)] px-4 py-3 text-sm text-[var(--color-ink-soft)]">
            Closed {formatDateTime(ticket.closedAt ?? "")}.
            {ticket.closureNote ? ` ${ticket.closureNote}` : ""}
          </p>
        ) : (
          <p className="rounded-xl bg-[var(--color-success-soft)] px-4 py-3 text-sm text-[var(--color-success)]">
            This ticket has a clinician response and is marked answered.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
