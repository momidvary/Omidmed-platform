import type { RedFlagItem } from "@/lib/types";

// Safety screening items grouped by category.
export const redFlags: RedFlagItem[] = [
  { id: "rf_cancer", category: "Cancer", label: "History of cancer", detail: "Previous malignancy with new unexplained pain" },
  { id: "rf_weightloss", category: "Cancer", label: "Unexplained weight loss", detail: "Significant loss without dieting" },
  { id: "rf_nightpain", category: "Cancer", label: "Constant, unremitting night pain", detail: "Non-mechanical, unrelieved by position" },

  { id: "rf_fracture_trauma", category: "Fracture", label: "Significant recent trauma", detail: "Fall, road accident, direct blow" },
  { id: "rf_fracture_osteo", category: "Fracture", label: "Osteoporosis + minor trauma", detail: "Fragility fracture risk" },
  { id: "rf_steroids", category: "Fracture", label: "Prolonged corticosteroid use", detail: "Increased fracture risk" },

  { id: "rf_fever", category: "Infection", label: "Fever / chills", detail: "Systemic signs of infection" },
  { id: "rf_ivdu", category: "Infection", label: "Recent infection or IV drug use", detail: "Risk of spinal/joint infection" },
  { id: "rf_immuno", category: "Infection", label: "Immunosuppression", detail: "Higher infection susceptibility" },

  { id: "rf_ce_saddle", category: "Cauda Equina", label: "Saddle anaesthesia", detail: "Numbness around perineum/inner thighs" },
  { id: "rf_ce_bladder", category: "Cauda Equina", label: "Bladder / bowel dysfunction", detail: "Retention, incontinence, loss of control" },
  { id: "rf_ce_sexual", category: "Cauda Equina", label: "Sexual dysfunction (new)", detail: "New loss of genital sensation" },

  { id: "rf_neuro_progressive", category: "Neurological", label: "Progressive neurological deficit", detail: "Worsening weakness / numbness" },
  { id: "rf_neuro_bilateral", category: "Neurological", label: "Bilateral limb symptoms", detail: "Numbness or weakness in both limbs" },

  { id: "rf_dvt_calf", category: "DVT", label: "Unilateral calf pain / swelling", detail: "Warm, tender, swollen calf" },
  { id: "rf_dvt_risk", category: "DVT", label: "Recent immobilisation / surgery", detail: "Raised thrombosis risk" },

  { id: "rf_cardiac_chest", category: "Cardiac", label: "Chest pain / tightness", detail: "Especially with exertion" },
  { id: "rf_cardiac_breath", category: "Cardiac", label: "Shortness of breath", detail: "Unexplained dyspnoea, palpitations" },

  { id: "rf_severe_pain", category: "General", label: "Severe unexplained pain", detail: "Out of proportion to findings" },
];

export const redFlagCategories = Array.from(
  new Set(redFlags.map((r) => r.category))
);

/* ── Persian clinician text ───────────────────────────────────────── */

export const redFlagCategoryFa: Record<string, string> = {
  Cancer: "بدخیمی",
  Fracture: "شکستگی",
  Infection: "عفونت",
  "Cauda Equina": "سندرم دم اسب",
  Neurological: "عصبی",
  DVT: "ترومبوز ورید عمقی (DVT)",
  Cardiac: "قلبی",
  General: "عمومی",
};

export const redFlagFa: Record<string, { label: string; detail: string }> = {
  rf_cancer: { label: "سابقه سرطان", detail: "سابقه بدخیمی همراه درد جدید بی‌دلیل" },
  rf_weightloss: { label: "کاهش وزن بی‌دلیل", detail: "کاهش وزن قابل توجه بدون رژیم" },
  rf_nightpain: { label: "درد شبانه مداوم و بی‌وقفه", detail: "غیرمکانیکی؛ با تغییر وضعیت کم نمی‌شود" },
  rf_fracture_trauma: { label: "ضربه قابل توجه اخیر", detail: "زمین خوردن، تصادف، ضربه مستقیم" },
  rf_fracture_osteo: { label: "پوکی استخوان + ضربه خفیف", detail: "خطر شکستگی شکنندگی" },
  rf_steroids: { label: "مصرف طولانی کورتیکواستروئید", detail: "افزایش خطر شکستگی" },
  rf_fever: { label: "تب / لرز", detail: "علائم سیستمیک عفونت" },
  rf_ivdu: { label: "عفونت اخیر یا مصرف تزریقی مواد", detail: "خطر عفونت ستون فقرات/مفصل" },
  rf_immuno: { label: "سرکوب ایمنی", detail: "استعداد بیشتر به عفونت" },
  rf_ce_saddle: { label: "بی‌حسی زینی", detail: "بی‌حسی اطراف پرینه/داخل ران‌ها" },
  rf_ce_bladder: { label: "اختلال مثانه / روده", detail: "احتباس، بی‌اختیاری، از دست دادن کنترل" },
  rf_ce_sexual: { label: "اختلال جنسی (جدید)", detail: "کاهش جدید حس ناحیه تناسلی" },
  rf_neuro_progressive: { label: "نقص عصبی پیشرونده", detail: "ضعف / بی‌حسی رو به افزایش" },
  rf_neuro_bilateral: { label: "علائم دوطرفه اندام‌ها", detail: "بی‌حسی یا ضعف در هر دو اندام" },
  rf_dvt_calf: { label: "درد / تورم یک‌طرفه ساق", detail: "ساق گرم، حساس و متورم" },
  rf_dvt_risk: { label: "بی‌حرکتی / جراحی اخیر", detail: "افزایش خطر ترومبوز" },
  rf_cardiac_chest: { label: "درد / فشار قفسه سینه", detail: "به‌ویژه هنگام فعالیت" },
  rf_cardiac_breath: { label: "تنگی نفس", detail: "تنگی نفس یا تپش قلب بی‌دلیل" },
  rf_severe_pain: { label: "درد شدید بی‌دلیل", detail: "نامتناسب با یافته‌ها" },
};

export function localizedRedFlag(
  flag: RedFlagItem,
  locale: "en" | "fa" | "ar"
): RedFlagItem {
  if (locale !== "fa") return flag;
  const fa = redFlagFa[flag.id];
  return fa ? { ...flag, ...fa } : flag;
}

export function redFlagCategoryLabel(category: string, locale: "en" | "fa" | "ar"): string {
  return locale === "fa" ? (redFlagCategoryFa[category] ?? category) : category;
}
