"use client";

import { useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { Disclaimer, PageIntro } from "@/components/ui/Misc";
import { useLocale } from "@/lib/store/LocaleContext";
import { locales, type Locale } from "@/lib/i18n/translations";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { hasDataConfigurationError, isMockMode } from "@/lib/config";
import { useAuth } from "@/lib/store/AuthContext";
import { useText } from "@/lib/i18n/text";
import { settingsText } from "./text";

interface BrowserSettings {
  clinicName: string;
  therapistName: string;
  units: "metric" | "imperial";
}

function readBrowserSettings(): BrowserSettings {
  const fallback: BrowserSettings = {
    clinicName: "",
    therapistName: "",
    units: "metric",
  };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem("physioai:settings:v1");
    if (!raw) return fallback;
    const stored = JSON.parse(raw) as Partial<BrowserSettings>;
    return {
      clinicName: typeof stored.clinicName === "string" ? stored.clinicName : "",
      therapistName:
        typeof stored.therapistName === "string" ? stored.therapistName : "",
      units:
        stored.units === "metric" || stored.units === "imperial"
          ? stored.units
          : "metric",
    };
  } catch {
    return fallback;
  }
}

export default function SettingsPage() {
  const { locale, setLocale, t } = useLocale();
  const s = useText(settingsText);
  const { profile, activeClinicId } = useAuth();
  const [initialSettings] = useState(readBrowserSettings);
  const [clinicName, setClinicName] = useState(initialSettings.clinicName);
  const [therapistName, setTherapistName] = useState(
    initialSettings.therapistName
  );
  const [units, setUnits] = useState(initialSettings.units);
  const [saved, setSaved] = useState(false);
  const [cleared, setCleared] = useState(false);
  const clinicalAiUiEnabled =
    process.env.NEXT_PUBLIC_ENABLE_CLINICAL_AI_DRAFTS === "true";
  const activeClinic =
    profile?.clinics.find((clinic) => clinic.id === activeClinicId) ?? null;

  function save() {
    // Language/units are browser preferences. Mock-only display names are
    // deliberately never presented as real profile/clinic mutations.
    localStorage.setItem(
      "physioai:settings:v1",
      JSON.stringify(
        isMockMode ? { clinicName, therapistName, units } : { units }
      )
    );
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  function clearData() {
    localStorage.removeItem("physioai:cases:v1");
    localStorage.removeItem("physioai:patients:v2");
    localStorage.removeItem("physioai:settings:v1");
    setCleared(true);
    setTimeout(() => {
      setCleared(false);
      // Full reload: client-side navigation would keep the in-memory case
      // and patient state and write it straight back to localStorage.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full reload is required here (see above)
      window.location.assign("/");
    }, 800);
  }

  return (
    <div className="space-y-6">
      <PageIntro
        title={s.title}
        description={isMockMode ? s.introDemo : s.introReal}
      />

      <Card>
        <CardHeader
          title={s.profileTitle}
          icon={<Icon name="settings" width={18} height={18} />}
        />
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {isMockMode ? (
            <>
              <Field label={s.demoClinic}>
                <Input
                  value={clinicName}
                  onChange={(e) => setClinicName(e.target.value)}
                  placeholder={s.demoClinicPlaceholder}
                />
              </Field>
              <Field label={s.demoTherapist}>
                <Input
                  value={therapistName}
                  onChange={(e) => setTherapistName(e.target.value)}
                  placeholder={s.demoTherapistPlaceholder}
                />
              </Field>
            </>
          ) : (
            <dl className="grid gap-3 rounded-xl bg-[var(--color-surface-muted)] p-4 text-sm sm:col-span-2 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-[var(--color-ink-faint)]">{s.profile}</dt>
                <dd className="mt-1 font-medium text-[var(--color-ink)]">
                  {profile?.fullName || s.unavailable}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-ink-faint)]">{s.role}</dt>
                <dd className="mt-1 font-medium text-[var(--color-ink)]">
                  {profile ? s.roles[profile.role] ?? profile.role : s.unavailable}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-ink-faint)]">{s.activeClinic}</dt>
                <dd className="mt-1 font-medium text-[var(--color-ink)]">
                  {activeClinic?.name ?? s.noClinic}
                </dd>
              </div>
            </dl>
          )}
          <Field label={t("settings.language")} hint={t("settings.language.hint")}>
            <Select
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
            >
              {locales.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={s.units}>
            <Select
              value={units}
              onChange={(e) =>
                setUnits(e.target.value === "imperial" ? "imperial" : "metric")
              }
            >
              <option value="metric">{s.metric}</option>
              <option value="imperial">{s.imperial}</option>
            </Select>
          </Field>
        </CardBody>
        <div className="border-t border-[var(--color-border)] px-5 py-4">
          <Button onClick={save}>
            <Icon name="check" width={16} height={16} />
            {saved ? s.saved : s.save}
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader
          title={s.dbTitle}
          subtitle={s.dbSubtitle}
          icon={<Icon name="shield" width={18} height={18} />}
        />
        <CardBody className="space-y-3">
          <div className="flex items-center gap-2">
            <span
              className={
                isSupabaseConfigured
                  ? "h-2.5 w-2.5 rounded-full bg-[var(--color-success)]"
                  : "h-2.5 w-2.5 rounded-full bg-[var(--color-ink-faint)]"
              }
            />
            <p className="text-sm font-medium text-[var(--color-ink)]">
              {hasDataConfigurationError
                ? s.configError
                : isMockMode
                  ? s.demoMode
                  : isSupabaseConfigured
                    ? s.cloudLoaded
                    : s.cloudUnavailable}
            </p>
          </div>
          <p className="text-sm text-[var(--color-ink-soft)]">
            {isMockMode ? s.dbDemoBody : s.dbRealBody}
            <span className="sr-only">{s.configFile}</span>
            <code className="rounded bg-[var(--color-surface-muted)] px-1.5 py-0.5 text-xs">
              apps/web/.env.local.example
            </code>{" "}
            {s.andMigrations}{" "}
            <code className="rounded bg-[var(--color-surface-muted)] px-1.5 py-0.5 text-xs">
              database/migrations/
            </code>{" "}
            {s.migrationRunner}{" "}
            <code className="rounded bg-[var(--color-surface-muted)] px-1.5 py-0.5 text-xs">
              docs/RAHNAMA-FA.md
            </code>
            .
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={s.aiTitle}
          subtitle={s.aiSubtitle}
          icon={<Icon name="sparkle" width={18} height={18} />}
        />
        <CardBody className="space-y-3">
          <p className="text-sm text-[var(--color-ink-soft)]">
            {clinicalAiUiEnabled ? s.aiEnabled : s.aiDisabled}
          </p>
          <Field label={s.aiKey}>
            <Input disabled placeholder={s.aiKeyPlaceholder} />
          </Field>
        </CardBody>
      </Card>

      {isMockMode && <Card>
        <CardHeader
          title={s.localTitle}
          subtitle={s.localSubtitle}
          icon={<Icon name="alert" width={18} height={18} />}
        />
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-md text-sm text-[var(--color-ink-soft)]">
            {s.localBody}
          </p>
          <Button variant="danger" onClick={clearData}>
            {cleared ? s.cleared : s.clear}
          </Button>
        </CardBody>
      </Card>}

      <Disclaimer />
    </div>
  );
}
