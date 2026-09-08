"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCases } from "@/lib/store/CaseContext";
import { useAuth } from "@/lib/store/AuthContext";
import type {
  BodyRegionId,
  Gender,
  PatientCase,
  PatientRegistryItem,
} from "@/lib/types";
import { bodyRegions } from "@/lib/data/bodyRegions";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { PageIntro, Disclaimer, Spinner } from "@/components/ui/Misc";
import { uuid } from "@/lib/utils";
import { redFlags, redFlagCategories } from "@/lib/data/redFlags";
import { evaluateSafetyScreen } from "@/lib/clinical/safety";
import { isMockMode } from "@/lib/config";
import { fetchPatientRegistry } from "@/lib/supabase/db";

const emptyForm = {
  name: "",
  age: "",
  gender: "" as Gender | "",
  region: "" as BodyRegionId | "",
  mainComplaint: "",
  painLocation: "",
  painIntensity: 5,
  duration: "",
  mechanism: "",
  aggravating: "",
  easing: "",
  medicalHistory: "",
  surgicalHistory: "",
  imaging: "",
  medications: "",
  functionalLimitations: "",
  patientGoal: "",
};

type FormState = typeof emptyForm;
type Errors = Partial<Record<keyof FormState, string>>;

const REGISTRY_PAGE_SIZE = 20;
const REGISTRY_SEARCH_LIMIT = 80;
const emptyFlags = new Set<string>();

interface PatientLookupState {
  key: string | null;
  patients: PatientRegistryItem[];
  loading: boolean;
  error: string | null;
}

interface PatientLookupQuery {
  clinicId: string | null;
  draft: string;
  applied: string;
}

interface RegistrySelection {
  clinicId: string;
  patient: PatientRegistryItem;
}

const emptyLookup: PatientLookupState = {
  key: null,
  patients: [],
  loading: false,
  error: null,
};

function emptyLookupQuery(clinicId: string | null): PatientLookupQuery {
  return { clinicId, draft: "", applied: "" };
}

export default function NewCasePage() {
  const router = useRouter();
  const { addCase } = useCases();
  const { profile, activeClinicId, loading: authLoading } = useAuth();
  const [storedForm, setStoredForm] = useState<FormState>(emptyForm);
  const [draftClinicId, setDraftClinicId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [storedRedFlags, setStoredRedFlags] = useState<Set<string>>(
    new Set()
  );
  const [storedSafetyCompleted, setStoredSafetyCompleted] = useState(false);
  const [storedSafetyError, setStoredSafetyError] = useState<string | null>(
    null
  );
  const [lookup, setLookup] = useState<PatientLookupState>(emptyLookup);
  const [lookupQuery, setLookupQuery] = useState<PatientLookupQuery>(() =>
    emptyLookupQuery(null)
  );
  const [selection, setSelection] = useState<RegistrySelection | null>(null);
  const [patientSelectionError, setPatientSelectionError] = useState<
    string | null
  >(null);
  const [lookupRetryToken, setLookupRetryToken] = useState(0);
  const activeClinicRef = useRef(activeClinicId);
  const submitInFlight = useRef(false);

  const canLinkPatient =
    profile?.role === "clinic_owner" || profile?.role === "therapist";
  const draftIsCurrent = isMockMode || draftClinicId === activeClinicId;
  const form = draftIsCurrent ? storedForm : emptyForm;
  const selectedRedFlags = draftIsCurrent ? storedRedFlags : emptyFlags;
  const safetyScreenCompleted = draftIsCurrent
    ? storedSafetyCompleted
    : false;
  const safetyError = draftIsCurrent ? storedSafetyError : null;
  const scopedLookupQuery =
    lookupQuery.clinicId === activeClinicId
      ? lookupQuery
      : emptyLookupQuery(activeClinicId);
  const selectedRegistryPatient =
    selection?.clinicId === activeClinicId ? selection.patient : null;
  const lookupKey = activeClinicId
    ? `${activeClinicId}|${scopedLookupQuery.applied}`
    : null;
  const scopedLookup: PatientLookupState =
    lookupKey && lookup.key === lookupKey
      ? lookup
      : {
          key: lookupKey,
          patients: [],
          loading: Boolean(
            lookupKey && !isMockMode && canLinkPatient
          ),
          error: null,
        };

  useEffect(() => {
    activeClinicRef.current = activeClinicId;
  }, [activeClinicId]);

  useEffect(() => {
    if (isMockMode || !canLinkPatient || !activeClinicId || !lookupKey) {
      return;
    }

    const clinicId = activeClinicId;
    const key = lookupKey;
    let cancelled = false;

    async function loadPatients() {
      const result = await fetchPatientRegistry({
        clinicId,
        search: scopedLookupQuery.applied,
        page: 1,
        pageSize: REGISTRY_PAGE_SIZE,
      });
      if (cancelled) return;

      if (!result) {
        setLookup({
          key,
          patients: [],
          loading: false,
          error:
            "Patient registry could not be loaded. Check the connection and your clinic access, then retry.",
        });
        return;
      }

      setLookup({
        key,
        patients: result.patients,
        loading: false,
        error: null,
      });
    }

    void loadPatients();
    return () => {
      cancelled = true;
    };
  }, [
    activeClinicId,
    canLinkPatient,
    lookupKey,
    lookupRetryToken,
    scopedLookupQuery.applied,
  ]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setStoredForm((previous) => ({
      ...(draftIsCurrent ? previous : emptyForm),
      [key]: value,
    }));
    setDraftClinicId(activeClinicId);
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function updateRedFlags(
    update: (previous: Set<string>) => Set<string>
  ) {
    setStoredRedFlags((previous) =>
      update(draftIsCurrent ? previous : new Set<string>())
    );
    setDraftClinicId(activeClinicId);
  }

  function updateSafetyCompleted(value: boolean) {
    setStoredSafetyCompleted(value);
    setDraftClinicId(activeClinicId);
  }

  function updateSafetyError(value: string | null) {
    setStoredSafetyError(value);
    setDraftClinicId(activeClinicId);
  }

  function resetDraft(clearPatient = true) {
    const patient = clearPatient ? null : selectedRegistryPatient;
    setStoredForm(
      patient
        ? {
            ...emptyForm,
            name: patient.fullName,
            age: patient.birthYear
              ? String(new Date().getFullYear() - patient.birthYear)
              : "",
            gender: patient.gender ?? "",
          }
        : emptyForm
    );
    setDraftClinicId(activeClinicId);
    setErrors({});
    setStoredRedFlags(new Set());
    setStoredSafetyCompleted(false);
    setStoredSafetyError(null);
    setSaveError(null);
    setPatientSelectionError(null);
    if (clearPatient) setSelection(null);
  }

  function choosePatient(patientId: string) {
    if (!patientId) {
      resetDraft(true);
      return;
    }
    const patient = scopedLookup.patients.find(
      (candidate) => candidate.id === patientId
    );
    if (!patient || patient.clinicId !== activeClinicId) {
      resetDraft(true);
      setPatientSelectionError("Select a patient from the active clinic.");
      return;
    }
    if (!patient.activeEpisode) {
      resetDraft(true);
      setPatientSelectionError(
        "This patient has no active care episode. Open the registry and create or reactivate an episode first."
      );
      return;
    }

    setSelection({ clinicId: patient.clinicId, patient });
    setStoredForm({
      ...emptyForm,
      name: patient.fullName,
      age: patient.birthYear
        ? String(new Date().getFullYear() - patient.birthYear)
        : "",
      gender: patient.gender ?? "",
    });
    setDraftClinicId(activeClinicId);
    setErrors({});
    setStoredRedFlags(new Set());
    setStoredSafetyCompleted(false);
    setStoredSafetyError(null);
    setSaveError(null);
    setPatientSelectionError(null);
  }

  function applyPatientSearch() {
    const applied = scopedLookupQuery.draft.trim();
    if (selectedRegistryPatient) resetDraft(true);
    setLookupQuery({
      clinicId: activeClinicId,
      draft: scopedLookupQuery.draft,
      applied,
    });
    setPatientSelectionError(null);
  }

  function validate(): boolean {
    const next: Errors = {};
    if (!form.name.trim()) next.name = "Patient name is required.";
    if (form.age && (Number(form.age) < 0 || Number(form.age) > 120))
      next.age = "Enter a valid age (0–120).";
    if (!form.mainComplaint.trim())
      next.mainComplaint = "Main complaint is required.";
    if (!form.region) next.region = "Select a body region.";
    if (!safetyScreenCompleted) {
      updateSafetyError(
        "Complete the structured red-flag screen before creating the case."
      );
    } else {
      updateSafetyError(null);
    }
    let validPatientLink = true;
    if (!isMockMode) {
      validPatientLink = Boolean(
        activeClinicId &&
          selectedRegistryPatient?.clinicId === activeClinicId &&
          selectedRegistryPatient.activeEpisode
      );
      if (!validPatientLink) {
        setPatientSelectionError(
          "Select a registry patient with an active care episode before creating the case."
        );
      } else {
        setPatientSelectionError(null);
      }
    }
    setErrors(next);
    return (
      Object.keys(next).length === 0 &&
      safetyScreenCompleted &&
      validPatientLink
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitInFlight.current || !validate()) return;
    submitInFlight.current = true;
    setSubmitting(true);
    setSaveError(null);

    const submittedClinicId = activeClinicId;

    const newCase: PatientCase = {
      id: uuid(),
      createdAt: new Date().toISOString(),
      name: form.name.trim(),
      age: form.age ? Number(form.age) : null,
      gender: form.gender || null,
      mainComplaint: form.mainComplaint.trim(),
      painLocation: form.painLocation.trim(),
      painIntensity: form.painIntensity,
      duration: form.duration.trim(),
      mechanism: form.mechanism.trim(),
      aggravating: form.aggravating.trim(),
      easing: form.easing.trim(),
      medicalHistory: form.medicalHistory.trim(),
      surgicalHistory: form.surgicalHistory.trim(),
      imaging: form.imaging.trim(),
      medications: form.medications.trim(),
      functionalLimitations: form.functionalLimitations.trim(),
      patientGoal: form.patientGoal.trim(),
      region: form.region || undefined,
      patientId: isMockMode ? undefined : selectedRegistryPatient?.id,
      episodeId: isMockMode
        ? undefined
        : selectedRegistryPatient?.activeEpisode?.id,
      safetyScreen: {
        screenedAt: new Date().toISOString(),
        selectedFlagIds: [...selectedRedFlags],
        disposition: evaluateSafetyScreen([...selectedRedFlags], true),
      },
    };

    const ok = await addCase(newCase);
    submitInFlight.current = false;
    if (!isMockMode && activeClinicRef.current !== submittedClinicId) {
      setSubmitting(false);
      return;
    }
    if (!ok) {
      // Keep the form exactly as typed — nothing is lost on a failed save.
      setSubmitting(false);
      setSaveError(
        "Save failed — your input has been kept. Check the connection (or that your account belongs to a clinic) and try again."
      );
      return;
    }
    router.push("/case-analysis");
  }

  if (!isMockMode && authLoading) {
    return <Spinner label="Loading patient registry…" />;
  }

  if (!isMockMode && !canLinkPatient) {
    return (
      <Card>
        <CardBody>
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            Only a clinic owner or therapist may create a clinical case.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageIntro
        title="New Patient Case"
        description="Capture the subjective interview in a structured format. Required fields are marked; everything else can be completed later."
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {!isMockMode && (
          <Card>
            <CardHeader
              title="Link registry patient"
              subtitle="Real clinical cases must belong to one patient and that patient’s active care episode."
              icon={<Icon name="user" width={18} height={18} />}
            />
            <CardBody className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Field
                    label="Search patient name"
                    hint={`Showing at most ${REGISTRY_PAGE_SIZE} matches from the active clinic.`}
                  >
                    <Input
                      value={scopedLookupQuery.draft}
                      maxLength={REGISTRY_SEARCH_LIMIT}
                      onChange={(event) =>
                        setLookupQuery({
                          clinicId: activeClinicId,
                          draft: event.target.value,
                          applied: scopedLookupQuery.applied,
                        })
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          applyPatientSearch();
                        }
                      }}
                      placeholder="Type a patient name"
                    />
                  </Field>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={applyPatientSearch}
                  disabled={scopedLookup.loading}
                >
                  Search
                </Button>
              </div>

              {scopedLookup.loading ? (
                <Spinner label="Loading patients…" />
              ) : scopedLookup.error ? (
                <div
                  role="alert"
                  className="rounded-xl bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]"
                >
                  <p>{scopedLookup.error}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="mt-3"
                    onClick={() => setLookupRetryToken((value) => value + 1)}
                  >
                    Retry
                  </Button>
                </div>
              ) : scopedLookup.patients.length === 0 ? (
                <p
                  role="status"
                  className="rounded-xl bg-[var(--color-surface-muted)] px-4 py-3 text-sm text-[var(--color-ink-soft)]"
                >
                  No matching patient was found. Create the patient and first
                  care episode in Patient Registry, then return here.
                </p>
              ) : (
                <Field
                  label="Patient and active episode"
                  required
                  error={patientSelectionError ?? undefined}
                >
                  <Select
                    value={selectedRegistryPatient?.id ?? ""}
                    onChange={(event) => choosePatient(event.target.value)}
                  >
                    <option value="">Select a patient…</option>
                    {scopedLookup.patients.map((patient) => (
                      <option key={patient.id} value={patient.id}>
                        {patient.fullName} — {patient.activeEpisode?.titleFa ?? "no active episode"}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}

              {selectedRegistryPatient?.activeEpisode && (
                <p
                  role="status"
                  className="rounded-xl bg-[var(--color-success-soft)] px-4 py-3 text-sm text-[var(--color-success)]"
                >
                  Linked to {selectedRegistryPatient.fullName} · episode: {" "}
                  {selectedRegistryPatient.activeEpisode.titleFa}
                </p>
              )}
              {patientSelectionError && scopedLookup.patients.length === 0 && (
                <p role="alert" className="text-sm text-[var(--color-danger)]">
                  {patientSelectionError}
                </p>
              )}
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader
            title="Patient Details"
            icon={<Icon name="user" width={18} height={18} />}
          />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Patient name" required error={errors.name}>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Sara Ahmadi"
                disabled={!isMockMode}
              />
            </Field>
            <Field label="Age" error={errors.age}>
              <Input
                type="number"
                min={0}
                max={120}
                value={form.age}
                onChange={(e) => set("age", e.target.value)}
                placeholder="e.g. 42"
                disabled={!isMockMode}
              />
            </Field>
            <Field label="Gender">
              <Select
                value={form.gender}
                onChange={(e) => set("gender", e.target.value as Gender)}
                disabled={!isMockMode}
              >
                <option value="">Select…</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            <Field label="Body region" required error={errors.region}>
              <Select
                value={form.region}
                onChange={(e) => set("region", e.target.value as BodyRegionId)}
              >
                <option value="">Select…</option>
                {bodyRegions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Presenting Problem"
            icon={<Icon name="analysis" width={18} height={18} />}
          />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Main complaint" required error={errors.mainComplaint}>
                <Textarea
                  value={form.mainComplaint}
                  onChange={(e) => set("mainComplaint", e.target.value)}
                  placeholder="In the patient's words — e.g. low back pain radiating to the right buttock"
                />
              </Field>
            </div>
            <Field label="Pain location">
              <Input
                value={form.painLocation}
                onChange={(e) => set("painLocation", e.target.value)}
                placeholder="e.g. Lower back, right side"
              />
            </Field>
            <Field label="Duration of symptoms">
              <Input
                value={form.duration}
                onChange={(e) => set("duration", e.target.value)}
                placeholder="e.g. 8 weeks"
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label={`Pain intensity — ${form.painIntensity}/10`}>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[var(--color-ink-faint)]">0</span>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    value={form.painIntensity}
                    onChange={(e) => set("painIntensity", Number(e.target.value))}
                    className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-gradient-to-r from-[var(--color-success)] via-[var(--color-warn)] to-[var(--color-danger)] accent-[var(--color-ink)]"
                  />
                  <span className="text-xs text-[var(--color-ink-faint)]">10</span>
                </div>
              </Field>
            </div>
            <Field label="Mechanism of injury / onset">
              <Input
                value={form.mechanism}
                onChange={(e) => set("mechanism", e.target.value)}
                placeholder="e.g. Gradual onset after desk work"
              />
            </Field>
            <Field label="Aggravating factors">
              <Input
                value={form.aggravating}
                onChange={(e) => set("aggravating", e.target.value)}
                placeholder="e.g. Sitting > 30 min, bending"
              />
            </Field>
            <Field label="Easing factors">
              <Input
                value={form.easing}
                onChange={(e) => set("easing", e.target.value)}
                placeholder="e.g. Walking, lying down"
              />
            </Field>
            <Field label="Functional limitations">
              <Input
                value={form.functionalLimitations}
                onChange={(e) => set("functionalLimitations", e.target.value)}
                placeholder="e.g. Cannot sit through a work day"
              />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="History & Context"
            icon={<Icon name="clock" width={18} height={18} />}
          />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Medical history">
              <Textarea
                value={form.medicalHistory}
                onChange={(e) => set("medicalHistory", e.target.value)}
                placeholder="e.g. Hypertension, diabetes…"
                className="min-h-20"
              />
            </Field>
            <Field label="Surgical history">
              <Textarea
                value={form.surgicalHistory}
                onChange={(e) => set("surgicalHistory", e.target.value)}
                placeholder="e.g. Left TKA 3 weeks ago"
                className="min-h-20"
              />
            </Field>
            <Field label="Imaging findings">
              <Textarea
                value={form.imaging}
                onChange={(e) => set("imaging", e.target.value)}
                placeholder="e.g. MRI: L4-L5 disc bulge / Not performed"
                className="min-h-20"
              />
            </Field>
            <Field label="Current medications">
              <Textarea
                value={form.medications}
                onChange={(e) => set("medications", e.target.value)}
                placeholder="e.g. Ibuprofen as needed"
                className="min-h-20"
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Patient goal" hint="What does the patient want to get back to?">
                <Input
                  value={form.patientGoal}
                  onChange={(e) => set("patientGoal", e.target.value)}
                  placeholder="e.g. Return to pain-free desk work and gym"
                />
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Clinical Safety Screen"
            subtitle="Record every item that is present. Unchecked is not considered a negative screen until you explicitly complete it."
            icon={<Icon name="shield" width={18} height={18} />}
          />
          <CardBody className="space-y-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {redFlagCategories.map((category) => (
                <fieldset key={category} className="rounded-xl border border-[var(--color-border)] p-3">
                  <legend className="px-1 text-xs font-semibold text-[var(--color-ink)]">
                    {category}
                  </legend>
                  <div className="space-y-1.5">
                    {redFlags
                      .filter((flag) => flag.category === category)
                      .map((flag) => {
                        const selected = selectedRedFlags.has(flag.id);
                        return (
                          <button
                            key={flag.id}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => {
                              updateRedFlags((previous) => {
                                const next = new Set(previous);
                                if (next.has(flag.id)) next.delete(flag.id);
                                else next.add(flag.id);
                                return next;
                              });
                              updateSafetyCompleted(false);
                              updateSafetyError(null);
                            }}
                            className={`flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-xs ${
                              selected
                                ? "bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
                                : "hover:bg-[var(--color-surface-muted)] text-[var(--color-ink-soft)]"
                            }`}
                          >
                            <span
                              aria-hidden="true"
                              className={`mt-0.5 h-4 w-4 shrink-0 rounded border ${
                                selected
                                  ? "border-[var(--color-danger)] bg-[var(--color-danger)]"
                                  : "border-[var(--color-border)]"
                              }`}
                            />
                            <span>
                              <span className="block font-medium">{flag.label}</span>
                              <span className="block text-[11px] opacity-80">{flag.detail}</span>
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </fieldset>
              ))}
            </div>

            {selectedRedFlags.size > 0 && (
              <p role="alert" className="rounded-xl bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]">
                One or more safety concerns are present. Document and complete the appropriate medical referral before treatment advice is generated.
              </p>
            )}

            <label className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] p-3 text-sm text-[var(--color-ink-soft)]">
              <input
                type="checkbox"
                className="mt-1"
                checked={safetyScreenCompleted}
                onChange={(event) => {
                  updateSafetyCompleted(event.target.checked);
                  updateSafetyError(null);
                }}
              />
              <span>
                I completed this structured screen and understand that selected concerns require medical escalation; an empty screen does not replace clinical judgement.
              </span>
            </label>
            {safetyError && (
              <p role="alert" className="text-sm text-[var(--color-danger)]">
                {safetyError}
              </p>
            )}
          </CardBody>
        </Card>

        <Disclaimer />

        {saveError && (
          <p className="rounded-xl bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]">
            {saveError}
          </p>
        )}

        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => resetDraft(true)}
          >
            Clear form
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create case & analyse"}
            <Icon name="arrow" width={16} height={16} />
          </Button>
        </div>
      </form>
    </div>
  );
}
