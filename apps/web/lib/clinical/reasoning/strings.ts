import type { Locale } from "@/lib/i18n/translations";
import type { LocalizedText } from "@/lib/clinical/reasoning/knowledge";
import type { SupportLevel } from "@/lib/clinical/reasoning/rank";
import type { ExamNoteKey } from "@/lib/clinical/reasoning/findings";

/** Knowledge-base text: Persian when available, otherwise English. */
export function localized(text: LocalizedText, locale: Locale): string {
  return locale === "fa" ? text.fa : text.en;
}

type Strings = {
  title: string;
  subtitle: string;
  noModule: string;
  history: string;
  historyHint: string;
  yes: string;
  no: string;
  notAsked: string;
  irritability: string;
  irritabilityLevels: Record<"" | "low" | "moderate" | "high", string>;
  exam: string;
  examHint: string;
  positive: string;
  negative: string;
  equivocal: string;
  notTested: string;
  notes: string;
  noteLabels: Record<ExamNoteKey, string>;
  save: string;
  saving: string;
  unsaved: string;
  savedVersion: (version: number, when: string) => string;
  nothingSaved: string;
  demoMode: string;
  loadFailed: string;
  retry: string;
  failures: Record<"stale" | "unchanged" | "not_permitted" | "invalid" | "failed", string>;
  ranking: string;
  rankingHint: string;
  rankingLocked: string;
  levels: Record<SupportLevel, string>;
  why: string;
  supports: string;
  against: string;
  noReasons: string;
  limitedData: string;
  medicalReview: string;
  nextTests: string;
  informs: string;
  screening: string;
  disclaimer: string;
  askAi: string;
  askAiHint: string;
  aiSaveFirst: string;
  sensitivity: string;
  specificity: string;
  progress: (answered: number, total: number, tests: number, totalTests: number) => string;
};

const en: Strings = {
  title: "Structured history & examination",
  subtitle: "Record findings to rank provisional hypotheses — every step is shown",
  noModule:
    "No structured module exists for this region yet. Use the free-text intake, the audited AI draft and your clinical reasoning.",
  history: "History checklist",
  historyHint: "Answer only what you asked; leave the rest as “not asked”.",
  yes: "Yes",
  no: "No",
  notAsked: "Not asked",
  irritability: "Irritability (SIN)",
  irritabilityLevels: { "": "Not assessed", low: "Low", moderate: "Moderate", high: "High" },
  exam: "Examination tests",
  examHint: "Record only tests you performed. Published accuracy is shown where available.",
  positive: "Positive",
  negative: "Negative",
  equivocal: "Equivocal",
  notTested: "Not tested",
  notes: "Examination notes",
  noteLabels: {
    observation: "Observation",
    rom: "Range of motion",
    strength: "Strength",
    neuro: "Neurological screen",
    palpation: "Palpation",
    functional: "Functional tests",
    other: "Other",
  },
  save: "Save findings",
  saving: "Saving…",
  unsaved: "Unsaved changes",
  savedVersion: (version, when) => `Version ${version} saved ${when}`,
  nothingSaved: "No findings saved for this case yet",
  demoMode: "Demo mode: findings stay on this screen and are not saved.",
  loadFailed: "Saved findings could not be loaded. Nothing is shown as empty until the record loads.",
  retry: "Retry",
  failures: {
    stale: "Findings were changed elsewhere. Reload before saving so nothing is overwritten.",
    unchanged: "Nothing changed since the last saved version.",
    not_permitted: "You are not permitted to record findings for this patient.",
    invalid: "The findings could not be validated. Check notes are under 2000 characters.",
    failed: "Saving failed. Your entries are still on screen — try again.",
  },
  ranking: "Provisional hypotheses",
  rankingHint: "Ranked by relative support from the recorded findings",
  rankingLocked:
    "Hypothesis ranking is locked until the structured safety screen is complete and clear.",
  levels: {
    stronger: "Stronger support",
    some: "Some support",
    weak: "Little support",
    against: "Findings argue against",
  },
  why: "Why",
  supports: "Supports",
  against: "Argues against",
  noReasons: "No recorded finding bears on this hypothesis yet.",
  limitedData: "Very few findings recorded — the ranking mostly reflects base rates.",
  medicalReview:
    "A serious hypothesis has support from the findings. Arrange medical review before treatment:",
  nextTests: "Most informative next tests",
  informs: "Informs",
  screening: "Screening rules to apply",
  disclaimer:
    "Relative support from recorded findings only — not a probability and not a diagnosis. Confirm with your examination and clinical judgment.",
  askAi: "Ask the AI for a ranked differential",
  askAiHint: "The audited AI draft receives the saved findings and this ranking as context.",
  aiSaveFirst: "Save the findings first so the AI draft uses them.",
  sensitivity: "Sn",
  specificity: "Sp",
  progress: (answered, total, tests, totalTests) =>
    `${answered}/${total} history items · ${tests}/${totalTests} tests recorded`,
};

const fa: Strings = {
  title: "شرح حال و معاینه ساختاریافته",
  subtitle: "یافته‌ها را ثبت کنید تا فرضیه‌های موقت رتبه‌بندی شوند — همه مراحل نمایش داده می‌شود",
  noModule:
    "برای این ناحیه هنوز ماژول ساختاریافته وجود ندارد. از شرح حال متنی، پیش‌نویس هوش مصنوعی و استدلال بالینی خود استفاده کنید.",
  history: "چک‌لیست شرح حال",
  historyHint: "فقط مواردی را که پرسیده‌اید پاسخ دهید؛ بقیه «پرسیده نشده» بمانند.",
  yes: "بله",
  no: "خیر",
  notAsked: "پرسیده نشده",
  irritability: "تحریک‌پذیری (SIN)",
  irritabilityLevels: { "": "ارزیابی نشده", low: "کم", moderate: "متوسط", high: "زیاد" },
  exam: "تست‌های معاینه",
  examHint: "فقط تست‌هایی را که انجام داده‌اید ثبت کنید. دقت منتشرشده در صورت وجود نمایش داده می‌شود.",
  positive: "مثبت",
  negative: "منفی",
  equivocal: "نامشخص",
  notTested: "انجام نشده",
  notes: "یادداشت‌های معاینه",
  noteLabels: {
    observation: "مشاهده",
    rom: "دامنه حرکتی",
    strength: "قدرت",
    neuro: "غربالگری عصبی",
    palpation: "لمس",
    functional: "تست‌های عملکردی",
    other: "سایر",
  },
  save: "ذخیره یافته‌ها",
  saving: "در حال ذخیره…",
  unsaved: "تغییرات ذخیره نشده",
  savedVersion: (version, when) => `نسخه ${version} ذخیره شد — ${when}`,
  nothingSaved: "هنوز یافته‌ای برای این کیس ذخیره نشده",
  demoMode: "حالت نمایشی: یافته‌ها فقط روی همین صفحه می‌مانند و ذخیره نمی‌شوند.",
  loadFailed: "یافته‌های ذخیره‌شده بارگذاری نشد. تا بارگذاری پرونده چیزی خالی نمایش داده نمی‌شود.",
  retry: "تلاش دوباره",
  failures: {
    stale: "یافته‌ها در جای دیگری تغییر کرده‌اند. قبل از ذخیره صفحه را تازه کنید تا چیزی بازنویسی نشود.",
    unchanged: "از آخرین نسخه ذخیره‌شده تغییری ایجاد نشده است.",
    not_permitted: "شما اجازه ثبت یافته برای این بیمار را ندارید.",
    invalid: "یافته‌ها معتبر نبودند. یادداشت‌ها باید کمتر از ۲۰۰۰ نویسه باشند.",
    failed: "ذخیره انجام نشد. ورودی‌های شما روی صفحه باقی است — دوباره تلاش کنید.",
  },
  ranking: "فرضیه‌های موقت",
  rankingHint: "رتبه‌بندی بر اساس میزان پشتیبانی نسبی یافته‌های ثبت‌شده",
  rankingLocked: "رتبه‌بندی فرضیه‌ها تا کامل و پاک بودن غربالگری ایمنی ساختاریافته قفل است.",
  levels: {
    stronger: "پشتیبانی قوی‌تر",
    some: "پشتیبانی نسبی",
    weak: "پشتیبانی کم",
    against: "یافته‌ها خلاف آن است",
  },
  why: "چرا",
  supports: "پشتیبانی می‌کند",
  against: "خلاف آن",
  noReasons: "هنوز یافته ثبت‌شده‌ای به این فرضیه مربوط نیست.",
  limitedData: "یافته‌های ثبت‌شده بسیار کم است — رتبه‌بندی عمدتاً بر اساس شیوع پایه است.",
  medicalReview: "یک فرضیه جدی از یافته‌ها پشتیبانی دارد. پیش از درمان ارزیابی پزشکی ترتیب دهید:",
  nextTests: "آموزنده‌ترین تست‌های بعدی",
  informs: "برای",
  screening: "قوانین غربالگری که باید اجرا شود",
  disclaimer:
    "فقط پشتیبانی نسبی از یافته‌های ثبت‌شده — نه احتمال است و نه تشخیص. با معاینه و قضاوت بالینی خود تأیید کنید.",
  askAi: "درخواست تشخیص افتراقی رتبه‌بندی‌شده از هوش مصنوعی",
  askAiHint: "پیش‌نویس هوش مصنوعی (ثبت‌شده و قابل ممیزی) یافته‌های ذخیره‌شده و این رتبه‌بندی را دریافت می‌کند.",
  aiSaveFirst: "ابتدا یافته‌ها را ذخیره کنید تا پیش‌نویس هوش مصنوعی از آن‌ها استفاده کند.",
  sensitivity: "حساسیت",
  specificity: "ویژگی",
  progress: (answered, total, tests, totalTests) =>
    `${answered} از ${total} مورد شرح حال · ${tests} از ${totalTests} تست ثبت شده`,
};

const ar: Strings = {
  ...en,
  title: "التاريخ المرضي والفحص المنظم",
  subtitle: "سجّل النتائج لترتيب الفرضيات المؤقتة — كل خطوة معروضة",
  noModule:
    "لا توجد وحدة منظمة لهذه المنطقة بعد. استخدم الاستمارة النصية ومسودة الذكاء الاصطناعي واستدلالك السريري.",
  history: "قائمة التاريخ المرضي",
  historyHint: "أجب فقط عمّا سألت عنه؛ اترك الباقي «لم يُسأل».",
  yes: "نعم",
  no: "لا",
  notAsked: "لم يُسأل",
  irritability: "القابلية للتهيج (SIN)",
  irritabilityLevels: { "": "لم يُقيَّم", low: "منخفضة", moderate: "متوسطة", high: "عالية" },
  exam: "اختبارات الفحص",
  examHint: "سجّل فقط الاختبارات التي أجريتها. تظهر الدقة المنشورة عند توفرها.",
  positive: "إيجابي",
  negative: "سلبي",
  equivocal: "غير حاسم",
  notTested: "لم يُجرَ",
  notes: "ملاحظات الفحص",
  noteLabels: {
    observation: "الملاحظة",
    rom: "مدى الحركة",
    strength: "القوة",
    neuro: "الفحص العصبي",
    palpation: "الجس",
    functional: "الاختبارات الوظيفية",
    other: "أخرى",
  },
  save: "حفظ النتائج",
  saving: "جارٍ الحفظ…",
  unsaved: "تغييرات غير محفوظة",
  savedVersion: (version, when) => `حُفظت النسخة ${version} — ${when}`,
  nothingSaved: "لم تُحفظ نتائج لهذه الحالة بعد",
  demoMode: "وضع تجريبي: تبقى النتائج على هذه الشاشة ولا تُحفظ.",
  loadFailed: "تعذّر تحميل النتائج المحفوظة. لا يُعرض شيء فارغاً حتى يُحمَّل السجل.",
  retry: "إعادة المحاولة",
  ranking: "الفرضيات المؤقتة",
  rankingHint: "مرتبة حسب الدعم النسبي من النتائج المسجلة",
  rankingLocked: "ترتيب الفرضيات مقفل حتى يكتمل فحص السلامة المنظم ويكون سليماً.",
  levels: {
    stronger: "دعم أقوى",
    some: "دعم جزئي",
    weak: "دعم ضعيف",
    against: "النتائج تعارضها",
  },
  why: "لماذا",
  supports: "يدعم",
  against: "يعارض",
  medicalReview: "فرضية خطيرة مدعومة بالنتائج. رتّب مراجعة طبية قبل العلاج:",
  nextTests: "أكثر الاختبارات التالية إفادة",
  informs: "يفيد",
  screening: "قواعد الفحص الواجب تطبيقها",
  disclaimer:
    "دعم نسبي من النتائج المسجلة فقط — ليس احتمالاً وليس تشخيصاً. أكّد بالفحص وحكمك السريري.",
  askAi: "اطلب من الذكاء الاصطناعي تشخيصاً تفريقياً مرتباً",
  askAiHint: "تتلقى مسودة الذكاء الاصطناعي الخاضعة للتدقيق النتائج المحفوظة وهذا الترتيب كسياق.",
  aiSaveFirst: "احفظ النتائج أولاً لتستخدمها مسودة الذكاء الاصطناعي.",
  progress: (answered, total, tests, totalTests) =>
    `${answered}/${total} من بنود التاريخ · ${tests}/${totalTests} اختبارات مسجلة`,
};

export const reasoningStrings: Record<Locale, Strings> = { en, fa, ar };
