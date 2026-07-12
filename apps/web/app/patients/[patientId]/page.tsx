"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/lib/store/LocaleContext";
import { useAuth } from "@/lib/store/AuthContext";
import { isMockMode } from "@/lib/config";
import {
  getPatient,
  updatePatient,
  type PatientRow,
} from "@/lib/supabase/clinical";
import { sessionCounts } from "@/lib/clinical/calc";
import {
  PageState,
  StatusBadge,
  ageFrom,
  displayName,
  maskedPhone,
  type LoadState,
} from "@/components/patients/shared";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

const tabs = ["overview", "episodes", "admin", "appointments", "tickets", "exercises", "documents"] as const;
type Tab = (typeof tabs)[number];

export default function PatientRecordPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = use(params);
  const { t } = useLocale();
  const { session, loading: authLoading, profile } = useAuth();
  const [patient, setPatient] = useState<PatientRow | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [tab, setTab] = useState<Tab>("overview");

  const load = useCallback(() => {
    getPatient(patientId).then((p) => {
      if (!p) {
        setState("error");
        return;
      }
      setPatient(p);
      setState("ready");
    });
  }, [patientId]);

  useEffect(() => {
    if (isMockMode || authLoading || !session) return;
    load();
  }, [session, authLoading, load]);

  if (!isMockMode && !authLoading && !session) {
    return <PageState state="denied" t={t} />;
  }
  if (state !== "ready" || !patient) {
    return <PageState state={state as Exclude<LoadState, "ready">} t={t} />;
  }

  const episodes = patient.care_episodes ?? [];
  const active = episodes.find((e) => e.status === "active") ?? null;
  const activeCounts = sessionCounts(
    active?.sessions ?? [],
    active?.planned_session_count ?? null
  );
  const allSessions = episodes.flatMap((e) => e.sessions ?? []);
  const lastSession = allSessions
    .filter((s) => s.status === "completed" && s.session_date)
    .map((s) => s.session_date as string)
    .sort()
    .pop();
  const canManageAdmin = profile && profile.role !== "patient";

  return (
    <div className="space-y-5">
      {/* Header */}
      <Card>
        <CardBody className="flex flex-wrap items-center gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--color-primary-tint)] text-lg font-bold text-[var(--color-primary-strong)]">
            {displayName(patient).charAt(0)}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-[var(--color-ink)]">
              {displayName(patient)}
            </h2>
            <p className="text-xs text-[var(--color-ink-faint)]" dir="ltr">
              {maskedPhone(patient.phone_e164)}
              {ageFrom(patient.date_of_birth) !== null &&
                ` · ${t("pm.age")}: ${ageFrom(patient.date_of_birth)}`}
              {` · ${patient.preferred_language}`}
            </p>
          </div>
          <StatusBadge status={patient.status} t={t} />
          {canManageAdmin && patient.status !== "archived" && (
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                // Soft delete only — data is preserved (spec 3.3).
                const ok = await updatePatient(patient.id, {
                  status: "archived",
                  archived_at: new Date().toISOString(),
                } as Partial<PatientRow>);
                if (ok) load();
              }}
            >
              {t("pm.archive")}
            </Button>
          )}
        </CardBody>
      </Card>

      {/* Tabs */}
      <nav className="flex gap-1.5 overflow-x-auto pb-1">
        {tabs.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-[13px] font-medium transition-colors",
              tab === id
                ? "bg-[var(--color-primary)] text-white"
                : "bg-white text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-muted)]"
            )}
          >
            {t(`pm.tab.${id}`)}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title={t("pm.activeEpisode")} icon={<Icon name="treatment" width={18} height={18} />} />
            <CardBody className="space-y-2 text-sm text-[var(--color-ink-soft)]">
              {active ? (
                <>
                  <p className="font-semibold text-[var(--color-ink)]">{active.title}</p>
                  <p>
                    {t("pm.sessions")}: {activeCounts.completed}
                    {activeCounts.planned !== null && ` / ${activeCounts.planned}`}
                    {activeCounts.remaining !== null &&
                      ` — ${t("pm.remaining")}: ${activeCounts.remaining}`}
                    {activeCounts.overPlan > 0 && (
                      <Badge tone="warn" className="ms-2">
                        {t("pm.overPlan")} +{activeCounts.overPlan}
                      </Badge>
                    )}
                  </p>
                  {lastSession && <p>{t("pm.lastSession")}: {lastSession}</p>}
                  {active.short_term_goals && (
                    <p><strong>{t("pm.goals")}:</strong> {active.short_term_goals}</p>
                  )}
                  {active.precautions && (
                    <p className="rounded-lg bg-[var(--color-danger-soft)] px-3 py-2 text-[var(--color-danger)]">
                      <strong>{t("pm.precautions")}:</strong> {active.precautions}
                    </p>
                  )}
                  <ButtonLink href={`/patients/${patient.id}/episodes/${active.id}`} size="sm" variant="secondary">
                    {t("pm.tab.episodes")} →
                  </ButtonLink>
                </>
              ) : (
                <p>{t("pm.noActiveEpisode")}</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t("pm.timeline")} icon={<Icon name="clock" width={18} height={18} />} />
            <CardBody>
              <Timeline patient={patient} t={t} />
            </CardBody>
          </Card>
        </div>
      )}

      {tab === "episodes" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <ButtonLink href={`/patients/${patient.id}/episodes/new`} size="sm">
              <Icon name="plus" width={14} height={14} />
              {t("ep.new")}
            </ButtonLink>
          </div>
          {episodes.length === 0 && (
            <p className="text-sm text-[var(--color-ink-faint)]">{t("pm.noActiveEpisode")}</p>
          )}
          {episodes.map((e) => {
            const c = sessionCounts(e.sessions ?? [], e.planned_session_count ?? null);
            return (
              <Link key={e.id} href={`/patients/${patient.id}/episodes/${e.id}`} className="block">
                <Card>
                  <CardBody className="flex flex-wrap items-center gap-3">
                    <span className="flex-1 font-medium text-[var(--color-ink)]">{e.title}</span>
                    <span className="text-xs text-[var(--color-ink-soft)]">
                      {t("pm.sessions")}: {c.completed}
                      {c.planned !== null && `/${c.planned}`}
                    </span>
                    <StatusBadge status={e.status} t={t} />
                  </CardBody>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {tab === "admin" && (
        <Card>
          <CardHeader title={t("pm.tab.admin")} icon={<Icon name="settings" width={18} height={18} />} />
          <CardBody className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            {(
              [
                [t("pm.nationalId"), patient.national_id],
                [t("pm.address"), patient.address],
                [t("pm.emergencyName"), patient.emergency_contact_name],
                [t("pm.emergencyPhone"), patient.emergency_contact_phone],
                [t("pm.medicalHistory"), patient.medical_history],
                [t("pm.surgicalHistory"), patient.surgical_history],
                [t("pm.medications"), patient.medications],
                [t("pm.allergies"), patient.allergies],
                [t("pm.adminNotes"), patient.general_notes],
              ] as [string, string | null][]
            ).map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-[var(--color-ink-faint)]">{label}</p>
                <p className="text-[var(--color-ink-soft)]">{value || "—"}</p>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {(tab === "appointments" || tab === "tickets" || tab === "exercises" || tab === "documents") && (
        <Card>
          <CardBody className="py-10 text-center text-sm text-[var(--color-ink-faint)]">
            {t("pm.placeholder")}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

/** Simple event timeline assembled from entity timestamps (no audit read
 *  needed, so owners/therapists see it too). */
function Timeline({ patient, t }: { patient: PatientRow; t: (k: string) => string }) {
  const events = useMemo(() => {
    const list: { at: string; label: string }[] = [
      { at: patient.created_at, label: t("pm.newPatient") },
    ];
    for (const e of patient.care_episodes ?? []) {
      list.push({ at: e.created_at, label: `${t("ep.new")}: ${e.title ?? ""}` });
      if (e.discharge_date)
        list.push({ at: e.discharge_date, label: `${t("st.discharged")}: ${e.title ?? ""}` });
      for (const s of e.sessions ?? []) {
        if (s.status === "completed" && s.session_date)
          list.push({
            at: s.session_date,
            label: `${t("se.date")} #${s.session_number ?? ""}`,
          });
      }
    }
    return list.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);
  }, [patient, t]);

  return (
    <ol className="space-y-2">
      {events.map((e, i) => (
        <li key={i} className="flex gap-3 text-sm">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-primary)]" />
          <span className="text-[var(--color-ink-soft)]">{e.label}</span>
          <span className="ms-auto shrink-0 text-xs text-[var(--color-ink-faint)]" dir="ltr">
            {e.at.slice(0, 10)}
          </span>
        </li>
      ))}
    </ol>
  );
}
