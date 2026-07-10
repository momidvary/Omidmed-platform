"use client";

import { useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { Disclaimer, PageIntro } from "@/components/ui/Misc";

export default function SettingsPage() {
  const [clinicName, setClinicName] = useState("");
  const [therapistName, setTherapistName] = useState("");
  const [language, setLanguage] = useState("en");
  const [units, setUnits] = useState("metric");
  const [saved, setSaved] = useState(false);
  const [cleared, setCleared] = useState(false);

  function save() {
    // Local-only preferences for the MVP; wire to a backend later.
    localStorage.setItem(
      "physioai:settings:v1",
      JSON.stringify({ clinicName, therapistName, language, units })
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
          <Field label="Language" hint="Persian UI is on the roadmap.">
            <Select value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="en">English</option>
              <option value="fa">فارسی (coming soon)</option>
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
            <Icon name={saved ? "check" : "check"} width={16} height={16} />
            {saved ? "Saved!" : "Save preferences"}
          </Button>
        </div>
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
