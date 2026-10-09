import type { PageText } from "@/lib/i18n/text";

type Copy = { title: string; detail: string };

const en = {
  copy: {
    clear: {
      title: "Screen completed with no concerns selected",
      detail:
        "This does not rule out serious pathology. Continue the clinical examination and repeat screening if the presentation changes.",
    },
    "medical-review": {
      title: "Medical review is required before treatment planning",
      detail:
        "Do not interpret this checklist as a diagnosis. Document the finding and follow the appropriate local referral pathway.",
    },
    urgent: {
      title: "Urgent clinical escalation is required",
      detail:
        "Pause treatment advice and arrange prompt medical assessment using the applicable local pathway. Do not delay escalation to finish this checklist.",
    },
    emergency: {
      title: "Possible emergency — arrange immediate assessment",
      detail:
        "Stop treatment activity and follow the local emergency pathway now. Do not leave the patient waiting on an app or routine message.",
    },
  } as Record<"clear" | "medical-review" | "urgent" | "emergency", Copy>,
  dispositions: {
    "not-screened": "not screened",
    clear: "clear",
    "medical-review": "medical review",
    urgent: "urgent",
    emergency: "emergency",
  } as Record<string, string>,
  discardConfirm: "Discard this unsaved safety-screen draft? Selected findings and notes will be lost.",
  actionRequired: "Document the referral or escalation action before saving a concern.",
  notSaved:
    "The safety screen was not saved. The case has not been cleared; check your connection and access, then retry.",
  title: "Red Flag Checker",
  intro: "Screen for signs of serious pathology. Select every item that applies to the patient in front of you.",
  clearDraft: "Clear draft",
  loadError: "Patient cases could not be loaded securely. This is a connection or access error, not an empty case list.",
  retryCases: "Retry case list",
  patientCase: "Patient case",
  loadingCases: "Loading cases…",
  casesFailed: "Cases could not be loaded",
  noCases: "No accessible cases",
  selectCase: "Select a case",
  storedState: "Current stored safety state:",
  selectFirst: "Select the exact patient case before reviewing the checklist. No result is stored without an explicit case.",
  completed: (when: string) => `Completed ${when}`,
  notCompleted: "Safety screen not completed",
  concernsSelected: (count: number, title: string) =>
    `${count} concern${count > 1 ? "s are" : " is"} currently selected. ${title}. Completion is not permission to delay the indicated referral.`,
  unknownItems:
    "Unselected items are currently unknown, not confirmed absent. Review every item, then complete the attestation below.",
  notes: "Clinical notes (optional)",
  notesPlaceholder: "Relevant context from this assessment",
  action: "Referral / escalation action",
  actionPlaceholderRequired: "Required: document the action taken now",
  actionPlaceholderOptional: "Not required when the completed screen is clear",
  actionMissing: "A concern cannot be saved without a documented action.",
  attest:
    "I actively reviewed every item with the patient. Unselected items are absent based on the current assessment, and I understand that this checklist does not rule out serious pathology.",
  saving: "Saving…",
  save: "Complete and save safety screen",
  stored: "This result is stored in the case history. Use Clear draft to begin a new assessment.",
};

export const redFlagsText: PageText<typeof en> = {
  en,
  fa: {
    copy: {
      clear: {
        title: "غربالگری بدون هیچ نگرانی انتخاب‌شده کامل شد",
        detail:
          "این به معنای رد پاتولوژی جدی نیست. معاینه بالینی را ادامه دهید و اگر تظاهر بیمار تغییر کرد، غربالگری را تکرار کنید.",
      },
      "medical-review": {
        title: "پیش از برنامه‌ریزی درمان، بررسی پزشکی لازم است",
        detail: "این چک‌لیست را تشخیص تلقی نکنید. یافته را ثبت و مسیر ارجاع محلی مناسب را دنبال کنید.",
      },
      urgent: {
        title: "ارجاع فوری بالینی لازم است",
        detail:
          "توصیه درمانی را متوقف کنید و از مسیر محلی، ارزیابی پزشکی سریع ترتیب دهید. ارجاع را به خاطر تکمیل این چک‌لیست به تأخیر نیندازید.",
      },
      emergency: {
        title: "احتمال اورژانس — ارزیابی فوری ترتیب دهید",
        detail:
          "فعالیت درمانی را متوقف کنید و همین حالا مسیر اورژانس محلی را دنبال کنید. بیمار را منتظر برنامه یا پیام عادی نگذارید.",
      },
    },
    dispositions: {
      "not-screened": "غربالگری نشده",
      clear: "پاک",
      "medical-review": "نیازمند بررسی پزشکی",
      urgent: "فوری",
      emergency: "اورژانسی",
    },
    discardConfirm: "پیش‌نویس ذخیره‌نشده غربالگری حذف شود؟ موارد انتخاب‌شده و یادداشت‌ها از بین می‌روند.",
    actionRequired: "پیش از ذخیره هر نگرانی، اقدام ارجاع یا اسکالیشن را ثبت کنید.",
    notSaved: "غربالگری ایمنی ذخیره نشد و کیس پاک‌شده تلقی نمی‌شود. اتصال و دسترسی را بررسی و دوباره تلاش کنید.",
    title: "بررسی پرچم قرمز",
    intro: "نشانه‌های پاتولوژی جدی را غربال کنید. هر موردی را که برای بیمار حاضر صدق می‌کند انتخاب کنید.",
    clearDraft: "پاک کردن پیش‌نویس",
    loadError: "پرونده‌های بیماران به‌طور امن بارگذاری نشد. این خطای اتصال یا دسترسی است، نه خالی بودن فهرست.",
    retryCases: "بارگذاری دوباره پرونده‌ها",
    patientCase: "پرونده بیمار",
    loadingCases: "در حال بارگذاری پرونده‌ها…",
    casesFailed: "پرونده‌ها بارگذاری نشدند",
    noCases: "پرونده قابل دسترسی وجود ندارد",
    selectCase: "انتخاب پرونده",
    storedState: "وضعیت ایمنی ذخیره‌شده فعلی:",
    selectFirst: "پیش از بررسی چک‌لیست، پرونده دقیق بیمار را انتخاب کنید. هیچ نتیجه‌ای بدون پرونده مشخص ذخیره نمی‌شود.",
    completed: (when) => `تکمیل‌شده در ${when}`,
    notCompleted: "غربالگری ایمنی کامل نشده است",
    concernsSelected: (count, title) =>
      `${count} نگرانی انتخاب شده است. ${title}. تکمیل غربالگری مجوز تأخیر در ارجاع لازم نیست.`,
    unknownItems:
      "موارد انتخاب‌نشده فعلاً نامشخص‌اند، نه قطعاً منفی. همه موارد را بررسی و سپس تأییدیه پایین را کامل کنید.",
    notes: "یادداشت بالینی (اختیاری)",
    notesPlaceholder: "زمینه مرتبط از این ارزیابی",
    action: "اقدام ارجاع / اسکالیشن",
    actionPlaceholderRequired: "الزامی: اقدام انجام‌شده را همین حالا ثبت کنید",
    actionPlaceholderOptional: "وقتی غربالگری پاک است لازم نیست",
    actionMissing: "هیچ نگرانی بدون ثبت اقدام قابل ذخیره نیست.",
    attest:
      "همه موارد را فعالانه با بیمار بررسی کردم. موارد انتخاب‌نشده بر اساس ارزیابی فعلی وجود ندارند و می‌دانم این چک‌لیست پاتولوژی جدی را رد نمی‌کند.",
    saving: "در حال ذخیره…",
    save: "تکمیل و ذخیره غربالگری ایمنی",
    stored: "این نتیجه در تاریخچه کیس ذخیره شد. برای شروع ارزیابی جدید «پاک کردن پیش‌نویس» را بزنید.",
  },
};
