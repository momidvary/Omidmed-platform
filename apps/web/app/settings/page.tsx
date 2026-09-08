"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const { locale, setLocale, t } = useLocale();
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
    localStorage.removeItem("physioai:settings:v1");
    setCleared(true);
    setTimeout(() => {
      setCleared(false);
      router.push("/");
      router.refresh();
    }, 800);
  }

  return (
    <div className="space-y-6">
      <PageIntro
        title="Settings"
        description={
          isMockMode
            ? "Browser-only preferences for the explicit demo environment."
            : "Authenticated account context and non-clinical browser preferences."
        }
      />

      <Card>
        <CardHeader
          title="Profile & Preferences"
          icon={<Icon name="settings" width={18} height={18} />}
        />
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {isMockMode ? (
            <>
              <Field label="Demo clinic name">
                <Input
                  value={clinicName}
                  onChange={(e) => setClinicName(e.target.value)}
                  placeholder="e.g. City Physio Clinic"
                />
              </Field>
              <Field label="Demo therapist name">
                <Input
                  value={therapistName}
                  onChange={(e) => setTherapistName(e.target.value)}
                  placeholder="e.g. Dr. Omidvary"
                />
              </Field>
            </>
          ) : (
            <dl className="grid gap-3 rounded-xl bg-[var(--color-surface-muted)] p-4 text-sm sm:col-span-2 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-[var(--color-ink-faint)]">Authenticated profile</dt>
                <dd className="mt-1 font-medium text-[var(--color-ink)]">
                  {profile?.fullName || "Unavailable"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-ink-faint)]">Role</dt>
                <dd className="mt-1 font-medium text-[var(--color-ink)]">
                  {profile?.role ?? "Unavailable"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-ink-faint)]">Active clinic</dt>
                <dd className="mt-1 font-medium text-[var(--color-ink)]">
                  {activeClinic?.name ?? "No clinic selected"}
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
          <Field label="Units">
            <Select
              value={units}
              onChange={(e) =>
                setUnits(e.target.value === "imperial" ? "imperial" : "metric")
              }
            >
              <option value="metric">Metric (kg, cm)</option>
              <option value="imperial">Imperial (lb, in)</option>
            </Select>
          </Field>
        </CardBody>
        <div className="border-t border-[var(--color-border)] px-5 py-4">
          <Button onClick={save}>
            <Icon name="check" width={16} height={16} />
            {saved ? "Saved!" : "Save browser preferences"}
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Supabase Connection"
          subtitle="Cloud database for cases, patients and tickets"
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
                ? "Configuration error — cloud mode is unavailable"
                : isMockMode
                  ? "Explicit demo mode — no cloud writes"
                  : isSupabaseConfigured
                    ? "Cloud configuration loaded"
                    : "Cloud configuration unavailable"}
            </p>
          </div>
          <p className="text-sm text-[var(--color-ink-soft)]">
            {isMockMode
              ? "Demo data stays in this browser and is never represented as a cloud save. To test real authentication and RLS, copy "
              : "Clinical records on this screen are not stored in browser preferences. Deployment configuration comes from "}
            <span className="sr-only">configuration file </span>
            <code className="rounded bg-[var(--color-surface-muted)] px-1.5 py-0.5 text-xs">
              apps/web/.env.local.example
            </code>{" "}
            and migrations in{" "}
            <code className="rounded bg-[var(--color-surface-muted)] px-1.5 py-0.5 text-xs">
              database/migrations/
            </code>{" "}
            through the tracked migration runner. See the Persian setup guide in{" "}
            <code className="rounded bg-[var(--color-surface-muted)] px-1.5 py-0.5 text-xs">
              docs/RAHNAMA-FA.md
            </code>
            .
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="AI Connection"
          subtitle="Audited clinical-draft capability"
          icon={<Icon name="sparkle" width={18} height={18} />}
        />
        <CardBody className="space-y-3">
          <p className="text-sm text-[var(--color-ink-soft)]">
            {clinicalAiUiEnabled
              ? "The browser gate for audited clinical drafts is enabled. Server approval, provider configuration, quota reservation, stored-case safety and clinician review are still verified on every request; this indicator does not prove provider availability."
              : "Audited clinical drafts are disabled in this deployment. Deterministic templates are not represented as a connected diagnostic AI service."}
          </p>
          <Field label="AI API key">
            <Input disabled placeholder="Configure via server environment variables — never in the browser" />
          </Field>
        </CardBody>
      </Card>

      {isMockMode && <Card>
        <CardHeader
          title="Local Data"
          subtitle="Cases are stored only in this browser"
          icon={<Icon name="alert" width={18} height={18} />}
        />
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-md text-sm text-[var(--color-ink-soft)]">
            Clearing local data removes all saved cases and preferences from
            this browser and restores the sample cases. This cannot be undone.
          </p>
          <Button variant="danger" onClick={clearData}>
            {cleared ? "Cleared…" : "Clear local data"}
          </Button>
        </CardBody>
      </Card>}

      <Disclaimer />
    </div>
  );
}
