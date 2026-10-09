import type { ClinicalDraftCaseContext } from "@/lib/ai/clinicalDraftSchema";

export const CLINICAL_AI_LIMIT_DEFAULTS = {
  perMinute: 5,
  perUserPerDay: 40,
  perClinicPerDay: 500,
} as const;

export type ClinicalAiLimits = {
  perMinute: number;
  perUserPerDay: number;
  perClinicPerDay: number;
};

type LimitEnvironment = {
  CLINICAL_AI_PER_MINUTE_LIMIT?: string;
  CLINICAL_AI_DAILY_USER_LIMIT?: string;
  CLINICAL_AI_DAILY_CLINIC_LIMIT?: string;
};

type LimitResult =
  | { ok: true; limits: ClinicalAiLimits }
  | { ok: false; invalidKey: keyof LimitEnvironment };

function boundedInteger(
  rawValue: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number | null {
  if (rawValue === undefined || rawValue.trim() === "") return fallback;
  if (!/^\d+$/.test(rawValue.trim())) return null;
  const parsed = Number(rawValue);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    return null;
  }
  return parsed;
}

export function resolveClinicalAiLimits(env: LimitEnvironment): LimitResult {
  const perMinute = boundedInteger(
    env.CLINICAL_AI_PER_MINUTE_LIMIT,
    CLINICAL_AI_LIMIT_DEFAULTS.perMinute,
    1,
    20
  );
  if (perMinute === null) {
    return { ok: false, invalidKey: "CLINICAL_AI_PER_MINUTE_LIMIT" };
  }

  const perUserPerDay = boundedInteger(
    env.CLINICAL_AI_DAILY_USER_LIMIT,
    CLINICAL_AI_LIMIT_DEFAULTS.perUserPerDay,
    1,
    1_000
  );
  if (perUserPerDay === null) {
    return { ok: false, invalidKey: "CLINICAL_AI_DAILY_USER_LIMIT" };
  }

  const perClinicPerDay = boundedInteger(
    env.CLINICAL_AI_DAILY_CLINIC_LIMIT,
    CLINICAL_AI_LIMIT_DEFAULTS.perClinicPerDay,
    1,
    100_000
  );
  if (perClinicPerDay === null) {
    return { ok: false, invalidKey: "CLINICAL_AI_DAILY_CLINIC_LIMIT" };
  }

  return {
    ok: true,
    limits: { perMinute, perUserPerDay, perClinicPerDay },
  };
}

const DIRECT_IDENTIFIER_PATTERNS = [
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/giu,
  /\bhttps?:\/\/[^\s]+/giu,
  /(?<!\d)(?:\+?\d[\s().-]*){10,15}(?!\d)/gu,
  /(?<![۰-۹])(?:[۰-۹][\s().-]*){10,15}(?![۰-۹])/gu,
  /(?<![٠-٩])(?:[٠-٩][\s().-]*){10,15}(?![٠-٩])/gu,
] as const;

export function redactDirectIdentifiers(value: string): {
  text: string;
  redactionCount: number;
} {
  let text = value;
  let redactionCount = 0;
  for (const pattern of DIRECT_IDENTIFIER_PATTERNS) {
    text = text.replace(pattern, () => {
      redactionCount += 1;
      return "[REDACTED_IDENTIFIER]";
    });
  }
  return { text, redactionCount };
}

export function minimizeClinicalAiPayload(
  question: string,
  caseContext: ClinicalDraftCaseContext
): {
  question: string;
  caseContext: ClinicalDraftCaseContext;
  redactionCount: number;
} {
  const minimizedQuestion = redactDirectIdentifiers(question);
  let redactionCount = minimizedQuestion.redactionCount;
  const minimizedEntries = Object.entries(caseContext).map(([key, value]) => {
    if (typeof value !== "string") return [key, value] as const;
    const minimized = redactDirectIdentifiers(value);
    redactionCount += minimized.redactionCount;
    return [key, minimized.text] as const;
  });
  const minimizedContext = Object.fromEntries(
    minimizedEntries
  ) as ClinicalDraftCaseContext;

  // Structured labels come from the knowledge base; only the clinician's
  // free-text examination notes can carry identifiers.
  if (caseContext.structuredFindings) {
    minimizedContext.structuredFindings = {
      ...caseContext.structuredFindings,
      examNotes: caseContext.structuredFindings.examNotes.map((entry) => {
        const minimized = redactDirectIdentifiers(entry.note);
        redactionCount += minimized.redactionCount;
        return { ...entry, note: minimized.text };
      }),
    };
  }

  return {
    question: minimizedQuestion.text,
    caseContext: minimizedContext,
    redactionCount,
  };
}

/**
 * Free text that the deterministic safety gate must scan: the question, the
 * clinician-entered case fields and examination notes. Knowledge-base labels
 * are controlled vocabulary and are deliberately excluded.
 */
export function clinicalAiFreeText(
  question: string,
  caseContext: ClinicalDraftCaseContext
): string {
  const { structuredFindings, ...fields } = caseContext;
  return [
    question,
    ...Object.values(fields).filter((value) => typeof value === "string"),
    ...(structuredFindings?.examNotes.map((entry) => entry.note) ?? []),
  ].join("\n");
}
