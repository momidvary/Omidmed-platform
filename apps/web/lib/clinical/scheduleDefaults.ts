import type { ExerciseCategory } from "@/lib/types";

/*
 * Starting values for a new home program. They save typing, never decide for
 * the clinician: every value stays editable and the program reaches the
 * patient only after the clinician ticks the publish statement.
 */

/** Weekday numbers as stored: 0 = Sunday … 6 = Saturday. */
export const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
/** Saturday, Monday, Wednesday — rest days between loaded sessions. */
export const ALTERNATE_DAYS = [1, 3, 6];
/** Display order for Persian clinics, whose week starts on Saturday. */
export const WEEK_ORDER_FA = [6, 0, 1, 2, 3, 4, 5];
export const WEEK_ORDER_EN = [0, 1, 2, 3, 4, 5, 6];

/** Loaded strength and jumping work every other day; the rest daily. */
export function defaultWeekdays(category: ExerciseCategory | undefined): number[] {
  return category === "strength" || category === "plyometric" ? [...ALTERNATE_DAYS] : [...EVERY_DAY];
}

const PRECAUTIONS = {
  fa: "تمرین‌ها را با همان دوزی که مشخص شده انجام دهید. کمی درد حین تمرین تا حدی که برای هر تمرین نوشته شده قابل قبول است، به شرطی که تا صبح روز بعد برطرف شود. اگر دردی بیشتر از این حد داشتید، آن تمرین را سبک‌تر کنید و در پیام به فیزیوتراپیست خبر دهید.",
  en: "Do each exercise at the dose shown. Some pain during exercise, up to the limit given for each exercise, is acceptable if it settles by the next morning. If pain goes beyond that limit, make the exercise easier and tell your physiotherapist in a message.",
};

const STOP_RULES = {
  fa: "اگر درد شدید (۷ از ۱۰ یا بیشتر)، ورم یا گرمی جدید، یا بی‌حسی یا ضعف جدید داشتید، تمرین را متوقف کنید و با کلینیک تماس بگیرید. اگر درد قفسه سینه، تنگی نفس شدید، اختلال جدید در کنترل ادرار یا مدفوع یا بی‌حسی ناحیه زین داشتید، منتظر پاسخ نمانید و با اورژانس ۱۱۵ تماس بگیرید.",
  en: "If you have severe pain (7/10 or more), new swelling or warmth, or new numbness or weakness, stop the exercises and contact the clinic. If you have chest pain, severe shortness of breath, new loss of bladder or bowel control or numbness in the saddle area, do not wait for a reply: call emergency services.",
};

export function defaultPrecautions(lang: "fa" | "en"): string {
  return PRECAUTIONS[lang];
}

export function defaultStopRules(lang: "fa" | "en"): string {
  return STOP_RULES[lang];
}
