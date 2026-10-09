"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, PageIntro, Spinner } from "@/components/ui/Misc";
import { isMockMode } from "@/lib/config";
import { hasClinicalSafetyClearance } from "@/lib/clinical/safety";
import { regionLabel } from "@/lib/data/bodyRegionsFa";
import { intlLocale, useText } from "@/lib/i18n/text";
import { useAuth } from "@/lib/store/AuthContext";
import { useCases } from "@/lib/store/CaseContext";
import { useLocale } from "@/lib/store/LocaleContext";
import {
  fetchClinicalAlerts,
  fetchClinicalDocumentation,
  fetchClinicianTickets,
  fetchPatientRegistry,
  fetchPrescriptionHistory,
  fetchTreatmentPlans,
} from "@/lib/supabase/db";
import type { OutcomeMeasurement, PatientCase } from "@/lib/types";
import { isUuid } from "@/lib/utils";
import { workspaceText } from "./text";

interface Loaded<T> {
  loading: boolean;
  failed: boolean;
  data: T | null;
}

/**
 * Load one section for a request key. State is tagged with the key it was
 * loaded for, so switching patient never shows the previous patient's rows
 * and nothing is set synchronously inside the effect.
 */
function useSection<T>(
  key: string | null,
  load: () => Promise<T | null>
): Loaded<T> {
  const [state, setState] = useState<{
    key: string;
    data: T | null;
    failed: boolean;
  } | null>(null);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    load()
      .then((data) => {
        if (!cancelled) setState({ key, data, failed: data === null });
      })
      .catch(() => {
        if (!cancelled) setState({ key, data: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
    // The key encodes every input of load().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!key) return { loading: false, failed: false, data: null };
  const current = state?.key === key ? state : null;
  return {
    loading: !current,
    failed: current?.failed ?? false,
    data: current?.data ?? null,
  };
}

function formatDate(value: string | null | undefined, locale: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(locale, { dateStyle: "medium" });
}

function outcomeTrends(measurements: OutcomeMeasurement[]) {
  const byInstrument = new Map<string, OutcomeMeasurement[]>();
  for (const measurement of measurements) {
    if (!measurement.isCurrent) continue;
    const list = byInstrument.get(measurement.instrumentKey) ?? [];
    list.push(measurement);
    byInstrument.set(measurement.instrumentKey, list);
  }
  return [...byInstrument.values()].map((list) => {
    const sorted = [...list].sort((a, b) =>
      a.measuredAt.localeCompare(b.measuredAt)
    );
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const delta = last.score - first.score;
    const better =
      delta === 0
        ? 0
        : (delta > 0) === (last.direction === "higher-better")
          ? 1
          : -1;
    return { first, last, count: sorted.length, better };
  });
}

export function WorkspaceClient() {
  const t = useText(workspaceText);
  const { locale } = useLocale();
  const dateLocale = intlLocale(locale);
  const router = useRouter();
  const patientId = useSearchParams().get("patient");
  const { profile, activeClinicId } = useAuth();
  const { cases, hydrated, loadError, setCurrentCase, reloadCases } = useCases();
  const [retryToken, setRetryToken] = useState(0);

  const canAccess =
    profile?.role === "clinic_owner" || profile?.role === "therapist";
  const validPatientId = isUuid(patientId);
  const enabled = !isMockMode && canAccess && Boolean(activeClinicId) && validPatientId;
  const baseKey = enabled ? `${activeClinicId}:${patientId}:${retryToken}` : null;

  const patient = useSection(baseKey, async () => {
    const result = await fetchPatientRegistry({
      clinicId: activeClinicId as string,
      patientId: patientId as string,
      pageSize: 1,
    });
    return result ? result.patients : null;
  });
  const record =
    patient.data?.find((row) => row.id === patientId && row.clinicId === activeClinicId) ??
    null;
  const episode = record?.activeEpisode ?? record?.latestEpisode ?? null;

  const patientCases: PatientCase[] = record
    ? cases.filter(
        (candidate) =>
          candidate.patientId === record.id &&
          (!candidate.clinicId || candidate.clinicId === activeClinicId)
      )
    : [];
  const latestCase = patientCases[0] ?? null;

  const episodeKey = baseKey && episode ? `${baseKey}:${episode.id}` : null;
  const caseKey = baseKey && latestCase ? `${baseKey}:${latestCase.id}` : null;
  const clinicKey = baseKey && record ? `${baseKey}:clinic` : null;

  const documentation = useSection(episodeKey, () =>
    fetchClinicalDocumentation(episode?.id as string)
  );
  const prescriptions = useSection(episodeKey, () =>
    fetchPrescriptionHistory(episode?.id as string)
  );
  const plans = useSection(caseKey, () => fetchTreatmentPlans(latestCase?.id as string));
  const alerts = useSection(clinicKey, () => fetchClinicalAlerts(activeClinicId as string));
  const tickets = useSection(clinicKey, () => fetchClinicianTickets(activeClinicId as string));

  function retry() {
    setRetryToken((value) => value + 1);
    reloadCases();
  }

  function openCase(caseId: string, href: string) {
    setCurrentCase(caseId);
    router.push(href);
  }

  const intro = <PageIntro title={t.title} description={t.intro} />;

  if (isMockMode) {
    return (
      <div className="space-y-6">
        {intro}
        <EmptyState icon="user" title={t.demoTitle} description={t.demoBody} />
      </div>
    );
  }
  if (!canAccess) {
    return (
      <div className="space-y-6">
        {intro}
        <EmptyState icon="shield" title={t.accessTitle} description={t.accessBody} />
      </div>
    );
  }
  if (!activeClinicId) {
    return (
      <div className="space-y-6">
        {intro}
        <EmptyState icon="search" title={t.noClinicTitle} description={t.noClinicBody} />
      </div>
    );
  }
  if (!patientId) {
    return (
      <div className="space-y-6">
        {intro}
        <EmptyState
          icon="user"
          title={t.noPatientTitle}
          description={t.noPatientBody}
          action={<ButtonLink href="/patients">{t.toRegistry}</ButtonLink>}
        />
      </div>
    );
  }
  if (!validPatientId) {
    return (
      <div className="space-y-6">
        {intro}
        <EmptyState
          icon="search"
          title={t.patientMissing}
          description={t.noPatientBody}
          action={<ButtonLink href="/patients">{t.toRegistry}</ButtonLink>}
        />
      </div>
    );
  }
  if (patient.loading) {
    return (
      <div className="space-y-6">
        {intro}
        <Card>
          <Spinner label={t.loadingPatient} />
        </Card>
      </div>
    );
  }
  if (patient.failed || !record) {
    return (
      <div className="space-y-6">
        {intro}
        <Card>
          <CardBody className="text-center">
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {patient.failed ? t.patientFailed : t.patientMissing}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              {patient.failed && (
                <Button variant="secondary" onClick={retry}>
                  {t.retry}
                </Button>
              )}
              <ButtonLink href="/patients" variant="secondary">
                {t.toRegistry}
              </ButtonLink>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  const age = record.birthYear ? new Date().getFullYear() - record.birthYear : null;
  const patientAlerts = (alerts.data ?? []).filter(
    (alert) => alert.patientId === record.id && alert.status !== "resolved"
  );
  const patientTickets = (tickets.data ?? []).filter(
    (ticket) => ticket.patientId === record.id
  );
  const openTicketCount = patientTickets.filter(
    (ticket) => ticket.status === "open" || ticket.status === "acknowledged"
  ).length;
  const latestPlan = [...(plans.data ?? [])].sort((a, b) => b.version - a.version)[0] ?? null;
  const prescriptionRows = [...(prescriptions.data ?? [])].sort(
    (a, b) => b.version - a.version
  );
  const currentProgram =
    prescriptionRows.find((row) => row.status === "published" || row.status === "suspended") ??
    prescriptionRows[0] ??
    null;
  const recentNotes = (documentation.data?.sessionNotes ?? [])
    .filter((note) => note.isCurrent)
    .slice(0, 3);
  const trends = outcomeTrends(documentation.data?.outcomeMeasurements ?? []);
  const latestDisposition = latestCase?.safetyScreen?.disposition ?? "not-screened";
  const latestCleared = hasClinicalSafetyClearance(latestCase?.safetyScreen);

  return (
    <div className="space-y-6">
      {intro}

      <Card>
        <CardBody className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-[var(--color-ink)]" dir="auto">
              {record.fullName}
            </h2>
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--color-ink-soft)]">
              {age !== null && <span>{t.age(age)}</span>}
              <span dir="ltr">{record.phone ?? t.noPhone}</span>
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {episode ? (
                <>
                  <Badge tone={record.activeEpisode ? "success" : "neutral"}>
                    {record.activeEpisode ? t.activeEpisode : t.latestEpisode}
                  </Badge>
                  <Badge>
                    <span dir="auto">{episode.titleFa}</span>
                  </Badge>
                  {record.latestEpisode && !record.activeEpisode && (
                    <Badge>{t.episodeStatus[record.latestEpisode.status]}</Badge>
                  )}
                  <Badge>{t.since(formatDate(episode.startedAt, dateLocale))}</Badge>
                </>
              ) : (
                <Badge tone="warn">{t.noEpisode}</Badge>
              )}
            </div>
            <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
              {t.therapists}:{" "}
              {record.assignedTherapists.length > 0
                ? record.assignedTherapists.map((therapist) => therapist.fullName).join("، ")
                : t.unassigned}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/new-case" size="sm">
              <Icon name="new-case" width={14} height={14} />
              {t.newAssessment}
            </ButtonLink>
            <ButtonLink
              href={`/clinical-records?patient=${encodeURIComponent(record.id)}`}
              size="sm"
              variant="secondary"
            >
              <Icon name="edit" width={14} height={14} />
              {t.sessionNotes}
            </ButtonLink>
            {latestCase && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => openCase(latestCase.id, "/treatment-planner")}
              >
                <Icon name="treatment" width={14} height={14} />
                {t.planner}
              </Button>
            )}
            <ButtonLink href="/tickets" size="sm" variant="secondary">
              <Icon name="chat" width={14} height={14} />
              {t.inbox}
            </ButtonLink>
          </div>
        </CardBody>
      </Card>

      <section
        aria-label={t.safetyTitle}
        className={
          patientAlerts.length > 0
            ? "rounded-2xl border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] px-5 py-4"
            : "rounded-2xl border border-[var(--color-border)] bg-white px-5 py-4"
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1 text-sm">
            {alerts.loading ? (
              <p className="text-[var(--color-ink-soft)]">{t.loading}</p>
            ) : alerts.failed ? (
              <p role="alert" className="text-[var(--color-danger)]">
                {t.sectionFailed}
              </p>
            ) : patientAlerts.length > 0 ? (
              <p role="alert" className="font-semibold text-[var(--color-danger)]">
                {t.openAlerts(patientAlerts.length)}
              </p>
            ) : (
              <p className="text-[var(--color-ink-soft)]">{t.noOpenAlerts}</p>
            )}
            {latestCase && (
              <p className="text-xs text-[var(--color-ink-soft)]">
                {t.latestScreen}:{" "}
                <Badge tone={latestCleared ? "success" : "danger"}>
                  {t.dispositions[latestDisposition] ?? latestDisposition}
                </Badge>
              </p>
            )}
          </div>
          {patientAlerts.length > 0 && (
            <ButtonLink href="/alerts" size="sm" variant="danger">
              {t.reviewAlerts}
            </ButtonLink>
          )}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title={t.assessmentsTitle} icon={<Icon name="analysis" />} />
          <CardBody>
            {!hydrated ? (
              <Spinner label={t.loading} />
            ) : loadError ? (
              <p role="alert" className="text-sm text-[var(--color-danger)]">
                {t.casesFailed}
              </p>
            ) : patientCases.length === 0 ? (
              <p className="text-sm text-[var(--color-ink-soft)]">{t.assessmentsEmpty}</p>
            ) : (
              <ol className="space-y-2">
                {patientCases.slice(0, 5).map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--color-border)] p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--color-ink)]" dir="auto">
                        {item.mainComplaint}
                      </p>
                      <p className="mt-1 flex flex-wrap gap-1.5 text-xs text-[var(--color-ink-soft)]">
                        <span>{formatDate(item.createdAt, dateLocale)}</span>
                        {item.region && <Badge tone="primary">{regionLabel(item.region, locale)}</Badge>}
                        <Badge tone={item.painIntensity >= 7 ? "danger" : "neutral"}>
                          {t.painOf(item.painIntensity)}
                        </Badge>
                        <Badge
                          tone={hasClinicalSafetyClearance(item.safetyScreen) ? "success" : "danger"}
                        >
                          {t.dispositions[item.safetyScreen?.disposition ?? "not-screened"] ??
                            item.safetyScreen?.disposition}
                        </Badge>
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => openCase(item.id, "/case-analysis")}
                    >
                      {t.openAnalysis}
                    </Button>
                  </li>
                ))}
              </ol>
            )}
          </CardBody>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title={t.planTitle} icon={<Icon name="treatment" />} />
            <CardBody>
              {!latestCase ? (
                <p className="text-sm text-[var(--color-ink-soft)]">{t.planNoCase}</p>
              ) : plans.loading ? (
                <Spinner label={t.loading} />
              ) : plans.failed ? (
                <p role="alert" className="text-sm text-[var(--color-danger)]">{t.sectionFailed}</p>
              ) : !latestPlan ? (
                <p className="text-sm text-[var(--color-ink-soft)]">{t.planEmpty}</p>
              ) : (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone={latestPlan.status === "approved" ? "success" : latestPlan.status === "draft" ? "warn" : "neutral"}>
                    {t.planStatus[latestPlan.status] ?? latestPlan.status}
                  </Badge>
                  <span className="text-xs text-[var(--color-ink-soft)]">
                    {t.version(latestPlan.version)} · {formatDate(latestPlan.reviewedAt ?? latestPlan.createdAt, dateLocale)}
                  </span>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t.programTitle} icon={<Icon name="exercise" />} />
            <CardBody>
              {!episode ? (
                <p className="text-sm text-[var(--color-ink-soft)]">{t.noEpisode}</p>
              ) : prescriptions.loading ? (
                <Spinner label={t.loading} />
              ) : prescriptions.failed ? (
                <p role="alert" className="text-sm text-[var(--color-danger)]">{t.sectionFailed}</p>
              ) : !currentProgram ? (
                <p className="text-sm text-[var(--color-ink-soft)]">{t.programEmpty}</p>
              ) : (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge
                    tone={
                      currentProgram.status === "published"
                        ? "success"
                        : currentProgram.status === "suspended"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    {t.programStatus[currentProgram.status] ?? currentProgram.status}
                  </Badge>
                  <span className="text-xs text-[var(--color-ink-soft)]">
                    {t.version(currentProgram.version)} · {t.exercisesCount(currentProgram.items.length)} ·{" "}
                    {t.reviewBy(formatDate(currentProgram.reviewDate, dateLocale))}
                  </span>
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader title={t.sessionsTitle} icon={<Icon name="clock" />} />
          <CardBody className="space-y-4">
            {!episode ? (
              <p className="text-sm text-[var(--color-ink-soft)]">{t.noEpisode}</p>
            ) : documentation.loading ? (
              <Spinner label={t.loading} />
            ) : documentation.failed ? (
              <p role="alert" className="text-sm text-[var(--color-danger)]">{t.sectionFailed}</p>
            ) : (
              <>
                {recentNotes.length === 0 ? (
                  <p className="text-sm text-[var(--color-ink-soft)]">{t.sessionsEmpty}</p>
                ) : (
                  <ol className="space-y-2">
                    {recentNotes.map((note) => (
                      <li key={note.id} className="rounded-xl border border-[var(--color-border)] p-3 text-sm">
                        <time className="text-xs text-[var(--color-ink-soft)]">
                          {formatDate(note.occurredAt, dateLocale)}
                        </time>
                        {note.plan && (
                          <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-[var(--color-ink)]" dir="auto">
                            <span className="font-semibold">{t.planLine}: </span>
                            {note.plan}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
                <div>
                  <h3 className="mb-2 text-xs font-semibold text-[var(--color-ink-faint)]">
                    {t.outcomesTitle}
                  </h3>
                  {trends.length === 0 ? (
                    <p className="text-sm text-[var(--color-ink-soft)]">{t.outcomesEmpty}</p>
                  ) : (
                    <ul className="space-y-1.5 text-sm">
                      {trends.map(({ first, last, count, better }) => (
                        <li key={last.instrumentKey} className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[var(--color-ink)]">{last.instrumentName}</span>
                          <span className="flex items-center gap-1.5 text-xs text-[var(--color-ink-soft)]">
                            {count > 1 ? t.change(first.score, last.score) : last.score} {last.unit}
                            {count > 1 && (
                              <Badge tone={better > 0 ? "success" : better < 0 ? "danger" : "neutral"}>
                                {better > 0 ? t.improved : better < 0 ? t.worsened : t.unchanged}
                              </Badge>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={t.messagesTitle}
            icon={<Icon name="chat" />}
            action={openTicketCount > 0 ? <Badge tone="warn">{t.openTickets(openTicketCount)}</Badge> : undefined}
          />
          <CardBody>
            {tickets.loading ? (
              <Spinner label={t.loading} />
            ) : tickets.failed ? (
              <p role="alert" className="text-sm text-[var(--color-danger)]">{t.sectionFailed}</p>
            ) : patientTickets.length === 0 ? (
              <p className="text-sm text-[var(--color-ink-soft)]">{t.messagesEmpty}</p>
            ) : (
              <ul className="space-y-2">
                {patientTickets.slice(0, 4).map((ticket) => (
                  <li key={ticket.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-[var(--color-ink)]" dir="auto">
                      {ticket.subject}
                    </span>
                    <Badge
                      tone={ticket.status === "open" || ticket.status === "acknowledged" ? "warn" : "success"}
                    >
                      {t.ticketStatus[ticket.status] ?? ticket.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <p className="text-xs text-[var(--color-ink-faint)]">{t.provisional}</p>
    </div>
  );
}
