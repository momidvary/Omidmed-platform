import type { PageText } from "@/lib/i18n/text";

const en = {
  blocked:
    "Patient advice is blocked until this case has a completed, clear structured safety screen and any concerns have been resolved.",
  failed: "The handout could not be generated safely.",
  title: "Patient Education Generator",
  intro: "Turn the clinical picture into a plain-language handout the patient can take home.",
  caseAria: "Case",
  selectCase: "Select a case…",
  unnamed: "Unnamed",
  noCaseTitle: "No case selected",
  noCaseBody: "Pick a case (or create one) to generate a patient-friendly explanation.",
  newCase: "New Assessment",
  gatePassed: "Safety gate passed for this case",
  gateLocked: "Patient handout generation locked",
  gatePassedBody:
    "A completed clear screen permits drafting, but the clinician must still review every statement before sharing it.",
  gateLockedBody: (disposition: string) =>
    `Current safety disposition: ${disposition}. Do not generate reassurance, exercises or home advice until escalation is resolved and documented.`,
  disposition: {
    clear: "clear",
    "medical-review": "medical review",
    urgent: "urgent",
    emergency: "emergency",
    "not-screened": "not screened",
  } as Record<string, string>,
  handoutLanguage: "Handout language",
  copied: "Copied!",
  copy: "Copy handout",
  writing: "Writing…",
  regenerate: "Regenerate",
  generate: "Generate handout",
  loading: "Writing patient-friendly advice…",
};

export const educationText: PageText<typeof en> = {
  en,
  fa: {
    blocked:
      "تا وقتی غربالگری ایمنی ساختاریافته این مورد کامل و بدون مشکل نباشد و نگرانی‌ها رفع نشده باشند، توصیه به بیمار مسدود است.",
    failed: "بروشور به‌صورت ایمن تولید نشد.",
    title: "تولید آموزش بیمار",
    intro: "تصویر بالینی را به یک بروشور ساده و قابل‌فهم برای بیمار تبدیل کنید.",
    caseAria: "مورد",
    selectCase: "انتخاب مورد…",
    unnamed: "بدون نام",
    noCaseTitle: "موردی انتخاب نشده است",
    noCaseBody: "یک مورد انتخاب کنید (یا بسازید) تا توضیحی قابل‌فهم برای بیمار تولید شود.",
    newCase: "ارزیابی جدید",
    gatePassed: "دروازه ایمنی برای این مورد تأیید شده است",
    gateLocked: "تولید بروشور بیمار قفل است",
    gatePassedBody:
      "غربالگری کامل و بدون مشکل اجازه پیش‌نویس را می‌دهد، اما درمانگر باید پیش از ارائه، همه جملات را بررسی کند.",
    gateLockedBody: (disposition) =>
      `وضعیت فعلی غربالگری ایمنی: ${disposition}. تا وقتی ارجاع انجام و ثبت نشده، اطمینان‌بخشی، تمرین یا توصیه خانگی تولید نکنید.`,
    disposition: {
      clear: "بدون مشکل",
      "medical-review": "نیازمند بررسی پزشکی",
      urgent: "فوری",
      emergency: "اورژانسی",
      "not-screened": "غربالگری‌نشده",
    },
    handoutLanguage: "زبان بروشور",
    copied: "کپی شد!",
    copy: "کپی بروشور",
    writing: "در حال نوشتن…",
    regenerate: "تولید دوباره",
    generate: "تولید بروشور",
    loading: "در حال نوشتن توصیه‌های قابل‌فهم برای بیمار…",
  },
};

/* Headings inside the handout follow the handout language, not the UI. */
export const handoutHeadings = {
  en: {
    homeAdvice: (name: string) => `Home advice for ${name}`,
    problem: "What is the problem?",
    avoid: "What to avoid for now",
    exercises: "Your exercises",
    contact: "When to contact us or a doctor",
    tips: "Simple home advice",
  },
  fa: {
    homeAdvice: (name: string) => `توصیه‌های خانگی برای ${name}`,
    problem: "مشکل چیست؟",
    avoid: "فعلاً از چه چیزهایی پرهیز کنید",
    exercises: "تمرین‌های شما",
    contact: "چه زمانی با ما یا پزشک تماس بگیرید",
    tips: "توصیه‌های ساده خانگی",
  },
};
