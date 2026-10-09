import type { PatientCase } from "@/lib/types";
import { bodyRegionsFa } from "@/lib/data/bodyRegionsFa";
import { buildEducation } from "@/lib/ai/engine";

export type EducationHandout = ReturnType<typeof buildEducation>;

/*
 * Persian patient handout from the deterministic education template.
 * buildEducation runs first so the same safety gate throws before any
 * advice is produced; only the patient-facing wording differs.
 */
export function buildEducationFa(c: PatientCase): EducationHandout {
  buildEducation(c);

  const region = c.region ? bodyRegionsFa[c.region] : undefined;
  const area = c.painLocation || region?.label || "ناحیه درگیر";

  return {
    problem: `شما در ناحیه ${area} درد دارید${c.duration ? ` که حدود ${c.duration} طول کشیده است` : ""}. در بیشتر موارد این نوع مشکل خطرناک نیست و با فعالیت مناسب و یک برنامه تدریجی بهتر می‌شود. فیزیوتراپیست شما علت را با معاینه حضوری تأیید می‌کند.`,
    avoid: [
      c.aggravating
        ? `فعلاً فعالیت‌هایی را که به‌وضوح درد را بیشتر می‌کنند محدود کنید (مثلاً ${c.aggravating}).`
        : "فعلاً فعالیت‌هایی را که به‌وضوح درد را بیشتر می‌کنند محدود کنید.",
      "از استراحت مطلق پرهیز کنید — حرکت ملایم معمولاً کمک می‌کند.",
      "با وجود درد تیز یا رو به افزایش، حرکت را ادامه ندهید.",
    ],
    exercises: region?.exerciseSuggestions
      .slice(0, 3)
      .map((exercise) => `${exercise} — طبق راهنمایی فیزیوتراپیست.`) ?? [
      "حرکت ملایم ناحیه در محدوده‌ای که درد اجازه می‌دهد.",
      "پیاده‌روی عمومی در حد راحتی.",
    ],
    contact: [
      "اگر درد به‌سرعت بدتر شد یا علامت جدیدی پیدا شد با فیزیوتراپیست تماس بگیرید.",
      "در این موارد فوراً به پزشک یا اورژانس مراجعه کنید: از دست دادن کنترل ادرار یا مدفوع، بی‌حسی اطراف کشاله ران و نشیمنگاه، درد شدید بی‌دلیل، درد قفسه سینه، یا ورم و درد ساق پا.",
    ],
    homeAdvice: [
      "در طول روز کم ولی مکرر حرکت کنید.",
      "اگر کمک می‌کند، برای راحتی کوتاه‌مدت از گرما یا یخ استفاده کنید.",
      "فعالیت را تدریجی بالا ببرید — هر هفته کمی بیشتر.",
      "به خواب کافی و فعالیت عمومی اهمیت دهید.",
    ],
  };
}
