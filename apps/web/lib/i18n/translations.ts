// Lightweight i18n for the clinician app chrome and key pages.
// The patient portal remains Persian-native (its audience is Iranian
// patients); full clinical-content translation is progressive.

export type Locale = "en" | "fa" | "ar";

export const locales: { id: Locale; label: string; dir: "ltr" | "rtl" }[] = [
  { id: "en", label: "English", dir: "ltr" },
  { id: "fa", label: "فارسی", dir: "rtl" },
  { id: "ar", label: "العربية", dir: "rtl" },
];

export const localeDir = (l: Locale): "ltr" | "rtl" =>
  l === "en" ? "ltr" : "rtl";

type Dict = Record<string, string>;

const en: Dict = {
  // nav
  "nav.dashboard": "Dashboard",
  "nav.dashboard.desc": "Overview & quick tools",
  "nav.patients": "Patients",
  "nav.patients.desc": "Registry & active care",
  "nav.clinical-records": "Clinical Records",
  "nav.clinical-records.desc": "Signed notes & outcomes",
  "nav.alerts": "Clinical Alerts",
  "nav.alerts.desc": "Urgent patient safety queue",
  "nav.tickets": "Tickets",
  "nav.tickets.desc": "Patient messages & response queue",
  "nav.new-case": "New Case",
  "nav.new-case.desc": "Patient intake",
  "nav.case-analysis": "Case Analysis",
  "nav.case-analysis.desc": "Clinical reasoning",
  "nav.treatment-planner": "Treatment Planner",
  "nav.treatment-planner.desc": "Build a rehab plan",
  "nav.exercise-library": "Exercise Library",
  "nav.exercise-library.desc": "Searchable exercises",
  "nav.ai-assistant": "AI Assistant",
  "nav.ai-assistant.desc": "Ask clinical questions",
  "nav.posture-analysis": "Posture Analysis",
  "nav.posture-analysis.desc": "AI photo screening",
  "nav.red-flags": "Red Flag Checker",
  "nav.red-flags.desc": "Safety screening",
  "nav.patient-education": "Patient Education",
  "nav.patient-education.desc": "Plain-language handouts",
  "nav.settings": "Settings",
  "nav.settings.desc": "Preferences",
  "nav.patient-portal": "Patient Portal",
  // shell
  "shell.evidence": "Evidence-informed",
  "shell.disclaimer":
    "Decision-support only. Always confirm with hands-on clinical examination and professional judgment.",
  "shell.brand.sub": "Clinical Assistant",
  // posture page
  "posture.title": "Posture Analysis",
  "posture.description":
    "Upload patient photos from three views. The AI screens for common postural deviations — findings are observations to verify, never a diagnosis.",
  "posture.view.front": "Front view",
  "posture.view.side": "Side view",
  "posture.view.back": "Back view",
  "posture.upload": "Upload photo",
  "posture.change": "Change",
  "posture.remove": "Remove",
  "posture.hint": "JPG or PNG, standing, full body, neutral stance",
  "posture.analyze": "Analyze posture",
  "posture.analyzing": "Analyzing posture…",
  "posture.needPhoto": "Upload at least one photo to analyze.",
  "posture.results": "Findings",
  "posture.summary": "Summary",
  "posture.recommendations": "Suggested focus areas",
  "posture.confidence": "screening confidence",
  "posture.demo":
    "Demo mode: findings below are sample output from the mock engine. Connect a vision AI provider in lib/ai/engine.ts for real photo analysis.",
  "posture.privacy":
    "Photos stay in this browser only — nothing is uploaded to a server in this version.",
  // settings
  "settings.language": "Language",
  "settings.language.hint": "Applies to the clinician interface.",
  // storage status
  "status.connected": "Connected",
  "status.saving": "Saving…",
  "status.saved": "Saved",
  "status.offline": "Offline",
  "status.save_failed": "Save failed",
  "auth.signout": "Sign out",
};

const fa: Dict = {
  "nav.dashboard": "داشبورد",
  "nav.dashboard.desc": "نمای کلی و ابزارهای سریع",
  "nav.patients": "بیماران",
  "nav.patients.desc": "فهرست و دوره درمان فعال",
  "nav.clinical-records": "پرونده بالینی",
  "nav.clinical-records.desc": "یادداشت امضاشده و پیامدها",
  "nav.alerts": "هشدارهای بالینی",
  "nav.alerts.desc": "صف فوری ایمنی بیماران",
  "nav.tickets": "صندوق تیکت‌ها",
  "nav.tickets.desc": "پیام‌های بیمار و صف پاسخ‌گویی",
  "nav.new-case": "پرونده جدید",
  "nav.new-case.desc": "پذیرش بیمار",
  "nav.case-analysis": "تحلیل پرونده",
  "nav.case-analysis.desc": "استدلال بالینی",
  "nav.treatment-planner": "برنامه‌ریز درمان",
  "nav.treatment-planner.desc": "ساخت برنامه توان‌بخشی",
  "nav.exercise-library": "کتابخانه تمرین",
  "nav.exercise-library.desc": "تمرین‌های قابل جستجو",
  "nav.ai-assistant": "دستیار هوشمند",
  "nav.ai-assistant.desc": "پرسش‌های بالینی",
  "nav.posture-analysis": "آنالیز پاسچر",
  "nav.posture-analysis.desc": "غربالگری هوشمند عکس",
  "nav.red-flags": "بررسی پرچم قرمز",
  "nav.red-flags.desc": "غربالگری ایمنی",
  "nav.patient-education": "آموزش بیمار",
  "nav.patient-education.desc": "بروشور به زبان ساده",
  "nav.settings": "تنظیمات",
  "nav.settings.desc": "ترجیحات",
  "nav.patient-portal": "پرتال بیمار",
  "shell.evidence": "مبتنی بر شواهد",
  "shell.disclaimer":
    "فقط پشتیبان تصمیم‌گیری. همیشه با معاینه بالینی و قضاوت حرفه‌ای تأیید کنید.",
  "shell.brand.sub": "دستیار بالینی",
  "posture.title": "آنالیز پاسچر",
  "posture.description":
    "عکس بیمار را از سه نما آپلود کنید. هوش مصنوعی انحراف‌های شایع پاسچر را غربال می‌کند — یافته‌ها مشاهده‌اند و باید بالینی تأیید شوند؛ تشخیص نیستند.",
  "posture.view.front": "نمای روبرو",
  "posture.view.side": "نمای بغل",
  "posture.view.back": "نمای پشت",
  "posture.upload": "آپلود عکس",
  "posture.change": "تغییر",
  "posture.remove": "حذف",
  "posture.hint": "JPG یا PNG، ایستاده، تمام‌قد، حالت طبیعی",
  "posture.analyze": "آنالیز پاسچر",
  "posture.analyzing": "در حال آنالیز پاسچر…",
  "posture.needPhoto": "برای آنالیز حداقل یک عکس آپلود کنید.",
  "posture.results": "یافته‌ها",
  "posture.summary": "جمع‌بندی",
  "posture.recommendations": "حوزه‌های پیشنهادی تمرکز",
  "posture.confidence": "اطمینان غربالگری",
  "posture.demo":
    "حالت دمو: یافته‌های زیر خروجی نمونه از موتور آزمایشی است. برای آنالیز واقعی عکس، ارائه‌دهنده هوش مصنوعی بینایی را در lib/ai/engine.ts متصل کنید.",
  "posture.privacy":
    "عکس‌ها فقط در همین مرورگر می‌مانند — در این نسخه چیزی به سرور ارسال نمی‌شود.",
  "settings.language": "زبان",
  "settings.language.hint": "روی رابط فیزیوتراپیست اعمال می‌شود.",
  "status.connected": "متصل",
  "status.saving": "در حال ذخیره…",
  "status.saved": "ذخیره شد",
  "status.offline": "آفلاین",
  "status.save_failed": "ذخیره ناموفق",
  "auth.signout": "خروج",
};

const ar: Dict = {
  "nav.dashboard": "لوحة التحكم",
  "nav.dashboard.desc": "نظرة عامة وأدوات سريعة",
  "nav.patients": "المرضى",
  "nav.patients.desc": "السجل والرعاية النشطة",
  "nav.clinical-records": "السجل السريري",
  "nav.clinical-records.desc": "ملاحظات موقعة ونتائج",
  "nav.alerts": "التنبيهات السريرية",
  "nav.alerts.desc": "قائمة سلامة المرضى العاجلة",
  "nav.tickets": "صندوق التذاكر",
  "nav.tickets.desc": "رسائل المرضى وقائمة الردود",
  "nav.new-case": "حالة جديدة",
  "nav.new-case.desc": "استقبال المريض",
  "nav.case-analysis": "تحليل الحالة",
  "nav.case-analysis.desc": "الاستدلال السريري",
  "nav.treatment-planner": "مخطط العلاج",
  "nav.treatment-planner.desc": "بناء خطة التأهيل",
  "nav.exercise-library": "مكتبة التمارين",
  "nav.exercise-library.desc": "تمارين قابلة للبحث",
  "nav.ai-assistant": "المساعد الذكي",
  "nav.ai-assistant.desc": "أسئلة سريرية",
  "nav.posture-analysis": "تحليل القوام",
  "nav.posture-analysis.desc": "فحص ذكي بالصور",
  "nav.red-flags": "فاحص العلامات الحمراء",
  "nav.red-flags.desc": "فحص السلامة",
  "nav.patient-education": "تثقيف المريض",
  "nav.patient-education.desc": "نشرات بلغة بسيطة",
  "nav.settings": "الإعدادات",
  "nav.settings.desc": "التفضيلات",
  "nav.patient-portal": "بوابة المريض",
  "shell.evidence": "قائم على الأدلة",
  "shell.disclaimer":
    "دعم للقرار فقط. أكِّد دائمًا بالفحص السريري والحكم المهني.",
  "shell.brand.sub": "المساعد السريري",
  "posture.title": "تحليل القوام",
  "posture.description":
    "حمِّل صور المريض من ثلاث جهات. يفحص الذكاء الاصطناعي انحرافات القوام الشائعة — النتائج ملاحظات يجب تأكيدها سريريًا، وليست تشخيصًا.",
  "posture.view.front": "منظر أمامي",
  "posture.view.side": "منظر جانبي",
  "posture.view.back": "منظر خلفي",
  "posture.upload": "تحميل صورة",
  "posture.change": "تغيير",
  "posture.remove": "إزالة",
  "posture.hint": "JPG أو PNG، وقوف، جسم كامل، وضعية طبيعية",
  "posture.analyze": "تحليل القوام",
  "posture.analyzing": "جارٍ تحليل القوام…",
  "posture.needPhoto": "حمِّل صورة واحدة على الأقل للتحليل.",
  "posture.results": "النتائج",
  "posture.summary": "الخلاصة",
  "posture.recommendations": "مجالات التركيز المقترحة",
  "posture.confidence": "ثقة الفحص",
  "posture.demo":
    "وضع تجريبي: النتائج أدناه مخرجات نموذجية من المحرك التجريبي. لتحليل حقيقي للصور، اربط مزوّد رؤية اصطناعية في lib/ai/engine.ts.",
  "posture.privacy":
    "تبقى الصور في هذا المتصفح فقط — لا يُرسل شيء إلى الخادم في هذه النسخة.",
  "settings.language": "اللغة",
  "settings.language.hint": "تنطبق على واجهة أخصائي العلاج الطبيعي.",
  "status.connected": "متصل",
  "status.saving": "جارٍ الحفظ…",
  "status.saved": "تم الحفظ",
  "status.offline": "غير متصل",
  "status.save_failed": "فشل الحفظ",
  "auth.signout": "تسجيل الخروج",
};

const dictionaries: Record<Locale, Dict> = { en, fa, ar };

export function translate(locale: Locale, key: string): string {
  return dictionaries[locale][key] ?? en[key] ?? key;
}
