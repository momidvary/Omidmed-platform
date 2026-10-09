import type { ClinicalReasoning, PatientCase } from "@/lib/types";
import { bodyRegionsFa } from "@/lib/data/bodyRegionsFa";
import { redFlagFa } from "@/lib/data/redFlags";
import { detectSafetySignals } from "@/lib/clinical/safety";
import { buildReasoning } from "@/lib/ai/engine";

/*
 * Persian rendering of the deterministic intake template (buildReasoning).
 * Same logic and safety gating; only the clinician-facing wording differs.
 * Standard outcome-measure names stay in English, as used in practice.
 */
export function buildReasoningFa(c: PatientCase): ClinicalReasoning {
  const english = buildReasoning(c);
  const region = c.region ? bodyRegionsFa[c.region] : undefined;

  const subjective = [
    c.mainComplaint && `شکایت اصلی: ${c.mainComplaint}.`,
    c.painLocation && `محل درد: ${c.painLocation}، شدت ${c.painIntensity} از ۱۰.`,
    c.duration && `مدت علائم: ${c.duration}.`,
    c.mechanism && `مکانیسم / نحوه شروع: ${c.mechanism}.`,
    c.aggravating && `عوامل تشدیدکننده: ${c.aggravating}.`,
    c.easing && `عوامل تسکین‌دهنده: ${c.easing}.`,
    c.functionalLimitations && `محدودیت‌های عملکردی: ${c.functionalLimitations}.`,
    c.patientGoal && `هدف بیمار: ${c.patientGoal}.`,
  ].filter(Boolean) as string[];

  const objective = [
    "در معاینه تکمیل شود:",
    ...(region?.functionalTests.map((test) => `تست عملکردی — ${test}.`) ?? []),
    "مشاهده، لمس و غربالگری عصبی در صورت نیاز.",
  ];

  const hypotheses = region
    ? region.commonConditions.map((condition) => `احتمالی: ${condition} (با معاینه تأیید شود).`)
    : ["برای فرضیه‌های اختصاصی، ناحیه بدن را انتخاب کنید."];

  const differentials = region
    ? [
        `درد ارجاعی و مفاصل مجاور در ناحیه «${region.label}» را در نظر بگیرید.`,
        "عوامل سیستمیک یا غیرعضلانی-اسکلتی را در نظر بگیرید.",
        "مکانیسم درد را در نظر بگیرید: نوسی‌سپتیو، نوروپاتیک یا نوسی‌پلاستیک.",
      ]
    : ["برای دقیق‌تر شدن تشخیص‌های افتراقی، ناحیه و جزئیات شرح حال را اضافه کنید."];

  const yellowFlags = [
    "ریسک روانی-اجتماعی با این پذیرش مشخص نشده است. با سؤالات معتبر درباره پریشانی، انتظار بهبود، ترس، خواب، کار و شرایط اجتماعی بپرسید.",
  ];

  const redFlags: string[] = [];
  const structuredFlags = c.safetyScreen?.selectedFlagIds ?? [];
  if (!c.safetyScreen?.screenedAt) {
    redFlags.push("غربالگری ایمنی کامل نشده است — پیدا نشدن کلمات هشدار به معنای مجوز بالینی نیست.");
  } else if (structuredFlags.length > 0) {
    redFlags.push(
      ...structuredFlags.map(
        (id) =>
          `نگرانی ثبت‌شده در غربالگری: ${redFlagFa[id]?.label ?? id}. مسیر ارجاع ثبت‌شده را دنبال کنید.`
      )
    );
  } else {
    redFlags.push("غربالگری ساختاریافته بدون مورد انتخاب‌شده کامل شده است؛ در طول معاینه همچنان بررسی کنید.");
  }

  const haystack = [
    c.mainComplaint, c.mechanism, c.medicalHistory, c.surgicalHistory,
    c.medications, c.functionalLimitations, c.imaging, c.aggravating,
    c.painLocation,
  ].join(" ");
  for (const signal of detectSafetySignals(haystack)) {
    const level = signal.disposition === "emergency" ? "اورژانسی" : signal.disposition === "urgent" ? "فوری" : "نیازمند بررسی پزشکی";
    redFlags.push(`هشدار تکمیلی از متن (${level}): ${signal.id}. فوراً با غربالگری ساختاریافته بررسی کنید.`);
  }

  const missingInfo = [
    !c.imaging || /not performed|none|انجام نشده|ندارد/i.test(c.imaging)
      ? "نتایج تصویربرداری، در صورت وجود."
      : null,
    "رفتار ۲۴ ساعته علائم (صبح در برابر عصر).",
    "علائم عصبی (گزگز، ضعف، بی‌حسی).",
    "وضعیت سلامت عمومی، سؤالات غربالگری پرچم قرمز و بررسی داروها.",
    "دوره‌های قبلی و پاسخ به درمان‌های قبلی.",
  ].filter(Boolean) as string[];

  return {
    subjective,
    objective,
    hypotheses,
    differentials,
    yellowFlags,
    redFlags,
    missingInfo,
    suggestedTests: region?.specialTests ?? ["پس از انتخاب ناحیه، تست‌های اختصاصی همان ناحیه."],
    outcomeMeasures: english.outcomeMeasures,
  };
}
