"use client";

import { DateInput } from "@/components/ui/DateInput";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Misc";
import { exerciseFa } from "@/lib/data/exerciseFa";
import { exercises } from "@/lib/data/exercises";
import { withExercise, withPatch } from "@/lib/clinical/exercisePrefill";
import { addPhaseExercises, type PhasePrefillResult } from "@/lib/clinical/protocolPrefill";
import {
  ALTERNATE_DAYS,
  EVERY_DAY,
  WEEK_ORDER_EN,
  WEEK_ORDER_FA,
  defaultPrecautions,
  defaultStopRules,
  defaultWeekdays,
} from "@/lib/clinical/scheduleDefaults";
import { protocolById, protocols } from "@/lib/clinical/protocols";
import { localizeExercise } from "@/lib/data/exerciseLibraryFa";
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
import {
  LOAD_TYPES,
  SIDES,
  describeDosage,
  dosagePayload,
  loadTypeLabel,
  sideLabel,
  validateDosage,
  type LoadType,
  type Side,
} from "@/lib/clinical/dosage";

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

/** A newly chosen exercise gets a starting schedule if it has none yet. */
function withDefaultDays(item: DraftItem): DraftItem {
  if (!item.exerciseId || item.scheduledWeekdays.length > 0) return item;
  const exercise = exercises.find((candidate) => candidate.id === item.exerciseId);
  const days = defaultWeekdays(exercise?.category);
  return { ...item, scheduledWeekdays: days, daysPerWeek: days.length };
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
        // Only reviewed exercises with an active catalog row can be prescribed.
        .filter((exercise) => exercise.review === "approved" && Boolean(exerciseFa[exercise.id]))
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
  // Patient-facing text is Persian; the defaults are editable starting text.
  const [precautions, setPrecautions] = useState(() => defaultPrecautions("fa"));
  // Rendered only after client-side data loads, so the browser timezone is a
  // safe, editable default (Asia/Tehran for clinics in Iran).
  const [scheduleTimezone, setScheduleTimezone] = useState(() =>
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "" : ""
  );
  const [stopRules, setStopRules] = useState(() => defaultStopRules("fa"));
  // "Start from this phase" on a protocol page links here with ?protocol=&phase=.
  const searchParams = useSearchParams();
  const [protocolChoice, setProtocolChoice] = useState(() => {
    const protocol = protocolById(searchParams.get("protocol") ?? "");
    const phase = protocol?.phases.find((candidate) => candidate.id === searchParams.get("phase"));
    return { protocol: protocol?.id ?? "", phase: phase?.id ?? "" };
  });
  // Arriving from a protocol phase, its reviewed exercises are already in the
  // draft with their starting dose and schedule; nothing is saved yet.
  const [initialPrefill] = useState(() => {
    const protocol = protocolById(protocolChoice.protocol);
    const phase = protocol?.phases.find((candidate) => candidate.id === protocolChoice.phase);
    if (!phase) return null;
    const result = addPhaseExercises([emptyItem()], phase.exercises, patientReadyExercises, emptyItem);
    return { ...result, items: result.items.map(withDefaultDays) };
  });
  const [items, setItems] = useState<DraftItem[]>(() => initialPrefill?.items ?? [emptyItem()]);
  const [phaseResult, setPhaseResult] = useState<PhasePrefillResult<DraftItem> | null>(initialPrefill);
  const protocolOptions = useMemo(
    () => [...protocols].sort((a, b) => Number(b.region === region) - Number(a.region === region)),
    [region]
  );
  const chosenProtocol = protocolById(protocolChoice.protocol);
  const chosenPhase = chosenProtocol?.phases.find((phase) => phase.id === protocolChoice.phase);
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

  function applyPhase() {
    if (!chosenPhase) return;
    const result = addPhaseExercises(items, chosenPhase.exercises, patientReadyExercises, emptyItem);
    setItems(result.items.map(withDefaultDays));
    setPhaseResult(result);
    invalidateStored();
  }

  const exerciseNames = (ids: string[]) =>
    ids
      .map((id) => {
        const exercise = exercises.find((candidate) => candidate.id === id);
        return exercise ? localizeExercise(exercise, locale).name : id;
      })
      .join(locale === "fa" ? "، " : ", ");

  function updateItem(rowId: string, patch: Partial<DraftItem>) {
    setItems((previous) =>
      previous.map((item) => (item.rowId === rowId ? withPatch(item, patch) : item))
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
    for (const [index, item] of items.entries()) {
      const detailError = validateDosage(item);
      if (detailError) return t.errDetails[detailError](index + 1);
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
      items: items.map((item) => ({
        targetSets: item.targetSets,
        targetReps: item.targetReps,
        targetDurationSeconds: item.targetDurationSeconds,
        scheduledWeekdays: item.scheduledWeekdays,
        exerciseId: item.exerciseId,
        dosageFa: item.dosageFa.trim(),
        daysPerWeek: item.daysPerWeek,
        ...dosagePayload(item),
      })),
    });
    setBusy(false);
    if (!result) {
      setError(t.saveFailed);
      return;
    }
    setStored(result);
    setHistoryRetry((value) => value + 1);
    return result;
  }

  // Usual case in one step: the clinician ticks the publish statement, then
  // the version is saved and published. The database steps stay separate, so
  // a failed publish leaves a saved draft that can be published later.
  async function saveAndPublish() {
    if (busy || !publishConfirmed) return;
    const saved = stored?.status === "draft" ? stored : await saveDraft();
    if (!saved) return;
    setBusy(true);
    setError(null);
    const result = await publishPrescription(saved.id);
    setBusy(false);
    if (!result) {
      setError(t.publishBlocked);
      return;
    }
    setStored(result);
    setPublishConfirmed(false);
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
        <section
          aria-labelledby="from-protocol"
          className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="from-protocol" className="text-sm font-semibold text-[var(--color-ink)]">{t.fromProtocol}</h3>
            {chosenProtocol && (
              <Link href={`/protocols/${chosenProtocol.id}`} className="text-xs font-medium text-[var(--color-primary-strong)] underline">
                {t.viewProtocol}
              </Link>
            )}
          </div>
          <p className="text-xs leading-relaxed text-[var(--color-ink-soft)]">{t.fromProtocolHint}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <Field label={t.protocol}>
              <Select
                value={protocolChoice.protocol}
                disabled={busy}
                onChange={(event) => {
                  setProtocolChoice({ protocol: event.target.value, phase: "" });
                  setPhaseResult(null);
                }}
              >
                <option value="">{t.choose}</option>
                {protocolOptions.map((protocol) => (
                  <option key={protocol.id} value={protocol.id}>
                    {locale === "fa" ? protocol.title.fa : protocol.title.en}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t.phase}>
              <Select
                value={protocolChoice.phase}
                disabled={busy || !chosenProtocol}
                onChange={(event) => {
                  setProtocolChoice((previous) => ({ ...previous, phase: event.target.value }));
                  setPhaseResult(null);
                }}
              >
                <option value="">{t.choose}</option>
                {chosenProtocol?.phases.map((phase, index) => (
                  <option key={phase.id} value={phase.id}>
                    {(index + 1).toLocaleString(intlLocale(locale))}. {locale === "fa" ? phase.name.fa : phase.name.en}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="button" variant="secondary" disabled={busy || !chosenPhase} onClick={applyPhase}>
              {t.addPhase}
            </Button>
          </div>
          {phaseResult && (
            <div role="status" className="space-y-1 text-xs leading-relaxed">
              <p className="font-medium text-[var(--color-ink)]">
                {phaseResult.added.length > 0 ? t.phaseAdded(phaseResult.added.length) : t.phaseNoneAdded}
              </p>
              {phaseResult.pending.length > 0 && (
                <p className="text-[var(--color-warn)]">{t.phasePending(exerciseNames(phaseResult.pending))}</p>
              )}
              {phaseResult.already.length > 0 && (
                <p className="text-[var(--color-ink-soft)]">{t.phaseAlready(exerciseNames(phaseResult.already))}</p>
              )}
              {phaseResult.overLimit.length > 0 && (
                <p className="text-[var(--color-warn)]">{t.phaseOverLimit(exerciseNames(phaseResult.overLimit))}</p>
              )}
            </div>
          )}
        </section>

        <div className="space-y-3">
          {items.map((item, index) => (
            <div
              key={item.rowId}
              className="relative grid grid-cols-1 gap-3 rounded-xl border border-[var(--color-border)] p-3 pe-12 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_13rem]"
            >
              <Button
                type="button"
                variant="ghost"
                className="absolute end-2 top-2 h-9 w-9 !p-0"
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
              <Field label={t.exercise(index + 1)} required>
                <Select
                  value={item.exerciseId}
                  disabled={busy}
                  onChange={(event) => {
                    const exercise = patientReadyExercises.find((candidate) => candidate.id === event.target.value);
                    setItems((previous) =>
                      previous.map((row) => (row.rowId === item.rowId ? withDefaultDays(withExercise(row, exercise)) : row))
                    );
                    invalidateStored();
                  }}
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
                </Field> : <div className="grid grid-cols-2 gap-2">
                  <Field label={t.sets} required><Input type="number" min={1} max={50} value={item.targetSets ?? ""} disabled={busy}
                    onChange={(event) => updateItem(item.rowId, { targetSets: Number(event.target.value) })} /></Field>
                  <Field label={t.reps} required><Input type="number" min={1} max={1000} value={item.targetReps ?? ""} disabled={busy}
                    onChange={(event) => updateItem(item.rowId, { targetReps: Number(event.target.value) })} /></Field>
                </div>}
              </div>
              <fieldset className="sm:col-span-3">
                <legend className="mb-1.5 text-sm font-medium text-[var(--color-ink)]">{t.days}</legend>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(locale === "fa" ? WEEK_ORDER_FA : WEEK_ORDER_EN).map((day) => {
                    const on = item.scheduledWeekdays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        aria-pressed={on}
                        disabled={busy}
                        onClick={() => {
                          const days = on
                            ? item.scheduledWeekdays.filter((value) => value !== day)
                            : [...item.scheduledWeekdays, day].sort();
                          updateItem(item.rowId, { scheduledWeekdays: days, daysPerWeek: days.length });
                        }}
                        className={`min-h-9 rounded-full border px-3 text-sm transition-colors ${
                          on
                            ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                            : "border-[var(--color-border)] bg-white text-[var(--color-ink-soft)] hover:border-[var(--color-primary)]"
                        }`}
                      >
                        {t.weekdays[day]}
                      </button>
                    );
                  })}
                  <span className="mx-1 h-5 w-px bg-[var(--color-border)]" aria-hidden="true" />
                  {[
                    { label: t.everyDay, days: EVERY_DAY },
                    { label: t.alternateDays, days: ALTERNATE_DAYS },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      disabled={busy}
                      onClick={() => updateItem(item.rowId, { scheduledWeekdays: [...preset.days], daysPerWeek: preset.days.length })}
                      className="min-h-9 rounded-full px-3 text-sm font-medium text-[var(--color-primary-strong)] hover:bg-[var(--color-primary-tint)]"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <DosageDetailsFields
                item={item}
                busy={busy}
                onChange={(patch) => updateItem(item.rowId, patch)}
              />
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

        <section aria-labelledby="rx-schedule" className="space-y-4 border-t border-[var(--color-border)] pt-5">
          <h3 id="rx-schedule" className="text-sm font-semibold text-[var(--color-ink)]">{t.scheduleSafety}</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t.startDate} required>
            <DateInput
              value={startDate}
              disabled={busy}
              onChange={(event) => {
                setStartDate(event.target.value);
                invalidateStored();
              }}
            />
          </Field>
          <Field label={t.reviewDate} required>
            <DateInput
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
            hint={t.defaultTextHint}
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
          <Field label={t.stopRules} required hint={t.defaultTextHint}>
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

          <details className="rounded-xl bg-[var(--color-surface-muted)] px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-[var(--color-ink)]">{t.moreSettings}</summary>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t.endDate}>
            <DateInput
              min={startDate}
              value={endDate}
              disabled={busy}
              onChange={(event) => {
                setEndDate(event.target.value);
                invalidateStored();
              }}
            />
          </Field>
        <Field label={t.timezone} required hint={t.timezoneHint}>
          <Input value={scheduleTimezone} disabled={busy} placeholder="Asia/Tehran" dir="ltr"
            onChange={(event) => { setScheduleTimezone(event.target.value); invalidateStored(); }} />
        </Field>
            </div>
          </details>
        </section>

        <div className="space-y-3 rounded-xl border border-[var(--color-primary)]/30 bg-[var(--color-primary-tint)] p-4">
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
          {stored?.status === "published" ? (
            <p role="status" className="text-sm font-medium text-[var(--color-success)]">
              {t.published}
            </p>
          ) : (
            <div className="space-y-3">
              <label className="flex items-start gap-3 text-sm text-[var(--color-ink-soft)]">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={publishConfirmed}
                  disabled={busy}
                  onChange={(event) => setPublishConfirmed(event.target.checked)}
                />
                <span>{t.publishAttest}</span>
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={saveAndPublish}
                  disabled={busy || !publishConfirmed || !safetyCleared}
                >
                  <Icon name="check" width={16} height={16} />
                  {busy ? t.publishing : t.publishNow}
                </Button>
                {!stored && (
                  <Button variant="ghost" onClick={() => void saveDraft()} disabled={busy || !safetyCleared}>
                    {t.saveDraftOnly}
                  </Button>
                )}
              </div>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {error}
            </p>
          )}
        </div>

        <details className="rounded-xl border border-[var(--color-border)] px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-[var(--color-ink)]">
            {historyLoading ? t.history : t.historyCount(scopedHistory.records.length)}
          </summary>
          <div className="mt-2">
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
          <div className="space-y-3">
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
          </div>
        </details>
      </CardBody>
    </Card>
  );
}

function numberOrUndefined(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const latin = trimmed.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  const number = Number(latin);
  return Number.isFinite(number) ? number : NaN;
}

function DosageDetailsFields({
  item,
  busy,
  onChange,
}: {
  item: DraftItem;
  busy: boolean;
  onChange: (patch: Partial<DraftItem>) => void;
}) {
  const t = useText(prescriptionText);
  const { locale } = useLocale();
  const lang = locale === "fa" ? "fa" : "en";
  const summary = describeDosage(item, "fa");
  const hasDetails = [item.holdSeconds, item.restSeconds, item.loadType, item.targetRpe,
    item.painLimit, item.tempo, item.side, item.timesPerDay, item.clinicianNote]
    .some((value) => value !== undefined && value !== "");
  const num = (label: string, key: "holdSeconds" | "restSeconds" | "timesPerDay", min: number, max: number) => (
    <Field label={label}>
      <Input type="number" inputMode="numeric" min={min} max={max} dir="ltr" disabled={busy}
        value={item[key] === undefined || Number.isNaN(item[key]) ? "" : String(item[key])}
        onChange={(event) => onChange({ [key]: numberOrUndefined(event.target.value) })} />
    </Field>
  );
  const scale = (label: string, key: "targetRpe" | "painLimit", min: number) => (
    <Field label={label}>
      <Select value={item[key] === undefined ? "" : String(item[key])} disabled={busy}
        onChange={(event) => onChange({ [key]: event.target.value === "" ? undefined : Number(event.target.value) })}>
        <option value="">{t.notSpecified}</option>
        {Array.from({ length: 11 - min }, (_, i) => i + min).map((value) => (
          <option key={value} value={value}>{lang === "fa" ? value.toLocaleString("fa-IR") : value}</option>
        ))}
      </Select>
    </Field>
  );
  return (
    <details className="rounded-lg bg-[var(--color-surface-muted)] px-3 py-2 sm:col-span-3" open={hasDetails || undefined}>
      <summary className="cursor-pointer text-sm font-medium text-[var(--color-ink)]">
        {t.details} <span className="text-xs font-normal text-[var(--color-ink-faint)]">({t.detailsHint})</span>
      </summary>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {num(t.holdSeconds, "holdSeconds", 1, 300)}
        {num(t.restSeconds, "restSeconds", 0, 600)}
        {num(t.timesPerDay, "timesPerDay", 1, 12)}
        <Field label={t.loadType}>
          <Select value={item.loadType ?? ""} disabled={busy}
            onChange={(event) => onChange({ loadType: (event.target.value || undefined) as LoadType | undefined })}>
            <option value="">{t.notSpecified}</option>
            {LOAD_TYPES.map((type) => <option key={type} value={type}>{loadTypeLabel(type, lang)}</option>)}
          </Select>
        </Field>
        <Field label={t.loadDetail}>
          <Input value={item.loadDetail ?? ""} maxLength={80} disabled={busy || !item.loadType} dir="auto"
            placeholder={t.loadDetailPlaceholder}
            onChange={(event) => onChange({ loadDetail: event.target.value })} />
        </Field>
        <Field label={t.side}>
          <Select value={item.side ?? ""} disabled={busy}
            onChange={(event) => onChange({ side: (event.target.value || undefined) as Side | undefined })}>
            <option value="">{t.notSpecified}</option>
            {SIDES.map((side) => <option key={side} value={side}>{sideLabel(side, lang)}</option>)}
          </Select>
        </Field>
        {scale(t.targetRpe, "targetRpe", 1)}
        {scale(t.painLimit, "painLimit", 0)}
        <Field label={t.tempo}>
          <Input value={item.tempo ?? ""} maxLength={11} dir="ltr" disabled={busy} placeholder={t.tempoPlaceholder}
            onChange={(event) => onChange({ tempo: event.target.value })} />
        </Field>
        <div className="sm:col-span-3">
          <Field label={t.clinicianNote}>
            <Input value={item.clinicianNote ?? ""} maxLength={300} dir="auto" disabled={busy}
              placeholder={t.clinicianNotePlaceholder}
              onChange={(event) => onChange({ clinicianNote: event.target.value })} />
          </Field>
        </div>
      </div>
      {summary.length > 0 && (
        <p className="mt-3 text-xs text-[var(--color-ink-soft)]" dir="rtl">
          <span className="font-semibold">{t.patientSees}: </span>
          {summary.join(" · ")}
        </p>
      )}
    </details>
  );
}
