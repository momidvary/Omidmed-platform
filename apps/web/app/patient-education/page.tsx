"use client";

import { useRef, useState } from "react";
import { useCases } from "@/lib/store/CaseContext";
import { buildEducation, delay } from "@/lib/ai/engine";
import { hasClinicalSafetyClearance } from "@/lib/clinical/safety";
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
  const [error, setError] = useState<string | null>(null);
  const generationToken = useRef(0);

  const safetyCleared = hasClinicalSafetyClearance(currentCase?.safetyScreen);

  async function generate() {
    if (!currentCase) return;
    if (!safetyCleared) {
      setHandout(null);
      setError(
        "Patient advice is blocked until this case has a completed, clear structured safety screen and any concerns have been resolved."
      );
      return;
    }

    const requestToken = ++generationToken.current;
    setLoading(true);
    setHandout(null);
    setError(null);

    try {
      // 🔌 REAL AI API INTEGRATION POINT — keep the safety gate when this
      // becomes an authenticated server-side AI call.
      const result = await delay(buildEducation(currentCase));
      if (requestToken === generationToken.current) setHandout(result);
    } catch (cause) {
      if (requestToken === generationToken.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : "The handout could not be generated safely."
        );
      }
    } finally {
      if (requestToken === generationToken.current) setLoading(false);
    }
  }

  async function copyHandout() {
    if (!handout || !currentCase || !safetyCleared) return;
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
                generationToken.current += 1;
                setCurrentCase(e.target.value || null);
                setHandout(null);
                setLoading(false);
                setError(null);
                setCopied(false);
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
          <div
            role={safetyCleared ? "status" : "alert"}
            className={
              safetyCleared
                ? "rounded-2xl border border-[var(--color-success)]/30 bg-[var(--color-success-soft)] px-5 py-4"
                : "rounded-2xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-5 py-4"
            }
          >
            <p
              className={
                safetyCleared
                  ? "text-sm font-semibold text-[var(--color-success)]"
                  : "text-sm font-semibold text-[var(--color-danger)]"
              }
            >
              {safetyCleared
                ? "Safety gate passed for this case"
                : "Patient handout generation locked"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--color-ink-soft)]">
              {safetyCleared
                ? "A completed clear screen permits drafting, but the clinician must still review every statement before sharing it."
                : `Current safety disposition: ${currentCase.safetyScreen?.disposition ?? "not-screened"}. Do not generate reassurance, exercises or home advice until escalation is resolved and documented.`}
            </p>
          </div>

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
                {handout && safetyCleared && (
                  <Button variant="secondary" onClick={copyHandout}>
                    <Icon name={copied ? "check" : "copy"} width={15} height={15} />
                    {copied ? "Copied!" : "Copy handout"}
                  </Button>
                )}
                <Button onClick={generate} disabled={loading || !safetyCleared}>
                  <Icon name="sparkle" width={16} height={16} />
                  {loading ? "Writing…" : handout ? "Regenerate" : "Generate handout"}
                </Button>
              </div>
            </CardBody>
          </Card>

          {error && (
            <p
              role="alert"
              className="rounded-xl bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]"
            >
              {error}
            </p>
          )}

          {loading && (
            <Card>
              <Spinner label="Writing patient-friendly advice…" />
            </Card>
          )}

          {handout && !loading && safetyCleared && (
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
