"use client";

import { useMemo, useState } from "react";
import { redFlags, redFlagCategories } from "@/lib/data/redFlags";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Disclaimer, PageIntro } from "@/components/ui/Misc";
import { cn } from "@/lib/utils";

export default function RedFlagCheckerPage() {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const selectedItems = useMemo(
    () => redFlags.filter((r) => selected.has(r.id)),
    [selected]
  );

  const urgent = selectedItems.some((r) =>
    ["Cauda Equina", "Cardiac", "DVT"].includes(r.category)
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <PageIntro
        title="Red Flag Checker"
        description="Screen for signs of serious pathology. Select every item that applies to the patient in front of you."
        action={
          selected.size > 0 ? (
            <Button variant="secondary" size="sm" onClick={() => setSelected(new Set())}>
              Clear selection
            </Button>
          ) : undefined
        }
      />

      {/* Result banner */}
      {selectedItems.length > 0 ? (
        <div
          className={cn(
            "flex items-start gap-3 rounded-2xl border px-5 py-4",
            urgent
              ? "border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)]"
              : "border-[var(--color-warn)]/40 bg-[var(--color-warn-soft)]"
          )}
        >
          <span className={cn("mt-0.5", urgent ? "text-[var(--color-danger)]" : "text-[var(--color-warn)]")}>
            <Icon name="alert" width={22} height={22} />
          </span>
          <div>
            <h3 className={cn("text-sm font-semibold", urgent ? "text-[var(--color-danger)]" : "text-[var(--color-warn)]")}>
              {selectedItems.length} red flag{selectedItems.length > 1 ? "s" : ""} selected —
              refer to physician / emergency care if clinically indicated.
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-[var(--color-ink-soft)]">
              {urgent
                ? "Selections include potentially urgent categories (cauda equina, cardiac, DVT). Do not delay medical referral where suspected."
                : "Interpret in the context of the full presentation. A single flag is not always sinister, but clusters raise concern."}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {selectedItems.map((item) => (
                <Badge key={item.id} tone={urgent ? "danger" : "warn"}>
                  {item.label}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-2xl border border-[var(--color-success)]/30 bg-[var(--color-success-soft)] px-5 py-4">
          <span className="mt-0.5 text-[var(--color-success)]">
            <Icon name="shield" width={20} height={20} />
          </span>
          <p className="text-sm text-[var(--color-ink-soft)]">
            No red flags selected. Complete the checklist below during your
            subjective examination.
          </p>
        </div>
      )}

      {/* Checklist grouped by category */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {redFlagCategories.map((category) => (
          <Card key={category}>
            <CardHeader
              title={category}
              icon={<Icon name="flag" width={18} height={18} />}
            />
            <CardBody className="space-y-1.5">
              {redFlags
                .filter((r) => r.category === category)
                .map((item) => {
                  const checked = selected.has(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggle(item.id)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                        checked
                          ? "border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)]"
                          : "border-transparent hover:bg-[var(--color-surface-muted)]"
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border",
                          checked
                            ? "border-[var(--color-danger)] bg-[var(--color-danger)] text-white"
                            : "border-[var(--color-border)] bg-white"
                        )}
                      >
                        {checked && <Icon name="check" width={12} height={12} />}
                      </span>
                      <span>
                        <span className="block text-sm font-medium text-[var(--color-ink)]">
                          {item.label}
                        </span>
                        <span className="block text-xs text-[var(--color-ink-faint)]">
                          {item.detail}
                        </span>
                      </span>
                    </button>
                  );
                })}
            </CardBody>
          </Card>
        ))}
      </div>

      <Disclaimer />
    </div>
  );
}
