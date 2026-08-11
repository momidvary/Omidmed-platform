"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/store/AuthContext";
import {
  fetchClinicTickets,
  replyToTicket,
  setTicketStatus,
} from "@/lib/supabase/db";
import { isMockMode } from "@/lib/config";
import { exerciseFa } from "@/lib/data/exerciseFa";
import type { ClinicTicket } from "@/lib/types";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { Disclaimer, EmptyState, PageIntro, Spinner } from "@/components/ui/Misc";
import { cn, formatDate } from "@/lib/utils";

type Filter = "open" | "all";

export default function TicketsPage() {
  const { activeClinicId } = useAuth();
  const [tickets, setTickets] = useState<ClinicTicket[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>("open");

  // Nothing is set before the first await: a synchronous setState inside
  // an effect triggers a cascading re-render.
  const load = useCallback(async () => {
    if (!activeClinicId) return;
    const data = await fetchClinicTickets(activeClinicId);
    setTickets(data ?? []);
    setLoadFailed(!data);
  }, [activeClinicId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (active) await load();
    })();
    return () => {
      active = false;
    };
  }, [load]);

  const shown = useMemo(
    () =>
      (tickets ?? []).filter((t) =>
        filter === "open" ? !isAnswered(t) : true
      ),
    [tickets, filter]
  );
  const openCount = (tickets ?? []).filter((t) => !isAnswered(t)).length;

  if (isMockMode) {
    return (
      <div className="space-y-6">
        <PageIntro
          title="Patient messages"
          description="Questions patients raise from their portal, and your replies."
        />
        <EmptyState
          icon="flag"
          title="Not available in demo mode"
          description="The inbox reads real tickets from the database. Connect Supabase to use it."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageIntro
        title="Patient messages"
        description="Questions patients raise from their portal. Replying marks the ticket answered and the patient sees it immediately."
        action={
          <div className="flex gap-1 rounded-xl bg-[var(--color-surface-muted)] p-1">
            {(
              [
                ["open", `Needs a reply${openCount ? ` (${openCount})` : ""}`],
                ["all", "All"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  filter === id
                    ? "bg-white text-[var(--color-ink)] shadow-sm"
                    : "text-[var(--color-ink-faint)] hover:text-[var(--color-ink-soft)]"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />

      {!activeClinicId ? (
        <EmptyState
          icon="alert"
          title="No clinic yet"
          description="Your account is not a member of any clinic, so there is no inbox to show."
        />
      ) : tickets === null ? (
        <Spinner label="Loading messages…" />
      ) : loadFailed ? (
        <EmptyState
          icon="alert"
          title="Could not load messages"
          description="The server did not respond. Try again."
          action={
            <Button
              onClick={() => {
                setTickets(null);
                void load();
              }}
            >
              Retry
            </Button>
          }
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon="check"
          title={filter === "open" ? "Nothing waiting" : "No messages yet"}
          description={
            filter === "open"
              ? "Every patient message has been answered."
              : "When a patient raises a question from their portal it appears here."
          }
        />
      ) : (
        <div className="space-y-4">
          {shown.map((t) => (
            <TicketCard key={t.id} ticket={t} onChange={load} />
          ))}
        </div>
      )}

      <Disclaimer />
    </div>
  );
}

/**
 * A ticket counts as answered once a therapist has replied. The stored
 * status is respected too, but derivation is what makes seeded and legacy
 * rows — and the AI acknowledgement, which is not an answer — behave.
 */
function isAnswered(t: ClinicTicket): boolean {
  return t.status === "answered" || t.replies.some((r) => r.from === "therapist");
}

function TicketCard({
  ticket,
  onChange,
}: {
  ticket: ClinicTicket;
  onChange: () => Promise<void>;
}) {
  const { profile } = useAuth();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const answered = isAnswered(ticket);
  const exercise = ticket.exerciseId ? exerciseFa[ticket.exerciseId] : null;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || !profile) return;
    setBusy(true);
    setError(null);
    const result = await replyToTicket(ticket.id, profile.id, draft.trim());
    setBusy(false);
    // The draft is never cleared on failure.
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setDraft("");
    await onChange();
  }

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--color-ink)]">
              {ticket.subject}
            </h3>
            <p className="mt-0.5 text-xs text-[var(--color-ink-faint)]">
              <Link
                href={`/patients/${ticket.patientId}`}
                className="text-[var(--color-primary-strong)] hover:underline"
              >
                {ticket.patientName}
              </Link>
              {" · "}
              {formatDate(ticket.createdAt)}
              {exercise ? ` · ${exercise.name}` : ""}
            </p>
          </div>
          <Badge tone={answered ? "success" : "warn"}>
            {answered ? "Answered" : "Needs a reply"}
          </Badge>
        </div>

        <p
          dir="rtl"
          className="rounded-xl bg-[var(--color-surface-muted)] px-3.5 py-2.5 text-[13px] leading-relaxed text-[var(--color-ink)] font-[family-name:var(--font-vazirmatn)]"
        >
          {ticket.message}
        </p>

        {ticket.replies.map((r) => (
          <div
            key={r.id}
            dir="rtl"
            className={cn(
              "rounded-xl border px-3.5 py-2.5 text-[13px] leading-relaxed font-[family-name:var(--font-vazirmatn)]",
              r.from === "therapist"
                ? "border-[var(--color-primary)]/30 bg-[var(--color-primary-tint)] text-[var(--color-ink)]"
                : "border-[var(--color-accent)]/20 bg-[var(--color-accent-soft)]/40 text-[var(--color-ink-soft)]"
            )}
          >
            <p className="mb-1 text-[10px] font-bold text-[var(--color-ink-faint)]">
              {r.from === "therapist"
                ? `🩺 ${r.authorName ?? "فیزیوتراپیست"}`
                : r.from === "patient"
                  ? "🙋 بیمار"
                  : "🤖 پاسخ خودکار"}
            </p>
            {r.content}
          </div>
        ))}

        <form onSubmit={send} className="space-y-2">
          <Textarea
            dir="rtl"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            placeholder="پاسخ خود را به زبان ساده بنویسید…"
            className="min-h-20 font-[family-name:var(--font-vazirmatn)]"
            aria-label={`Reply to ${ticket.subject}`}
          />
          {error && (
            <p className="rounded-xl bg-[var(--color-danger-soft)] px-3.5 py-2.5 text-[13px] text-[var(--color-danger)]">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={!draft.trim() || busy}>
              <Icon name="send" width={14} height={14} />
              {busy ? "Sending…" : "Send reply"}
            </Button>
            {!answered && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const result = await setTicketStatus(ticket.id, "answered");
                  setBusy(false);
                  if (!result.ok) setError(result.message);
                  else await onChange();
                }}
              >
                Mark answered without replying
              </Button>
            )}
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
