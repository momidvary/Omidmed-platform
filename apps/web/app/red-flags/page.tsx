"use client";

import { useMemo, useState } from "react";
import { redFlags, redFlagCategories } from "@/lib/data/redFlags";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Disclaimer, PageIntro } from "@/components/ui/Misc";
import { cn } from "@/lib/utils";
import {
  evaluateSafetyScreen,
  redFlagDisposition,
} from "@/lib/clinical/safety";
import type { SafetyDisposition } from "@/lib/types";
import { useCases } from "@/lib/store/CaseContext";

type ScreenPhase = "not-started" | "in-progress" | "completed";
type CompletedDisposition = Exclude<SafetyDisposition, "not-screened">;

const dispositionTone: Record<
  SafetyDisposition,
  "neutral" | "success" | "warn" | "danger"
> = {
  "not-screened": "neutral",
  clear: "success",
  "medical-review": "warn",
  urgent: "danger",
  emergency: "danger",
};

const dispositionCopy: Record<
  CompletedDisposition,
  { title: string; detail: string }
> = {
  clear: {
    title: "Screen completed with no concerns selected",
    detail:
      "This does not rule out serious pathology. Continue the clinical examination and repeat screening if the presentation changes.",
  },
  "medical-review": {
    title: "Medical review is required before treatment planning",
    detail:
      "Do not interpret this checklist as a diagnosis. Document the finding and follow the appropriate local referral pathway.",
  },
  urgent: {
    title: "Urgent clinical escalation is required",
    detail:
      "Pause treatment advice and arrange prompt medical assessment using the applicable local pathway. Do not delay escalation to finish this checklist.",
  },
  emergency: {
    title: "Possible emergency — arrange immediate assessment",
    detail:
      "Stop treatment activity and follow the local emergency pathway now. Do not leave the patient waiting on an app or routine message.",
  },
};

export default function RedFlagCheckerPage() {
  const {
    cases,
    currentCase,
    currentCaseId,
    setCurrentCase,
    saveSafetyScreen,
    hydrated,
    loadError,
    reloadCases,
  } = useCases();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<ScreenPhase>("not-started");
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [actionTaken, setActionTaken] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const selectedItems = useMemo(
    () => redFlags.filter((r) => selected.has(r.id)),
    [selected]
  );

  const provisionalDisposition = useMemo(
    () => evaluateSafetyScreen([...selected], true),
    [selected]
  );
  const disposition = evaluateSafetyScreen(
    [...selected],
    phase === "completed"
  );

  const displayedDisposition = (
    phase === "completed" ? disposition : provisionalDisposition
  ) as CompletedDisposition;
  const incompleteDanger =
    phase !== "completed" &&
    selectedItems.length > 0 &&
    (displayedDisposition === "urgent" || displayedDisposition === "emergency");

  function toggle(id: string) {
    if (!currentCase || saving || phase === "completed") return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPhase("in-progress");
    setReviewConfirmed(false);
    setCompletedAt(null);
  }

  function reset() {
    setSelected(new Set());
    setPhase("not-started");
    setReviewConfirmed(false);
    setCompletedAt(null);
    setNotes("");
    setActionTaken("");
    setSaveError(null);
  }

  const hasUnsavedDraft =
    phase !== "completed" &&
    (phase !== "not-started" ||
      selected.size > 0 ||
      reviewConfirmed ||
      notes.trim().length > 0 ||
      actionTaken.trim().length > 0);

  function confirmDiscardDraft(): boolean {
    return (
      !hasUnsavedDraft ||
      window.confirm(
        "Discard this unsaved safety-screen draft? Selected findings and notes will be lost."
      )
    );
  }

  function clearDraft() {
    if (confirmDiscardDraft()) reset();
  }

  async function completeScreen() {
    if (!reviewConfirmed || !currentCase || saving) return;
    if (selected.size > 0 && actionTaken.trim().length < 3) {
      setSaveError(
        "Document the referral or escalation action before saving a concern."
      );
      return;
    }
    setSaving(true);
    setSaveError(null);
    const saved = await saveSafetyScreen(currentCase.id, {
      selectedFlagIds: [...selected],
      notes,
      actionTaken,
    });
    setSaving(false);
    if (!saved) {
      setSaveError(
        "The safety screen was not saved. The case has not been cleared; check your connection and access, then retry."
      );
      return;
    }
    setPhase("completed");
    setCompletedAt(saved.screenedAt);
  }

  return (
    <div className="space-y-6">
      <PageIntro
        title="Red Flag Checker"
        description="Screen for signs of serious pathology. Select every item that applies to the patient in front of you."
        action={
          phase !== "not-started" || selected.size > 0 ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={clearDraft}
              disabled={saving}
            >
              Clear draft
            </Button>
          ) : undefined
        }
      />

      <Card>
        <CardBody className="space-y-3">
          {loadError && (
            <div
              role="alert"
              className="rounded-xl border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]"
            >
              <p>
                Patient cases could not be loaded securely. This is a connection
                or access error, not an empty case list.
              </p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="mt-3"
                onClick={reloadCases}
              >
                Retry case list
              </Button>
            </div>
          )}
          <label className="block text-sm font-semibold text-[var(--color-ink)]">
            Patient case
            <select
              value={currentCaseId ?? ""}
              onChange={(event) => {
                if (!confirmDiscardDraft()) return;
                setCurrentCase(event.target.value || null);
                reset();
              }}
              disabled={
                !hydrated || loadError || saving || cases.length === 0
              }
              className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm font-normal text-[var(--color-ink)] outline-none focus:border-[var(--color-primary)]"
            >
              <option value="">
                {!hydrated
                  ? "Loading cases…"
                  : loadError
                    ? "Cases could not be loaded"
                  : cases.length === 0
                    ? "No accessible cases"
                    : "Select a case"}
              </option>
              {cases.map((patientCase) => (
                <option key={patientCase.id} value={patientCase.id}>
                  {patientCase.name} — {patientCase.mainComplaint}
                </option>
              ))}
            </select>
          </label>
          {currentCase ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-ink-soft)]">
              <span>Current stored safety state:</span>
              <Badge
                tone={
                  dispositionTone[
                    currentCase.safetyScreen?.disposition ?? "not-screened"
                  ]
                }
              >
                {currentCase.safetyScreen?.disposition ?? "not-screened"}
              </Badge>
              {currentCase.safetyScreen?.screenedAt && (
                <span>
                  {new Date(
                    currentCase.safetyScreen.screenedAt
                  ).toLocaleString()}
                </span>
              )}
            </div>
          ) : (
            <p className="text-xs text-[var(--color-ink-faint)]">
              Select the exact patient case before reviewing the checklist. No
              result is stored without an explicit case.
            </p>
          )}
        </CardBody>
      </Card>

      {/* A green clearance state is shown only after explicit completion. */}
      {phase === "completed" ? (
        <div
          role={displayedDisposition === "emergency" ? "alert" : "status"}
          className={cn(
            "flex items-start gap-3 rounded-2xl border px-5 py-4",
            displayedDisposition === "clear"
              ? "border-[var(--color-success)]/30 bg-[var(--color-success-soft)]"
              : displayedDisposition === "medical-review"
                ? "border-[var(--color-warn)]/40 bg-[var(--color-warn-soft)]"
                : "border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)]"
          )}
        >
          <span
            className={cn(
              "mt-0.5",
              displayedDisposition === "clear"
                ? "text-[var(--color-success)]"
                : displayedDisposition === "medical-review"
                  ? "text-[var(--color-warn)]"
                  : "text-[var(--color-danger)]"
            )}
          >
            <Icon
              name={displayedDisposition === "clear" ? "shield" : "alert"}
              width={22}
              height={22}
            />
          </span>
          <div>
            <h3
              className={cn(
                "text-sm font-semibold",
                displayedDisposition === "clear"
                  ? "text-[var(--color-success)]"
                  : displayedDisposition === "medical-review"
                    ? "text-[var(--color-warn)]"
                    : "text-[var(--color-danger)]"
              )}
            >
              {dispositionCopy[displayedDisposition].title}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-[var(--color-ink-soft)]">
              {dispositionCopy[displayedDisposition].detail}
            </p>
            {completedAt && (
              <p className="mt-2 text-[11px] text-[var(--color-ink-faint)]">
                Completed {new Date(completedAt).toLocaleString()}
              </p>
            )}
            {selectedItems.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedItems.map((item) => (
                  <Badge
                    key={item.id}
                    tone={dispositionTone[redFlagDisposition[item.id] ?? "medical-review"]}
                  >
                    {item.label}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div
          role={selectedItems.length > 0 ? "alert" : "status"}
          className={cn(
            "flex items-start gap-3 rounded-2xl border px-5 py-4",
            incompleteDanger
              ? "border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)]"
              : selectedItems.length > 0
                ? "border-[var(--color-warn)]/40 bg-[var(--color-warn-soft)]"
              : "border-[var(--color-border)] bg-[var(--color-surface-muted)]"
          )}
        >
          <span
            className={cn(
              "mt-0.5",
              incompleteDanger
                ? "text-[var(--color-danger)]"
                : selectedItems.length > 0
                  ? "text-[var(--color-warn)]"
                : "text-[var(--color-ink-faint)]"
            )}
          >
            <Icon
              name={selectedItems.length > 0 ? "alert" : "shield"}
              width={20}
              height={20}
            />
          </span>
          <div>
            <p className="text-sm font-semibold text-[var(--color-ink)]">
              Safety screen not completed
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--color-ink-soft)]">
              {selectedItems.length > 0
                ? `${selectedItems.length} concern${selectedItems.length > 1 ? "s are" : " is"} currently selected. ${dispositionCopy[displayedDisposition].title}. Completion is not permission to delay the indicated referral.`
                : "Unselected items are currently unknown, not confirmed absent. Review every item, then complete the attestation below."}
            </p>
          </div>
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
                      role="checkbox"
                      aria-checked={checked}
                      onClick={() => toggle(item.id)}
                      disabled={!currentCase || saving || phase === "completed"}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-start transition-colors",
                        (!currentCase || saving || phase === "completed") &&
                          "cursor-not-allowed opacity-60",
                        checked
                          ? "border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)]"
                          : "border-transparent hover:bg-[var(--color-surface-muted)]"
                      )}
                    >
                      <span
                        aria-hidden="true"
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

      <Card>
        <CardBody className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-medium text-[var(--color-ink)]">
              Clinical notes (optional)
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                maxLength={10000}
                rows={4}
                disabled={!currentCase || saving || phase === "completed"}
                placeholder="Relevant context from this assessment"
                className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
            <label className="block text-sm font-medium text-[var(--color-ink)]">
              Referral / escalation action
              <textarea
                value={actionTaken}
                onChange={(event) => setActionTaken(event.target.value)}
                maxLength={4000}
                rows={4}
                required={selected.size > 0}
                disabled={!currentCase || saving || phase === "completed"}
                placeholder={
                  selected.size > 0
                    ? "Required: document the action taken now"
                    : "Not required when the completed screen is clear"
                }
                className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-60"
              />
              {selected.size > 0 && (
                <span className="mt-1 block text-xs text-[var(--color-danger)]">
                  A concern cannot be saved without a documented action.
                </span>
              )}
            </label>
          </div>
          <label className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] p-3 text-sm text-[var(--color-ink-soft)]">
            <input
              type="checkbox"
              checked={reviewConfirmed}
              disabled={!currentCase || saving || phase === "completed"}
              onChange={(event) => {
                setReviewConfirmed(event.target.checked);
                if (phase === "not-started") setPhase("in-progress");
                if (phase === "completed") {
                  setPhase("in-progress");
                  setCompletedAt(null);
                }
              }}
              className="mt-1"
            />
            <span>
              I actively reviewed every item with the patient. Unselected items
              are absent based on the current assessment, and I understand that
              this checklist does not rule out serious pathology.
            </span>
          </label>
          {saveError && (
            <div
              role="alert"
              className="rounded-xl border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]"
            >
              {saveError}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={completeScreen}
              disabled={
                !currentCase ||
                !reviewConfirmed ||
                saving ||
                phase === "completed" ||
                (selected.size > 0 && actionTaken.trim().length < 3)
              }
            >
              {saving ? "Saving…" : "Complete and save safety screen"}
            </Button>
            {phase === "completed" && (
              <span className="text-xs text-[var(--color-ink-faint)]">
                This result is stored in the case history. Use Clear draft to
                begin a new assessment.
              </span>
            )}
          </div>
        </CardBody>
      </Card>

      <Disclaimer />
    </div>
  );
}
