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

function localDateTimeInput(value = new Date()): string {
  const adjusted = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 16);
}

function localDateInput(value = new Date()): string {
  const adjusted = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 10);
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Unknown date"
    : parsed.toLocaleString("en-GB", {
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
        "Discard the unsaved clinical note or outcome draft before changing patient context?"
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
      setFeedback(
        "Enter clinical content; a correction also requires a reason."
      );
      return;
    }
    const occurredAt = new Date(sessionForm.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) {
      setFeedback("Choose a valid session date and time.");
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
      setFeedback(
        "Session note was not signed. Check assignment, content and connection; the draft remains here."
      );
      return;
    }
    setSessionForm(emptySessionForm());
    setFeedback("Signed session note appended to the record.");
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
      setFeedback("Choose a reviewed measure and enter a score in its range.");
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
      setFeedback(
        "Outcome was not signed. Check assignment, date and reviewed score range; the draft remains here."
      );
      return;
    }
    setOutcomeForm(emptyOutcomeForm());
    setFeedback("Versioned outcome measurement appended to the record.");
    setRefreshToken((value) => value + 1);
  }

  function correctSession(note: ClinicalSessionNote) {
    if (
      hasUnsavedSessionDraft &&
      !window.confirm(
        "Replace the unsaved session-note draft with this correction?"
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
    setFeedback("Correction mode: the signed original remains in history.");
  }

  function correctOutcome(measurement: OutcomeMeasurement) {
    if (
      hasUnsavedOutcomeDraft &&
      !window.confirm(
        "Replace the unsaved outcome-measure draft with this correction?"
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
    setFeedback("Correction mode: the signed original remains in history.");
  }

  if (isMockMode) {
    return (
      <div className="space-y-6">
        <PageIntro
          title="Clinical Records"
          description="Signed session notes and validated outcome measurements."
        />
        <EmptyState
          icon="new-case"
          title="No fabricated clinical documentation"
          description="This append-only workflow is available only with authenticated Supabase and migration 018. Demo mode does not invent signed notes or scores."
        />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="space-y-6">
        <PageIntro title="Clinical Records" description="Signed clinical documentation." />
        <EmptyState
          icon="shield"
          title="Clinical access required"
          description="Only clinic owners and assigned therapists can read or append this record."
        />
      </div>
    );
  }

  if (!activeClinicId) {
    return (
      <div className="space-y-6">
        <PageIntro title="Clinical Records" description="Signed clinical documentation." />
        <EmptyState
          icon="search"
          title="Select an active clinic"
          description="Choose the tenant before opening patient documentation."
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
        title="Clinical Records"
        description="Append-only session documentation and versioned, range-checked outcome measures. Corrections never overwrite the signed original."
      />

      <Card>
        <CardHeader title="Patient and care episode" icon={<Icon name="user" />} />
        <CardBody className="space-y-4">
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={submitPatientSearch}
          >
            <Input
              value={search}
              maxLength={80}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search patient name"
              aria-label="Search patient name"
            />
            <Button type="submit" variant="secondary">
              <Icon name="search" width={15} height={15} /> Search
            </Button>
          </form>
          {patientsLoading ? (
            <Spinner label="Loading authorized patients…" />
          ) : patientsError ? (
            <div
              role="alert"
              className="rounded-xl border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]"
            >
              <p>
                Patient list could not be loaded. This is not an empty registry;
                check the connection and retry.
              </p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="mt-3"
                onClick={() => setPatientRetryToken((value) => value + 1)}
              >
                Retry patient list
              </Button>
            </div>
          ) : (
            <Field
              label="Patient"
              hint="Only patients visible through the active clinic and current assignment are listed."
            >
              <Select
                value={selectedPatientId}
                onChange={(event) => selectPatient(event.target.value)}
              >
                <option value="">Select a patient</option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.fullName} — {patient.activeEpisode?.titleFa ?? patient.latestEpisode?.titleFa ?? "No episode"}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {selectedPatient && (
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge tone="primary">{selectedPatient.fullName}</Badge>
              <Badge tone={selectedPatient.activeEpisode ? "success" : "neutral"}>
                {selectedPatient.activeEpisode ? "active episode" : "historical episode"}
              </Badge>
              {selectedEpisode && <Badge>{selectedEpisode.titleFa}</Badge>}
            </div>
          )}
        </CardBody>
      </Card>

      {!selectedEpisode ? (
        <EmptyState
          icon="new-case"
          title="Choose a patient with a care episode"
          description="The signed timeline is scoped to one explicit episode."
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
                title={sessionForm.supersedesId ? "Correct session note" : "Sign session note"}
                subtitle="SOAP-style fields remain immutable after signing."
                icon={<Icon name="new-case" />}
              />
              <CardBody>
                <form onSubmit={saveSession} className="space-y-3">
                  <Field label="Session date and time" required>
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
                    <Field key={field} label={field[0].toUpperCase() + field.slice(1)}>
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
                    <Field label="Correction reason" required>
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
                      {submitting === "session" ? "Signing…" : "Append signed note"}
                    </Button>
                    {sessionForm.supersedesId && (
                      <Button type="button" variant="secondary" onClick={() => setSessionForm(emptySessionForm())}>
                        Cancel correction
                      </Button>
                    )}
                  </div>
                </form>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title={outcomeForm.supersedesId ? "Correct outcome" : "Record outcome"}
                subtitle="Instrument version, unit and scoring range are stamped by the database."
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
                        The reviewed outcome-measure catalog could not be loaded.
                        No score can be signed until it is available.
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="mt-3"
                        onClick={retryInstrumentCatalog}
                      >
                        Retry instrument catalog
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
                        No active reviewed outcome instruments are configured.
                        Ask the platform administrator to verify migration 018.
                      </p>
                    )}
                  <Field label="Reviewed instrument" required>
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
                          ? "Loading reviewed instruments…"
                          : "Select an instrument"}
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
                      label="Score"
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
                    <Field label="Measured date" required>
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
                  <Field label="Clinical note">
                    <Textarea
                      value={outcomeForm.notes}
                      maxLength={5000}
                      onChange={(event) =>
                        setOutcomeForm((current) => ({ ...current, notes: event.target.value }))
                      }
                    />
                  </Field>
                  {outcomeForm.supersedesId && (
                    <Field label="Correction reason" required>
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
                      {submitting === "outcome" ? "Signing…" : "Append outcome"}
                    </Button>
                    {outcomeForm.supersedesId && (
                      <Button type="button" variant="secondary" onClick={() => setOutcomeForm(emptyOutcomeForm())}>
                        Cancel correction
                      </Button>
                    )}
                  </div>
                </form>
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader title="Signed timeline" icon={<Icon name="clock" />} />
            <CardBody className="space-y-6">
              {recordsLoading ? (
                <Spinner label="Loading signed documentation…" />
              ) : recordsError ? (
                <div role="alert" className="text-sm text-[var(--color-danger)]">
                  <p>
                    Documentation could not be loaded. Existing rows are not
                    shown as current.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="mt-3"
                    onClick={() => setRefreshToken((value) => value + 1)}
                  >
                    Retry signed timeline
                  </Button>
                </div>
              ) : documentation.sessionNotes.length === 0 &&
                documentation.outcomeMeasurements.length === 0 ? (
                <p className="text-sm text-[var(--color-ink-soft)]">No signed documentation for this episode yet.</p>
              ) : (
                <div className="grid gap-6 lg:grid-cols-2">
                  <section>
                    <h2 className="mb-3 text-sm font-bold text-[var(--color-ink)]">Session notes</h2>
                    <ol className="space-y-3">
                      {documentation.sessionNotes.map((note) => (
                        <li key={note.id} className="rounded-xl border border-[var(--color-border)] p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <time className="text-xs text-[var(--color-ink-soft)]">{formatDateTime(note.occurredAt)}</time>
                            <Badge tone={note.isCurrent ? "success" : "neutral"}>{note.isCurrent ? "current" : "superseded"}</Badge>
                          </div>
                          <dl className="mt-3 space-y-2 text-sm">
                            {(["subjective", "objective", "interventions", "response", "plan"] as const).map((field) => note[field] ? (
                              <div key={field}>
                                <dt className="text-xs font-semibold capitalize text-[var(--color-ink-faint)]">{field}</dt>
                                <dd className="whitespace-pre-wrap text-[var(--color-ink)]">{note[field]}</dd>
                              </div>
                            ) : null)}
                          </dl>
                          {note.correctionReason && <p className="mt-3 text-xs text-[var(--color-warn)]">Correction: {note.correctionReason}</p>}
                          {note.isCurrent && (
                            <Button className="mt-3" size="sm" variant="secondary" onClick={() => correctSession(note)}>
                              Create correction
                            </Button>
                          )}
                        </li>
                      ))}
                    </ol>
                  </section>
                  <section>
                    <h2 className="mb-3 text-sm font-bold text-[var(--color-ink)]">Outcome measures</h2>
                    <ol className="space-y-3">
                      {documentation.outcomeMeasurements.map((measurement) => (
                        <li key={measurement.id} className="rounded-xl border border-[var(--color-border)] p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-[var(--color-ink)]">{measurement.instrumentName}</p>
                              <p className="text-xs text-[var(--color-ink-soft)]">{measurement.measuredAt} · version {measurement.instrumentVersion}</p>
                            </div>
                            <Badge tone={measurement.isCurrent ? "primary" : "neutral"}>{measurement.score} {measurement.unit}</Badge>
                          </div>
                          <p className="mt-2 text-xs text-[var(--color-ink-soft)]">Reviewed range {measurement.scoreMin}–{measurement.scoreMax}; {measurement.direction.replace("-", " ")}.</p>
                          {measurement.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--color-ink)]">{measurement.notes}</p>}
                          {measurement.correctionReason && <p className="mt-2 text-xs text-[var(--color-warn)]">Correction: {measurement.correctionReason}</p>}
                          {measurement.isCurrent && (
                            <Button className="mt-3" size="sm" variant="secondary" onClick={() => correctOutcome(measurement)}>
                              Create correction
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
