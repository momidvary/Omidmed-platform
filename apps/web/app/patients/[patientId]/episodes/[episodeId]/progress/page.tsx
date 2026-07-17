"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "@/lib/store/LocaleContext";
import { useAuth } from "@/lib/store/AuthContext";
import { isMockMode } from "@/lib/config";
import {
  addMeasurement,
  ensureMetricDefs,
  getEpisode,
  type EpisodeRow,
  type MeasurementRow,
  type MetricDefRow,
  type SessionRow,
} from "@/lib/supabase/clinical";
import { metricsForRegion } from "@/lib/data/clinicalTemplates";
import {
  outOfRange,
  sessionCounts,
  summarizeMetric,
  categoricalSummary,
  type MetricDirection,
} from "@/lib/clinical/calc";
import { PageState, type LoadState } from "@/components/patients/shared";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/Badge";
import { PageIntro } from "@/components/ui/Misc";

export default function ProgressPage({
  params,
}: {
  params: Promise<{ patientId: string; episodeId: string }>;
}) {
  const { episodeId } = use(params);
  const { t, locale } = useLocale();
  const { session, loading: authLoading, profile } = useAuth();
  const [episode, setEpisode] = useState<EpisodeRow | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [measurements, setMeasurements] = useState<MeasurementRow[]>([]);
  const [defs, setDefs] = useState<MetricDefRow[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [metricFilter, setMetricFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // add-measurement form
  const [newDefId, setNewDefId] = useState("");
  const [newValue, setNewValue] = useState("");
  const [warn, setWarn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getEpisode(episodeId).then((res) => {
      if (!res) {
        setState("error");
        return;
      }
      setEpisode(res.episode);
      setSessions(res.sessions);
      setMeasurements(res.measurements);
      setDefs(res.metricDefs);
      setState("ready");
    });
  }, [episodeId]);

  useEffect(() => {
    if (isMockMode || authLoading || !session) return;
    load();
  }, [session, authLoading, load]);

  const usedDefIds = useMemo(
    () => new Set(measurements.map((m) => m.metric_definition_id)),
    [measurements]
  );

  if (!isMockMode && !authLoading && !session) {
    return <PageState state="denied" t={t} />;
  }
  if (state !== "ready" || !episode) {
    return <PageState state={state as Exclude<LoadState, "ready">} t={t} />;
  }

  const counts = sessionCounts(sessions, episode.planned_session_count);
  const canClinical = profile && !["patient", "clinic_staff"].includes(profile.role);

  const filteredMeasurements = measurements.filter((m) => {
    if (from && m.measured_at < from) return false;
    if (to && m.measured_at > to) return false;
    return true;
  });

  const visibleDefs = defs.filter(
    (d) => usedDefIds.has(d.id) && (!metricFilter || d.id === metricFilter)
  );

  async function enableTemplates() {
    if (!episode || !profile) return;
    setBusy(true);
    const result = await ensureMetricDefs(
      episode.clinic_id,
      profile.id,
      metricsForRegion(episode.body_region ?? "general"),
      locale
    );
    setBusy(false);
    if (result) setDefs(result);
  }

  async function submitMeasurement() {
    if (!episode || !profile || !newDefId) return;
    const def = defs.find((d) => d.id === newDefId);
    if (!def) return;
    setError(null);
    setWarn(null);
    const isNumeric = ["numeric", "duration", "distance", "repetition"].includes(def.data_type);
    const numeric = isNumeric ? Number(newValue) : null;
    if (isNumeric && (newValue === "" || isNaN(numeric as number))) {
      setError(t("pm.required"));
      return;
    }
    if (
      isNumeric &&
      outOfRange(numeric as number, def.minimum_value, def.maximum_value)
    ) {
      setWarn(t("pr.outOfRange"));
    }
    setBusy(true);
    const ok = await addMeasurement({
      clinic_id: episode.clinic_id,
      patient_id: episode.patient_id,
      care_episode_id: episode.id,
      metric_definition_id: def.id,
      numeric_value: isNumeric ? (numeric as number) : null,
      categorical_value: def.data_type === "categorical" ? newValue : null,
      boolean_value: def.data_type === "boolean" ? newValue === "true" : null,
      text_value: def.data_type === "text" ? newValue : null,
      unit: def.unit,
      therapist_id: profile.id,
      created_by: profile.id,
    });
    setBusy(false);
    if (!ok) {
      setError(t("pm.saveFailedKeep"));
      return;
    }
    setNewValue("");
    load();
  }

  return (
    <div className="space-y-5">
      <PageIntro title={t("pr.title")} description={episode.title ?? ""} />

      {/* Session plan tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 print:grid-cols-4">
        {[
          [t("ep.plannedSessions"), counts.planned ?? "—"],
          [t("st.completed"), counts.completed],
          [t("pm.remaining"), counts.remaining ?? "—"],
          [t("pm.overPlan"), counts.overPlan > 0 ? `+${counts.overPlan}` : "0"],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardBody className="px-3 py-4 text-center">
              <p className="text-lg font-bold text-[var(--color-ink)]">{String(value)}</p>
              <p className="mt-1 text-[11px] text-[var(--color-ink-faint)]">{String(label)}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Filters + add measurement */}
      <Card>
        <CardBody className="grid grid-cols-1 items-end gap-3 sm:grid-cols-4">
          <Field label={t("pr.metric")}>
            <Select value={metricFilter} onChange={(e) => setMetricFilter(e.target.value)}>
              <option value="">{t("pm.all")}</option>
              {defs.filter((d) => usedDefIds.has(d.id)).map((d) => (
                <option key={d.id} value={d.id}>{d.custom_name ?? d.name_key}</option>
              ))}
            </Select>
          </Field>
          <Field label={t("pr.from")}>
            <Input type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label={t("pr.to")}>
            <Input type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          {canClinical && defs.length === 0 && (
            <Button size="sm" variant="secondary" disabled={busy} onClick={enableTemplates}>
              {t("pr.enableMetrics")}
            </Button>
          )}
        </CardBody>
      </Card>

      {canClinical && defs.length > 0 && (
        <Card>
          <CardHeader title={t("pr.addMeasurement")} icon={<Icon name="plus" width={18} height={18} />} />
          <CardBody className="flex flex-wrap items-end gap-3">
            <Field label={t("pr.metric")}>
              <Select value={newDefId} onChange={(e) => setNewDefId(e.target.value)} className="w-56">
                <option value="">—</option>
                {defs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.custom_name ?? d.name_key}{d.unit ? ` (${d.unit})` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("pr.value")} error={error ?? undefined}>
              <Input dir="ltr" value={newValue} onChange={(e) => setNewValue(e.target.value)} className="w-32" />
            </Field>
            <Button size="sm" disabled={busy || !newDefId} onClick={submitMeasurement}>
              {t("pm.save")}
            </Button>
            {warn && <p className="text-xs text-[var(--color-warn)]">{warn}</p>}
          </CardBody>
        </Card>
      )}

      {/* Per-metric summaries */}
      {visibleDefs.length === 0 ? (
        <Card>
          <CardBody className="py-8 text-center text-sm text-[var(--color-ink-faint)]">
            {t("pr.notEnough")}
          </CardBody>
        </Card>
      ) : (
        visibleDefs.map((def) => (
          <MetricCard
            key={def.id}
            def={def}
            points={filteredMeasurements.filter((m) => m.metric_definition_id === def.id)}
            t={t}
          />
        ))
      )}
    </div>
  );
}

function MetricCard({
  def,
  points,
  t,
}: {
  def: MetricDefRow;
  points: MeasurementRow[];
  t: (k: string) => string;
}) {
  const isNumeric = ["numeric", "duration", "distance", "repetition"].includes(def.data_type);
  const name = def.custom_name ?? def.name_key;

  if (!isNumeric) {
    const summary = categoricalSummary(
      points.map((p) => ({
        measuredAt: p.measured_at,
        value: p.categorical_value ?? p.text_value ?? String(p.boolean_value ?? ""),
      }))
    );
    return (
      <Card>
        <CardHeader title={name} subtitle={t(`st.${def.data_type}`) === `st.${def.data_type}` ? def.data_type : def.data_type} />
        <CardBody className="flex flex-wrap gap-6 text-sm text-[var(--color-ink-soft)]">
          <span>{t("pr.baseline")}: <strong>{summary.baseline ?? "—"}</strong></span>
          <span>{t("pr.latest")}: <strong>{summary.latest ?? "—"}</strong></span>
          <span>{t("pr.count")}: {summary.count}</span>
          {/* categorical metrics never get a percentage (spec 15.5) */}
        </CardBody>
      </Card>
    );
  }

  const summary = summarizeMetric(
    points.map((p) => ({
      measuredAt: p.measured_at,
      numericValue: p.numeric_value,
      unit: p.unit,
    })),
    def.direction as MetricDirection
  );

  return (
    <Card>
      <CardHeader
        title={`${name}${def.unit ? ` (${def.unit})` : ""}`}
        action={
          summary.improved !== null ? (
            <Badge tone={summary.improved ? "success" : "danger"}>
              {summary.improved ? t("pr.improved") : t("pr.worsened")}
            </Badge>
          ) : undefined
        }
      />
      <CardBody className="space-y-4">
        {!summary.comparable && (
          <p className="rounded-lg bg-[var(--color-warn-soft)] px-3 py-2 text-xs text-[var(--color-warn)]">
            {t("pr.mixedUnits")}
          </p>
        )}
        <div className="flex flex-wrap gap-6 text-sm text-[var(--color-ink-soft)]">
          <span>{t("pr.baseline")}: <strong>{summary.baseline ?? "—"}</strong></span>
          <span>{t("pr.latest")}: <strong>{summary.latest ?? "—"}</strong></span>
          <span>
            {t("pr.target")}:{" "}
            <strong>{def.target_value ?? t("pr.noTarget")}</strong>
          </span>
          <span>
            {t("pr.change")}:{" "}
            <strong dir="ltr">
              {summary.absoluteChange === null
                ? "—"
                : `${summary.absoluteChange > 0 ? "+" : ""}${summary.absoluteChange}`}
            </strong>
          </span>
          <span>{t("pr.count")}: {summary.count}</span>
        </div>
        {summary.hasTrend && summary.comparable ? (
          <TrendChart
            points={points
              .filter((p) => p.numeric_value !== null)
              .map((p) => ({ date: p.measured_at, value: p.numeric_value as number }))}
            target={def.target_value}
          />
        ) : (
          <p className="text-xs text-[var(--color-ink-faint)]">{t("pr.notEnough")}</p>
        )}
      </CardBody>
    </Card>
  );
}

/** Single-series SVG trend line (responsive + printable, no chart lib —
 *  nothing new to break with React 19 / Next 16). */
function TrendChart({
  points,
  target,
}: {
  points: { date: string; value: number }[];
  target: number | null;
}) {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const W = 560, H = 160;
  const pad = { top: 12, right: 14, bottom: 24, left: 38 };
  const values = sorted.map((p) => p.value).concat(target !== null ? [target] : []);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) =>
    pad.left + (sorted.length === 1 ? 0.5 : i / (sorted.length - 1)) * (W - pad.left - pad.right);
  const y = (v: number) =>
    pad.top + (1 - (v - min) / span) * (H - pad.top - pad.bottom);
  const path = sorted
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join(" ");

  return (
    <div dir="ltr" className="overflow-x-auto print:overflow-visible">
      <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[420px] max-w-full" role="img">
        {[min, max].map((v) => (
          <g key={v}>
            <line x1={pad.left} x2={W - pad.right} y1={y(v)} y2={y(v)}
              stroke="var(--color-border)" strokeWidth={1} />
            <text x={pad.left - 6} y={y(v) + 3.5} textAnchor="end" fontSize={10}
              fill="var(--color-ink-faint)">{v}</text>
          </g>
        ))}
        {target !== null && (
          <line x1={pad.left} x2={W - pad.right} y1={y(target)} y2={y(target)}
            stroke="var(--color-accent)" strokeWidth={1.5} strokeDasharray="5 4" />
        )}
        <path d={path} fill="none" stroke="var(--color-primary)" strokeWidth={2} />
        {sorted.map((p, i) => (
          <g key={p.date + i}>
            <circle cx={x(i)} cy={y(p.value)} r={10} fill="transparent">
              <title>{`${p.date}: ${p.value}`}</title>
            </circle>
            <circle cx={x(i)} cy={y(p.value)} r={3.5} fill="var(--color-primary)"
              stroke="var(--color-surface)" strokeWidth={2} className="pointer-events-none" />
          </g>
        ))}
        <text x={x(0)} y={H - 8} fontSize={10} fill="var(--color-ink-faint)">{sorted[0].date}</text>
        <text x={x(sorted.length - 1)} y={H - 8} textAnchor="end" fontSize={10}
          fill="var(--color-ink-faint)">{sorted[sorted.length - 1].date}</text>
      </svg>
    </div>
  );
}
