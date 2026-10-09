"use client";

import { useEffect, useState } from "react";
import { isMockMode } from "@/lib/config";
import { bodyRegions } from "@/lib/data/bodyRegions";
import {
  fetchCaseAssessmentHistory,
  reviseCaseAssessment,
} from "@/lib/supabase/db";
import type {
  BodyRegionId,
  CaseAssessmentChangeType,
  CaseAssessmentPayload,
  CaseAssessmentVersion,
  Gender,
  PatientCase,
} from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Misc";

type RevisionType = Exclude<CaseAssessmentChangeType, "initial">;

type EditableAssessmentPayload = Omit<CaseAssessmentPayload, "region"> & {
  region: BodyRegionId | "";
};

interface RevisionDraft {
  changeType: RevisionType;
  changeReason: string;
  assessedAtLocal: string;
  assessment: EditableAssessmentPayload;
}

interface HistoryState {
  requestKey: string;
  rows: CaseAssessmentVersion[];
  failed: boolean;
}

function localDateTimeInput(value: Date): string {
  const shifted = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 16);
}

function isGender(value: string | null): value is Gender | null {
  return value === null || value === "male" || value === "female" || value === "other";
}

function isBodyRegionId(value: string | null): value is BodyRegionId {
  return bodyRegions.some((region) => region.id === value);
}

function assessmentPayload(
  assessment: CaseAssessmentVersion
): EditableAssessmentPayload {
  return {
    name: assessment.name,
    age: assessment.age,
    gender: isGender(assessment.gender) ? assessment.gender : null,
    region: isBodyRegionId(assessment.region) ? assessment.region : "",
    mainComplaint: assessment.mainComplaint,
    painLocation: assessment.painLocation,
    painIntensity: assessment.painIntensity,
    duration: assessment.duration,
    mechanism: assessment.mechanism,
    aggravating: assessment.aggravating,
    easing: assessment.easing,
    medicalHistory: assessment.medicalHistory,
    surgicalHistory: assessment.surgicalHistory,
    imaging: assessment.imaging,
    medications: assessment.medications,
    functionalLimitations: assessment.functionalLimitations,
    patientGoal: assessment.patientGoal,
  };
}

function labelForChange(changeType: CaseAssessmentChangeType): string {
  if (changeType === "initial") return "Initial intake";
  if (changeType === "correction") return "Correction";
  return "Reassessment";
}

function display(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "Not recorded";
  return String(value);
}

export function CaseAssessmentHistory({
  patientCase,
  onSnapshotApplied,
}: {
  patientCase: PatientCase;
  onSnapshotApplied: (
    caseId: string,
    assessment: CaseAssessmentPayload
  ) => void;
}) {
  const [retryToken, setRetryToken] = useState(0);
  const [historyState, setHistoryState] = useState<HistoryState>({
    requestKey: "",
    rows: [],
    failed: false,
  });
  const [draft, setDraft] = useState<RevisionDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const requestKey = `${patientCase.id}:${retryToken}`;

  useEffect(() => {
    if (isMockMode) return;
    let cancelled = false;
    fetchCaseAssessmentHistory(patientCase.id).then((rows) => {
      if (cancelled) return;
      setHistoryState({
        requestKey,
        rows: rows ?? [],
        failed: rows === null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [patientCase.id, requestKey]);

  if (isMockMode) {
    return (
      <Card>
        <CardHeader
          title="Signed assessment history"
          subtitle="Available for authenticated clinical records"
          icon={<Icon name="clock" width={18} height={18} />}
        />
        <CardBody>
          <p className="text-sm text-[var(--color-ink-soft)]">
            This is a local demo case. It does not create signed clinical
            assessment versions, and corrections are intentionally disabled.
          </p>
        </CardBody>
      </Card>
    );
  }

  const loading = historyState.requestKey !== requestKey;
  const history = loading ? [] : historyState.rows;
  const current = history[0];

  function beginRevision(changeType: RevisionType) {
    if (!current) return;
    setDraft({
      changeType,
      changeReason: "",
      assessedAtLocal:
        changeType === "correction"
          ? localDateTimeInput(new Date(current.assessedAt))
          : localDateTimeInput(new Date()),
      assessment: assessmentPayload(current),
    });
    setFormError(null);
    setSuccess(null);
  }

  function setAssessment<K extends keyof EditableAssessmentPayload>(
    key: K,
    value: EditableAssessmentPayload[K]
  ) {
    setDraft((previous) =>
      previous
        ? {
            ...previous,
            assessment: { ...previous.assessment, [key]: value },
          }
        : previous
    );
    setFormError(null);
  }

  async function submitRevision(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || !current || saving) return;

    const reason = draft.changeReason.trim();
    const age = draft.assessment.age;
    if (reason.length < 3 || reason.length > 1000) {
      setFormError("Document a reason between 3 and 1,000 characters.");
      return;
    }
    if (
      !draft.assessment.name.trim() ||
      !draft.assessment.mainComplaint.trim() ||
      !draft.assessment.region ||
      (age !== null && (!Number.isInteger(age) || age < 0 || age > 120)) ||
      !Number.isInteger(draft.assessment.painIntensity) ||
      draft.assessment.painIntensity < 0 ||
      draft.assessment.painIntensity > 10
    ) {
      setFormError("Review the required fields, age, region, and pain score.");
      return;
    }
    if (
      draft.changeType === "correction" &&
      JSON.stringify(draft.assessment) ===
        JSON.stringify(assessmentPayload(current))
    ) {
      setFormError("A correction must change at least one assessment field.");
      return;
    }

    const reassessmentDate = new Date(draft.assessedAtLocal);
    if (
      draft.changeType === "reassessment" &&
      Number.isNaN(reassessmentDate.getTime())
    ) {
      setFormError("Enter a valid reassessment date and time.");
      return;
    }
    const assessedAt =
      draft.changeType === "correction"
        ? current.assessedAt
        : reassessmentDate.toISOString();
    setSaving(true);
    setFormError(null);
    const normalizedAssessment: CaseAssessmentPayload = {
      ...draft.assessment,
      region: draft.assessment.region as BodyRegionId,
    };
    const receipt = await reviseCaseAssessment({
      caseId: patientCase.id,
      supersedesId: current.id,
      changeType: draft.changeType,
      changeReason: reason,
      assessedAt,
      assessment: normalizedAssessment,
    });
    setSaving(false);
    if (!receipt) {
      setFormError(
        "The revision was not stored. Refresh the history before retrying; another clinician may have created a newer version."
      );
      return;
    }

    onSnapshotApplied(patientCase.id, normalizedAssessment);
    setDraft(null);
    setSuccess(`Assessment version ${receipt.version} was signed and stored.`);
    setRetryToken((value) => value + 1);
  }

  return (
    <Card>
      <CardHeader
        title="Signed assessment history"
        subtitle="Append-only intake snapshots; corrections never overwrite the original"
        icon={<Icon name="clock" width={18} height={18} />}
        action={
          current && !draft ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => beginRevision("correction")}
              >
                Correct record
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => beginRevision("reassessment")}
              >
                New reassessment
              </Button>
            </div>
          ) : undefined
        }
      />

      {loading && <Spinner label="Loading signed assessment history…" />}

      {!loading && historyState.failed && (
        <CardBody>
          <div
            role="alert"
            className="rounded-xl bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]"
          >
            Assessment history could not be verified. Editing is locked until
            the complete signed history loads.
          </div>
          <Button
            type="button"
            variant="secondary"
            className="mt-3"
            onClick={() => setRetryToken((value) => value + 1)}
          >
            Retry history
          </Button>
        </CardBody>
      )}

      {!loading && !historyState.failed && history.length === 0 && (
        <CardBody>
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            No signed assessment version was found. Editing is locked; ask an
            administrator to verify migration 020 and the case backfill.
          </p>
        </CardBody>
      )}

      {success && !loading && (
        <div
          role="status"
          className="mx-5 mt-4 rounded-xl bg-[var(--color-success-soft)] px-4 py-3 text-sm text-[var(--color-success)]"
        >
          {success}
        </div>
      )}

      {draft && current && (
        <CardBody>
          <form onSubmit={submitRevision} className="space-y-5">
            <fieldset className="space-y-4">
              <legend className="text-sm font-semibold text-[var(--color-ink)]">
                {draft.changeType === "correction"
                  ? `Correct version ${current.version}`
                  : `Reassess from version ${current.version}`}
              </legend>
              <p className="text-xs text-[var(--color-ink-soft)]">
                The existing version remains immutable. Saving creates version
                {` ${current.version + 1}`} and records your authenticated user ID.
              </p>
              {(!isBodyRegionId(current.region) || !isGender(current.gender)) && (
                <p
                  role="alert"
                  className="rounded-xl bg-[var(--color-warn-soft)] px-4 py-3 text-xs leading-relaxed text-[var(--color-warn)]"
                >
                  This legacy snapshot contains a body-region or gender value
                  outside the current controlled list. Review those fields
                  explicitly before signing the new version; the original
                  snapshot remains unchanged.
                </p>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Change type" required>
                  <Select
                    value={draft.changeType}
                    onChange={(event) => {
                      const changeType = event.target.value as RevisionType;
                      setDraft((previous) =>
                        previous
                          ? {
                              ...previous,
                              changeType,
                              assessedAtLocal:
                                changeType === "correction"
                                  ? localDateTimeInput(
                                      new Date(current.assessedAt)
                                    )
                                  : localDateTimeInput(new Date()),
                            }
                          : previous
                      );
                    }}
                  >
                    <option value="correction">Correction to documentation</option>
                    <option value="reassessment">New clinical reassessment</option>
                  </Select>
                </Field>
                <Field
                  label="Assessment time"
                  required
                  hint={
                    draft.changeType === "correction"
                      ? "Corrections retain the original clinical assessment time."
                      : "Use the time the reassessment occurred."
                  }
                >
                  <Input
                    type="datetime-local"
                    value={draft.assessedAtLocal}
                    disabled={draft.changeType === "correction"}
                    onChange={(event) =>
                      setDraft((previous) =>
                        previous
                          ? { ...previous, assessedAtLocal: event.target.value }
                          : previous
                      )
                    }
                  />
                </Field>
              </div>

              <Field
                label="Reason for this version"
                required
                hint="Describe what was corrected or what prompted reassessment."
              >
                <Textarea
                  value={draft.changeReason}
                  minLength={3}
                  maxLength={1000}
                  onChange={(event) =>
                    setDraft((previous) =>
                      previous
                        ? { ...previous, changeReason: event.target.value }
                        : previous
                    )
                  }
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Patient name snapshot" required>
                  <Input
                    value={draft.assessment.name}
                    maxLength={200}
                    onChange={(event) => setAssessment("name", event.target.value)}
                  />
                </Field>
                <Field label="Age at assessment">
                  <Input
                    type="number"
                    min={0}
                    max={120}
                    step={1}
                    value={draft.assessment.age ?? ""}
                    onChange={(event) =>
                      setAssessment(
                        "age",
                        event.target.value === "" ? null : Number(event.target.value)
                      )
                    }
                  />
                </Field>
                <Field label="Gender snapshot">
                  <Select
                    value={draft.assessment.gender ?? ""}
                    onChange={(event) =>
                      setAssessment(
                        "gender",
                        (event.target.value || null) as Gender | null
                      )
                    }
                  >
                    <option value="">Not recorded</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="other">Other</option>
                  </Select>
                </Field>
                <Field label="Body region" required>
                  <Select
                    value={draft.assessment.region}
                    onChange={(event) =>
                      setAssessment("region", event.target.value as BodyRegionId)
                    }
                  >
                    {bodyRegions.map((region) => (
                      <option key={region.id} value={region.id}>
                        {region.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="md:col-span-2">
                  <Field label="Main complaint" required>
                    <Textarea
                      value={draft.assessment.mainComplaint}
                      maxLength={10000}
                      onChange={(event) =>
                        setAssessment("mainComplaint", event.target.value)
                      }
                    />
                  </Field>
                </div>
                <Field label="Pain location">
                  <Input
                    value={draft.assessment.painLocation}
                    maxLength={2000}
                    onChange={(event) =>
                      setAssessment("painLocation", event.target.value)
                    }
                  />
                </Field>
                <Field label="Pain intensity (0–10)" required>
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    step={1}
                    value={draft.assessment.painIntensity}
                    onChange={(event) =>
                      setAssessment("painIntensity", Number(event.target.value))
                    }
                  />
                </Field>
                <Field label="Duration">
                  <Input
                    value={draft.assessment.duration}
                    maxLength={500}
                    onChange={(event) =>
                      setAssessment("duration", event.target.value)
                    }
                  />
                </Field>
                <Field label="Mechanism / onset">
                  <Textarea
                    value={draft.assessment.mechanism}
                    maxLength={5000}
                    onChange={(event) =>
                      setAssessment("mechanism", event.target.value)
                    }
                  />
                </Field>
                <Field label="Aggravating factors">
                  <Textarea
                    value={draft.assessment.aggravating}
                    maxLength={5000}
                    onChange={(event) =>
                      setAssessment("aggravating", event.target.value)
                    }
                  />
                </Field>
                <Field label="Easing factors">
                  <Textarea
                    value={draft.assessment.easing}
                    maxLength={5000}
                    onChange={(event) =>
                      setAssessment("easing", event.target.value)
                    }
                  />
                </Field>
                <Field label="Functional limitations">
                  <Textarea
                    value={draft.assessment.functionalLimitations}
                    maxLength={10000}
                    onChange={(event) =>
                      setAssessment("functionalLimitations", event.target.value)
                    }
                  />
                </Field>
                <Field label="Patient goal">
                  <Textarea
                    value={draft.assessment.patientGoal}
                    maxLength={5000}
                    onChange={(event) =>
                      setAssessment("patientGoal", event.target.value)
                    }
                  />
                </Field>
                <Field label="Medical history">
                  <Textarea
                    value={draft.assessment.medicalHistory}
                    maxLength={20000}
                    onChange={(event) =>
                      setAssessment("medicalHistory", event.target.value)
                    }
                  />
                </Field>
                <Field label="Surgical history">
                  <Textarea
                    value={draft.assessment.surgicalHistory}
                    maxLength={20000}
                    onChange={(event) =>
                      setAssessment("surgicalHistory", event.target.value)
                    }
                  />
                </Field>
                <Field label="Imaging">
                  <Textarea
                    value={draft.assessment.imaging}
                    maxLength={20000}
                    onChange={(event) =>
                      setAssessment("imaging", event.target.value)
                    }
                  />
                </Field>
                <Field label="Medications">
                  <Textarea
                    value={draft.assessment.medications}
                    maxLength={10000}
                    onChange={(event) =>
                      setAssessment("medications", event.target.value)
                    }
                  />
                </Field>
              </div>
            </fieldset>

            {formError && (
              <p
                role="alert"
                className="rounded-xl bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]"
              >
                {formError}
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={saving}
                onClick={() => {
                  setDraft(null);
                  setFormError(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Signing version…" : "Sign and append version"}
              </Button>
            </div>
          </form>
        </CardBody>
      )}

      {!loading && !historyState.failed && history.length > 0 && !draft && (
        <CardBody className="space-y-3">
          {history.map((assessment) => (
            <details
              key={assessment.id}
              open={assessment.isCurrent}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"
            >
              <summary className="cursor-pointer list-none px-4 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/40">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--color-ink)]">
                    Version {assessment.version}
                  </span>
                  <Badge tone={assessment.isCurrent ? "success" : "neutral"}>
                    {assessment.isCurrent ? "Current" : labelForChange(assessment.changeType)}
                  </Badge>
                  <span className="text-xs text-[var(--color-ink-faint)]">
                    Assessed {new Date(assessment.assessedAt).toLocaleString()}
                  </span>
                </div>
              </summary>
              <div className="border-t border-[var(--color-border)] px-4 py-4">
                <dl className="grid grid-cols-1 gap-x-5 gap-y-3 text-sm md:grid-cols-2">
                  <HistoryField label="Patient snapshot" value={assessment.name} />
                  <HistoryField
                    label="Age / gender"
                    value={`${display(assessment.age)} / ${display(assessment.gender)}`}
                  />
                  <HistoryField label="Region" value={display(assessment.region)} />
                  <HistoryField
                    label="Pain"
                    value={`${assessment.painIntensity}/10 — ${display(assessment.painLocation)}`}
                  />
                  <HistoryField label="Main complaint" value={assessment.mainComplaint} wide />
                  <HistoryField label="Duration" value={display(assessment.duration)} />
                  <HistoryField label="Mechanism / onset" value={display(assessment.mechanism)} />
                  <HistoryField label="Aggravating" value={display(assessment.aggravating)} />
                  <HistoryField label="Easing" value={display(assessment.easing)} />
                  <HistoryField
                    label="Functional limitations"
                    value={display(assessment.functionalLimitations)}
                  />
                  <HistoryField label="Patient goal" value={display(assessment.patientGoal)} />
                  <HistoryField label="Medical history" value={display(assessment.medicalHistory)} />
                  <HistoryField label="Surgical history" value={display(assessment.surgicalHistory)} />
                  <HistoryField label="Imaging" value={display(assessment.imaging)} />
                  <HistoryField label="Medications" value={display(assessment.medications)} />
                </dl>
                <div className="mt-4 rounded-lg bg-[var(--color-surface-muted)] px-3 py-2 text-xs text-[var(--color-ink-soft)]">
                  <p>
                    {labelForChange(assessment.changeType)} recorded {new Date(assessment.createdAt).toLocaleString()}.
                  </p>
                  <p className="mt-1 break-all">
                    {assessment.authoredBy
                      ? `Authenticated clinician: ${assessment.authoredBy}`
                      : "Legacy import: original actor was not available."}
                  </p>
                  {assessment.changeReason && (
                    <p className="mt-1">Reason: {assessment.changeReason}</p>
                  )}
                </div>
              </div>
            </details>
          ))}
        </CardBody>
      )}
    </Card>
  );
}

function HistoryField({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "md:col-span-2" : undefined}>
      <dt className="text-xs font-medium text-[var(--color-ink-faint)]">
        {label}
      </dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-[var(--color-ink-soft)]">
        {value}
      </dd>
    </div>
  );
}
