"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Misc";
import { exerciseFa } from "@/lib/data/exerciseFa";
import { exercises } from "@/lib/data/exercises";
import {
  fetchPrescriptionHistory,
  publishPrescription,
  revokePrescription,
  savePrescriptionDraft,
  type PrescriptionMutationResult,
} from "@/lib/supabase/db";
import type {
  BodyRegionId,
  PrescriptionItemInput,
  PrescriptionRecord,
} from "@/lib/types";
import { localDateValue, uid } from "@/lib/utils";

interface DraftItem extends PrescriptionItemInput {
  rowId: string;
}

function plusDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localDateValue(date);
}

function emptyItem(): DraftItem {
  return { rowId: uid("rx"), exerciseId: "", dosageFa: "", daysPerWeek: 5 };
}

export function PrescriptionBuilder({
  treatmentPlanId,
  episodeId,
  region,
  safetyCleared,
}: {
  treatmentPlanId: string;
  episodeId: string;
  region?: BodyRegionId;
  safetyCleared: boolean;
}) {
  const patientReadyExercises = useMemo(
    () =>
      exercises
        .filter((exercise) => Boolean(exerciseFa[exercise.id]))
        .sort((a, b) => {
          const aRegion = a.region === region ? 0 : 1;
          const bRegion = b.region === region ? 0 : 1;
          return aRegion - bRegion || a.name.localeCompare(b.name);
        }),
    [region]
  );
  const [startDate, setStartDate] = useState(localDateValue());
  const [endDate, setEndDate] = useState(plusDays(42));
  const [reviewDate, setReviewDate] = useState(plusDays(14));
  const [precautions, setPrecautions] = useState("");
  const [stopRules, setStopRules] = useState("");
  const [items, setItems] = useState<DraftItem[]>([emptyItem()]);
  const [stored, setStored] = useState<PrescriptionMutationResult | null>(null);
  const [publishConfirmed, setPublishConfirmed] = useState(false);
  const [revokeConfirmed, setRevokeConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<{
    episodeId: string | null;
    records: PrescriptionRecord[];
    error: string | null;
  }>({ episodeId: null, records: [], error: null });
  const [historyRetry, setHistoryRetry] = useState(0);

  const scopedHistory =
    history.episodeId === episodeId
      ? history
      : { episodeId, records: [], error: null };
  const historyLoading = history.episodeId !== episodeId;
  const currentlyPublished = scopedHistory.records.find(
    (record) => record.status === "published"
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const records = await fetchPrescriptionHistory(episodeId);
      if (cancelled) return;
      setHistory({
        episodeId,
        records: records ?? [],
        error:
          records === null
            ? "Prescription history could not be loaded."
            : null,
      });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [episodeId, historyRetry]);

  function invalidateStored() {
    setStored(null);
    setPublishConfirmed(false);
    setError(null);
  }

  function updateItem(rowId: string, patch: Partial<DraftItem>) {
    setItems((previous) =>
      previous.map((item) => (item.rowId === rowId ? { ...item, ...patch } : item))
    );
    invalidateStored();
  }

  function validate(): string | null {
    if (!safetyCleared) return "The case safety screen is no longer clear.";
    if (!startDate || !reviewDate || reviewDate < startDate) {
      return "Review date must be on or after the start date.";
    }
    if (endDate && endDate < startDate) {
      return "End date must be on or after the start date.";
    }
    if (precautions.trim().length < 3) {
      return "Document precautions, or explicitly write that none are documented.";
    }
    if (stopRules.trim().length < 3) {
      return "Document patient-facing stop rules.";
    }
    if (items.length < 1 || items.length > 20) {
      return "A prescription must contain 1 to 20 exercises.";
    }
    const ids = items.map((item) => item.exerciseId);
    if (ids.some((id) => !patientReadyExercises.some((exercise) => exercise.id === id))) {
      return "Select a patient-ready exercise for every row.";
    }
    if (new Set(ids).size !== ids.length) return "Do not prescribe an exercise twice.";
    if (
      items.some(
        (item) =>
          item.dosageFa.trim().length < 3 ||
          item.dosageFa.trim().length > 500 ||
          !Number.isInteger(item.daysPerWeek) ||
          item.daysPerWeek < 1 ||
          item.daysPerWeek > 7
      )
    ) {
      return "Complete a valid dosage and weekly frequency for every exercise.";
    }
    return null;
  }

  async function saveDraft() {
    if (busy) return;
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await savePrescriptionDraft({
      treatmentPlanId,
      startDate,
      endDate: endDate || null,
      precautions,
      stopRules,
      reviewDate,
      items: items.map(({ exerciseId, dosageFa, daysPerWeek }) => ({
        exerciseId,
        dosageFa: dosageFa.trim(),
        daysPerWeek,
      })),
    });
    setBusy(false);
    if (!result) {
      setError(
        "Prescription draft was not saved. Confirm the treatment plan is still approved and the safety screen is clear."
      );
      return;
    }
    setStored(result);
    setHistoryRetry((value) => value + 1);
  }

  async function publish() {
    if (busy || !stored || stored.status !== "draft" || !publishConfirmed) return;
    setBusy(true);
    setError(null);
    const result = await publishPrescription(stored.id);
    setBusy(false);
    if (!result) {
      setError(
        "Publish was blocked. Re-check current safety, treatment-plan approval and assignment. The existing patient program was not changed."
      );
      return;
    }
    setStored(result);
    setHistoryRetry((value) => value + 1);
  }

  async function revokeCurrent() {
    if (busy || !currentlyPublished || !revokeConfirmed) return;
    setBusy(true);
    setError(null);
    const ok = await revokePrescription(currentlyPublished.id);
    setBusy(false);
    if (!ok) {
      setError("The published prescription was not revoked. Retry before advising the patient that it is stopped.");
      return;
    }
    if (stored?.id === currentlyPublished.id) setStored(null);
    setRevokeConfirmed(false);
    setHistoryRetry((value) => value + 1);
  }

  return (
    <Card>
      <CardHeader
        title="Patient exercise prescription"
        subtitle="Only exercises with complete Persian patient content are listed. Save a draft, then explicitly publish it to replace the current patient program."
        icon={<Icon name="exercise" width={18} height={18} />}
      />
      <CardBody className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Start date" required>
            <Input
              type="date"
              value={startDate}
              disabled={busy}
              onChange={(event) => {
                setStartDate(event.target.value);
                invalidateStored();
              }}
            />
          </Field>
          <Field label="End date">
            <Input
              type="date"
              min={startDate}
              value={endDate}
              disabled={busy}
              onChange={(event) => {
                setEndDate(event.target.value);
                invalidateStored();
              }}
            />
          </Field>
          <Field label="Review date" required>
            <Input
              type="date"
              min={startDate}
              value={reviewDate}
              disabled={busy}
              onChange={(event) => {
                setReviewDate(event.target.value);
                invalidateStored();
              }}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Patient-facing precautions"
            required
            hint="Use explicit wording; do not leave this blank."
          >
            <Textarea
              value={precautions}
              maxLength={4000}
              disabled={busy}
              onChange={(event) => {
                setPrecautions(event.target.value);
                invalidateStored();
              }}
              className="min-h-24"
            />
          </Field>
          <Field label="Stop rules" required hint="When must the patient stop and contact the clinic or seek urgent care?">
            <Textarea
              value={stopRules}
              maxLength={4000}
              disabled={busy}
              onChange={(event) => {
                setStopRules(event.target.value);
                invalidateStored();
              }}
              className="min-h-24"
            />
          </Field>
        </div>

        <div className="space-y-3">
          {items.map((item, index) => (
            <div
              key={item.rowId}
              className="grid grid-cols-1 gap-3 rounded-xl border border-[var(--color-border)] p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_8rem_auto]"
            >
              <Field label={`Exercise ${index + 1}`} required>
                <Select
                  value={item.exerciseId}
                  disabled={busy}
                  onChange={(event) =>
                    updateItem(item.rowId, { exerciseId: event.target.value })
                  }
                >
                  <option value="">Select…</option>
                  {patientReadyExercises.map((exercise) => (
                    <option key={exercise.id} value={exercise.id}>
                      {exercise.name} · {exerciseFa[exercise.id].name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Dosage shown to patient" required>
                <Input
                  value={item.dosageFa}
                  maxLength={500}
                  disabled={busy}
                  onChange={(event) =>
                    updateItem(item.rowId, { dosageFa: event.target.value })
                  }
                  placeholder="مثلاً ۳ ست × ۱۰ تکرار"
                />
              </Field>
              <Field label="Days/week" required>
                <Input
                  type="number"
                  min={1}
                  max={7}
                  value={item.daysPerWeek}
                  disabled={busy}
                  onChange={(event) =>
                    updateItem(item.rowId, {
                      daysPerWeek: Number(event.target.value),
                    })
                  }
                />
              </Field>
              <Button
                type="button"
                variant="ghost"
                className="self-end"
                disabled={busy || items.length === 1}
                onClick={() => {
                  setItems((previous) =>
                    previous.filter((candidate) => candidate.rowId !== item.rowId)
                  );
                  invalidateStored();
                }}
                aria-label={`Remove exercise ${index + 1}`}
              >
                <Icon name="close" width={16} height={16} />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy || items.length >= 20}
            onClick={() => {
              setItems((previous) => [...previous, emptyItem()]);
              invalidateStored();
            }}
          >
            Add exercise
          </Button>
        </div>

        <div className="space-y-3 rounded-xl border border-[var(--color-border)] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={stored?.status === "published" ? "success" : "warn"}>
              {stored
                ? `Prescription v${stored.version} · ${stored.status}`
                : "Unsaved prescription"}
            </Badge>
            {currentlyPublished && (
              <Badge tone="success">
                Current patient version: {currentlyPublished.version}
              </Badge>
            )}
          </div>
          {!stored ? (
            <Button onClick={saveDraft} disabled={busy || !safetyCleared}>
              {busy ? "Saving…" : "Save prescription draft"}
            </Button>
          ) : stored.status === "draft" ? (
            <div className="space-y-3">
              <label className="flex items-start gap-3 text-sm text-[var(--color-ink-soft)]">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={publishConfirmed}
                  disabled={busy}
                  onChange={(event) => setPublishConfirmed(event.target.checked)}
                />
                <span>
                  I verified each exercise, dosage, schedule, precaution, stop
                  rule and review date against the patient record. Publishing
                  will revoke the previous patient-visible version.
                </span>
              </label>
              <Button
                onClick={publish}
                disabled={busy || !publishConfirmed || !safetyCleared}
              >
                {busy ? "Publishing…" : "Publish to patient portal"}
              </Button>
            </div>
          ) : (
            <p role="status" className="text-sm text-[var(--color-success)]">
              This version is now patient-visible. The portal will load it on refresh.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {error}
            </p>
          )}
        </div>

        {historyLoading ? (
          <Spinner label="Loading prescription history…" />
        ) : scopedHistory.error ? (
          <div role="alert" className="space-y-2 text-sm text-[var(--color-danger)]">
            <p>{scopedHistory.error}</p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setHistoryRetry((value) => value + 1)}
            >
              Retry
            </Button>
          </div>
        ) : scopedHistory.records.length > 0 ? (
          <div className="space-y-3 border-t border-[var(--color-border)] pt-4">
            <h4 className="text-sm font-semibold text-[var(--color-ink)]">
              Prescription history
            </h4>
            {scopedHistory.records.map((record) => (
              <div key={record.id} className="flex flex-wrap items-center gap-2 text-xs">
                <span>Version {record.version}</span>
                <Badge
                  tone={
                    record.status === "published"
                      ? "success"
                      : record.status === "revoked"
                        ? "neutral"
                        : "warn"
                  }
                >
                  {record.status}
                </Badge>
                <span className="text-[var(--color-ink-faint)]">
                  {record.items.length} exercise(s) · {new Date(record.createdAt).toLocaleString()}
                </span>
              </div>
            ))}

            {currentlyPublished && (
              <div className="space-y-2 rounded-xl bg-[var(--color-danger-soft)] p-3">
                <label className="flex items-start gap-3 text-xs text-[var(--color-danger)]">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={revokeConfirmed}
                    disabled={busy}
                    onChange={(event) => setRevokeConfirmed(event.target.checked)}
                  />
                  <span>
                    I intend to stop the current patient-visible prescription.
                    The patient will have no active published program after revocation.
                  </span>
                </label>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={busy || !revokeConfirmed}
                  onClick={revokeCurrent}
                >
                  Revoke current prescription
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
