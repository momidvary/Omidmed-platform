import type { BodyRegionId, ClinicalSessionNote } from "@/lib/types";
import type { Locale } from "@/lib/i18n/translations";
import {
  normalizeFindings,
  type ClinicalFindings,
} from "@/lib/clinical/reasoning/findings";
import { getRegionKnowledge } from "@/lib/clinical/reasoning/knowledge";
import { localized, reasoningStrings } from "@/lib/clinical/reasoning/strings";

/*
 * Session-note starting points. Templates are prompts for the clinician to
 * complete, never pre-written clinical content: every line ends with an
 * empty slot, and nothing is saved until the clinician signs the note.
 */

export const SOAP_FIELDS = [
  "subjective",
  "objective",
  "interventions",
  "response",
  "plan",
] as const;
export type SoapField = (typeof SOAP_FIELDS)[number];
export type SoapDraft = Record<SoapField, string>;

export const SESSION_TEMPLATE_IDS = [
  "initial",
  "follow-up",
  "post-op",
  "discharge",
] as const;
export type SessionTemplateId = (typeof SESSION_TEMPLATE_IDS)[number];

type TemplateLanguage = "en" | "fa";

const lines = (...items: string[]) => items.map((item) => `${item}: `).join("\n");

const templates: Record<
  SessionTemplateId,
  Record<TemplateLanguage, { label: string; fields: SoapDraft }>
> = {
  initial: {
    en: {
      label: "Initial assessment",
      fields: {
        subjective: lines(
          "Presenting complaint",
          "Onset / mechanism",
          "Pain 0–10 (now / best / worst)",
          "24-hour behaviour",
          "Aggravating / easing",
          "Red-flag screen reviewed",
          "Patient goals"
        ),
        objective: lines(
          "Observation",
          "Range of motion",
          "Strength",
          "Neurological screen",
          "Special tests",
          "Functional tests",
          "Baseline outcome measure"
        ),
        interventions: lines("Education", "Exercise", "Manual therapy (if indicated)"),
        response: lines("Within-session change", "Patient understanding"),
        plan: lines(
          "Provisional working hypothesis (to confirm)",
          "Frequency",
          "Home program",
          "Next review",
          "Referral / medical review needed"
        ),
      },
    },
    fa: {
      label: "ارزیابی اولیه",
      fields: {
        subjective: lines(
          "شکایت اصلی",
          "نحوه شروع / مکانیسم",
          "درد ۰ تا ۱۰ (الان / کمترین / بیشترین)",
          "رفتار ۲۴ ساعته علائم",
          "عوامل تشدیدکننده / تسکین‌دهنده",
          "غربالگری پرچم قرمز بررسی شد",
          "اهداف بیمار"
        ),
        objective: lines(
          "مشاهده",
          "دامنه حرکتی",
          "قدرت",
          "غربالگری عصبی",
          "تست‌های اختصاصی",
          "تست‌های عملکردی",
          "ابزار سنجش پیامد پایه"
        ),
        interventions: lines("آموزش", "تمرین", "درمان دستی (در صورت اندیکاسیون)"),
        response: lines("تغییر در طول جلسه", "درک بیمار"),
        plan: lines(
          "فرضیه کاری موقت (نیازمند تأیید)",
          "تعداد جلسات",
          "برنامه خانگی",
          "ارزیابی مجدد بعدی",
          "نیاز به ارجاع / بررسی پزشکی"
        ),
      },
    },
  },
  "follow-up": {
    en: {
      label: "Follow-up session",
      fields: {
        subjective: lines(
          "Since last session — pain 0–10 and function",
          "Home program adherence",
          "New symptoms or red flags"
        ),
        objective: lines("Re-assessment markers", "Range / strength change"),
        interventions: lines(
          "Exercises progressed / regressed",
          "Manual therapy",
          "Education"
        ),
        response: lines("Within-session change", "24-hour response to last session"),
        plan: lines("Progression criteria", "Home program changes", "Next session"),
      },
    },
    fa: {
      label: "جلسه پیگیری",
      fields: {
        subjective: lines(
          "از جلسه قبل — درد ۰ تا ۱۰ و عملکرد",
          "پایبندی به برنامه خانگی",
          "علامت جدید یا پرچم قرمز"
        ),
        objective: lines("شاخص‌های ارزیابی مجدد", "تغییر دامنه / قدرت"),
        interventions: lines("تمرین‌های پیشرفت‌داده / پسرفت‌داده", "درمان دستی", "آموزش"),
        response: lines("تغییر در طول جلسه", "پاسخ ۲۴ ساعته به جلسه قبل"),
        plan: lines("معیارهای پیشرفت", "تغییرات برنامه خانگی", "جلسه بعد"),
      },
    },
  },
  "post-op": {
    en: {
      label: "Post-operative follow-up",
      fields: {
        subjective: lines(
          "Days since surgery",
          "Pain / swelling",
          "Wound concerns, calf pain or fever",
          "Adherence to precautions"
        ),
        objective: lines(
          "Wound / swelling",
          "Range of motion",
          "Muscle activation / strength",
          "Gait and weight-bearing status"
        ),
        interventions: lines(
          "Exercises within the surgical protocol",
          "Gait training",
          "Swelling management"
        ),
        response: lines("Within-session change", "Tolerance"),
        plan: lines(
          "Protocol phase",
          "Precautions confirmed with the surgical team",
          "Next review"
        ),
      },
    },
    fa: {
      label: "پیگیری پس از جراحی",
      fields: {
        subjective: lines(
          "روزهای پس از جراحی",
          "درد / تورم",
          "نگرانی زخم، درد ساق یا تب",
          "رعایت احتیاط‌ها"
        ),
        objective: lines(
          "زخم / تورم",
          "دامنه حرکتی",
          "فعال‌سازی / قدرت عضله",
          "راه رفتن و وضعیت تحمل وزن"
        ),
        interventions: lines(
          "تمرین‌ها در چارچوب پروتکل جراحی",
          "تمرین راه رفتن",
          "مدیریت تورم"
        ),
        response: lines("تغییر در طول جلسه", "تحمل"),
        plan: lines("فاز پروتکل", "احتیاط‌های تأییدشده با تیم جراحی", "ارزیابی بعدی"),
      },
    },
  },
  discharge: {
    en: {
      label: "Discharge summary",
      fields: {
        subjective: lines("Status against initial goals", "Remaining symptoms"),
        objective: lines("Final outcome measures", "Range / strength / function"),
        interventions: lines("Self-management plan reviewed"),
        response: lines("Confidence with self-management"),
        plan: lines(
          "Discharge reason",
          "When to return or seek care",
          "Long-term home program"
        ),
      },
    },
    fa: {
      label: "خلاصه ترخیص",
      fields: {
        subjective: lines("وضعیت نسبت به اهداف اولیه", "علائم باقی‌مانده"),
        objective: lines("ابزارهای سنجش پیامد نهایی", "دامنه / قدرت / عملکرد"),
        interventions: lines("برنامه خودمدیریتی مرور شد"),
        response: lines("اطمینان بیمار به خودمدیریتی"),
        plan: lines("دلیل ترخیص", "چه زمانی برگردد یا مراجعه کند", "برنامه خانگی بلندمدت"),
      },
    },
  },
};

function templateLanguage(locale: Locale): TemplateLanguage {
  return locale === "fa" ? "fa" : "en";
}

export function sessionTemplateLabel(id: SessionTemplateId, locale: Locale): string {
  return templates[id][templateLanguage(locale)].label;
}

export function sessionTemplate(id: SessionTemplateId, locale: Locale): SoapDraft {
  return { ...templates[id][templateLanguage(locale)].fields };
}

/**
 * Start a new note from the previous one. Only the parts that usually carry
 * over are copied; subjective report and response belong to the new session.
 */
export function carryForwardFromNote(
  note: Pick<ClinicalSessionNote, SoapField>
): SoapDraft {
  return {
    subjective: "",
    objective: note.objective,
    interventions: note.interventions,
    response: "",
    plan: note.plan,
  };
}

/**
 * Render saved structured findings as editable note text: history answers
 * for the subjective field, tests and examination notes for the objective.
 * Only findings the clinician recorded are included.
 */
export function findingsToNoteText(
  findings: ClinicalFindings,
  region: BodyRegionId,
  locale: Locale
): { subjective: string; objective: string } {
  const knowledge = getRegionKnowledge(region);
  const s = reasoningStrings[locale];
  const clean = normalizeFindings(findings, region);
  const fa = locale === "fa";

  const reported: string[] = [];
  const denied: string[] = [];
  for (const question of knowledge?.questions ?? []) {
    const answer = clean.intake.answers[question.id];
    if (answer === "yes") reported.push(localized(question, locale));
    if (answer === "no") denied.push(localized(question, locale));
  }

  const subjective = [
    ...reported.map((item) => `${fa ? "گزارش شد" : "Reported"}: ${item}`),
    ...denied.map((item) => `${fa ? "رد شد" : "Denied"}: ${item}`),
    clean.intake.irritability
      ? `${s.irritability}: ${s.irritabilityLevels[clean.intake.irritability]}`
      : null,
  ].filter(Boolean) as string[];

  const resultLabel = {
    positive: fa ? "مثبت" : "positive",
    negative: fa ? "منفی" : "negative",
    equivocal: fa ? "مشکوک" : "equivocal",
  };
  const tests = (knowledge?.tests ?? []).flatMap((test) => {
    const result = clean.exam.tests[test.id];
    return result ? [`${localized(test, locale)}: ${resultLabel[result]}`] : [];
  });
  const notes = Object.entries(clean.exam.notes).flatMap(([key, value]) =>
    value ? [`${s.noteLabels[key as keyof typeof s.noteLabels]}: ${value}`] : []
  );

  return {
    subjective: subjective.join("\n"),
    objective: [...tests, ...notes].join("\n"),
  };
}

const templatePrompts = new Set(
  Object.values(templates).flatMap((byLanguage) =>
    Object.values(byLanguage).flatMap(({ fields }) =>
      SOAP_FIELDS.flatMap((field) =>
        fields[field].split("\n").map((line) => line.trim())
      )
    )
  )
);

/**
 * Remove template prompt lines the clinician left unanswered, so empty
 * prompts are never signed into the record or counted as note content.
 * Any line with text after the prompt is kept unchanged.
 */
export function stripEmptyPrompts(text: string): string {
  return text
    .split("\n")
    .filter((line) => !templatePrompts.has(line.trim()))
    .join("\n")
    .trim();
}

/** Append text to a field without overwriting what the clinician wrote. */
export function appendToField(current: string, addition: string): string {
  if (!addition.trim()) return current;
  return current.trim() ? `${current.replace(/\s+$/, "")}\n${addition}` : addition;
}
