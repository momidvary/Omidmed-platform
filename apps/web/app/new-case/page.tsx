"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCases } from "@/lib/store/CaseContext";
import type { BodyRegionId, Gender, PatientCase } from "@/lib/types";
import { bodyRegions } from "@/lib/data/bodyRegions";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { PageIntro, Disclaimer } from "@/components/ui/Misc";
import { uuid } from "@/lib/utils";

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

export default function NewCasePage() {
  const router = useRouter();
  const { addCase } = useCases();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function validate(): boolean {
    const next: Errors = {};
    if (!form.name.trim()) next.name = "Patient name is required.";
    if (form.age && (Number(form.age) < 0 || Number(form.age) > 120))
      next.age = "Enter a valid age (0–120).";
    if (!form.mainComplaint.trim())
      next.mainComplaint = "Main complaint is required.";
    if (!form.region) next.region = "Select a body region.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setSaveError(null);

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
    };

    const ok = await addCase(newCase);
    if (!ok) {
      // Keep the form exactly as typed — nothing is lost on a failed save.
      setSubmitting(false);
      setSaveError(
        "Save failed — your input has been kept. Check the connection (or that your account belongs to a clinic) and try again."
      );
      return;
    }
    router.push("/case-analysis");
  }

  return (
    <div className="space-y-6">
      <PageIntro
        title="New Patient Case"
        description="Capture the subjective interview in a structured format. Required fields are marked; everything else can be completed later."
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader
            title="Patient Details"
            icon={<Icon name="user" width={18} height={18} />}
          />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Patient name" required error={errors.name}>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Sara Ahmadi"
              />
            </Field>
            <Field label="Age" error={errors.age}>
              <Input
                type="number"
                min={0}
                max={120}
                value={form.age}
                onChange={(e) => set("age", e.target.value)}
                placeholder="e.g. 42"
              />
            </Field>
            <Field label="Gender">
              <Select
                value={form.gender}
                onChange={(e) => set("gender", e.target.value as Gender)}
              >
                <option value="">Select…</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            <Field label="Body region" required error={errors.region}>
              <Select
                value={form.region}
                onChange={(e) => set("region", e.target.value as BodyRegionId)}
              >
                <option value="">Select…</option>
                {bodyRegions.map((r) => (
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
            title="Presenting Problem"
            icon={<Icon name="analysis" width={18} height={18} />}
          />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Main complaint" required error={errors.mainComplaint}>
                <Textarea
                  value={form.mainComplaint}
                  onChange={(e) => set("mainComplaint", e.target.value)}
                  placeholder="In the patient's words — e.g. low back pain radiating to the right buttock"
                />
              </Field>
            </div>
            <Field label="Pain location">
              <Input
                value={form.painLocation}
                onChange={(e) => set("painLocation", e.target.value)}
                placeholder="e.g. Lower back, right side"
              />
            </Field>
            <Field label="Duration of symptoms">
              <Input
                value={form.duration}
                onChange={(e) => set("duration", e.target.value)}
                placeholder="e.g. 8 weeks"
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label={`Pain intensity — ${form.painIntensity}/10`}>
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
            <Field label="Mechanism of injury / onset">
              <Input
                value={form.mechanism}
                onChange={(e) => set("mechanism", e.target.value)}
                placeholder="e.g. Gradual onset after desk work"
              />
            </Field>
            <Field label="Aggravating factors">
              <Input
                value={form.aggravating}
                onChange={(e) => set("aggravating", e.target.value)}
                placeholder="e.g. Sitting > 30 min, bending"
              />
            </Field>
            <Field label="Easing factors">
              <Input
                value={form.easing}
                onChange={(e) => set("easing", e.target.value)}
                placeholder="e.g. Walking, lying down"
              />
            </Field>
            <Field label="Functional limitations">
              <Input
                value={form.functionalLimitations}
                onChange={(e) => set("functionalLimitations", e.target.value)}
                placeholder="e.g. Cannot sit through a work day"
              />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="History & Context"
            icon={<Icon name="clock" width={18} height={18} />}
          />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Medical history">
              <Textarea
                value={form.medicalHistory}
                onChange={(e) => set("medicalHistory", e.target.value)}
                placeholder="e.g. Hypertension, diabetes…"
                className="min-h-20"
              />
            </Field>
            <Field label="Surgical history">
              <Textarea
                value={form.surgicalHistory}
                onChange={(e) => set("surgicalHistory", e.target.value)}
                placeholder="e.g. Left TKA 3 weeks ago"
                className="min-h-20"
              />
            </Field>
            <Field label="Imaging findings">
              <Textarea
                value={form.imaging}
                onChange={(e) => set("imaging", e.target.value)}
                placeholder="e.g. MRI: L4-L5 disc bulge / Not performed"
                className="min-h-20"
              />
            </Field>
            <Field label="Current medications">
              <Textarea
                value={form.medications}
                onChange={(e) => set("medications", e.target.value)}
                placeholder="e.g. Ibuprofen as needed"
                className="min-h-20"
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Patient goal" hint="What does the patient want to get back to?">
                <Input
                  value={form.patientGoal}
                  onChange={(e) => set("patientGoal", e.target.value)}
                  placeholder="e.g. Return to pain-free desk work and gym"
                />
              </Field>
            </div>
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
            onClick={() => {
              setForm(emptyForm);
              setErrors({});
            }}
          >
            Clear form
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create case & analyse"}
            <Icon name="arrow" width={16} height={16} />
          </Button>
        </div>
      </form>
    </div>
  );
}
