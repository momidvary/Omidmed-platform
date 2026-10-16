import type { RedFlagItem } from "@/lib/types";

// Safety screening items grouped by category.
//
// Warning signs ("warning") are current presentations that need medical
// assessment; one selected warning sign makes the screen non-clear and blocks
// treatment. Risk factors ("risk") are history items that raise the index of
// suspicion; they are recorded for vigilance and do not block treatment on
// their own (IFOMPT framework, Finucane et al. 2020). The database applies the
// same split (migration 032).
export const redFlags: RedFlagItem[] = [
  { id: "rf_cancer_spinal", kind: "warning", category: "Cancer", label: "History of cancer with new spinal pain", detail: "Suspect spinal metastasis until proven otherwise" },
  { id: "rf_weightloss", kind: "warning", category: "Cancer", label: "Unexplained weight loss", detail: "Significant loss without dieting" },
  { id: "rf_nightpain", kind: "warning", category: "Cancer", label: "Constant, unremitting night pain", detail: "Non-mechanical, unrelieved by position" },
  { id: "rf_cancer", kind: "risk", category: "Cancer", label: "Previous history of cancer", detail: "Record; ask about weight loss, night pain and new spinal pain" },

  { id: "rf_fracture_trauma", kind: "warning", category: "Fracture", label: "Significant recent trauma", detail: "Fall, road accident, direct blow" },
  { id: "rf_fracture_osteo", kind: "warning", category: "Fracture", label: "Osteoporosis + minor trauma", detail: "Fragility fracture risk" },
  { id: "rf_steroids", kind: "risk", category: "Fracture", label: "Prolonged corticosteroid use", detail: "Raised fracture and infection risk" },

  { id: "rf_fever", kind: "warning", category: "Infection", label: "Fever / chills", detail: "Systemic signs of infection" },
  { id: "rf_ivdu", kind: "warning", category: "Infection", label: "Recent infection or IV drug use", detail: "Risk of spinal/joint infection" },
  { id: "rf_immuno", kind: "risk", category: "Infection", label: "Immunosuppression", detail: "Higher infection susceptibility" },

  { id: "rf_ce_saddle", kind: "warning", category: "Cauda Equina", label: "Saddle anaesthesia", detail: "Numbness around perineum/inner thighs" },
  { id: "rf_ce_bladder", kind: "warning", category: "Cauda Equina", label: "Bladder / bowel dysfunction", detail: "Retention, incontinence, loss of control" },
  { id: "rf_ce_sexual", kind: "warning", category: "Cauda Equina", label: "Sexual dysfunction (new)", detail: "New loss of genital sensation" },

  { id: "rf_neuro_progressive", kind: "warning", category: "Neurological", label: "Progressive neurological deficit", detail: "Worsening weakness / numbness" },
  { id: "rf_neuro_bilateral", kind: "warning", category: "Neurological", label: "Bilateral limb symptoms", detail: "Numbness or weakness in both limbs" },
  { id: "rf_umn", kind: "warning", category: "Neurological", label: "Upper motor neuron signs", detail: "Hyperreflexia, clonus, Hoffmann/Babinski, clumsy hands, unsteady gait (possible myelopathy)" },

  { id: "rf_cad", kind: "warning", category: "Vascular", label: "Signs of cervical arterial dysfunction", detail: "Dizziness, diplopia, dysarthria, dysphagia, drop attacks, nystagmus, nausea, numbness (5 D's, 3 N's) or a new headache unlike any before" },
  { id: "rf_aaa", kind: "warning", category: "Vascular", label: "Possible abdominal aortic aneurysm", detail: "Pulsatile abdominal mass, or back/abdominal pain in an older adult with vascular risk factors" },
  { id: "rf_gca", kind: "warning", category: "Vascular", label: "Possible giant cell arteritis", detail: "New headache over 50 with scalp tenderness or jaw claudication; visual disturbance is an emergency" },

  { id: "rf_dvt_calf", kind: "warning", category: "DVT", label: "Unilateral calf pain / swelling", detail: "Warm, tender, swollen calf" },
  { id: "rf_dvt_risk", kind: "risk", category: "DVT", label: "Recent surgery / immobilisation", detail: "Raised thrombosis risk; check the calf at each visit" },

  { id: "rf_cardiac_chest", kind: "warning", category: "Cardiac", label: "Chest pain / tightness", detail: "Especially with exertion" },
  { id: "rf_cardiac_breath", kind: "warning", category: "Cardiac", label: "Shortness of breath", detail: "Unexplained dyspnoea, palpitations" },

  { id: "rf_severe_pain", kind: "warning", category: "General", label: "Severe unexplained pain", detail: "Out of proportion to findings" },
  { id: "rf_age_over50", kind: "risk", category: "General", label: "Age over 50 with a first episode", detail: "Raises suspicion of serious pathology; combine with other findings" },
];

export const warningSigns = redFlags.filter((flag) => flag.kind === "warning");
export const riskFactors = redFlags.filter((flag) => flag.kind === "risk");
export const riskFactorIdSet = new Set(riskFactors.map((flag) => flag.id));

export const redFlagCategories = Array.from(
  new Set(warningSigns.map((r) => r.category))
);

/* ── Persian clinician text ───────────────────────────────────────── */

export const redFlagCategoryFa: Record<string, string> = {
  Cancer: "بدخیمی",
  Fracture: "شکستگی",
  Infection: "عفونت",
  "Cauda Equina": "سندرم دم اسب",
  Neurological: "عصبی",
  Vascular: "عروقی",
  DVT: "ترومبوز ورید عمقی (DVT)",
  Cardiac: "قلبی",
  General: "عمومی",
};

export const redFlagFa: Record<string, { label: string; detail: string }> = {
  rf_cancer_spinal: { label: "سابقه سرطان همراه با درد جدید ستون فقرات", detail: "تا رد شدن، احتمال متاستاز ستون فقرات را در نظر بگیرید" },
  rf_cancer: { label: "سابقه قبلی سرطان", detail: "ثبت کنید؛ درباره کاهش وزن، درد شبانه و درد جدید ستون فقرات بپرسید" },
  rf_weightloss: { label: "کاهش وزن بی‌دلیل", detail: "کاهش وزن قابل توجه بدون رژیم" },
  rf_nightpain: { label: "درد شبانه مداوم و بی‌وقفه", detail: "غیرمکانیکی؛ با تغییر وضعیت کم نمی‌شود" },
  rf_fracture_trauma: { label: "ضربه قابل توجه اخیر", detail: "زمین خوردن، تصادف، ضربه مستقیم" },
  rf_fracture_osteo: { label: "پوکی استخوان + ضربه خفیف", detail: "خطر شکستگی شکنندگی" },
  rf_steroids: { label: "مصرف طولانی کورتیکواستروئید", detail: "افزایش خطر شکستگی و عفونت" },
  rf_fever: { label: "تب / لرز", detail: "علائم سیستمیک عفونت" },
  rf_ivdu: { label: "عفونت اخیر یا مصرف تزریقی مواد", detail: "خطر عفونت ستون فقرات/مفصل" },
  rf_immuno: { label: "سرکوب ایمنی", detail: "استعداد بیشتر به عفونت" },
  rf_ce_saddle: { label: "بی‌حسی زینی", detail: "بی‌حسی اطراف پرینه/داخل ران‌ها" },
  rf_ce_bladder: { label: "اختلال مثانه / روده", detail: "احتباس، بی‌اختیاری، از دست دادن کنترل" },
  rf_ce_sexual: { label: "اختلال جنسی (جدید)", detail: "کاهش جدید حس ناحیه تناسلی" },
  rf_neuro_progressive: { label: "نقص عصبی پیشرونده", detail: "ضعف / بی‌حسی رو به افزایش" },
  rf_neuro_bilateral: { label: "علائم دوطرفه اندام‌ها", detail: "بی‌حسی یا ضعف در هر دو اندام" },
  rf_umn: { label: "علائم نورون محرکه فوقانی", detail: "هایپررفلکسی، کلونوس، هافمن/بابنسکی مثبت، بی‌دقتی دست‌ها، راه رفتن ناپایدار (احتمال میلوپاتی)" },
  rf_cad: { label: "علائم اختلال شریانی گردن", detail: "سرگیجه، دوبینی، اختلال تکلم، اختلال بلع، افتادن ناگهانی، نیستاگموس، تهوع، بی‌حسی (5D و 3N) یا سردرد جدید و متفاوت با قبل" },
  rf_aaa: { label: "احتمال آنوریسم آئورت شکمی", detail: "توده ضربان‌دار شکم، یا درد کمر/شکم در فرد مسن با عوامل خطر عروقی" },
  rf_gca: { label: "احتمال آرتریت سلول غول‌آسا", detail: "سردرد جدید بعد از ۵۰ سالگی با حساسیت پوست سر یا لنگش فک؛ اختلال بینایی اورژانسی است" },
  rf_dvt_calf: { label: "درد / تورم یک‌طرفه ساق", detail: "ساق گرم، حساس و متورم" },
  rf_dvt_risk: { label: "جراحی / بی‌حرکتی اخیر", detail: "افزایش خطر ترومبوز؛ ساق را در هر جلسه بررسی کنید" },
  rf_cardiac_chest: { label: "درد / فشار قفسه سینه", detail: "به‌ویژه هنگام فعالیت" },
  rf_cardiac_breath: { label: "تنگی نفس", detail: "تنگی نفس یا تپش قلب بی‌دلیل" },
  rf_severe_pain: { label: "درد شدید بی‌دلیل", detail: "نامتناسب با یافته‌ها" },
  rf_age_over50: { label: "سن بالای ۵۰ سال با اولین دوره درد", detail: "احتمال پاتولوژی جدی را بالا می‌برد؛ همراه سایر یافته‌ها تفسیر شود" },
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
