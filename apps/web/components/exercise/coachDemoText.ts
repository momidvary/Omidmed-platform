import type { PageText } from "@/lib/i18n/text";

const en = {
  region: (name: string) => `Coach demonstration: ${name}`,
  sceneAlt: (name: string) =>
    `Illustrated athlete coach in a gym slowly repeating ${name}, side view`,
  stillAlt: (name: string) => `Illustrated athlete coach in a gym in the key position of ${name}`,
  phases: ["Lift", "Hold", "Lower slowly"],
  simulated: "Side view · illustration",
  still: "Key position · still illustration",
  play: "Play demonstration",
  pause: "Pause demonstration",
  repetition: (n: number) => `Repetition ${n}`,
  speed: "Demonstration speed",
  slow: "Slow",
  normal: "Normal",
  guide: "Body-line guide",
  guideLine: "Shoulder, hip and knee in one line",
  note: "A reminder of the movement, not a substitute for your clinician's instructions.",
};

export const coachDemoText: PageText<typeof en> = {
  en,
  fa: {
    region: (name) => `نمایش مربی: ${name}`,
    sceneAlt: (name) =>
      `تصویر یک مربی ورزشکار در باشگاه که حرکت ${name} را آرام تکرار می‌کند، نمای نیم‌رخ`,
    stillAlt: (name) => `تصویر یک مربی ورزشکار در باشگاه در وضعیت اصلی حرکت ${name}`,
    phases: ["بالا بیاورید", "نگه دارید", "آرام پایین"],
    simulated: "نمای نیم‌رخ · تصویرسازی",
    still: "وضعیت اصلی حرکت · تصویر ثابت",
    play: "پخش نمایش",
    pause: "توقف نمایش",
    repetition: (n) => `تکرار ${n.toLocaleString("fa-IR")}`,
    speed: "سرعت نمایش",
    slow: "آهسته",
    normal: "عادی",
    guide: "خط راهنما",
    guideLine: "شانه، لگن و زانو در یک خط",
    note: "این نمایش برای یادآوری شکل حرکت است و جایگزین دستور درمانگر نیست.",
  },
  ar: {
    region: (name) => `عرض المدرب: ${name}`,
    sceneAlt: (name) => `رسم لمدرب رياضي في صالة رياضية يكرر ${name} ببطء، منظر جانبي`,
    stillAlt: (name) => `رسم لمدرب رياضي في صالة رياضية في الوضعية الأساسية لـ ${name}`,
    phases: ["ارفع", "اثبت", "انزل ببطء"],
    simulated: "منظر جانبي · رسم توضيحي",
    still: "الوضعية الأساسية · رسم ثابت",
    play: "تشغيل العرض",
    pause: "إيقاف العرض",
    repetition: (n) => `التكرار ${n.toLocaleString("ar")}`,
    speed: "سرعة العرض",
    slow: "بطيء",
    normal: "عادي",
    guide: "خط الإرشاد",
    guideLine: "الكتف والورك والركبة على خط واحد",
    note: "هذا العرض للتذكير بشكل الحركة ولا يغني عن تعليمات المعالج.",
  },
};
