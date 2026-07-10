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

export default function SettingsPage() {
  const { locale, setLocale, t } = useLocale();
  const [clinicName, setClinicName] = useState("");
  const [therapistName, setTherapistName] = useState("");
  const [units, setUnits] = useState("metric");
  const [saved, setSaved] = useState(false);
  const [cleared, setCleared] = useState(false);

  function save() {
    // Local-only preferences for the MVP; wire to a backend later.
    localStorage.setItem(
      "physioai:settings:v1",
      JSON.stringify({ clinicName, therapistName, units })
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
      window.location.href = "/";
    }, 800);
  }

  return (
    <div className="space-y-6">
      <PageIntro
        title="Settings"
        description="Clinic preferences and local data. All data in this MVP stays in your browser."
      />

      <Card>
        <CardHeader
          title="Profile & Preferences"
          icon={<Icon name="settings" width={18} height={18} />}
        />
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Clinic name">
            <Input
              value={clinicName}
              onChange={(e) => setClinicName(e.target.value)}
              placeholder="e.g. City Physio Clinic"
            />
          </Field>
          <Field label="Therapist name">
            <Input
              value={therapistName}
              onChange={(e) => setTherapistName(e.target.value)}
              placeholder="e.g. Dr. Omidvary"
            />
          </Field>
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
            <Select value={units} onChange={(e) => setUnits(e.target.value)}>
              <option value="metric">Metric (kg, cm)</option>
              <option value="imperial">Imperial (lb, in)</option>
            </Select>
          </Field>
        </CardBody>
        <div className="border-t border-[var(--color-border)] px-5 py-4">
          <Button onClick={save}>
            <Icon name="check" width={16} height={16} />
            {saved ? "Saved!" : "Save preferences"}
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
              {isSupabaseConfigured ? "Connected" : "Not configured — running in local mode"}
            </p>
          </div>
          <p className="text-sm text-[var(--color-ink-soft)]">
            To connect: copy{" "}
            <code className="rounded bg-[var(--color-surface-muted)] px-1.5 py-0.5 text-xs">
              apps/web/.env.local.example
            </code>{" "}
            to <code className="rounded bg-[var(--color-surface-muted)] px-1.5 py-0.5 text-xs">.env.local</code>,
            fill in your project URL and anon key from Supabase → Project
            Settings → API, and run the SQL in{" "}
            <code className="rounded bg-[var(--color-surface-muted)] px-1.5 py-0.5 text-xs">
              database/schema.sql
            </code>{" "}
            once in the Supabase SQL editor. All data stays local until then.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="AI Connection"
          subtitle="Where the real AI API will plug in"
          icon={<Icon name="sparkle" width={18} height={18} />}
        />
        <CardBody className="space-y-3">
          <p className="text-sm text-[var(--color-ink-soft)]">
            This MVP runs on a built-in mock engine so it works fully offline.
            To connect a real AI provider, implement the functions in{" "}
            <code className="rounded bg-[var(--color-surface-muted)] px-1.5 py-0.5 text-xs">
              apps/web/lib/ai/engine.ts
            </code>{" "}
            — each integration point is marked with a{" "}
            <code className="rounded bg-[var(--color-surface-muted)] px-1.5 py-0.5 text-xs">
              🔌 REAL AI API INTEGRATION POINT
            </code>{" "}
            comment. Keep API keys server-side in environment variables.
          </p>
          <Field label="AI API key (disabled in MVP)">
            <Input disabled placeholder="Configure via server environment variables — never in the browser" />
          </Field>
        </CardBody>
      </Card>

      <Card>
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
      </Card>

      <Disclaimer />
    </div>
  );
}
