"use client";

import { useState } from "react";
import { useCases } from "@/lib/store/CaseContext";
import { buildEducation, delay } from "@/lib/ai/engine";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Select } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import {
  BulletList,
  Disclaimer,
  EmptyState,
  PageIntro,
  Spinner,
} from "@/components/ui/Misc";

type Handout = ReturnType<typeof buildEducation>;

export default function PatientEducationPage() {
  const { cases, currentCase, setCurrentCase } = useCases();
  const [handout, setHandout] = useState<Handout | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    if (!currentCase) return;
    setLoading(true);
    setHandout(null);
    // 🔌 REAL AI API INTEGRATION POINT — replace with an AI call that
    // writes patient-friendly text from the case (see lib/ai/engine.ts).
    const result = await delay(buildEducation(currentCase));
    setHandout(result);
    setLoading(false);
  }

  async function copyHandout() {
    if (!handout || !currentCase) return;
    const text = [
      `Home advice for ${currentCase.name}`,
      "",
      "What is the problem?",
      handout.problem,
      "",
      "What to avoid for now:",
      ...handout.avoid.map((i) => `• ${i}`),
      "",
      "Your exercises:",
      ...handout.exercises.map((i) => `• ${i}`),
      "",
      "When to contact us or a doctor:",
      ...handout.contact.map((i) => `• ${i}`),
      "",
      "Simple home advice:",
      ...handout.homeAdvice.map((i) => `• ${i}`),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="space-y-6">
      <PageIntro
        title="Patient Education Generator"
        description="Turn the clinical picture into a plain-language handout the patient can take home."
        action={
          cases.length > 0 ? (
            <Select
              value={currentCase?.id ?? ""}
              onChange={(e) => {
                setCurrentCase(e.target.value || null);
                setHandout(null);
              }}
              className="w-64"
            >
              <option value="">Select a case…</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || "Unnamed"}
                </option>
              ))}
            </Select>
          ) : undefined
        }
      />

      {!currentCase && (
        <EmptyState
          icon="education"
          title="No case selected"
          description="Pick a case (or create one) to generate a patient-friendly explanation."
          action={<ButtonLink href="/new-case">New Patient Case</ButtonLink>}
        />
      )}

      {currentCase && (
        <>
          <Card>
            <CardBody className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--color-ink)]">
                  {currentCase.name}
                  {currentCase.age ? `, ${currentCase.age}` : ""}
                </p>
                <p className="text-xs text-[var(--color-ink-faint)]">
                  {currentCase.mainComplaint}
                </p>
              </div>
              <div className="flex gap-2">
                {handout && (
                  <Button variant="secondary" onClick={copyHandout}>
                    <Icon name={copied ? "check" : "copy"} width={15} height={15} />
                    {copied ? "Copied!" : "Copy handout"}
                  </Button>
                )}
                <Button onClick={generate} disabled={loading}>
                  <Icon name="sparkle" width={16} height={16} />
                  {loading ? "Writing…" : handout ? "Regenerate" : "Generate handout"}
                </Button>
              </div>
            </CardBody>
          </Card>

          {loading && (
            <Card>
              <Spinner label="Writing patient-friendly advice…" />
            </Card>
          )}

          {handout && !loading && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Card className="md:col-span-2">
                <CardHeader
                  title="What is the problem?"
                  icon={<Icon name="education" width={18} height={18} />}
                />
                <CardBody>
                  <p className="text-sm leading-relaxed text-[var(--color-ink-soft)]">
                    {handout.problem}
                  </p>
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="What to avoid for now" icon={<Icon name="alert" width={18} height={18} />} />
                <CardBody>
                  <BulletList items={handout.avoid} tone="warn" />
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="Your exercises" icon={<Icon name="exercise" width={18} height={18} />} />
                <CardBody>
                  <BulletList items={handout.exercises} tone="primary" />
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="When to contact us or a doctor" icon={<Icon name="flag" width={18} height={18} />} />
                <CardBody>
                  <BulletList items={handout.contact} tone="danger" />
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="Simple home advice" icon={<Icon name="check" width={18} height={18} />} />
                <CardBody>
                  <BulletList items={handout.homeAdvice} tone="success" />
                </CardBody>
              </Card>
            </div>
          )}
        </>
      )}

      <Disclaimer />
    </div>
  );
}
