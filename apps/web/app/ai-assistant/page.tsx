"use client";

import { useEffect, useRef, useState } from "react";
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
import { cn, uid } from "@/lib/utils";

export default function AiAssistantPage() {
  const { cases, currentCase, setCurrentCase } = useCases();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, thinking]);

  function send(text: string) {
    const content = text.trim();
    if (!content || thinking) return;

    const userMsg: ChatMessage = { id: uid("msg"), role: "user", content };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setThinking(true);

    // 🔌 REAL AI API INTEGRATION POINT — replace this timeout + keyword
    // responder with a streaming call to your AI provider, passing the
    // conversation history and the active case as context.
    setTimeout(() => {
      const reply: ChatMessage = {
        id: uid("msg"),
        role: "assistant",
        content: buildChatReply(content, currentCase ?? undefined),
      };
      setMessages((prev) => [...prev, reply]);
      setThinking(false);
    }, 800);
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
        description="Ask about assessment, tests, treatment planning, exercise selection and progression. Answers use the active case as context."
      />

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
                    "group relative max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                    msg.role === "user"
                      ? "rounded-br-md bg-[var(--color-primary)] text-white"
                      : "rounded-bl-md bg-[var(--color-surface-muted)] text-[var(--color-ink)]"
                  )}
                >
                  {msg.content}
                  {msg.role === "assistant" && (
                    <button
                      type="button"
                      onClick={() => copyMessage(msg)}
                      className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full border border-[var(--color-border)] bg-white text-[var(--color-ink-faint)] opacity-0 shadow-sm transition-opacity hover:text-[var(--color-primary)] group-hover:opacity-100"
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
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
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
