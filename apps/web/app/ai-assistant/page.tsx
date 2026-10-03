"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCases } from "@/lib/store/CaseContext";
import { buildChatReply, suggestedPrompts } from "@/lib/ai/engine";
import { getRegion } from "@/lib/data/bodyRegions";
import type { ChatMessage } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { Disclaimer, PageIntro } from "@/components/ui/Misc";
import { cn, uid, uuid } from "@/lib/utils";
import { hasClinicalSafetyClearance } from "@/lib/clinical/safety";
import {
  ClinicalDraftSchema,
  type ClinicalDraft,
} from "@/lib/ai/clinicalDraftSchema";

const GENERAL_CONTEXT = "__general__";
const CLINICAL_AI_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_CLINICAL_AI_DRAFTS === "true";

type ClinicalDraftMessage = ChatMessage & {
  clinicalDraft: ClinicalDraft;
  aiMetadata: NonNullable<ChatMessage["aiMetadata"]>;
};

function isClinicalDraftMessage(
  message: ChatMessage
): message is ClinicalDraftMessage {
  return Boolean(message.clinicalDraft && message.aiMetadata);
}

export default function AiAssistantPage() {
  const { cases, currentCase, setCurrentCase } = useCases();
  const contextKey = currentCase?.id ?? GENERAL_CONTEXT;
  const [conversations, setConversations] = useState<
    Record<string, ChatMessage[]>
  >({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pendingContexts, setPendingContexts] = useState<Set<string>>(
    new Set()
  );
  const messages = useMemo(
    () => conversations[contextKey] ?? [],
    [conversations, contextKey]
  );
  const input = drafts[contextKey] ?? "";
  const thinking = pendingContexts.has(contextKey);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );
  const controllersRef = useRef<Map<string, AbortController>>(new Map());
  const [reviewingIds, setReviewingIds] = useState<Set<string>>(new Set());

  function appendMessage(key: string, message: ChatMessage) {
    setConversations((previous) => ({
      ...previous,
      [key]: [...(previous[key] ?? []), message],
    }));
  }

  useEffect(
    () => () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
      timersRef.current.clear();
      controllersRef.current.forEach((controller) => controller.abort());
      controllersRef.current.clear();
    },
    []
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, thinking]);

  function clearPending(key: string) {
    setPendingContexts((previous) => {
      const next = new Set(previous);
      next.delete(key);
      return next;
    });
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || thinking) return;

    const requestContext = contextKey;
    const caseSnapshot = currentCase;
    const userMsg: ChatMessage = { id: uid("msg"), role: "user", content };
    appendMessage(requestContext, userMsg);
    setDrafts((previous) => ({ ...previous, [requestContext]: "" }));

    if (
      caseSnapshot &&
      !hasClinicalSafetyClearance(caseSnapshot.safetyScreen)
    ) {
      appendMessage(requestContext, {
        id: uid("msg"),
        role: "assistant",
        content:
          "Case-specific clinical suggestions are locked because this case does not have a completed, clear safety screen. Complete or resolve the structured safety pathway first; do not use this chat to bypass escalation.",
      });
      return;
    }

    if (CLINICAL_AI_ENABLED && !caseSnapshot) {
      appendMessage(requestContext, {
        id: uid("msg"),
        role: "assistant",
        content:
          "Select a safety-cleared case before requesting a real clinical draft. The server does not accept free-floating clinical prompts without a case record.",
      });
      return;
    }

    setPendingContexts((previous) => new Set(previous).add(requestContext));

    if (CLINICAL_AI_ENABLED && caseSnapshot) {
      const controller = new AbortController();
      controllersRef.current.set(requestContext, controller);
      try {
        const response = await fetch("/api/ai/clinical-draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId: uuid(),
            caseId: caseSnapshot.id,
            question: content,
          }),
          signal: controller.signal,
        });
        const payload = (await response.json()) as Record<string, unknown>;
        if (!response.ok) {
          const safetyBlocked =
            response.status === 409 &&
            (payload.error === "safety_signal_detected" ||
              payload.error === "safety_clearance_required");
          appendMessage(requestContext, {
            id: uid("msg"),
            role: "assistant",
            content: safetyBlocked
              ? "The deterministic safety gate blocked AI generation. Review the structured red-flag pathway and arrange the indicated escalation; do not use a model response to override it."
              : "The audited AI draft service is unavailable or refused this request. No fallback clinical answer was generated; continue with independent clinical reasoning.",
          });
          return;
        }

        const parsedDraft = ClinicalDraftSchema.safeParse(payload.draft);
        if (
          !parsedDraft.success ||
          typeof payload.auditId !== "string" ||
          typeof payload.model !== "string" ||
          typeof payload.promptVersion !== "string"
        ) {
          appendMessage(requestContext, {
            id: uid("msg"),
            role: "assistant",
            content:
              "The AI service returned an invalid draft. It was discarded and must not be used.",
          });
          return;
        }

        appendMessage(requestContext, {
          id: uid("msg"),
          role: "assistant",
          content: parsedDraft.data.answer,
          clinicalDraft: parsedDraft.data,
          aiMetadata: {
            auditId: payload.auditId,
            model: payload.model,
            promptVersion: payload.promptVersion,
            reviewStatus: "pending",
          },
        });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          appendMessage(requestContext, {
            id: uid("msg"),
            role: "assistant",
            content:
              "The AI request failed. No clinical fallback was substituted; verify the case independently.",
          });
        }
      } finally {
        controllersRef.current.delete(requestContext);
        clearPending(requestContext);
      }
      return;
    }

    // 🔌 REAL AI API INTEGRATION POINT — replace this timeout + keyword
    // responder with a streaming call to your AI provider, passing the
    // conversation history and the active case as context.
    const timer = setTimeout(() => {
      const reply: ChatMessage = {
        id: uid("msg"),
        role: "assistant",
        content: buildChatReply(content, caseSnapshot ?? undefined),
      };
      appendMessage(requestContext, reply);
      clearPending(requestContext);
      timersRef.current.delete(requestContext);
    }, 800);
    timersRef.current.set(requestContext, timer);
  }

  async function reviewClinicalDraft(
    message: ChatMessage,
    decision: "accepted" | "edited" | "rejected",
    editedOutput?: ClinicalDraft
  ): Promise<boolean> {
    if (!message.aiMetadata || reviewingIds.has(message.id)) return false;
    const reviewContext = contextKey;
    setReviewingIds((previous) => new Set(previous).add(message.id));
    try {
      const response = await fetch("/api/ai/clinical-draft/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auditId: message.aiMetadata.auditId,
          decision,
          editedOutput: decision === "edited" ? editedOutput : undefined,
        }),
      });
      if (!response.ok) return false;

      setConversations((previous) => ({
        ...previous,
        [reviewContext]: (previous[reviewContext] ?? []).map((candidate) =>
          candidate.id === message.id && candidate.aiMetadata
            ? {
                ...candidate,
                content: editedOutput?.answer ?? candidate.content,
                clinicalDraft: editedOutput ?? candidate.clinicalDraft,
                aiMetadata: {
                  ...candidate.aiMetadata,
                  reviewStatus: decision,
                },
              }
            : candidate
        ),
      }));
      return true;
    } catch {
      return false;
    } finally {
      setReviewingIds((previous) => {
        const next = new Set(previous);
        next.delete(message.id);
        return next;
      });
    }
  }

  async function copyMessage(msg: ChatMessage) {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="space-y-6">
      <PageIntro
        title="AI Clinical Assistant"
        description={
          CLINICAL_AI_ENABLED
            ? "Audited, structured draft assistant. A safety-cleared case and explicit clinician review are required."
            : "Template assistant sandbox. Conversations and pending replies are isolated to the selected case."
        }
      />

      <div
        role="alert"
        className="rounded-2xl border border-[var(--color-warn)]/40 bg-[var(--color-warn-soft)] px-5 py-4 text-sm text-[var(--color-ink-soft)]"
      >
        {CLINICAL_AI_ENABLED
          ? "AI drafts are generated server-side and logged, but no model output is clinical clearance. Review the original record, verify every unsupported claim and explicitly accept, edit or reject the draft."
          : "No validated clinical AI model or evidence retrieval service is connected. Treat every response as fixed demo content; do not copy it into a care plan without independent clinical review."}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Chat panel */}
        <Card className="flex min-h-[560px] flex-col lg:col-span-2">
          <div
            ref={scrollRef}
            className="flex-1 space-y-4 overflow-y-auto px-5 py-5"
          >
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--color-primary-tint)] text-[var(--color-primary)]">
                  <Icon name="chat" width={24} height={24} />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-[var(--color-ink)]">
                  Ask a clinical question
                </h3>
                <p className="mt-1 max-w-sm text-sm text-[var(--color-ink-soft)]">
                  Try one of the suggested prompts, or type your own question below.
                </p>
                <div className="mt-4 flex max-w-md flex-wrap justify-center gap-2">
                  {suggestedPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => send(prompt)}
                      disabled={thinking}
                      className="rounded-full border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary-strong)]"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "group relative rounded-2xl px-4 py-3 text-sm leading-relaxed",
                    msg.clinicalDraft ? "max-w-[96%]" : "max-w-[85%]",
                    msg.role === "user"
                      ? "rounded-br-md bg-[var(--color-primary)] text-white"
                      : "rounded-bl-md bg-[var(--color-surface-muted)] text-[var(--color-ink)]"
                  )}
                >
                  {isClinicalDraftMessage(msg) ? (
                    <ClinicalDraftBubble
                      message={msg}
                      busy={reviewingIds.has(msg.id)}
                      copied={copiedId === msg.id}
                      onCopy={() => copyMessage(msg)}
                      onReview={(decision, editedOutput) =>
                        reviewClinicalDraft(msg, decision, editedOutput)
                      }
                    />
                  ) : (
                    msg.content
                  )}
                  {msg.role === "assistant" && !msg.clinicalDraft && (
                    <button
                      type="button"
                      onClick={() => copyMessage(msg)}
                      className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full border border-[var(--color-border)] bg-white text-[var(--color-ink-faint)] opacity-0 shadow-sm transition-opacity hover:text-[var(--color-primary)] group-hover:opacity-100 focus-visible:opacity-100"
                      aria-label="Copy answer"
                    >
                      <Icon
                        name={copiedId === msg.id ? "check" : "copy"}
                        width={13}
                        height={13}
                      />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {thinking && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-[var(--color-surface-muted)] px-4 py-3">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--color-ink-faint)] [animation-delay:0ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--color-ink-faint)] [animation-delay:120ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--color-ink-faint)] [animation-delay:240ms]" />
                </div>
              </div>
            )}
          </div>

          {/* Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-end gap-2 border-t border-[var(--color-border)] p-4"
          >
            <textarea
              value={input}
              onChange={(e) =>
                setDrafts((previous) => ({
                  ...previous,
                  [contextKey]: e.target.value,
                }))
              }
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              maxLength={CLINICAL_AI_ENABLED ? 2000 : 4000}
              aria-label="Clinical question"
              placeholder="Ask about tests, plans, exercises, progression…"
              className="max-h-32 flex-1 resize-none rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
            />
            <Button type="submit" disabled={!input.trim() || thinking} aria-label="Send">
              <Icon name="send" width={16} height={16} />
            </Button>
          </form>
        </Card>

        {/* Case context panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Case Context"
              subtitle="The assistant considers this case"
              icon={<Icon name="user" width={18} height={18} />}
            />
            <CardBody className="space-y-3">
              <Select
                value={currentCase?.id ?? ""}
                onChange={(e) => setCurrentCase(e.target.value || null)}
              >
                <option value="">No case context</option>
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || "Unnamed"}
                  </option>
                ))}
              </Select>

              {currentCase ? (
                <div className="space-y-2 rounded-xl bg-[var(--color-surface-muted)] p-3 text-sm">
                  <p className="font-medium text-[var(--color-ink)]">
                    {currentCase.name}
                    {currentCase.age ? `, ${currentCase.age}` : ""}
                  </p>
                  <p className="text-xs text-[var(--color-ink-soft)]">
                    {currentCase.mainComplaint}
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Badge tone={currentCase.painIntensity >= 7 ? "danger" : "warn"}>
                      Pain {currentCase.painIntensity}/10
                    </Badge>
                    {currentCase.region && (
                      <Badge tone="primary">
                        {getRegion(currentCase.region)?.label}
                      </Badge>
                    )}
                    {currentCase.duration && <Badge>{currentCase.duration}</Badge>}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[var(--color-ink-faint)]">
                  Select a case so answers can reference its details.
                </p>
              )}
            </CardBody>
          </Card>

          <Disclaimer />
        </div>
      </div>
    </div>
  );
}

function ClinicalDraftBubble({
  message,
  busy,
  copied,
  onCopy,
  onReview,
}: {
  message: ClinicalDraftMessage;
  busy: boolean;
  copied: boolean;
  onCopy: () => void;
  onReview: (
    decision: "accepted" | "edited" | "rejected",
    editedOutput?: ClinicalDraft
  ) => Promise<boolean>;
}) {
  const { clinicalDraft: draft, aiMetadata } = message;
  const [editing, setEditing] = useState(false);
  const [editedAnswer, setEditedAnswer] = useState(draft.answer);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const reviewed = aiMetadata.reviewStatus !== "pending";

  async function decide(
    decision: "accepted" | "edited" | "rejected"
  ) {
    setReviewError(null);
    let editedOutput: ClinicalDraft | undefined;
    if (decision === "edited") {
      const candidate = ClinicalDraftSchema.safeParse({
        ...draft,
        answer: editedAnswer.trim(),
      });
      if (!candidate.success) {
        setReviewError("The edited answer is empty or exceeds the safe limit.");
        return;
      }
      editedOutput = candidate.data;
    }
    const saved = await onReview(decision, editedOutput);
    if (!saved) {
      setReviewError(
        "The review decision was not saved. The draft remains unapproved."
      );
      return;
    }
    setEditing(false);
  }

  const statusTone =
    aiMetadata.reviewStatus === "accepted"
      ? "success"
      : aiMetadata.reviewStatus === "edited"
        ? "primary"
        : aiMetadata.reviewStatus === "rejected"
          ? "danger"
          : "warn";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] pb-3">
        <Badge tone={statusTone}>
          {reviewed
            ? `Clinician ${aiMetadata.reviewStatus}`
            : "Unreviewed AI draft"}
        </Badge>
        <span className="text-[10px] text-[var(--color-ink-faint)]">
          {aiMetadata.model} · {aiMetadata.promptVersion}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="ms-auto grid h-7 w-7 place-items-center rounded-full border border-[var(--color-border)] bg-white text-[var(--color-ink-faint)] hover:text-[var(--color-primary)]"
          aria-label="Copy draft answer"
        >
          <Icon name={copied ? "check" : "copy"} width={13} height={13} />
        </button>
      </div>

      {draft.requiresMedicalReview && (
        <p
          role="alert"
          className="rounded-lg bg-[var(--color-danger-soft)] px-3 py-2 text-xs text-[var(--color-danger)]"
        >
          The model marked this draft for medical review. Do not progress
          treatment from this output.
        </p>
      )}
      {draft.abstained && (
        <p className="rounded-lg bg-[var(--color-warn-soft)] px-3 py-2 text-xs text-[var(--color-warn)]">
          Model abstained: {draft.abstainReason ?? "insufficient context"}
        </p>
      )}

      {editing ? (
        <label className="block text-xs font-medium text-[var(--color-ink-soft)]">
          Edit the answer after checking the original record
          <textarea
            value={editedAnswer}
            maxLength={4000}
            onChange={(event) => setEditedAnswer(event.target.value)}
            className="mt-2 min-h-32 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-none"
          />
        </label>
      ) : (
        <p className="whitespace-pre-wrap">{draft.answer}</p>
      )}

      {draft.possibleHypotheses.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold text-[var(--color-ink)]">
            Non-definitive hypotheses
          </h4>
          <div className="mt-2 space-y-2">
            {draft.possibleHypotheses.map((hypothesis) => (
              <div
                key={hypothesis.label}
                className="rounded-lg border border-[var(--color-border)] bg-white p-3"
              >
                <p className="text-xs font-semibold">{hypothesis.label}</p>
                <DraftList
                  title="Supporting context"
                  items={hypothesis.supportingContext}
                />
                <DraftList
                  title="Against / missing"
                  items={hypothesis.conflictingOrMissingContext}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <DraftList title="Assessment priorities" items={draft.assessmentPriorities} />
        <DraftList title="Treatment considerations" items={draft.treatmentConsiderations} />
        <DraftList
          title="Contraindications / stop rules"
          items={draft.contraindicationsAndStopRules}
        />
        <DraftList title="Missing information" items={draft.missingInformation} />
        <div className="sm:col-span-2">
          <DraftList title="Must verify" items={draft.verificationItems} />
        </div>
      </div>

      {reviewError && (
        <p role="alert" className="text-xs text-[var(--color-danger)]">
          {reviewError}
        </p>
      )}

      {!reviewed && (
        <div className="flex flex-wrap gap-2 border-t border-[var(--color-border)] pt-3">
          {editing ? (
            <>
              <Button size="sm" disabled={busy} onClick={() => void decide("edited")}>
                Save edited review
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setEditing(false);
                  setEditedAnswer(draft.answer);
                  setReviewError(null);
                }}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" disabled={busy} onClick={() => void decide("accepted")}>
                Mark reviewed & accept
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => setEditing(true)}
              >
                Edit before accepting
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={() => void decide("rejected")}
              >
                Reject draft
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function DraftList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h4 className="text-[11px] font-semibold text-[var(--color-ink)]">
        {title}
      </h4>
      <ul className="mt-1 list-disc space-y-1 ps-4 text-xs text-[var(--color-ink-soft)]">
        {items.map((item, index) => (
          <li key={`${index}-${item}`}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
