"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, PageIntro, Spinner } from "@/components/ui/Misc";
import { isMockMode } from "@/lib/config";
import { useAuth } from "@/lib/store/AuthContext";
import {
  archivePatientRecord,
  createPatientEpisode,
  fetchClinicTherapistDirectory,
  fetchPatientRegistry,
  invitePatientAccount,
  revokePatientAccountLink,
  setPatientPrimaryTherapist,
  startPatientEpisode,
  transitionCareEpisode,
  updatePatientRecord,
} from "@/lib/supabase/db";
import type {
  Gender,
  PatientAccountRelationship,
  PatientRegistryItem,
  PatientRegistryResult,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatIranianMobile, normalizeIranianMobile } from "@/lib/phone";
import { useLocale } from "@/lib/store/LocaleContext";
import { intlLocale, useText } from "@/lib/i18n/text";
import { patientsText, type PatientsText } from "./text";

const PAGE_SIZE = 20;
const CURRENT_YEAR = new Date().getFullYear();

interface RegistryState {
  key: string | null;
  result: PatientRegistryResult | null;
  loading: boolean;
  error: string | null;
}

interface RegistryQuery {
  clinicId: string | null;
  draft: string;
  applied: string;
  page: number;
}

interface PatientFormDraft {
  clinicId: string | null;
  fullName: string;
  phone: string;
  birthYear: string;
  gender: "" | Gender;
  titleFa: string;
  weeklyTarget: string;
}

type PatientFormField = Exclude<keyof PatientFormDraft, "clinicId">;
type FormErrors = Partial<Record<PatientFormField, string>>;

interface NormalizedPatientForm {
  fullName: string;
  phone: string | null;
  birthYear: number | null;
  gender: Gender | null;
  titleFa: string;
  weeklyTarget: number;
}

const emptyRegistry: RegistryState = {
  key: null,
  result: null,
  loading: false,
  error: null,
};

function emptyQuery(clinicId: string | null): RegistryQuery {
  return { clinicId, draft: "", applied: "", page: 1 };
}

function emptyPatientForm(clinicId: string | null): PatientFormDraft {
  return {
    clinicId,
    fullName: "",
    phone: "",
    birthYear: "",
    gender: "",
    titleFa: "",
    weeklyTarget: "5",
  };
}

function latinDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) =>
      String(digit.charCodeAt(0) - "۰".charCodeAt(0))
    )
    .replace(/[٠-٩]/g, (digit) =>
      String(digit.charCodeAt(0) - "٠".charCodeAt(0))
    );
}

function compactSpaces(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * Birth year as stored (Gregorian). Iranian users often know their Solar
 * Hijri birth year (e.g. 1365); 1279–1420 is converted by +621 (±1 year,
 * which is within the precision of a year-only field).
 */
function gregorianBirthYear(input: string): number | null {
  const trimmed = latinDigits(input).trim();
  if (trimmed === "") return null;
  const year = Number(trimmed);
  if (Number.isInteger(year) && year >= 1279 && year <= 1420) return year + 621;
  return year;
}

function validatePatientForm(form: PatientFormDraft, t: PatientsText): {
  errors: FormErrors;
  normalized: NormalizedPatientForm | null;
} {
  const errors: FormErrors = {};
  const fullName = compactSpaces(form.fullName);
  const titleFa = compactSpaces(form.titleFa);
  const phoneInput = latinDigits(form.phone).trim();
  const phone = phoneInput.replace(/[\s()-]/g, "");
  const weeklyTargetInput = latinDigits(form.weeklyTarget).trim();
  const birthYear = gregorianBirthYear(form.birthYear);
  const weeklyTarget = Number(weeklyTargetInput);

  if (fullName.length < 2) {
    errors.fullName = t.errName2;
  } else if (fullName.length > 120) {
    errors.fullName = t.errName120;
  }

  if (phone && !/^\+?\d{7,15}$/.test(phone)) {
    errors.phone = t.errPhone;
  }

  if (
    birthYear !== null &&
    (!Number.isInteger(birthYear) ||
      birthYear < 1900 ||
      birthYear > CURRENT_YEAR)
  ) {
    errors.birthYear = t.errBirthYear(CURRENT_YEAR);
  }

  if (titleFa.length < 2) {
    errors.titleFa = t.errTitle2;
  } else if (titleFa.length > 160) {
    errors.titleFa = t.errTitle160;
  }

  if (
    !Number.isInteger(weeklyTarget) ||
    weeklyTarget < 1 ||
    weeklyTarget > 7
  ) {
    errors.weeklyTarget = t.errWeekly;
  }

  if (Object.keys(errors).length > 0) return { errors, normalized: null };
  return {
    errors,
    normalized: {
      fullName,
      phone: phone || null,
      birthYear,
      gender: form.gender || null,
      titleFa,
      weeklyTarget,
    },
  };
}

function inviteFailureMessage(reason: string | undefined, t: PatientsText): string {
  return (reason && t.invite[reason]) || t.invite.default;
}

function formatDate(value: string, locale: string, unknown: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return unknown;
  return date.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function genderLabel(gender: Gender | null, t: PatientsText): string {
  if (gender === "female") return t.female;
  if (gender === "male") return t.male;
  if (gender === "other") return t.other;
  return t.notRecorded;
}

export default function PatientRegistryPage() {
  const {
    profile,
    activeClinicId,
    loading: authLoading,
  } = useAuth();
  const t = useText(patientsText);
  const [registry, setRegistry] = useState<RegistryState>(emptyRegistry);
  const [query, setQuery] = useState<RegistryQuery>(() => emptyQuery(null));
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<PatientFormDraft>(() =>
    emptyPatientForm(null)
  );
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    clinicId: string;
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [therapists, setTherapists] = useState<
    { id: string; fullName: string }[]
  >([]);
  const activeClinicRef = useRef(activeClinicId);
  const submitInFlight = useRef(false);

  const canAccess =
    profile?.role === "clinic_owner" || profile?.role === "therapist";
  const scopedQuery =
    query.clinicId === activeClinicId ? query : emptyQuery(activeClinicId);
  const scopedForm =
    form.clinicId === activeClinicId ? form : emptyPatientForm(activeClinicId);
  const requestKey = activeClinicId
    ? `${activeClinicId}|${scopedQuery.applied}|${scopedQuery.page}`
    : null;

  useEffect(() => {
    activeClinicRef.current = activeClinicId;
  }, [activeClinicId]);

  useEffect(() => {
    if (isMockMode || !canAccess || !activeClinicId) {
      return;
    }
    const clinicId = activeClinicId;
    let cancelled = false;
    void fetchClinicTherapistDirectory(clinicId).then((directory) => {
      if (!cancelled && activeClinicRef.current === clinicId) {
        setTherapists(directory ?? []);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeClinicId, canAccess, retryToken]);

  useEffect(() => {
    if (
      isMockMode ||
      !canAccess ||
      !activeClinicId ||
      requestKey === null
    ) {
      return;
    }

    const clinicId = activeClinicId;
    const key = requestKey;
    let cancelled = false;

    async function loadPatients() {
      const result = await fetchPatientRegistry({
        clinicId,
        search: scopedQuery.applied,
        page: scopedQuery.page,
        pageSize: PAGE_SIZE,
      });
      if (cancelled) return;

      if (!result) {
        setRegistry({
          key,
          result: null,
          loading: false,
          error: "load_failed",
        });
        return;
      }

      setRegistry({ key, result, loading: false, error: null });
    }

    void loadPatients();
    return () => {
      cancelled = true;
    };
  }, [
    activeClinicId,
    canAccess,
    requestKey,
    retryToken,
    scopedQuery.applied,
    scopedQuery.page,
  ]);

  const scopedRegistry: RegistryState =
    requestKey && registry.key === requestKey
      ? registry
      : {
          key: requestKey,
          result: null,
          loading: Boolean(requestKey && canAccess && !isMockMode),
          error: null,
        };
  const result = scopedRegistry.result;
  const totalPages = Math.max(
    1,
    Math.ceil((result?.total ?? 0) / PAGE_SIZE)
  );
  const currentFeedback =
    feedback?.clinicId === activeClinicId ? feedback : null;
  const selectedPatient =
    result?.patients.find((patient) => patient.id === selectedPatientId) ?? null;

  function applySearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery({
      clinicId: activeClinicId,
      draft: scopedQuery.draft,
      applied: scopedQuery.draft.trim().slice(0, 80),
      page: 1,
    });
  }

  function clearSearch() {
    setQuery(emptyQuery(activeClinicId));
  }

  function changePage(page: number) {
    if (page < 1 || page > totalPages) return;
    setQuery({ ...scopedQuery, clinicId: activeClinicId, page });
  }

  function retry() {
    setRegistry((previous) =>
      previous.key === requestKey
        ? { ...previous, loading: true, error: null }
        : previous
    );
    setRetryToken((value) => value + 1);
  }

  function updateForm(field: PatientFormField, value: string) {
    setForm({ ...scopedForm, clinicId: activeClinicId, [field]: value });
    setFormErrors((previous) => ({ ...previous, [field]: undefined }));
    setFeedback(null);
  }

  async function submitPatient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      submitInFlight.current ||
      !activeClinicId ||
      !profile ||
      (profile.role !== "clinic_owner" && profile.role !== "therapist")
    ) {
      return;
    }

    const validated = validatePatientForm(scopedForm, t);
    setFormErrors(validated.errors);
    if (!validated.normalized) return;

    const clinicId = activeClinicId;
    submitInFlight.current = true;
    setSubmitting(true);
    setFeedback(null);

    const ok = await createPatientEpisode({
      clinicId,
      ...validated.normalized,
      assignedTherapistId: profile.role === "therapist" ? profile.id : null,
    });

    submitInFlight.current = false;
    setSubmitting(false);
    if (activeClinicRef.current !== clinicId) return;

    if (!ok) {
      setFeedback({
        clinicId,
        tone: "error",
        message: t.createFailed,
      });
      return;
    }

    setForm(emptyPatientForm(clinicId));
    setFormErrors({});
    setQuery(emptyQuery(clinicId));
    setFeedback({
      clinicId,
      tone: "success",
      message: t.created,
    });
    setRetryToken((value) => value + 1);
  }

  if (isMockMode) {
    return (
      <div className="space-y-6">
        <PageIntro
          title={t.title}
          description={t.introShort}
        />
        <EmptyState
          icon="user"
          title={t.demoEmpty}
          description={t.demoEmptyHint}
        />
      </div>
    );
  }

  if (authLoading) {
    return (
      <Card>
        <Spinner label={t.checkingAccess} />
      </Card>
    );
  }

  if (!canAccess) {
    return (
      <div className="space-y-6">
        <PageIntro
          title={t.title}
          description={t.introShort}
        />
        <Card>
          <CardBody>
            <div role="alert" className="flex items-start gap-3">
              <Icon name="shield" className="mt-0.5 text-[var(--color-danger)]" />
              <div>
                <h2 className="text-sm font-semibold text-[var(--color-ink)]">
                  {t.accessRequired}
                </h2>
                <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                  {t.accessRequiredHint}
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  if (!activeClinicId) {
    return (
      <div className="space-y-6">
        <PageIntro
          title={t.title}
          description={t.introShort}
        />
        <EmptyState
          icon="search"
          title={t.selectClinic}
          description={t.selectClinicHint}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageIntro
        title={t.title}
        description={t.intro}
        action={
          <Button
            onClick={() => setShowCreate((visible) => !visible)}
            aria-expanded={showCreate}
            aria-controls="create-patient-panel"
          >
            <Icon name={showCreate ? "close" : "plus"} width={15} height={15} />
            {showCreate ? t.closeForm : t.newPatient}
          </Button>
        }
      />

      {showCreate && (
        <Card>
          <div id="create-patient-panel">
            <CardHeader
              title={t.createTitle}
              subtitle={t.createSubtitle}
              icon={<Icon name="user" />}
            />
            <CardBody>
              <form onSubmit={submitPatient} className="space-y-5" noValidate>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field
                    label={t.fullName}
                    required
                    error={formErrors.fullName}
                  >
                    <Input
                      value={scopedForm.fullName}
                      onChange={(event) =>
                        updateForm("fullName", event.target.value)
                      }
                      maxLength={120}
                      autoComplete="name"
                    />
                  </Field>
                  <Field
                    label={t.phoneOptional}
                    hint={t.phoneHint}
                    error={formErrors.phone}
                  >
                    <Input
                      value={scopedForm.phone}
                      onChange={(event) =>
                        updateForm("phone", event.target.value)
                      }
                      maxLength={30}
                      inputMode="tel"
                      autoComplete="tel"
                      dir="ltr"
                    />
                  </Field>
                  <Field
                    label={t.birthYearOptional}
                    hint={t.birthYearHint}
                    error={formErrors.birthYear}
                  >
                    <Input
                      value={scopedForm.birthYear}
                      onChange={(event) =>
                        updateForm("birthYear", event.target.value)
                      }
                      inputMode="numeric"
                      maxLength={4}
                      dir="ltr"
                    />
                  </Field>
                  <Field label={t.genderOptional} error={formErrors.gender}>
                    <Select
                      value={scopedForm.gender}
                      onChange={(event) =>
                        updateForm("gender", event.target.value)
                      }
                    >
                      <option value="">{t.notRecorded}</option>
                      <option value="female">{t.female}</option>
                      <option value="male">{t.male}</option>
                      <option value="other">{t.other}</option>
                    </Select>
                  </Field>
                  <Field
                    label={t.episodeTitle}
                    required
                    error={formErrors.titleFa}
                  >
                    <Input
                      value={scopedForm.titleFa}
                      onChange={(event) =>
                        updateForm("titleFa", event.target.value)
                      }
                      maxLength={160}
                      dir="auto"
                    />
                  </Field>
                  <Field
                    label={t.weeklyTarget}
                    required
                    hint={t.weeklyTargetHint}
                    error={formErrors.weeklyTarget}
                  >
                    <Input
                      value={scopedForm.weeklyTarget}
                      onChange={(event) =>
                        updateForm("weeklyTarget", event.target.value)
                      }
                      inputMode="numeric"
                      maxLength={2}
                      dir="ltr"
                    />
                  </Field>
                </div>

                <p className="rounded-xl bg-[var(--color-surface-muted)] px-4 py-3 text-xs text-[var(--color-ink-soft)]">
                  {profile?.role === "therapist"
                    ? t.therapistAutoAssign
                    : t.ownerUnassigned}
                </p>

                {currentFeedback && (
                  <p
                    role={currentFeedback.tone === "error" ? "alert" : "status"}
                    className={cn(
                      "rounded-xl px-4 py-3 text-sm",
                      currentFeedback.tone === "error"
                        ? "bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
                        : "bg-[var(--color-success-soft)] text-[var(--color-success)]"
                    )}
                  >
                    {currentFeedback.message}
                  </p>
                )}

                <div className="flex justify-end">
                  <Button type="submit" disabled={submitting}>
                    <Icon name="plus" width={15} height={15} />
                    {submitting ? t.creating : t.createButton}
                  </Button>
                </div>
              </form>
            </CardBody>
          </div>
        </Card>
      )}

      <Card>
        <CardBody className="space-y-4">
          <form
            role="search"
            onSubmit={applySearch}
            className="flex flex-col gap-3 sm:flex-row"
          >
            <label htmlFor="patient-search" className="sr-only">
              {t.searchLabel}
            </label>
            <Input
              id="patient-search"
              type="search"
              value={scopedQuery.draft}
              onChange={(event) =>
                setQuery({
                  ...scopedQuery,
                  clinicId: activeClinicId,
                  draft: event.target.value,
                })
              }
              maxLength={80}
              placeholder={t.searchPlaceholder}
              className="sm:max-w-md"
            />
            <Button type="submit" variant="secondary">
              <Icon name="search" width={15} height={15} />
              {t.search}
            </Button>
            {scopedQuery.applied && (
              <Button type="button" variant="ghost" onClick={clearSearch}>
                {t.clear}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              onClick={retry}
              disabled={scopedRegistry.loading}
              className="sm:ms-auto"
            >
              <Icon name="clock" width={15} height={15} />
              {t.refresh}
            </Button>
          </form>
        </CardBody>
      </Card>

      {/* Keep the table and the open panel mounted while refreshing after
          an action; otherwise the panel's confirmation message is lost. */}
      {scopedRegistry.loading && !result ? (
        <Card>
          <Spinner label={t.loadingPatients} />
        </Card>
      ) : scopedRegistry.error ? (
        <Card>
          <CardBody className="text-center">
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {t.loadFailed}
            </p>
            <Button className="mt-4" variant="secondary" onClick={retry}>
              {t.tryAgain}
            </Button>
          </CardBody>
        </Card>
      ) : !result || result.patients.length === 0 ? (
        <EmptyState
          icon={scopedQuery.applied ? "search" : "user"}
          title={
            scopedQuery.applied
              ? t.noMatches
              : t.noPatients
          }
          description={
            scopedQuery.applied
              ? t.noMatchesHint
              : t.noPatientsHint
          }
          action={
            scopedQuery.applied ? (
              <Button variant="secondary" onClick={clearSearch}>
                {t.clearSearch}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <RegistryTable
            patients={result.patients}
            total={result.total}
            page={scopedQuery.page}
            totalPages={totalPages}
            selectedPatientId={selectedPatientId}
            onManage={setSelectedPatientId}
            onPageChange={changePage}
          />
          {selectedPatient && profile && (
            <PatientManagementPanel
              key={selectedPatient.id}
              patient={selectedPatient}
              therapists={therapists}
              currentUserId={profile.id}
              isOwner={profile.role === "clinic_owner"}
              onChanged={retry}
              onArchived={() => {
                setSelectedPatientId(null);
                retry();
              }}
              onClose={() => setSelectedPatientId(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

function RegistryTable({
  patients,
  total,
  page,
  totalPages,
  selectedPatientId,
  onManage,
  onPageChange,
}: {
  patients: PatientRegistryItem[];
  total: number;
  page: number;
  totalPages: number;
  selectedPatientId: string | null;
  onManage: (patientId: string) => void;
  onPageChange: (page: number) => void;
}) {
  const t = useText(patientsText);
  const { locale } = useLocale();
  const dateLocale = intlLocale(locale);
  const first = (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(total, first + patients.length - 1);

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-start text-sm">
          <caption className="sr-only">
            {t.caption}
          </caption>
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs text-[var(--color-ink-soft)]">
            <tr>
              <th scope="col" className="px-5 py-3 text-start font-medium">
                {t.colPatient}
              </th>
              <th scope="col" className="px-5 py-3 text-start font-medium">
                {t.colDemographics}
              </th>
              <th scope="col" className="px-5 py-3 text-start font-medium">
                {t.colEpisode}
              </th>
              <th scope="col" className="px-5 py-3 text-start font-medium">
                {t.colTherapist}
              </th>
              <th scope="col" className="px-5 py-3 text-start font-medium">
                {t.colAdded}
              </th>
              <th scope="col" className="px-5 py-3 text-start font-medium">
                {t.colActions}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {patients.map((patient) => (
              <tr key={patient.id} className="align-top">
                <td className="px-5 py-4">
                  <p className="font-semibold text-[var(--color-ink)]" dir="auto">
                    {patient.fullName}
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-ink-soft)]" dir="ltr">
                    {patient.phone ?? t.noPhone}
                  </p>
                </td>
                <td className="px-5 py-4 text-[var(--color-ink-soft)]">
                  <p>{genderLabel(patient.gender, t)}</p>
                  <p className="mt-1 text-xs">
                    {patient.birthYear
                      ? t.born(
                          locale === "fa" ? patient.birthYear - 621 : patient.birthYear,
                          Math.max(0, CURRENT_YEAR - patient.birthYear)
                        )
                      : t.noBirthYear}
                  </p>
                </td>
                <td className="px-5 py-4">
                  {patient.activeEpisode ? (
                    <>
                      <p className="font-medium text-[var(--color-ink)]" dir="auto">
                        {patient.activeEpisode.titleFa}
                      </p>
                      <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                        {t.targetSince(
                          patient.activeEpisode.weeklyTarget,
                          formatDate(patient.activeEpisode.startedAt, dateLocale, t.unknownDate)
                        )}
                      </p>
                    </>
                  ) : (
                    <span className="text-xs font-medium text-[var(--color-warn)]">
                      {t.noActiveEpisode}
                    </span>
                  )}
                </td>
                <td className="px-5 py-4">
                  {patient.assignedTherapists.length > 0 ? (
                    <ul className="space-y-1 text-[var(--color-ink-soft)]">
                      {patient.assignedTherapists.map((therapist) => (
                        <li key={therapist.id}>{therapist.fullName}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-xs text-[var(--color-warn)]">
                      {t.unassigned}
                    </span>
                  )}
                </td>
                <td className="px-5 py-4 text-xs text-[var(--color-ink-soft)]">
                  <time dateTime={patient.createdAt}>
                    {formatDate(patient.createdAt, dateLocale, t.unknownDate)}
                  </time>
                </td>
                <td className="px-5 py-4">
                  <Button
                    type="button"
                    size="sm"
                    variant={selectedPatientId === patient.id ? "primary" : "secondary"}
                    onClick={() => onManage(patient.id)}
                  >
                    <Icon name="edit" width={14} height={14} />
                    {t.manage}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-3 border-t border-[var(--color-border)] px-5 py-4 text-xs text-[var(--color-ink-soft)] sm:flex-row sm:items-center sm:justify-between">
        <p aria-live="polite">
          {t.showing(first, last, total)}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label={t.previousAria}
          >
            {t.previous}
          </Button>
          <span>
            {t.pageOf(page, totalPages)}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label={t.nextAria}
          >
            {t.next}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function PatientManagementPanel({
  patient,
  therapists,
  currentUserId,
  isOwner,
  onChanged,
  onArchived,
  onClose,
}: {
  patient: PatientRegistryItem;
  therapists: { id: string; fullName: string }[];
  currentUserId: string;
  isOwner: boolean;
  onChanged: () => void;
  onArchived: () => void;
  onClose: () => void;
}) {
  const t = useText(patientsText);
  const { locale } = useLocale();
  const dateLocale = intlLocale(locale);
  const [fullName, setFullName] = useState(patient.fullName);
  const [phone, setPhone] = useState(patient.phone ?? "");
  const [birthYear, setBirthYear] = useState(
    patient.birthYear?.toString() ?? ""
  );
  const [gender, setGender] = useState<"" | Gender>(patient.gender ?? "");
  const [therapistId, setTherapistId] = useState(
    patient.assignedTherapists[0]?.id ?? ""
  );
  const [episodeTitle, setEpisodeTitle] = useState("");
  const [weeklyTarget, setWeeklyTarget] = useState("5");
  const [invitePhone, setInvitePhone] = useState(patient.phone ?? "");
  const [relationship, setRelationship] =
    useState<PatientAccountRelationship>("self");
  const [expiresOn, setExpiresOn] = useState("");
  const [authorityAttested, setAuthorityAttested] = useState(false);
  const [revocationReason, setRevocationReason] = useState("");
  const [archiveReason, setArchiveReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [referenceTime] = useState(() => Date.now());

  async function runAction(
    key: string,
    operation: () => Promise<boolean>,
    successMessage: string,
    afterSuccess?: () => void
  ) {
    if (busy) return;
    setBusy(key);
    setStatus(null);
    const ok = await operation();
    setBusy(null);
    if (!ok) {
      setStatus({
        tone: "error",
        message: t.changeRejected,
      });
      return;
    }
    setStatus({ tone: "success", message: successMessage });
    afterSuccess?.();
    onChanged();
  }

  async function saveDemographics(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedBirthYear = gregorianBirthYear(birthYear);
    await runAction(
      "demographics",
      () =>
        updatePatientRecord({
          patientId: patient.id,
          fullName: compactSpaces(fullName),
          phone: latinDigits(phone).trim().replace(/[\s()-]/g, "") || null,
          birthYear: normalizedBirthYear,
          gender: gender || null,
        }),
      t.demographicsSaved
    );
  }

  async function saveAssignment() {
    await runAction(
      "assignment",
      () => setPatientPrimaryTherapist(patient.id, therapistId || null),
      therapistId
        ? t.assignmentSaved
        : t.nowUnassigned
    );
  }

  async function changeEpisode(statusValue: "active" | "paused" | "completed") {
    const episode = patient.latestEpisode;
    if (!episode) return;
    await runAction(
      `episode-${statusValue}`,
      () => transitionCareEpisode(episode.id, statusValue),
      statusValue === "active"
        ? t.resumed
        : statusValue === "paused"
          ? t.paused
          : t.completed
    );
  }

  async function createEpisode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedTarget = Number(latinDigits(weeklyTarget));
    await runAction(
      "new-episode",
      () =>
        startPatientEpisode({
          patientId: patient.id,
          titleFa: compactSpaces(episodeTitle),
          weeklyTarget: normalizedTarget,
          assignedTherapistId: isOwner
            ? therapistId || null
            : currentUserId,
        }),
      t.episodeCreated,
      () => setEpisodeTitle("")
    );
  }

  async function sendInvitation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!authorityAttested || (relationship !== "self" && !expiresOn)) {
      setStatus({
        tone: "error",
        message: t.attestRequired,
      });
      return;
    }
    const mobile = normalizeIranianMobile(invitePhone);
    if (!mobile) {
      setStatus({
        tone: "error",
        message: t.invalidMobile,
      });
      return;
    }
    setBusy("invite");
    setStatus(null);
    const invitation = await invitePatientAccount({
      patientId: patient.id,
      phone: mobile,
      relationship,
      expiresAt: expiresOn
        ? new Date(`${expiresOn}T23:59:59.999Z`).toISOString()
        : null,
      authorityAttested,
    });
    setBusy(null);
    if (!invitation.ok) {
      setStatus({
        tone: "error",
        message: inviteFailureMessage(invitation.reason, t),
      });
      return;
    }
    setStatus({
      tone: "success",
      message:
        invitation.status === "created"
          ? t.linkedCreated(formatIranianMobile(mobile))
          : t.linkedExisting(formatIranianMobile(mobile)),
    });
    setAuthorityAttested(false);
    onChanged();
  }

  async function revokeLink(userId: string) {
    await runAction(
      `revoke-${userId}`,
      () =>
        revokePatientAccountLink(patient.id, userId, revocationReason),
      t.revoked,
      () => setRevocationReason("")
    );
  }

  async function archivePatient() {
    await runAction(
      "archive",
      () => archivePatientRecord(patient.id, archiveReason),
      t.archived,
      onArchived
    );
  }

  const latestEpisode = patient.latestEpisode;
  const activeLinks = patient.accountLinks.filter((link) => {
    if (link.revokedAt) return false;
    return !link.expiresAt || new Date(link.expiresAt).getTime() > referenceTime;
  });

  return (
    <Card>
      <CardHeader
        title={t.manageTitle(patient.fullName)}
        subtitle={t.manageSubtitle}
        icon={<Icon name="edit" />}
        action={
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            <Icon name="close" width={14} height={14} />
            {t.close}
          </Button>
        }
      />
      <CardBody className="space-y-6">
        {status && (
          <p
            role={status.tone === "error" ? "alert" : "status"}
            className={cn(
              "rounded-xl px-4 py-3 text-sm",
              status.tone === "error"
                ? "bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
                : "bg-[var(--color-success-soft)] text-[var(--color-success)]"
            )}
          >
            {status.message}
          </p>
        )}

        <section aria-labelledby="patient-demographics-heading">
          <h3 id="patient-demographics-heading" className="text-sm font-semibold">
            {t.demographics}
          </h3>
          <form onSubmit={saveDemographics} className="mt-3 grid gap-3 md:grid-cols-5">
            <Field label={t.fullName} required>
              <Input value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={120} />
            </Field>
            <Field label={t.phone}>
              <Input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" maxLength={30} />
            </Field>
            <Field label={t.birthYear} hint={t.birthYearHint}>
              <Input value={birthYear} onChange={(event) => setBirthYear(event.target.value)} inputMode="numeric" maxLength={4} />
            </Field>
            <Field label={t.gender}>
              <Select value={gender} onChange={(event) => setGender(event.target.value as "" | Gender)}>
                <option value="">{t.notRecorded}</option>
                <option value="female">{t.female}</option>
                <option value="male">{t.male}</option>
                <option value="other">{t.other}</option>
              </Select>
            </Field>
            <div className="flex items-end">
              <Button type="submit" size="sm" disabled={Boolean(busy)}>
                {busy === "demographics" ? t.saving : t.saveDetails}
              </Button>
            </div>
          </form>
        </section>

        <section className="border-t border-[var(--color-border)] pt-5" aria-labelledby="assignment-heading">
          <h3 id="assignment-heading" className="text-sm font-semibold">
            {t.therapistAssignment}
          </h3>
          {isOwner ? (
            <div className="mt-3 flex max-w-xl flex-col gap-3 sm:flex-row sm:items-end">
              <Field label={t.primaryTherapist}>
                <Select value={therapistId} onChange={(event) => setTherapistId(event.target.value)}>
                  <option value="">{t.unassigned}</option>
                  {therapists.map((therapist) => (
                    <option key={therapist.id} value={therapist.id}>{therapist.fullName}</option>
                  ))}
                </Select>
              </Field>
              <Button type="button" size="sm" disabled={Boolean(busy)} onClick={saveAssignment}>
                {busy === "assignment" ? t.saving : t.updateAssignment}
              </Button>
            </div>
          ) : (
            <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
              {t.ownerOnlyReassign}
            </p>
          )}
        </section>

        <section className="border-t border-[var(--color-border)] pt-5" aria-labelledby="episode-heading">
          <h3 id="episode-heading" className="text-sm font-semibold">{t.careEpisode}</h3>
          {latestEpisode ? (
            <div className="mt-3 rounded-xl bg-[var(--color-surface-muted)] p-4">
              <p className="font-medium" dir="auto">{latestEpisode.titleFa}</p>
              <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                {t.episodeStatus(
                  t.statuses[latestEpisode.status] ?? latestEpisode.status,
                  latestEpisode.weeklyTarget,
                  formatDate(latestEpisode.startedAt, dateLocale, t.unknownDate)
                )}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {latestEpisode.status === "active" && (
                  <Button type="button" size="sm" variant="secondary" disabled={Boolean(busy)} onClick={() => changeEpisode("paused")}>{t.pause}</Button>
                )}
                {latestEpisode.status === "paused" && (
                  <Button type="button" size="sm" variant="secondary" disabled={Boolean(busy)} onClick={() => changeEpisode("active")}>{t.resume}</Button>
                )}
                {latestEpisode.status !== "completed" && (
                  <Button type="button" size="sm" variant="danger" disabled={Boolean(busy)} onClick={() => changeEpisode("completed")}>{t.complete}</Button>
                )}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-[var(--color-ink-soft)]">{t.noEpisode}</p>
          )}
          {!patient.activeEpisode && (
            <form onSubmit={createEpisode} className="mt-4 grid gap-3 md:grid-cols-[1fr_10rem_auto] md:items-end">
              <Field label={t.newEpisodeTitle} required>
                <Input value={episodeTitle} onChange={(event) => setEpisodeTitle(event.target.value)} maxLength={160} dir="auto" />
              </Field>
              <Field label={t.weeklyTarget} required hint={t.daysHint}>
                <Input value={weeklyTarget} onChange={(event) => setWeeklyTarget(event.target.value)} inputMode="numeric" maxLength={1} />
              </Field>
              <Button type="submit" size="sm" disabled={Boolean(busy)}>
                {busy === "new-episode" ? t.starting : t.startEpisode}
              </Button>
            </form>
          )}
        </section>

        {isOwner && (
          <section className="border-t border-[var(--color-border)] pt-5" aria-labelledby="portal-access-heading">
            <h3 id="portal-access-heading" className="text-sm font-semibold">{t.portalAccess}</h3>
            <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
              {t.portalHint}
            </p>
            <form onSubmit={sendInvitation} className="mt-3 grid gap-3 md:grid-cols-3">
              <Field label={t.mobile} required hint={t.mobileHint}>
                <Input type="tel" inputMode="tel" dir="ltr" value={invitePhone} onChange={(event) => setInvitePhone(event.target.value)} maxLength={20} autoComplete="off" placeholder="09123456789" />
              </Field>
              <Field label={t.relationship} required>
                <Select value={relationship} onChange={(event) => setRelationship(event.target.value as PatientAccountRelationship)}>
                  <option value="self">{t.relationships.self}</option>
                  <option value="parent">{t.relationships.parent}</option>
                  <option value="guardian">{t.relationships.guardian}</option>
                  <option value="caregiver">{t.relationships.caregiver}</option>
                </Select>
              </Field>
              <Field label={relationship === "self" ? t.expiryOptional : t.expiryRequired}>
                <Input type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} required={relationship !== "self"} />
              </Field>
              <label className="flex items-start gap-2 text-xs text-[var(--color-ink-soft)] md:col-span-2">
                <input type="checkbox" checked={authorityAttested} onChange={(event) => setAuthorityAttested(event.target.checked)} className="mt-0.5" />
                {t.attest}
              </label>
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={Boolean(busy) || !authorityAttested}>
                  <Icon name="send" width={14} height={14} />
                  {busy === "invite" ? t.linking : t.link}
                </Button>
              </div>
            </form>

            <div className="mt-5 space-y-3">
              <Field label={t.revokeReason}>
                <Input value={revocationReason} onChange={(event) => setRevocationReason(event.target.value)} maxLength={1000} />
              </Field>
              {activeLinks.length === 0 ? (
                <p className="text-sm text-[var(--color-ink-soft)]">{t.noActivePortal}</p>
              ) : (
                <ul className="space-y-2">
                  {activeLinks.map((link) => (
                    <li key={link.userId} className="flex flex-col gap-2 rounded-xl border border-[var(--color-border)] p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm">
                        <p className="font-medium" dir="ltr">
                          {link.phone ? formatIranianMobile(link.phone) : link.email ?? link.fullName}
                        </p>
                        <p className="text-xs text-[var(--color-ink-soft)]">
                          {t.relationships[link.relationship] ?? link.relationship}
                          {link.expiresAt
                            ? t.expires(formatDate(link.expiresAt, dateLocale, t.unknownDate))
                            : t.noExpiry}
                        </p>
                      </div>
                      <Button type="button" size="sm" variant="danger" disabled={Boolean(busy) || revocationReason.trim().length < 3} onClick={() => revokeLink(link.userId)}>
                        {t.revoke}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {isOwner && !patient.activeEpisode && (
          <section className="border-t border-[var(--color-border)] pt-5" aria-labelledby="archive-heading">
            <h3 id="archive-heading" className="text-sm font-semibold text-[var(--color-danger)]">{t.archiveTitle}</h3>
            <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
              {t.archiveHint}
            </p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
              <Field label={t.archiveReason} required>
                <Textarea value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} maxLength={1000} />
              </Field>
              <Button type="button" size="sm" variant="danger" disabled={Boolean(busy) || archiveReason.trim().length < 3} onClick={archivePatient}>
                {busy === "archive" ? t.archiving : t.archive}
              </Button>
            </div>
          </section>
        )}
      </CardBody>
    </Card>
  );
}
