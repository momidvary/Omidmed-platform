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
import { localizedRegions } from "@/lib/data/bodyRegionsFa";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { PageIntro, Disclaimer, Spinner } from "@/components/ui/Misc";
import { uuid } from "@/lib/utils";
import {
  localizedRedFlag,
  redFlagCategories,
  redFlagCategoryLabel,
  redFlags,
} from "@/lib/data/redFlags";
import { evaluateSafetyScreen } from "@/lib/clinical/safety";
import { isMockMode } from "@/lib/config";
import { fetchPatientRegistry } from "@/lib/supabase/db";
import { useLocale } from "@/lib/store/LocaleContext";
import { useText } from "@/lib/i18n/text";
import { newCaseText } from "./text";

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
  const { locale } = useLocale();
  const t = useText(newCaseText);
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
          error: "load_failed",
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
      setPatientSelectionError(t.selectFromClinic);
      return;
    }
    if (!patient.activeEpisode) {
      resetDraft(true);
      setPatientSelectionError(t.noActiveEpisode);
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
    if (!form.name.trim()) next.name = t.nameRequired;
    if (form.age && (Number(form.age) < 0 || Number(form.age) > 120))
      next.age = t.ageInvalid;
    if (!form.mainComplaint.trim())
      next.mainComplaint = t.complaintRequired;
    if (!form.region) next.region = t.regionRequired;
    if (!safetyScreenCompleted) {
      updateSafetyError(t.screenRequired);
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
        setPatientSelectionError(t.patientRequired);
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
      setSaveError(t.saveFailed);
      return;
    }
    router.push("/case-analysis");
  }

  if (!isMockMode && authLoading) {
    return <Spinner label={t.loadingRegistry} />;
  }

  if (!isMockMode && !canLinkPatient) {
    return (
      <Card>
        <CardBody>
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {t.roleRequired}
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageIntro
        title={t.title}
        description={t.intro}
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {!isMockMode && (
          <Card>
            <CardHeader
              title={t.linkTitle}
              subtitle={t.linkSubtitle}
              icon={<Icon name="user" width={18} height={18} />}
            />
            <CardBody className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Field
                    label={t.searchName}
                    hint={t.searchHint(REGISTRY_PAGE_SIZE)}
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
                      placeholder={t.searchPlaceholder}
                    />
                  </Field>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={applyPatientSearch}
                  disabled={scopedLookup.loading}
                >
                  {t.search}
                </Button>
              </div>

              {scopedLookup.loading ? (
                <Spinner label={t.loadingPatients} />
              ) : scopedLookup.error ? (
                <div
                  role="alert"
                  className="rounded-xl bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]"
                >
                  <p>{t.registryFailed}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="mt-3"
                    onClick={() => setLookupRetryToken((value) => value + 1)}
                  >
                    {t.retry}
                  </Button>
                </div>
              ) : scopedLookup.patients.length === 0 ? (
                <p
                  role="status"
                  className="rounded-xl bg-[var(--color-surface-muted)] px-4 py-3 text-sm text-[var(--color-ink-soft)]"
                >
                  {t.noMatch}
                </p>
              ) : (
                <Field
                  label={t.patientEpisode}
                  required
                  error={patientSelectionError ?? undefined}
                >
                  <Select
                    value={selectedRegistryPatient?.id ?? ""}
                    onChange={(event) => choosePatient(event.target.value)}
                  >
                    <option value="">{t.selectPatient}</option>
                    {scopedLookup.patients.map((patient) => (
                      <option key={patient.id} value={patient.id}>
                        {patient.fullName} — {patient.activeEpisode?.titleFa ?? t.noActiveEpisodeShort}
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
                  {t.linkedTo(
                    selectedRegistryPatient.fullName,
                    selectedRegistryPatient.activeEpisode.titleFa
                  )}
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
            title={t.details}
            icon={<Icon name="user" width={18} height={18} />}
          />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t.patientName} required error={errors.name}>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder={t.namePlaceholder}
                disabled={!isMockMode}
              />
            </Field>
            <Field label={t.age} error={errors.age}>
              <Input
                type="number"
                min={0}
                max={120}
                value={form.age}
                onChange={(e) => set("age", e.target.value)}
                placeholder={t.agePlaceholder}
                disabled={!isMockMode}
              />
            </Field>
            <Field label={t.gender}>
              <Select
                value={form.gender}
                onChange={(e) => set("gender", e.target.value as Gender)}
                disabled={!isMockMode}
              >
                <option value="">{t.select}</option>
                <option value="female">{t.female}</option>
                <option value="male">{t.male}</option>
                <option value="other">{t.other}</option>
              </Select>
            </Field>
            <Field label={t.region} required error={errors.region}>
              <Select
                value={form.region}
                onChange={(e) => set("region", e.target.value as BodyRegionId)}
              >
                <option value="">{t.select}</option>
                {localizedRegions(locale).map((r) => (
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
            title={t.presenting}
            icon={<Icon name="analysis" width={18} height={18} />}
          />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label={t.mainComplaint} required error={errors.mainComplaint}>
                <Textarea
                  value={form.mainComplaint}
                  onChange={(e) => set("mainComplaint", e.target.value)}
                  placeholder={t.complaintPlaceholder}
                />
              </Field>
            </div>
            <Field label={t.painLocation}>
              <Input
                value={form.painLocation}
                onChange={(e) => set("painLocation", e.target.value)}
                placeholder={t.painLocationPlaceholder}
              />
            </Field>
            <Field label={t.duration}>
              <Input
                value={form.duration}
                onChange={(e) => set("duration", e.target.value)}
                placeholder={t.durationPlaceholder}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label={t.painIntensity(form.painIntensity)}>
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
            <Field label={t.mechanism}>
              <Input
                value={form.mechanism}
                onChange={(e) => set("mechanism", e.target.value)}
                placeholder={t.mechanismPlaceholder}
              />
            </Field>
            <Field label={t.aggravating}>
              <Input
                value={form.aggravating}
                onChange={(e) => set("aggravating", e.target.value)}
                placeholder={t.aggravatingPlaceholder}
              />
            </Field>
            <Field label={t.easing}>
              <Input
                value={form.easing}
                onChange={(e) => set("easing", e.target.value)}
                placeholder={t.easingPlaceholder}
              />
            </Field>
            <Field label={t.functional}>
              <Input
                value={form.functionalLimitations}
                onChange={(e) => set("functionalLimitations", e.target.value)}
                placeholder={t.functionalPlaceholder}
              />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={t.history}
            icon={<Icon name="clock" width={18} height={18} />}
          />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t.medicalHistory}>
              <Textarea
                value={form.medicalHistory}
                onChange={(e) => set("medicalHistory", e.target.value)}
                placeholder={t.medicalPlaceholder}
                className="min-h-20"
              />
            </Field>
            <Field label={t.surgicalHistory}>
              <Textarea
                value={form.surgicalHistory}
                onChange={(e) => set("surgicalHistory", e.target.value)}
                placeholder={t.surgicalPlaceholder}
                className="min-h-20"
              />
            </Field>
            <Field label={t.imaging}>
              <Textarea
                value={form.imaging}
                onChange={(e) => set("imaging", e.target.value)}
                placeholder={t.imagingPlaceholder}
                className="min-h-20"
              />
            </Field>
            <Field label={t.medications}>
              <Textarea
                value={form.medications}
                onChange={(e) => set("medications", e.target.value)}
                placeholder={t.medicationsPlaceholder}
                className="min-h-20"
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label={t.goal} hint={t.goalHint}>
                <Input
                  value={form.patientGoal}
                  onChange={(e) => set("patientGoal", e.target.value)}
                  placeholder={t.goalPlaceholder}
                />
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={t.safetyTitle}
            subtitle={t.safetySubtitle}
            icon={<Icon name="shield" width={18} height={18} />}
          />
          <CardBody className="space-y-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {redFlagCategories.map((category) => (
                <fieldset key={category} className="rounded-xl border border-[var(--color-border)] p-3">
                  <legend className="px-1 text-xs font-semibold text-[var(--color-ink)]">
                    {redFlagCategoryLabel(category, locale)}
                  </legend>
                  <div className="space-y-1.5">
                    {redFlags
                      .filter((flag) => flag.category === category)
                      .map((source) => localizedRedFlag(source, locale))
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
                            className={`flex w-full items-start gap-2 rounded-lg px-2 py-2 text-start text-xs ${
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
                {t.concernsPresent}
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
                {t.screenAttest}
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
            {t.clear}
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? t.creating : t.create}
            <Icon name="arrow" width={16} height={16} className="rtl:rotate-180" />
          </Button>
        </div>
      </form>
    </div>
  );
}
