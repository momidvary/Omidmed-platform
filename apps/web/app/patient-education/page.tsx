"use client";

import { useRef, useState } from "react";
import { useCases } from "@/lib/store/CaseContext";
import { buildEducation, delay } from "@/lib/ai/engine";
import { buildEducationFa, type EducationHandout } from "@/lib/ai/educationFa";
import { useText } from "@/lib/i18n/text";
import { useLocale } from "@/lib/store/LocaleContext";
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
import { educationText, handoutHeadings } from "./text";

type HandoutLanguage = "en" | "fa";
type Handout = EducationHandout & { language: HandoutLanguage };

export default function PatientEducationPage() {
  const { cases, currentCase, setCurrentCase } = useCases();
  const { locale } = useLocale();
  const t = useText(educationText);
  const [chosenLanguage, setChosenLanguage] = useState<HandoutLanguage | null>(null);
  const handoutLanguage: HandoutLanguage =
    chosenLanguage ?? (locale === "fa" ? "fa" : "en");
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
      setError(t.blocked);
      return;
    }

    const requestToken = ++generationToken.current;
    setLoading(true);
    setHandout(null);
    setError(null);

    try {
      // 🔌 REAL AI API INTEGRATION POINT — keep the safety gate when this
      // becomes an authenticated server-side AI call.
      const language = handoutLanguage;
      const result = await delay(
        language === "fa" ? buildEducationFa(currentCase) : buildEducation(currentCase)
      );
      if (requestToken === generationToken.current) {
        setHandout({ ...result, language });
      }
    } catch (cause) {
      if (requestToken === generationToken.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : t.failed
        );
      }
    } finally {
      if (requestToken === generationToken.current) setLoading(false);
    }
  }

  async function copyHandout() {
    if (!handout || !currentCase || !safetyCleared) return;
    const h = handoutHeadings[handout.language];
    const text = [
      h.homeAdvice(currentCase.name),
      "",
      h.problem,
      handout.problem,
      "",
      `${h.avoid}:`,
      ...handout.avoid.map((i) => `• ${i}`),
      "",
      `${h.exercises}:`,
      ...handout.exercises.map((i) => `• ${i}`),
      "",
      `${h.contact}:`,
      ...handout.contact.map((i) => `• ${i}`),
      "",
      `${h.tips}:`,
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
        title={t.title}
        description={t.intro}
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
              aria-label={t.caseAria}
              className="w-64"
            >
              <option value="">{t.selectCase}</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || t.unnamed}
                </option>
              ))}
            </Select>
          ) : undefined
        }
      />

      {!currentCase && (
        <EmptyState
          icon="education"
          title={t.noCaseTitle}
          description={t.noCaseBody}
          action={<ButtonLink href="/new-case">{t.newCase}</ButtonLink>}
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
              {safetyCleared ? t.gatePassed : t.gateLocked}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--color-ink-soft)]">
              {safetyCleared
                ? t.gatePassedBody
                : t.gateLockedBody(
                    t.disposition[currentCase.safetyScreen?.disposition ?? "not-screened"] ??
                      currentCase.safetyScreen?.disposition ??
                      t.disposition["not-screened"]
                  )}
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
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  aria-label={t.handoutLanguage}
                  value={handoutLanguage}
                  onChange={(e) => {
                    generationToken.current += 1;
                    setChosenLanguage(e.target.value as HandoutLanguage);
                    setHandout(null);
                    setLoading(false);
                    setCopied(false);
                  }}
                  className="w-auto"
                >
                  <option value="fa">{t.handoutLanguage}: فارسی</option>
                  <option value="en">{t.handoutLanguage}: English</option>
                </Select>
                {handout && safetyCleared && (
                  <Button variant="secondary" onClick={copyHandout}>
                    <Icon name={copied ? "check" : "copy"} width={15} height={15} />
                    {copied ? t.copied : t.copy}
                  </Button>
                )}
                <Button onClick={generate} disabled={loading || !safetyCleared}>
                  <Icon name="sparkle" width={16} height={16} />
                  {loading ? t.writing : handout ? t.regenerate : t.generate}
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
              <Spinner label={t.loading} />
            </Card>
          )}

          {handout && !loading && safetyCleared && (
            <div
              lang={handout.language}
              dir={handout.language === "fa" ? "rtl" : "ltr"}
              className="grid grid-cols-1 gap-4 md:grid-cols-2"
            >
              <Card className="md:col-span-2">
                <CardHeader
                  title={handoutHeadings[handout.language].problem}
                  icon={<Icon name="education" width={18} height={18} />}
                />
                <CardBody>
                  <p className="text-sm leading-relaxed text-[var(--color-ink-soft)]">
                    {handout.problem}
                  </p>
                </CardBody>
              </Card>

              <Card>
                <CardHeader title={handoutHeadings[handout.language].avoid} icon={<Icon name="alert" width={18} height={18} />} />
                <CardBody>
                  <BulletList items={handout.avoid} tone="warn" />
                </CardBody>
              </Card>

              <Card>
                <CardHeader title={handoutHeadings[handout.language].exercises} icon={<Icon name="exercise" width={18} height={18} />} />
                <CardBody>
                  <BulletList items={handout.exercises} tone="primary" />
                </CardBody>
              </Card>

              <Card>
                <CardHeader title={handoutHeadings[handout.language].contact} icon={<Icon name="flag" width={18} height={18} />} />
                <CardBody>
                  <BulletList items={handout.contact} tone="danger" />
                </CardBody>
              </Card>

              <Card>
                <CardHeader title={handoutHeadings[handout.language].tips} icon={<Icon name="check" width={18} height={18} />} />
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
