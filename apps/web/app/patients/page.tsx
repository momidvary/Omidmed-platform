"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/lib/store/LocaleContext";
import { useAuth } from "@/lib/store/AuthContext";
import { isMockMode } from "@/lib/config";
import { listPatients, type PatientRow } from "@/lib/supabase/clinical";
import { sessionCounts } from "@/lib/clinical/calc";
import { toEnglishDigits } from "@/lib/phone";
import {
  PageState,
  StatusBadge,
  displayName,
  maskedPhone,
  type LoadState,
} from "@/components/patients/shared";
import { Card, CardBody } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/Badge";
import { PageIntro } from "@/components/ui/Misc";

export default function PatientsPage() {
  const { t } = useLocale();
  const { session, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<PatientRow[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [therapist, setTherapist] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);

  const load = useCallback(() => {
    listPatients().then((data) => {
      if (data === null) {
        setState("error");
        return;
      }
      setRows(data);
      setState(data.length === 0 ? "empty" : "ready");
    });
  }, []);

  useEffect(() => {
    if (isMockMode || authLoading || !session) return;
    load();
  }, [session, authLoading, load]);

  const therapistIds = useMemo(() => {
    const ids = new Set<string>();
    rows.forEach((p) =>
      p.care_episodes?.forEach((e) => {
        if (e.primary_therapist_id) ids.add(e.primary_therapist_id);
      })
    );
    return Array.from(ids);
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = toEnglishDigits(q.trim().toLowerCase());
    return rows.filter((p) => {
      if (needle) {
        const hay = `${displayName(p)} ${p.phone_e164 ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (status && p.status !== status) return false;
      const episodes = p.care_episodes ?? [];
      if (therapist && !episodes.some((e) => e.primary_therapist_id === therapist))
        return false;
      if (activeOnly && !episodes.some((e) => e.status === "active")) return false;
      return true;
    });
  }, [rows, q, status, therapist, activeOnly]);

  return (
    <div className="space-y-5">
      <PageIntro
        title={t("nav.patients")}
        description={t("nav.patients.desc")}
        action={
          <ButtonLink href="/patients/new">
            <Icon name="plus" width={16} height={16} />
            {t("pm.newPatient")}
          </ButtonLink>
        }
      />

      {/* Filters */}
      <Card>
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("pm.search")}
          />
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t("pm.filter.status")}: {t("pm.all")}</option>
            {["active", "inactive", "completed", "archived"].map((s) => (
              <option key={s} value={s}>{t(`st.${s}`)}</option>
            ))}
          </Select>
          <Select value={therapist} onChange={(e) => setTherapist(e.target.value)}>
            <option value="">{t("pm.filter.therapist")}: {t("pm.all")}</option>
            {therapistIds.map((id) => (
              <option key={id} value={id}>{id.slice(0, 8)}…</option>
            ))}
          </Select>
          <label className="flex items-center gap-2 text-sm text-[var(--color-ink-soft)]">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
            />
            {t("pm.filter.activeEpisode")}
          </label>
        </CardBody>
      </Card>

      {state !== "ready" ? (
        <PageState state={state as Exclude<LoadState, "ready">} t={t} onRetry={() => { setState("loading"); load(); }} />
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-start text-xs text-[var(--color-ink-faint)]">
                  <th className="px-4 py-3 text-start">{t("pm.firstName")}</th>
                  <th className="px-4 py-3 text-start">{t("pm.phone")}</th>
                  <th className="px-4 py-3 text-start">{t("pm.filter.status")}</th>
                  <th className="px-4 py-3 text-start">{t("pm.activeEpisode")}</th>
                  <th className="px-4 py-3 text-start">{t("pm.sessions")}</th>
                  <th className="px-4 py-3 text-start">{t("pm.lastSession")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <PatientTableRow key={p.id} p={p} t={t} />
                ))}
              </tbody>
            </table>
          </Card>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {filtered.map((p) => (
              <PatientCard key={p.id} p={p} t={t} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function usePatientDerived(p: PatientRow) {
  const episodes = p.care_episodes ?? [];
  const active = episodes.find((e) => e.status === "active") ?? null;
  const sessions = episodes.flatMap((e) => e.sessions ?? []);
  const counts = sessionCounts(sessions, active?.planned_session_count ?? null);
  const lastSession = sessions
    .filter((s) => s.status === "completed" && s.session_date)
    .map((s) => s.session_date as string)
    .sort()
    .pop();
  return { active, counts, lastSession };
}

function PatientTableRow({ p, t }: { p: PatientRow; t: (k: string) => string }) {
  const { active, counts, lastSession } = usePatientDerived(p);
  return (
    <tr className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-muted)]">
      <td className="px-4 py-3">
        <Link href={`/patients/${p.id}`} className="font-medium text-[var(--color-primary-strong)] hover:underline">
          {displayName(p)}
        </Link>
      </td>
      <td className="px-4 py-3" dir="ltr">{maskedPhone(p.phone_e164)}</td>
      <td className="px-4 py-3"><StatusBadge status={p.status} t={t} /></td>
      <td className="px-4 py-3">
        {active ? (
          <span className="text-[var(--color-ink-soft)]">{active.title ?? "—"}</span>
        ) : (
          <Badge>{t("pm.noActiveEpisode")}</Badge>
        )}
      </td>
      <td className="px-4 py-3 text-[var(--color-ink-soft)]">
        {counts.completed}
        {counts.planned !== null && ` / ${counts.planned}`}
        {counts.overPlan > 0 && (
          <Badge tone="warn" className="ms-2">{t("pm.overPlan")} +{counts.overPlan}</Badge>
        )}
      </td>
      <td className="px-4 py-3 text-[var(--color-ink-faint)]">{lastSession ?? "—"}</td>
    </tr>
  );
}

function PatientCard({ p, t }: { p: PatientRow; t: (k: string) => string }) {
  const { active, counts, lastSession } = usePatientDerived(p);
  return (
    <Link href={`/patients/${p.id}`} className="block">
      <Card>
        <CardBody className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-[var(--color-ink)]">{displayName(p)}</span>
            <StatusBadge status={p.status} t={t} />
          </div>
          <p className="text-xs text-[var(--color-ink-faint)]" dir="ltr">
            {maskedPhone(p.phone_e164)}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-ink-soft)]">
            <span>{active ? active.title : t("pm.noActiveEpisode")}</span>
            <span>·</span>
            <span>
              {t("pm.sessions")}: {counts.completed}
              {counts.planned !== null && `/${counts.planned}`}
            </span>
            {lastSession && (
              <>
                <span>·</span>
                <span>{t("pm.lastSession")}: {lastSession}</span>
              </>
            )}
          </div>
        </CardBody>
      </Card>
    </Link>
  );
}
