import type { PageText } from "@/lib/i18n/text";

const en = {
  notRecorded: "Not recorded",
  unknownTime: "Unknown time",
  summaryEmergency: "Emergency language in patient ticket",
  summaryUrgent: "Urgent language in patient ticket",
  summaryPain: (value: number | null) => `High pain reported${value === null ? "" : `: ${value}/10`}`,
  detailEmergency:
    "The patient ticket was classified as emergency. Contact the patient now and follow the clinic emergency pathway; never wait for an inbox response.",
  detailUrgent: "The patient ticket was classified as urgent. Review it now and document same-day contact and escalation.",
  detailPain: (value: number | null) =>
    `Patient reported high pain${value === null ? "" : ` (${value}/10)`}. The linked prescription was paused by the same database transaction.`,
  refreshFailed: "Alert refresh failed. Visible data may be stale; retry before making a safety decision.",
  switchConfirm: "Switch alerts and discard the unsaved resolution note on this screen?",
  ackFailed: "Acknowledgement was not saved. Check assignment and retry.",
  ackSaved: "Alert acknowledged with your authenticated identity.",
  resumeRejected:
    "Resume was rejected. Record a newer clear safety screen and verify the current plan, dates, and other open alerts.",
  resolveFailed: "Resolution was not saved. Check assignment and connection, then retry.",
  resolvedResumed: "Alert resolved and the reviewed prescription resumed.",
  resolvedPaused: "Alert resolved; any suspended prescription remains paused.",
  title: "Clinical Alerts",
  demoIntro: "Operational alerts are disabled in mock mode. No real clinician notification is sent.",
  demoTitle: "Demo mode has no safety queue",
  demoBody: "Connect Supabase and apply migration 014 to test attributed acknowledgement and reviewed resume.",
  accessTitle: "Clinical alert access required",
  accessBody: "Only clinic owners and assigned therapists can load this queue.",
  intro:
    "Oldest unresolved safety events are shown first. Acknowledgement is not resolution, and a paused prescription resumes only after a newer clear screen.",
  refresh: "Refresh",
  unresolved: "Unresolved",
  acknowledged: "Acknowledged",
  lastRefresh: "Last refresh",
  filters: {
    unresolved: "unresolved",
    open: "open",
    acknowledged: "acknowledged",
    resolved: "resolved",
    all: "all",
  } as Record<string, string>,
  statuses: { open: "open", acknowledged: "acknowledged", resolved: "resolved" } as Record<string, string>,
  emptyTitle: "No alerts in this view",
  emptyBody: "The database has no matching clinician-visible safety events.",
  created: (when: string) => `Created ${when}`,
  reportDate: "Patient report date",
  queueCreated: "Queue created",
  acknowledgedAt: "Acknowledged",
  resolvedAt: "Resolved",
  acknowledge: "Acknowledge alert",
  resolutionNote: "Resolution note",
  resolutionPlaceholder: "Assessment, contact, advice and follow-up completed",
  resumeLabel:
    "Resume the paused prescription. The database will reject this unless a newer clear safety screen, current approved plan and valid dates all exist.",
  resolveResume: "Resolve and resume",
  resolveKeep: "Resolve; keep program paused",
  noNote: "Resolved without a visible note.",
  pollNotice:
    "This in-app queue polls every 30 seconds while open. Production rollout still requires an external delivery channel, retry/dead-letter handling and an on-call escalation policy.",
};

export type AlertsText = typeof en;

export const alertsText: PageText<AlertsText> = {
  en,
  fa: {
    notRecorded: "ثبت نشده",
    unknownTime: "زمان نامشخص",
    summaryEmergency: "عبارت اورژانسی در تیکت بیمار",
    summaryUrgent: "عبارت فوری در تیکت بیمار",
    summaryPain: (value) => `گزارش درد شدید${value === null ? "" : `: ${value}/10`}`,
    detailEmergency:
      "تیکت بیمار اورژانسی طبقه‌بندی شد. همین حالا با بیمار تماس بگیرید و مسیر اورژانس کلینیک را دنبال کنید؛ هرگز منتظر پاسخ صندوق پیام نمانید.",
    detailUrgent: "تیکت بیمار فوری طبقه‌بندی شد. همین حالا بررسی کنید و تماس و ارجاع همان روز را ثبت کنید.",
    detailPain: (value) =>
      `بیمار درد شدید گزارش کرده است${value === null ? "" : ` (${value}/10)`}. نسخه تمرین مرتبط در همان تراکنش دیتابیس متوقف شد.`,
    refreshFailed: "تازه‌سازی هشدارها انجام نشد. داده‌های نمایش‌داده‌شده ممکن است قدیمی باشد؛ پیش از تصمیم ایمنی دوباره تلاش کنید.",
    switchConfirm: "هشدار عوض شود و یادداشت ذخیره‌نشده رفع هشدار در این صفحه حذف شود؟",
    ackFailed: "تأیید مشاهده ذخیره نشد. تخصیص را بررسی و دوباره تلاش کنید.",
    ackSaved: "مشاهده هشدار با هویت احراز‌شده شما ثبت شد.",
    resumeRejected:
      "ادامه نسخه رد شد. یک غربالگری ایمنی پاکِ جدیدتر ثبت کنید و برنامه فعلی، تاریخ‌ها و سایر هشدارهای باز را بررسی کنید.",
    resolveFailed: "رفع هشدار ذخیره نشد. تخصیص و اتصال را بررسی و دوباره تلاش کنید.",
    resolvedResumed: "هشدار رفع شد و نسخه بازبینی‌شده ادامه یافت.",
    resolvedPaused: "هشدار رفع شد؛ هر نسخه متوقف‌شده همچنان متوقف می‌ماند.",
    title: "هشدارهای بالینی",
    demoIntro: "هشدارهای عملیاتی در حالت نمایشی غیرفعال‌اند و هیچ اعلان واقعی ارسال نمی‌شود.",
    demoTitle: "حالت نمایشی صف ایمنی ندارد",
    demoBody: "برای آزمایش تأیید مشاهده و ادامه بازبینی‌شده، Supabase را وصل و migration 014 را اجرا کنید.",
    accessTitle: "دسترسی به هشدارهای بالینی لازم است",
    accessBody: "فقط صاحب کلینیک و فیزیوتراپیست مسئول می‌توانند این صف را ببینند.",
    intro:
      "قدیمی‌ترین رویدادهای ایمنی رفع‌نشده اول نمایش داده می‌شوند. تأیید مشاهده به معنای رفع نیست و نسخه متوقف‌شده فقط پس از غربالگری پاک جدیدتر ادامه می‌یابد.",
    refresh: "تازه‌سازی",
    unresolved: "رفع‌نشده",
    acknowledged: "مشاهده‌شده",
    lastRefresh: "آخرین تازه‌سازی",
    filters: {
      unresolved: "رفع‌نشده",
      open: "باز",
      acknowledged: "مشاهده‌شده",
      resolved: "رفع‌شده",
      all: "همه",
    },
    statuses: { open: "باز", acknowledged: "مشاهده‌شده", resolved: "رفع‌شده" },
    emptyTitle: "هشداری در این نما نیست",
    emptyBody: "دیتابیس رویداد ایمنی منطبق و قابل مشاهده‌ای ندارد.",
    created: (when) => `ایجاد ${when}`,
    reportDate: "تاریخ گزارش بیمار",
    queueCreated: "ورود به صف",
    acknowledgedAt: "مشاهده",
    resolvedAt: "رفع",
    acknowledge: "تأیید مشاهده هشدار",
    resolutionNote: "یادداشت رفع هشدار",
    resolutionPlaceholder: "ارزیابی، تماس، توصیه و پیگیری انجام‌شده",
    resumeLabel:
      "ادامه نسخه متوقف‌شده. دیتابیس این را رد می‌کند مگر اینکه غربالگری ایمنی پاکِ جدیدتر، برنامه تأییدشده فعلی و تاریخ‌های معتبر وجود داشته باشد.",
    resolveResume: "رفع و ادامه برنامه",
    resolveKeep: "رفع؛ برنامه متوقف بماند",
    noNote: "بدون یادداشت قابل مشاهده رفع شد.",
    pollNotice:
      "این صف داخل برنامه هر ۳۰ ثانیه تازه می‌شود. انتشار عملیاتی همچنان به کانال ارسال خارجی، مدیریت تلاش مجدد و سیاست آنکال نیاز دارد.",
  },
};
