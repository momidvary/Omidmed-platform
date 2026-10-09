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
import { useLocale } from "@/lib/store/LocaleContext";
import { intlLocale, useText } from "@/lib/i18n/text";
import { prescriptionText } from "./prescriptionText";

interface DraftItem extends PrescriptionItemInput {
  rowId: string;
  scheduledWeekdays: number[];
}

function plusDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localDateValue(date);
}

function emptyItem(): DraftItem {
  return { rowId: uid("rx"), exerciseId: "", dosageFa: "", daysPerWeek: 0, scheduledWeekdays: [] };
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
  const t = useText(prescriptionText);
  const { locale } = useLocale();
  const when = (value: string) => new Date(value).toLocaleString(intlLocale(locale));
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
  // Rendered only after client-side data loads, so the browser timezone is a
  // safe, editable default (Asia/Tehran for clinics in Iran).
  const [scheduleTimezone, setScheduleTimezone] = useState(() =>
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "" : ""
  );
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
            ? "load_failed"
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
    const integer = (value: number | undefined, max: number, min = 1) =>
      value !== undefined && Number.isInteger(value) && value >= min && value <= max;
    if (items.some((item) => item.targetDurationSeconds !== undefined
      ? !integer(item.targetDurationSeconds, 21600, 5)
      : !integer(item.targetSets, 50) || !integer(item.targetReps, 1000))) {
      return t.errTargets;
    }
    try {
      if (!scheduleTimezone.trim()) return t.errTimezone;
      new Intl.DateTimeFormat("en", { timeZone: scheduleTimezone.trim() });
    } catch {
      return t.errTimezoneInvalid;
    }
    if (!safetyCleared) return t.errSafety;
    if (!startDate || !reviewDate || reviewDate < startDate) {
      return t.errReviewDate;
    }
    if (endDate && endDate < startDate) {
      return t.errEndDate;
    }
    if (precautions.trim().length < 3) {
      return t.errPrecautions;
    }
    if (stopRules.trim().length < 3) {
      return t.errStopRules;
    }
    if (items.length < 1 || items.length > 20) {
      return t.errCount;
    }
    const ids = items.map((item) => item.exerciseId);
    if (ids.some((id) => !patientReadyExercises.some((exercise) => exercise.id === id))) {
      return t.errExercise;
    }
    if (new Set(ids).size !== ids.length) return t.errDuplicate;
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
      return t.errDosage;
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
      scheduleTimezone: scheduleTimezone.trim(),
      items: items.map(({ exerciseId, dosageFa, daysPerWeek, scheduledWeekdays, targetSets, targetReps, targetDurationSeconds }) => ({
        targetSets, targetReps, targetDurationSeconds,
        scheduledWeekdays,
        exerciseId,
        dosageFa: dosageFa.trim(),
        daysPerWeek,
      })),
    });
    setBusy(false);
    if (!result) {
      setError(t.saveFailed);
      return;
    }
    setStored(result);
    setHistoryRetry((value) => value + 1);
  }

  // Load a saved draft back into the form so it can be checked and
  // published after a reload or on another day.
  function openSavedDraft(record: PrescriptionRecord) {
    if (busy || record.status !== "draft") return;
    setStartDate(record.startDate);
    setEndDate(record.endDate ?? "");
    setReviewDate(record.reviewDate);
    setPrecautions(record.precautions);
    setStopRules(record.stopRules);
    setScheduleTimezone(record.scheduleTimezone ?? "");
    setItems(
      record.items.length > 0
        ? record.items.map((item) => ({
            ...item,
            rowId: uid("rx"),
            scheduledWeekdays: item.scheduledWeekdays ?? [],
          }))
        : [emptyItem()]
    );
    setStored({
      id: record.id,
      version: record.version,
      status: record.status,
      timestamp: record.createdAt,
    });
    setPublishConfirmed(false);
    setError(null);
  }

  async function publish() {
    if (busy || !stored || stored.status !== "draft" || !publishConfirmed) return;
    setBusy(true);
    setError(null);
    const result = await publishPrescription(stored.id);
    setBusy(false);
    if (!result) {
      setError(t.publishBlocked);
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
      setError(t.revokeFailed);
      return;
    }
    if (stored?.id === currentlyPublished.id) setStored(null);
    setRevokeConfirmed(false);
    setHistoryRetry((value) => value + 1);
  }

  return (
    <Card>
      <CardHeader
        title={t.title}
        subtitle={t.subtitle}
        icon={<Icon name="exercise" width={18} height={18} />}
      />
      <CardBody className="space-y-5">
        <Field label={t.timezone} required hint={t.timezoneHint}>
          <Input value={scheduleTimezone} disabled={busy} placeholder="Asia/Tehran" dir="ltr"
            onChange={(event) => { setScheduleTimezone(event.target.value); invalidateStored(); }} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={t.startDate} required>
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
          <Field label={t.endDate}>
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
          <Field label={t.reviewDate} required>
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
            label={t.precautions}
            required
            hint={t.precautionsHint}
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
          <Field label={t.stopRules} required hint={t.stopRulesHint}>
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
              <Field label={t.exercise(index + 1)} required>
                <Select
                  value={item.exerciseId}
                  disabled={busy}
                  onChange={(event) =>
                    updateItem(item.rowId, { exerciseId: event.target.value })
                  }
                >
                  <option value="">{t.select}</option>
                  {patientReadyExercises.map((exercise) => (
                    <option key={exercise.id} value={exercise.id}>
                      {locale === "fa"
                        ? `${exerciseFa[exercise.id].name} · ${exercise.name}`
                        : `${exercise.name} · ${exerciseFa[exercise.id].name}`}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t.dosage} required>
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
              <div className="space-y-2">
                <Field label={t.target} required>
                  <Select value={item.targetDurationSeconds === undefined ? "reps" : "duration"} disabled={busy}
                    onChange={(event) => updateItem(item.rowId, event.target.value === "duration"
                      ? { targetSets: undefined, targetReps: undefined, targetDurationSeconds: 0 }
                      : { targetSets: undefined, targetReps: undefined, targetDurationSeconds: undefined })}>
                    <option value="reps">{t.targetReps}</option><option value="duration">{t.targetDuration}</option>
                  </Select>
                </Field>
                {item.targetDurationSeconds !== undefined ? <Field label={t.totalSeconds} required>
                  <Input type="number" min={5} max={21600} value={item.targetDurationSeconds || ""} disabled={busy}
                    onChange={(event) => updateItem(item.rowId, { targetDurationSeconds: Number(event.target.value) })} />
                </Field> : <>
                  <Field label={t.sets} required><Input type="number" min={1} max={50} value={item.targetSets ?? ""} disabled={busy}
                    onChange={(event) => updateItem(item.rowId, { targetSets: Number(event.target.value) })} /></Field>
                  <Field label={t.reps} required><Input type="number" min={1} max={1000} value={item.targetReps ?? ""} disabled={busy}
                    onChange={(event) => updateItem(item.rowId, { targetReps: Number(event.target.value) })} /></Field>
                </>}
              </div>
              <fieldset className="space-y-1">
                <legend>{t.days}</legend>
                {t.weekdays.map((label, day) => (
                  <label key={day} className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={item.scheduledWeekdays.includes(day)} disabled={busy}
                      onChange={(event) => {
                        const days = event.target.checked ? [...item.scheduledWeekdays, day].sort() : item.scheduledWeekdays.filter((value) => value !== day);
                        updateItem(item.rowId, { scheduledWeekdays: days, daysPerWeek: days.length });
                      }} />{label}
                  </label>
                ))}
              </fieldset>
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
                aria-label={t.remove(index + 1)}
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
            {t.add}
          </Button>
        </div>

        <div className="space-y-3 rounded-xl border border-[var(--color-border)] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={stored?.status === "published" ? "success" : "warn"}>
              {stored
                ? t.versionStatus(stored.version, t.statuses[stored.status] ?? stored.status)
                : t.unsaved}
            </Badge>
            {currentlyPublished && (
              <Badge tone="success">
                {t.currentVersion(currentlyPublished.version)}
              </Badge>
            )}
          </div>
          {!stored ? (
            <Button onClick={saveDraft} disabled={busy || !safetyCleared}>
              {busy ? t.saving : t.save}
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
                  {t.publishAttest}
                </span>
              </label>
              <Button
                onClick={publish}
                disabled={busy || !publishConfirmed || !safetyCleared}
              >
                {busy ? t.publishing : t.publish}
              </Button>
            </div>
          ) : (
            <p role="status" className="text-sm text-[var(--color-success)]">
              {t.published}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {error}
            </p>
          )}
        </div>

        {historyLoading ? (
          <Spinner label={t.loadingHistory} />
        ) : scopedHistory.error ? (
          <div role="alert" className="space-y-2 text-sm text-[var(--color-danger)]">
            <p>{t.historyFailed}</p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setHistoryRetry((value) => value + 1)}
            >
              {t.retry}
            </Button>
          </div>
        ) : scopedHistory.records.length > 0 ? (
          <div className="space-y-3 border-t border-[var(--color-border)] pt-4">
            <h4 className="text-sm font-semibold text-[var(--color-ink)]">
              {t.history}
            </h4>
            {scopedHistory.records.map((record) => (
              <div key={record.id} className="flex flex-wrap items-center gap-2 text-xs">
                <span>{t.version(record.version)}</span>
                <span dir="ltr">{record.scheduleTimezone ?? t.legacySchedule}</span>
                <Badge
                  tone={
                    record.status === "published"
                      ? "success"
                      : record.status === "revoked"
                        ? "neutral"
                        : "warn"
                  }
                >
                  {t.statuses[record.status] ?? record.status}
                </Badge>
                <span className="text-[var(--color-ink-faint)]">
                  {t.itemsAt(record.items.length, when(record.createdAt))}
                </span>
                {record.status === "draft" &&
                  record.treatmentPlanId === treatmentPlanId &&
                  stored?.id !== record.id && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => openSavedDraft(record)}
                    >
                      {t.openForReview}
                    </Button>
                  )}
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
                    {t.revokeAttest}
                  </span>
                </label>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={busy || !revokeConfirmed}
                  onClick={revokeCurrent}
                >
                  {t.revoke}
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
