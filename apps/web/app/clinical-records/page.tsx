"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, PageIntro, Spinner } from "@/components/ui/Misc";
import { isMockMode } from "@/lib/config";
import { useAuth } from "@/lib/store/AuthContext";
import {
  appendClinicalSessionNote,
  fetchClinicalDocumentation,
  fetchOutcomeInstruments,
  fetchPatientRegistry,
  recordOutcomeMeasurement,
} from "@/lib/supabase/db";
import type {
  ClinicalDocumentation,
  ClinicalSessionNote,
  OutcomeInstrument,
  OutcomeMeasurement,
  PatientRegistryItem,
} from "@/lib/types";
import { useLocale } from "@/lib/store/LocaleContext";
import { intlLocale, useText } from "@/lib/i18n/text";
import { clinicalRecordsText } from "./text";

function localDateTimeInput(value = new Date()): string {
  const adjusted = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 16);
}

function localDateInput(value = new Date()): string {
  const adjusted = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 10);
}

function formatDateTime(value: string, locale: string, unknown: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? unknown
    : parsed.toLocaleString(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

const emptyDocumentation: ClinicalDocumentation = {
  sessionNotes: [],
  outcomeMeasurements: [],
};

const emptySessionForm = () => ({
  occurredAt: localDateTimeInput(),
  subjective: "",
  objective: "",
  interventions: "",
  response: "",
  plan: "",
  supersedesId: null as string | null,
  correctionReason: "",
});

const emptyOutcomeForm = () => ({
  instrumentKey: "",
  score: "",
  measuredAt: localDateInput(),
  notes: "",
  supersedesId: null as string | null,
  correctionReason: "",
});

export default function ClinicalRecordsPage() {
  const { profile, activeClinicId } = useAuth();
  const t = useText(clinicalRecordsText);
  const { locale } = useLocale();
  const canAccess =
    profile?.role === "clinic_owner" || profile?.role === "therapist";
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [patients, setPatients] = useState<PatientRegistryItem[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [patientsError, setPatientsError] = useState(false);
  const [patientRetryToken, setPatientRetryToken] = useState(0);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [documentation, setDocumentation] =
    useState<ClinicalDocumentation>(emptyDocumentation);
  const [instruments, setInstruments] = useState<OutcomeInstrument[]>([]);
  const [instrumentsLoading, setInstrumentsLoading] = useState(!isMockMode);
  const [instrumentsError, setInstrumentsError] = useState(false);
  const [instrumentRetryToken, setInstrumentRetryToken] = useState(0);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [sessionForm, setSessionForm] = useState(emptySessionForm);
  const [outcomeForm, setOutcomeForm] = useState(emptyOutcomeForm);
  const [submitting, setSubmitting] = useState<"session" | "outcome" | null>(
    null
  );
  const [feedback, setFeedback] = useState<string | null>(null);
  const scopeRef = useRef(`${profile?.id ?? "none"}:${activeClinicId ?? "none"}`);

  useEffect(() => {
    scopeRef.current = `${profile?.id ?? "none"}:${activeClinicId ?? "none"}`;
  }, [profile?.id, activeClinicId]);

  useEffect(() => {
    if (isMockMode || !canAccess || !activeClinicId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear tenant-scoped UI before the asynchronous RLS query returns
    setPatients([]);
    setSelectedPatientId("");
    setPatientsLoading(true);
    setPatientsError(false);
    fetchPatientRegistry({
      clinicId: activeClinicId,
      search: submittedSearch,
      page: 1,
      pageSize: 50,
    }).then((result) => {
      if (cancelled) return;
      setPatients(result?.patients ?? []);
      setPatientsError(result === null);
      setPatientsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [activeClinicId, canAccess, submittedSearch, patientRetryToken]);

  useEffect(() => {
    if (isMockMode || !canAccess) return;
    let cancelled = false;
    fetchOutcomeInstruments().then((rows) => {
      if (cancelled) return;
      setInstruments(rows ?? []);
      setInstrumentsError(rows === null);
      setInstrumentsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [canAccess, instrumentRetryToken]);

  const selectedPatient = useMemo(
    () => patients.find((patient) => patient.id === selectedPatientId) ?? null,
    [patients, selectedPatientId]
  );
  const selectedEpisode =
    selectedPatient?.activeEpisode ?? selectedPatient?.latestEpisode ?? null;

  useEffect(() => {
    const episodeId = selectedEpisode?.id;
    if (isMockMode || !episodeId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a patient switch must synchronously hide the previous episode's PHI
      setDocumentation(emptyDocumentation);
      setRecordsError(false);
      return;
    }
    let cancelled = false;
    setDocumentation(emptyDocumentation);
    setRecordsLoading(true);
    setRecordsError(false);
    fetchClinicalDocumentation(episodeId).then((rows) => {
      if (cancelled) return;
      setDocumentation(rows ?? emptyDocumentation);
      setRecordsError(rows === null);
      setRecordsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedEpisode?.id, refreshToken]);

  const hasUnsavedSessionDraft =
    [
      sessionForm.subjective,
      sessionForm.objective,
      sessionForm.interventions,
      sessionForm.response,
      sessionForm.plan,
      sessionForm.correctionReason,
    ].some((value) => value.trim().length > 0) ||
    Boolean(sessionForm.supersedesId);
  const hasUnsavedOutcomeDraft =
    [
      outcomeForm.instrumentKey,
      outcomeForm.score,
      outcomeForm.notes,
      outcomeForm.correctionReason,
    ].some((value) => value.trim().length > 0) ||
    Boolean(outcomeForm.supersedesId);
  const hasUnsavedClinicalDraft =
    hasUnsavedSessionDraft || hasUnsavedOutcomeDraft;

  function confirmDiscardDraft(): boolean {
    return (
      !hasUnsavedClinicalDraft ||
      window.confirm(
        t.discardConfirm
      )
    );
  }

  function clearClinicalDrafts() {
    setSessionForm(emptySessionForm());
    setOutcomeForm(emptyOutcomeForm());
  }

  function selectPatient(patientId: string) {
    if (patientId === selectedPatientId) return;
    if (!confirmDiscardDraft()) return;
    setSelectedPatientId(patientId);
    clearClinicalDrafts();
    setFeedback(null);
  }

  function submitPatientSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmDiscardDraft()) return;
    clearClinicalDrafts();
    setFeedback(null);
    setSubmittedSearch(search.trim());
    setPatientRetryToken((value) => value + 1);
  }

  function retryInstrumentCatalog() {
    setInstruments([]);
    setInstrumentsLoading(true);
    setInstrumentsError(false);
    setInstrumentRetryToken((value) => value + 1);
  }

  async function saveSession(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedEpisode || submitting) return;
    const scope = scopeRef.current;
    const hasContent = [
      sessionForm.subjective,
      sessionForm.objective,
      sessionForm.interventions,
      sessionForm.response,
      sessionForm.plan,
    ].some((value) => value.trim().length > 0);
    if (
      !hasContent ||
      (sessionForm.supersedesId &&
        sessionForm.correctionReason.trim().length < 3)
    ) {
      setFeedback(t.needContent);
      return;
    }
    const occurredAt = new Date(sessionForm.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) {
      setFeedback(t.invalidTime);
      return;
    }
    setSubmitting("session");
    setFeedback(null);
    const ok = await appendClinicalSessionNote({
      episodeId: selectedEpisode.id,
      occurredAt: occurredAt.toISOString(),
      subjective: sessionForm.subjective,
      objective: sessionForm.objective,
      interventions: sessionForm.interventions,
      response: sessionForm.response,
      plan: sessionForm.plan,
      supersedesId: sessionForm.supersedesId,
      correctionReason: sessionForm.supersedesId
        ? sessionForm.correctionReason
        : null,
    });
    setSubmitting(null);
    if (scopeRef.current !== scope) return;
    if (!ok) {
      setFeedback(t.sessionFailed);
      return;
    }
    setSessionForm(emptySessionForm());
    setFeedback(t.sessionSaved);
    setRefreshToken((value) => value + 1);
  }

  async function saveOutcome(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedEpisode || submitting) return;
    const scope = scopeRef.current;
    const instrument = instruments.find(
      (candidate) => candidate.key === outcomeForm.instrumentKey
    );
    const score = Number(outcomeForm.score);
    if (
      !instrument ||
      !Number.isFinite(score) ||
      score < instrument.scoreMin ||
      score > instrument.scoreMax ||
      (outcomeForm.supersedesId &&
        outcomeForm.correctionReason.trim().length < 3)
    ) {
      setFeedback(t.outcomeInvalid);
      return;
    }
    setSubmitting("outcome");
    setFeedback(null);
    const ok = await recordOutcomeMeasurement({
      episodeId: selectedEpisode.id,
      instrumentKey: instrument.key,
      score,
      measuredAt: outcomeForm.measuredAt,
      notes: outcomeForm.notes,
      supersedesId: outcomeForm.supersedesId,
      correctionReason: outcomeForm.supersedesId
        ? outcomeForm.correctionReason
        : null,
    });
    setSubmitting(null);
    if (scopeRef.current !== scope) return;
    if (!ok) {
      setFeedback(t.outcomeFailed);
      return;
    }
    setOutcomeForm(emptyOutcomeForm());
    setFeedback(t.outcomeSaved);
    setRefreshToken((value) => value + 1);
  }

  function correctSession(note: ClinicalSessionNote) {
    if (
      hasUnsavedSessionDraft &&
      !window.confirm(
        t.replaceSession
      )
    ) {
      return;
    }
    setSessionForm({
      occurredAt: localDateTimeInput(new Date(note.occurredAt)),
      subjective: note.subjective,
      objective: note.objective,
      interventions: note.interventions,
      response: note.response,
      plan: note.plan,
      supersedesId: note.id,
      correctionReason: "",
    });
    setFeedback(t.correctionMode);
  }

  function correctOutcome(measurement: OutcomeMeasurement) {
    if (
      hasUnsavedOutcomeDraft &&
      !window.confirm(
        t.replaceOutcome
      )
    ) {
      return;
    }
    setOutcomeForm({
      instrumentKey: measurement.instrumentKey,
      score: String(measurement.score),
      measuredAt: measurement.measuredAt,
      notes: measurement.notes ?? "",
      supersedesId: measurement.id,
      correctionReason: "",
    });
    setFeedback(t.correctionMode);
  }

  if (isMockMode) {
    return (
      <div className="space-y-6">
        <PageIntro
          title={t.title}
          description={t.demoIntro}
        />
        <EmptyState
          icon="new-case"
          title={t.demoTitle}
          description={t.demoBody}
        />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="space-y-6">
        <PageIntro title={t.title} description={t.shortIntro} />
        <EmptyState
          icon="shield"
          title={t.accessTitle}
          description={t.accessBody}
        />
      </div>
    );
  }

  if (!activeClinicId) {
    return (
      <div className="space-y-6">
        <PageIntro title={t.title} description={t.shortIntro} />
        <EmptyState
          icon="search"
          title={t.clinicTitle}
          description={t.clinicBody}
        />
      </div>
    );
  }

  const selectedInstrument = instruments.find(
    (instrument) => instrument.key === outcomeForm.instrumentKey
  );

  return (
    <div className="space-y-6">
      <PageIntro
        title={t.title}
        description={t.intro}
      />

      <Card>
        <CardHeader title={t.patientEpisode} icon={<Icon name="user" />} />
        <CardBody className="space-y-4">
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={submitPatientSearch}
          >
            <Input
              value={search}
              maxLength={80}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t.searchPlaceholder}
              aria-label={t.searchPlaceholder}
            />
            <Button type="submit" variant="secondary">
              <Icon name="search" width={15} height={15} /> {t.search}
            </Button>
          </form>
          {patientsLoading ? (
            <Spinner label={t.loadingPatients} />
          ) : patientsError ? (
            <div
              role="alert"
              className="rounded-xl border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]"
            >
              <p>
                {t.patientsFailed}
              </p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="mt-3"
                onClick={() => setPatientRetryToken((value) => value + 1)}
              >
                {t.retryPatients}
              </Button>
            </div>
          ) : (
            <Field
              label={t.patient}
              hint={t.patientHint}
            >
              <Select
                value={selectedPatientId}
                onChange={(event) => selectPatient(event.target.value)}
              >
                <option value="">{t.selectPatient}</option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.fullName} — {patient.activeEpisode?.titleFa ?? patient.latestEpisode?.titleFa ?? t.noEpisode}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {selectedPatient && (
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge tone="primary">{selectedPatient.fullName}</Badge>
              <Badge tone={selectedPatient.activeEpisode ? "success" : "neutral"}>
                {selectedPatient.activeEpisode ? t.activeEpisode : t.historicalEpisode}
              </Badge>
              {selectedEpisode && <Badge>{selectedEpisode.titleFa}</Badge>}
            </div>
          )}
        </CardBody>
      </Card>

      {!selectedEpisode ? (
        <EmptyState
          icon="new-case"
          title={t.chooseTitle}
          description={t.chooseBody}
        />
      ) : (
        <>
          {feedback && (
            <p role="status" className="rounded-xl bg-[var(--color-primary-tint)] px-4 py-3 text-sm text-[var(--color-ink-soft)]">
              {feedback}
            </p>
          )}

          <div className="grid gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader
                title={sessionForm.supersedesId ? t.correctSession : t.signSession}
                subtitle={t.sessionSubtitle}
                icon={<Icon name="new-case" />}
              />
              <CardBody>
                <form onSubmit={saveSession} className="space-y-3">
                  <Field label={t.sessionTime} required>
                    <Input
                      type="datetime-local"
                      value={sessionForm.occurredAt}
                      required
                      onChange={(event) =>
                        setSessionForm((current) => ({ ...current, occurredAt: event.target.value }))
                      }
                    />
                  </Field>
                  {(["subjective", "objective", "interventions", "response", "plan"] as const).map((field) => (
                    <Field key={field} label={t.fields[field]}>
                      <Textarea
                        value={sessionForm[field]}
                        maxLength={10000}
                        onChange={(event) =>
                          setSessionForm((current) => ({ ...current, [field]: event.target.value }))
                        }
                      />
                    </Field>
                  ))}
                  {sessionForm.supersedesId && (
                    <Field label={t.correctionReason} required>
                      <Input
                        value={sessionForm.correctionReason}
                        minLength={3}
                        maxLength={1000}
                        required
                        onChange={(event) =>
                          setSessionForm((current) => ({ ...current, correctionReason: event.target.value }))
                        }
                      />
                    </Field>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={submitting !== null}>
                      {submitting === "session" ? t.signing : t.appendNote}
                    </Button>
                    {sessionForm.supersedesId && (
                      <Button type="button" variant="secondary" onClick={() => setSessionForm(emptySessionForm())}>
                        {t.cancelCorrection}
                      </Button>
                    )}
                  </div>
                </form>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title={outcomeForm.supersedesId ? t.correctOutcome : t.recordOutcome}
                subtitle={t.outcomeSubtitle}
                icon={<Icon name="analysis" />}
              />
              <CardBody>
                <form onSubmit={saveOutcome} className="space-y-3">
                  {instrumentsError && (
                    <div
                      role="alert"
                      className="rounded-xl border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]"
                    >
                      <p>
                        {t.catalogFailed}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="mt-3"
                        onClick={retryInstrumentCatalog}
                      >
                        {t.retryCatalog}
                      </Button>
                    </div>
                  )}
                  {!instrumentsLoading &&
                    !instrumentsError &&
                    instruments.length === 0 && (
                      <p
                        role="alert"
                        className="rounded-xl bg-[var(--color-warn-soft)] px-4 py-3 text-sm text-[var(--color-warn)]"
                      >
                        {t.noInstruments}
                      </p>
                    )}
                  <Field label={t.instrument} required>
                    <Select
                      value={outcomeForm.instrumentKey}
                      disabled={
                        Boolean(outcomeForm.supersedesId) ||
                        instrumentsLoading ||
                        instrumentsError ||
                        instruments.length === 0
                      }
                      required
                      onChange={(event) =>
                        setOutcomeForm((current) => ({ ...current, instrumentKey: event.target.value, score: "" }))
                      }
                    >
                      <option value="">
                        {instrumentsLoading
                          ? t.loadingInstruments
                          : t.selectInstrument}
                      </option>
                      {instruments.map((instrument) => (
                        <option key={instrument.key} value={instrument.key}>
                          {instrument.displayName} v{instrument.version}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field
                      label={t.score}
                      hint={selectedInstrument ? `${selectedInstrument.scoreMin}–${selectedInstrument.scoreMax} ${selectedInstrument.unit}` : undefined}
                      required
                    >
                      <Input
                        type="number"
                        step="0.01"
                        min={selectedInstrument?.scoreMin}
                        max={selectedInstrument?.scoreMax}
                        value={outcomeForm.score}
                        required
                        onChange={(event) =>
                          setOutcomeForm((current) => ({ ...current, score: event.target.value }))
                        }
                      />
                    </Field>
                    <Field label={t.measuredDate} required>
                      <Input
                        type="date"
                        value={outcomeForm.measuredAt}
                        required
                        onChange={(event) =>
                          setOutcomeForm((current) => ({ ...current, measuredAt: event.target.value }))
                        }
                      />
                    </Field>
                  </div>
                  <Field label={t.clinicalNote}>
                    <Textarea
                      value={outcomeForm.notes}
                      maxLength={5000}
                      onChange={(event) =>
                        setOutcomeForm((current) => ({ ...current, notes: event.target.value }))
                      }
                    />
                  </Field>
                  {outcomeForm.supersedesId && (
                    <Field label={t.correctionReason} required>
                      <Input
                        value={outcomeForm.correctionReason}
                        minLength={3}
                        maxLength={1000}
                        required
                        onChange={(event) =>
                          setOutcomeForm((current) => ({ ...current, correctionReason: event.target.value }))
                        }
                      />
                    </Field>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="submit"
                      disabled={
                        submitting !== null ||
                        instrumentsLoading ||
                        instrumentsError ||
                        !selectedInstrument
                      }
                    >
                      {submitting === "outcome" ? t.signing : t.appendOutcome}
                    </Button>
                    {outcomeForm.supersedesId && (
                      <Button type="button" variant="secondary" onClick={() => setOutcomeForm(emptyOutcomeForm())}>
                        {t.cancelCorrection}
                      </Button>
                    )}
                  </div>
                </form>
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader title={t.timeline} icon={<Icon name="clock" />} />
            <CardBody className="space-y-6">
              {recordsLoading ? (
                <Spinner label={t.loadingDocs} />
              ) : recordsError ? (
                <div role="alert" className="text-sm text-[var(--color-danger)]">
                  <p>
                    {t.docsFailed}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="mt-3"
                    onClick={() => setRefreshToken((value) => value + 1)}
                  >
                    {t.retryTimeline}
                  </Button>
                </div>
              ) : documentation.sessionNotes.length === 0 &&
                documentation.outcomeMeasurements.length === 0 ? (
                <p className="text-sm text-[var(--color-ink-soft)]">{t.noDocs}</p>
              ) : (
                <div className="grid gap-6 lg:grid-cols-2">
                  <section>
                    <h2 className="mb-3 text-sm font-bold text-[var(--color-ink)]">{t.sessionNotes}</h2>
                    <ol className="space-y-3">
                      {documentation.sessionNotes.map((note) => (
                        <li key={note.id} className="rounded-xl border border-[var(--color-border)] p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <time className="text-xs text-[var(--color-ink-soft)]">{formatDateTime(note.occurredAt, intlLocale(locale), t.unknownDate)}</time>
                            <Badge tone={note.isCurrent ? "success" : "neutral"}>{note.isCurrent ? t.current : t.superseded}</Badge>
                          </div>
                          <dl className="mt-3 space-y-2 text-sm">
                            {(["subjective", "objective", "interventions", "response", "plan"] as const).map((field) => note[field] ? (
                              <div key={field}>
                                <dt className="text-xs font-semibold text-[var(--color-ink-faint)]">{t.fields[field]}</dt>
                                <dd className="whitespace-pre-wrap text-[var(--color-ink)]">{note[field]}</dd>
                              </div>
                            ) : null)}
                          </dl>
                          {note.correctionReason && <p className="mt-3 text-xs text-[var(--color-warn)]">{t.correction(note.correctionReason)}</p>}
                          {note.isCurrent && (
                            <Button className="mt-3" size="sm" variant="secondary" onClick={() => correctSession(note)}>
                              {t.createCorrection}
                            </Button>
                          )}
                        </li>
                      ))}
                    </ol>
                  </section>
                  <section>
                    <h2 className="mb-3 text-sm font-bold text-[var(--color-ink)]">{t.outcomes}</h2>
                    <ol className="space-y-3">
                      {documentation.outcomeMeasurements.map((measurement) => (
                        <li key={measurement.id} className="rounded-xl border border-[var(--color-border)] p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-[var(--color-ink)]">{measurement.instrumentName}</p>
                              <p className="text-xs text-[var(--color-ink-soft)]">{t.measuredVersion(measurement.measuredAt, measurement.instrumentVersion)}</p>
                            </div>
                            <Badge tone={measurement.isCurrent ? "primary" : "neutral"}>{measurement.score} {measurement.unit}</Badge>
                          </div>
                          <p className="mt-2 text-xs text-[var(--color-ink-soft)]">{t.range(measurement.scoreMin, measurement.scoreMax, t.directions[measurement.direction] ?? measurement.direction)}</p>
                          {measurement.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--color-ink)]">{measurement.notes}</p>}
                          {measurement.correctionReason && <p className="mt-2 text-xs text-[var(--color-warn)]">{t.correction(measurement.correctionReason)}</p>}
                          {measurement.isCurrent && (
                            <Button className="mt-3" size="sm" variant="secondary" onClick={() => correctOutcome(measurement)}>
                              {t.createCorrection}
                            </Button>
                          )}
                        </li>
                      ))}
                    </ol>
                  </section>
                </div>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
