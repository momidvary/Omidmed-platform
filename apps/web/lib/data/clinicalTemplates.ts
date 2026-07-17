import type { Locale } from "@/lib/i18n/translations";

/*
 * Assessment + metric templates. Templates are SUGGESTED structure only:
 * therapists can disable fields, add custom ones, and pick metrics per
 * episode. Assessments store their own jsonb data, so template changes
 * never rewrite existing records. All labels are trilingual.
 */

export type L = Record<Locale, string>;
export const lbl = (en: string, fa: string, ar: string): L => ({ en, fa, ar });

export interface FieldDef {
  key: string;
  label: L;
  type: "text" | "textarea" | "number" | "boolean";
  required?: boolean;
}

export type AssessmentSection = "subjective" | "safety" | "objective" | "clinical_summary";

const f = (key: string, en: string, fa: string, ar: string, type: FieldDef["type"] = "textarea", required = false): FieldDef =>
  ({ key, label: lbl(en, fa, ar), type, required });

/** Common sections (spec 8) shared by every template. */
export const commonAssessmentFields: Record<AssessmentSection, FieldDef[]> = {
  subjective: [
    f("chief_complaint", "Chief complaint", "شکایت اصلی", "الشكوى الرئيسية", "textarea", true),
    f("pain_location", "Pain location", "محل درد", "موضع الألم", "text"),
    f("pain_intensity", "Pain intensity (0-10)", "شدت درد (۰-۱۰)", "شدة الألم (0-10)", "number"),
    f("symptom_duration", "Symptom duration", "مدت علائم", "مدة الأعراض", "text"),
    f("mechanism", "Mechanism of injury", "مکانیسم آسیب", "آلية الإصابة"),
    f("aggravating", "Aggravating factors", "عوامل تشدید", "عوامل التفاقم"),
    f("easing", "Easing factors", "عوامل کاهش", "عوامل التخفيف"),
    f("night_symptoms", "Night symptoms", "علائم شبانه", "أعراض ليلية", "boolean"),
    f("functional_limitations", "Functional limitations", "محدودیت‌های عملکردی", "قيود وظيفية"),
    f("work_limitation", "Work limitation", "محدودیت کاری", "قيود العمل", "text"),
    f("sleep_limitation", "Sleep limitation", "محدودیت خواب", "قيود النوم", "text"),
    f("patient_goals", "Patient goals", "اهداف بیمار", "أهداف المريض"),
    f("previous_treatment", "Previous treatment", "درمان قبلی", "العلاج السابق"),
    f("imaging", "Imaging", "تصویربرداری", "التصوير"),
    f("medications", "Medications", "داروها", "الأدوية"),
  ],
  safety: [
    f("red_flags", "Red flags", "پرچم‌های قرمز", "علامات حمراء"),
    f("yellow_flags", "Yellow flags", "پرچم‌های زرد", "علامات صفراء"),
    f("contraindications", "Contraindications", "موارد منع", "موانع الاستعمال"),
    f("precautions", "Precautions", "احتیاطات", "احتياطات"),
    f("referral_required", "Referral required", "نیاز به ارجاع", "يلزم الإحالة", "boolean"),
    f("referral_note", "Referral note", "یادداشت ارجاع", "ملاحظة الإحالة"),
  ],
  objective: [
    f("observation", "Observation", "مشاهده", "الملاحظة"),
    f("palpation", "Palpation", "لمس", "الجس"),
    f("rom", "ROM", "دامنه حرکتی", "مدى الحركة"),
    f("strength", "Strength", "قدرت", "القوة"),
    f("functional_tests", "Functional tests", "تست‌های عملکردی", "اختبارات وظيفية"),
    f("special_tests", "Special tests", "تست‌های اختصاصی", "اختبارات خاصة"),
    f("neuro_screen", "Neurological screen", "غربالگری عصبی", "فحص عصبي"),
    f("gait", "Gait", "راه‌رفتن", "المشية"),
    f("balance", "Balance", "تعادل", "التوازن"),
    f("swelling", "Swelling", "تورم", "التورم", "text"),
    f("therapist_notes", "Therapist notes", "یادداشت درمانگر", "ملاحظات المعالج"),
  ],
  clinical_summary: [
    f("problem_list", "Problem list", "فهرست مشکلات", "قائمة المشكلات"),
    f("clinical_hypotheses", "Clinical hypotheses", "فرضیه‌های بالینی", "فرضيات سريرية"),
    f("treatment_priorities", "Treatment priorities", "اولویت‌های درمان", "أولويات العلاج"),
    f("short_term_goals", "Short-term goals", "اهداف کوتاه‌مدت", "أهداف قصيرة المدى"),
    f("long_term_goals", "Long-term goals", "اهداف بلندمدت", "أهداف طويلة المدى"),
  ],
};

export interface AssessmentTemplate {
  key: string;
  label: L;
  /** Extra region-specific objective fields. */
  extraObjective: FieldDef[];
}

export const assessmentTemplates: AssessmentTemplate[] = [
  { key: "knee", label: lbl("Knee", "زانو", "الركبة"), extraObjective: [
    f("knee_effusion", "Effusion grade", "درجه افیوژن", "درجة الانصباب", "text"),
    f("patella_mobility", "Patellar mobility", "تحرک کشکک", "حركة الرضفة", "text") ] },
  { key: "hip", label: lbl("Hip", "لگن/ران", "الورك"), extraObjective: [
    f("hip_impingement_tests", "Impingement tests", "تست‌های ایمپینجمنت", "اختبارات الانحشار", "text") ] },
  { key: "low_back", label: lbl("Low back", "کمر", "أسفل الظهر"), extraObjective: [
    f("repeated_movements", "Repeated movement response", "پاسخ به حرکات تکراری", "استجابة الحركات المتكررة"),
    f("slr", "Straight leg raise", "بالا آوردن پای صاف", "رفع الساق المستقيمة", "text") ] },
  { key: "cervical", label: lbl("Cervical", "گردن", "الرقبة"), extraObjective: [
    f("headache_pattern", "Headache pattern", "الگوی سردرد", "نمط الصداع", "text"),
    f("dnf_endurance", "Deep neck flexor endurance", "استقامت فلکسورهای عمقی گردن", "تحمل عاضلات الرقبة العميقة", "text") ] },
  { key: "shoulder", label: lbl("Shoulder", "شانه", "الكتف"), extraObjective: [
    f("painful_arc", "Painful arc", "قوس دردناک", "القوس المؤلم", "text"),
    f("scapular_control", "Scapular control", "کنترل کتف", "التحكم اللوحي", "text") ] },
  { key: "ankle_foot", label: lbl("Ankle & foot", "مچ و کف پا", "الكاحل والقدم"), extraObjective: [
    f("ligament_tests", "Ligament tests", "تست‌های لیگامانی", "اختبارات الأربطة", "text") ] },
  { key: "elbow", label: lbl("Elbow", "آرنج", "المرفق"), extraObjective: [
    f("grip_strength", "Grip strength", "قدرت گرفتن", "قوة القبضة", "text") ] },
  { key: "wrist_hand", label: lbl("Wrist & hand", "مچ و دست", "المعصم واليد"), extraObjective: [
    f("fine_motor", "Fine motor function", "حرکات ظریف", "المهارات الدقيقة", "text") ] },
  { key: "general", label: lbl("General rehabilitation", "توان‌بخشی عمومی", "تأهيل عام"), extraObjective: [] },
];

/* ── Metric templates per region (spec 13) ─────────────────────── */

export interface MetricTemplate {
  nameKey: string;
  label: L;
  dataType: "numeric" | "boolean" | "categorical";
  unit: string | null;
  direction: "higher_is_better" | "lower_is_better" | "neutral" | "clinician_interpretation";
  min?: number;
  max?: number;
  patientVisible?: boolean;
}

const m = (
  nameKey: string, en: string, fa: string, ar: string,
  direction: MetricTemplate["direction"], unit: string | null = null,
  min?: number, max?: number, patientVisible = true,
  dataType: MetricTemplate["dataType"] = "numeric"
): MetricTemplate => ({ nameKey, label: lbl(en, fa, ar), dataType, unit, direction, min, max, patientVisible });

export const metricTemplates: Record<string, MetricTemplate[]> = {
  knee: [
    m("pain_rest", "Pain at rest", "درد در استراحت", "ألم أثناء الراحة", "lower_is_better", "0-10", 0, 10),
    m("pain_walking", "Pain during walking", "درد هنگام راه‌رفتن", "ألم أثناء المشي", "lower_is_better", "0-10", 0, 10),
    m("knee_flexion_rom", "Knee flexion ROM", "دامنه خم‌شدن زانو", "مدى انثناء الركبة", "higher_is_better", "deg", 0, 160),
    m("knee_extension_rom", "Knee extension deficit", "کمبود بازشدن زانو", "عجز بسط الركبة", "lower_is_better", "deg", 0, 40),
    m("swelling", "Swelling", "تورم", "التورم", "lower_is_better", "cm", 0, 20, false),
    m("quad_strength", "Quadriceps strength", "قدرت چهارسر", "قوة العاضلة الرباعية", "higher_is_better", "0-5", 0, 5, false),
    m("slr_lag", "Straight leg raise lag", "تأخیر SLR", "تأخر رفع الساق", "lower_is_better", "deg", 0, 45, false),
    m("sit_to_stand", "Sit to stand (30s)", "نشستن-ایستادن (۳۰ث)", "الجلوس-الوقوف (30ث)", "higher_is_better", "reps", 0, 40),
    m("tug", "Timed Up and Go", "تست TUG", "اختبار TUG", "lower_is_better", "s", 0, 120),
    m("walking_distance", "Walking distance", "مسافت راه‌رفتن", "مسافة المشي", "higher_is_better", "m", 0, 5000),
    m("stair_ability", "Stair ability", "توانایی پله", "القدرة على الدرج", "clinician_interpretation", null, undefined, undefined, true, "categorical"),
  ],
  low_back: [
    m("pain", "Pain", "درد", "الألم", "lower_is_better", "0-10", 0, 10),
    m("sitting_tolerance", "Sitting tolerance", "تحمل نشستن", "تحمل الجلوس", "higher_is_better", "min", 0, 480),
    m("standing_tolerance", "Standing tolerance", "تحمل ایستادن", "تحمل الوقوف", "higher_is_better", "min", 0, 480),
    m("walking_tolerance", "Walking tolerance", "تحمل راه‌رفتن", "تحمل المشي", "higher_is_better", "min", 0, 480),
    m("forward_bend_tolerance", "Forward bending tolerance", "تحمل خم‌شدن", "تحمل الانحناء", "clinician_interpretation", null, undefined, undefined, true, "categorical"),
    m("sit_to_stand", "Sit to stand (30s)", "نشستن-ایستادن (۳۰ث)", "الجلوس-الوقوف (30ث)", "higher_is_better", "reps", 0, 40),
    m("sleep_disturbance", "Sleep disturbance (nights/week)", "اختلال خواب (شب/هفته)", "اضطراب النوم (ليالٍ/أسبوع)", "lower_is_better", "nights", 0, 7),
    m("work_tolerance", "Work tolerance", "تحمل کار", "تحمل العمل", "higher_is_better", "hrs", 0, 12),
    m("functional_score", "Functional questionnaire score", "امتیاز پرسش‌نامه عملکردی", "درجة الاستبيان الوظيفي", "clinician_interpretation", "score", 0, 100, false),
  ],
  shoulder: [
    m("flexion_rom", "Flexion ROM", "دامنه فلکشن", "مدى الانثناء", "higher_is_better", "deg", 0, 180),
    m("abduction_rom", "Abduction ROM", "دامنه ابداکشن", "مدى الإبعاد", "higher_is_better", "deg", 0, 180),
    m("external_rotation", "External rotation", "چرخش خارجی", "الدوران الخارجي", "higher_is_better", "deg", 0, 100),
    m("internal_rotation", "Internal rotation", "چرخش داخلی", "الدوران الداخلي", "higher_is_better", "deg", 0, 100),
    m("painful_arc", "Painful arc", "قوس دردناک", "القوس المؤلم", "lower_is_better", "0-10", 0, 10, false),
    m("hand_behind_back", "Hand behind back", "دست پشت کمر", "اليد خلف الظهر", "clinician_interpretation", null, undefined, undefined, true, "categorical"),
    m("reaching", "Reaching ability", "توانایی دسترسی", "القدرة على الوصول", "clinician_interpretation", null, undefined, undefined, true, "categorical"),
    m("strength", "Strength", "قدرت", "القوة", "higher_is_better", "0-5", 0, 5, false),
    m("functional_score", "Functional score", "امتیاز عملکردی", "الدرجة الوظيفية", "clinician_interpretation", "score", 0, 100, false),
  ],
  cervical: [
    m("cervical_rotation", "Cervical rotation", "چرخش گردن", "دوران الرقبة", "higher_is_better", "deg", 0, 90),
    m("cervical_flexion", "Flexion", "فلکشن", "الانثناء", "higher_is_better", "deg", 0, 70),
    m("cervical_extension", "Extension", "اکستنشن", "البسط", "higher_is_better", "deg", 0, 80),
    m("headache_frequency", "Headache frequency (days/week)", "تعداد سردرد (روز/هفته)", "تكرار الصداع (أيام/أسبوع)", "lower_is_better", "days", 0, 7),
    m("headache_duration", "Headache duration", "مدت سردرد", "مدة الصداع", "lower_is_better", "hrs", 0, 24),
    m("headache_intensity", "Headache intensity", "شدت سردرد", "شدة الصداع", "lower_is_better", "0-10", 0, 10),
    m("dnf_endurance", "Deep neck flexor endurance", "استقامت فلکسور عمقی", "تحمل العاضلات العميقة", "higher_is_better", "s", 0, 120, false),
    m("sleep_quality", "Sleep quality", "کیفیت خواب", "جودة النوم", "higher_is_better", "0-10", 0, 10),
    m("work_tolerance", "Work tolerance", "تحمل کار", "تحمل العمل", "higher_is_better", "hrs", 0, 12),
  ],
};

/** Metrics for a template key; falls back to a generic pain metric. */
export function metricsForRegion(regionKey: string): MetricTemplate[] {
  return (
    metricTemplates[regionKey] ?? [
      m("pain", "Pain", "درد", "الألم", "lower_is_better", "0-10", 0, 10),
    ]
  );
}
