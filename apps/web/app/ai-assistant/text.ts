import type { PageText } from "@/lib/i18n/text";

const en = {
  lockedCase:
    "Case-specific clinical suggestions are locked because this case does not have a completed, clear safety screen. Complete or resolve the structured safety pathway first; do not use this chat to bypass escalation.",
  needCase:
    "Select a safety-cleared case before requesting a real clinical draft. The server does not accept free-floating clinical prompts without a case record.",
  safetyBlocked:
    "The deterministic safety gate blocked AI generation. Review the structured red-flag pathway and arrange the indicated escalation; do not use a model response to override it.",
  unavailable:
    "The audited AI draft service is unavailable or refused this request. No fallback clinical answer was generated; continue with independent clinical reasoning.",
  invalid: "The AI service returned an invalid draft. It was discarded and must not be used.",
  failed: "The AI request failed. No clinical fallback was substituted; verify the case independently.",
  title: "AI Clinical Assistant",
  introAi:
    "Audited, structured draft assistant. A safety-cleared case and explicit clinician review are required.",
  introTemplate:
    "Template assistant sandbox. Conversations and pending replies are isolated to the selected case.",
  warnAi:
    "AI drafts are generated server-side and logged, but no model output is clinical clearance. Review the original record, verify every unsupported claim and explicitly accept, edit or reject the draft.",
  warnTemplate:
    "No validated clinical AI model or evidence retrieval service is connected. Treat every response as fixed demo content; do not copy it into a care plan without independent clinical review.",
  emptyTitle: "Ask a clinical question",
  emptyBody: "Try one of the suggested prompts, or type your own question below.",
  copyAnswer: "Copy answer",
  question: "Clinical question",
  placeholder: "Ask about tests, plans, exercises, progression…",
  send: "Send",
  contextTitle: "Case Context",
  contextSubtitle: "The assistant considers this case",
  caseAria: "Case context",
  noContext: "No case context",
  unnamed: "Unnamed",
  pain: (value: number) => `Pain ${value}/10`,
  selectCaseHint: "Select a case so answers can reference its details.",
  editInvalid: "The edited answer is empty or exceeds the safe limit.",
  reviewFailed: "The review decision was not saved. The draft remains unapproved.",
  reviewStatus: {
    accepted: "Clinician accepted",
    edited: "Clinician edited",
    rejected: "Clinician rejected",
  } as Record<string, string>,
  unreviewed: "Unreviewed AI draft",
  copyDraft: "Copy draft answer",
  medicalReview:
    "The model marked this draft for medical review. Do not progress treatment from this output.",
  abstained: (reason: string | null) => `Model abstained: ${reason ?? "insufficient context"}`,
  editLabel: "Edit the answer after checking the original record",
  hypotheses: "Non-definitive hypotheses",
  supporting: "Supporting context",
  against: "Against / missing",
  priorities: "Assessment priorities",
  treatment: "Treatment considerations",
  stopRules: "Contraindications / stop rules",
  missing: "Missing information",
  verify: "Must verify",
  saveEdited: "Save edited review",
  cancel: "Cancel",
  accept: "Mark reviewed & accept",
  edit: "Edit before accepting",
  reject: "Reject draft",
};

export const aiAssistantText: PageText<typeof en> = {
  en,
  fa: {
    lockedCase:
      "پیشنهادهای بالینی اختصاصی این مورد قفل است، چون غربالگری ایمنی کامل و بدون مشکل ندارد. ابتدا مسیر ایمنی ساختاریافته را کامل یا حل کنید؛ از این گفتگو برای دور زدن ارجاع استفاده نکنید.",
    needCase:
      "پیش از درخواست پیش‌نویس بالینی واقعی، یک مورد با ایمنی تأییدشده انتخاب کنید. سرور درخواست بالینی بدون پرونده مورد را نمی‌پذیرد.",
    safetyBlocked:
      "دروازه ایمنی قطعی، تولید هوش مصنوعی را مسدود کرد. مسیر پرچم قرمز ساختاریافته را بررسی و ارجاع لازم را انجام دهید؛ از پاسخ مدل برای نادیده گرفتن آن استفاده نکنید.",
    unavailable:
      "سرویس پیش‌نویس ممیزی‌شده هوش مصنوعی در دسترس نیست یا این درخواست را رد کرد. هیچ پاسخ بالینی جایگزینی تولید نشد؛ استدلال بالینی مستقل را ادامه دهید.",
    invalid: "سرویس هوش مصنوعی پیش‌نویس نامعتبر برگرداند. کنار گذاشته شد و نباید استفاده شود.",
    failed: "درخواست هوش مصنوعی ناموفق بود. هیچ جایگزین بالینی ارائه نشد؛ مورد را مستقلاً بررسی کنید.",
    title: "دستیار بالینی هوش مصنوعی",
    introAi:
      "دستیار پیش‌نویس ساختاریافته و ممیزی‌شده. مورد با ایمنی تأییدشده و بررسی صریح درمانگر لازم است.",
    introTemplate:
      "محیط آزمایشی دستیار الگو. گفتگوها و پاسخ‌های در انتظار به مورد انتخاب‌شده محدودند.",
    warnAi:
      "پیش‌نویس‌های هوش مصنوعی در سرور تولید و ثبت می‌شوند، اما هیچ خروجی مدلی مجوز بالینی نیست. پرونده اصلی را بررسی کنید، هر ادعای بدون پشتوانه را تأیید کنید و پیش‌نویس را صریحاً بپذیرید، ویرایش یا رد کنید.",
    warnTemplate:
      "هیچ مدل هوش مصنوعی بالینی معتبر یا سرویس بازیابی شواهد متصل نیست. هر پاسخ را محتوای نمایشی ثابت بدانید؛ بدون بررسی بالینی مستقل آن را وارد برنامه درمان نکنید.",
    emptyTitle: "یک سؤال بالینی بپرسید",
    emptyBody: "یکی از پیشنهادها را امتحان کنید یا سؤال خود را پایین بنویسید.",
    copyAnswer: "کپی پاسخ",
    question: "سؤال بالینی",
    placeholder: "درباره تست‌ها، برنامه، تمرین‌ها یا پیشرفت بپرسید…",
    send: "ارسال",
    contextTitle: "زمینه مورد",
    contextSubtitle: "دستیار این مورد را در نظر می‌گیرد",
    caseAria: "زمینه مورد",
    noContext: "بدون زمینه مورد",
    unnamed: "بدون نام",
    pain: (value) => `درد ${value.toLocaleString("fa-IR")} از ۱۰`,
    selectCaseHint: "یک مورد انتخاب کنید تا پاسخ‌ها به جزئیات آن اشاره کنند.",
    editInvalid: "پاسخ ویرایش‌شده خالی است یا از حد مجاز بیشتر است.",
    reviewFailed: "تصمیم بررسی ذخیره نشد. پیش‌نویس همچنان تأییدنشده است.",
    reviewStatus: {
      accepted: "پذیرفته‌شده توسط درمانگر",
      edited: "ویرایش‌شده توسط درمانگر",
      rejected: "ردشده توسط درمانگر",
    },
    unreviewed: "پیش‌نویس بررسی‌نشده هوش مصنوعی",
    copyDraft: "کپی پاسخ پیش‌نویس",
    medicalReview:
      "مدل این پیش‌نویس را برای بررسی پزشکی علامت زده است. بر اساس این خروجی درمان را پیش نبرید.",
    abstained: (reason) => `مدل از پاسخ خودداری کرد: ${reason ?? "اطلاعات ناکافی"}`,
    editLabel: "پس از بررسی پرونده اصلی، پاسخ را ویرایش کنید",
    hypotheses: "فرضیه‌های غیرقطعی",
    supporting: "شواهد موافق",
    against: "مخالف / ناموجود",
    priorities: "اولویت‌های ارزیابی",
    treatment: "ملاحظات درمانی",
    stopRules: "موارد منع / قوانین توقف",
    missing: "اطلاعات ناموجود",
    verify: "باید تأیید شود",
    saveEdited: "ذخیره بررسی ویرایش‌شده",
    cancel: "انصراف",
    accept: "علامت بررسی و پذیرش",
    edit: "ویرایش پیش از پذیرش",
    reject: "رد پیش‌نویس",
  },
};
