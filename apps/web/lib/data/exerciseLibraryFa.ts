import type { Exercise } from "@/lib/types";
import type { Locale } from "@/lib/i18n/translations";
import { exerciseFa, type ExerciseFa } from "@/lib/data/exerciseFa";

/*
 * Persian clinician library content. Patient-facing wording for prescribed
 * exercises stays in exerciseFa (which also gates what can be prescribed);
 * this module adds the clinician-only fields and covers the full library.
 */
interface ExerciseLibraryFa extends ExerciseFa {
  equipment: string;
  setsReps: string;
  progression: string;
  regression: string;
}

export const exerciseGoalFa: Record<string, string> = {
  "Core endurance": "استقامت مرکزی تنه",
  "Motor control": "کنترل حرکتی",
  Strengthening: "تقویت",
  "Gluteus medius strengthening": "تقویت سرینی میانی",
  "Quadriceps activation": "فعال‌سازی چهارسر",
  "Circulation / early mobility": "گردش خون / تحرک زودهنگام",
  "Knee flexion ROM": "دامنه خم شدن زانو",
  "Strengthening / control": "تقویت / کنترل",
  "Quadriceps strengthening": "تقویت چهارسر",
  "Scapular control": "کنترل کتف",
  "Rotator cuff loading": "بارگذاری روتیتور کاف",
  "Balance / proprioception": "تعادل / حس عمقی",
  "Hip mobility": "تحرک لگن",
};

type Extra = Omit<ExerciseLibraryFa, keyof ExerciseFa>;

const extras: Record<string, Extra> = {
  ex_curl_up: {
    equipment: "بدون وسیله",
    setsReps: "۳ ست ۸ تا ۱۰ تکرار، نگه‌داشتن ۸ ثانیه",
    progression: "افزایش زمان نگه‌داشتن یا تعداد تکرار.",
    regression: "کاهش زمان نگه‌داشتن؛ فقط سر بلند شود.",
  },
  ex_bird_dog: {
    equipment: "تشک",
    setsReps: "۳ ست ۸ تکرار برای هر سمت",
    progression: "اضافه کردن مکث کوتاه یا کشیدن مربع با دست.",
    regression: "فقط دست یا فقط پا حرکت کند.",
  },
  ex_glute_bridge: {
    equipment: "تشک",
    setsReps: "۳ ست ۱۲ تکرار",
    progression: "پل تک‌پا یا اضافه کردن کش مقاومتی.",
    regression: "کاهش دامنه یا زمان نگه‌داشتن.",
  },
  ex_glute_med_sidelying: {
    equipment: "بدون وسیله / کش",
    setsReps: "۳ ست ۱۲ تا ۱۵ تکرار برای هر سمت",
    progression: "کش مقاومتی بالای زانوها اضافه شود.",
    regression: "کاهش دامنه یا تعداد تکرار.",
  },
  ex_glute_med_bridge: {
    equipment: "کش مقاومتی",
    setsReps: "۳ ست ۱۵ تکرار",
    progression: "کش قوی‌تر یا تکرار بیشتر.",
    regression: "بدون کش.",
  },
  ex_quad_sets: {
    equipment: "حوله",
    setsReps: "۳ ست ۱۰ تکرار، نگه‌داشتن ۵ ثانیه (در روزهای اول هر ساعت)",
    progression: "بالا آوردن پای صاف پس از کنترل خوب چهارسر.",
    regression: "نگه‌داشتن کوتاه‌تر، تکرار کمتر.",
  },
  ex_ankle_pumps: {
    equipment: "بدون وسیله",
    setsReps: "۱۰ تا ۲۰ تکرار هر ساعت در زمان بیداری",
    progression: "اضافه کردن باز کردن زانو در حالت نشسته.",
    regression: "تکرار کمتر، دامنه کوچک‌تر.",
  },
  ex_heel_slides: {
    equipment: "بند / حوله",
    setsReps: "۲ تا ۳ ست ۱۰ تکرار، نگه‌داشتن ملایم",
    progression: "با فروکش کردن تورم، دامنه افزایش یابد.",
    regression: "دامنه کمتر، کمک بیشتر.",
  },
  ex_step_down: {
    equipment: "پله",
    setsReps: "۳ ست ۸ تا ۱۰ تکرار برای هر سمت",
    progression: "پله بلندتر یا اضافه کردن بار.",
    regression: "پله کوتاه‌تر یا گرفتن تکیه‌گاه.",
  },
  ex_wall_sit: {
    equipment: "دیوار",
    setsReps: "۳ ست نگه‌داشتن ۲۰ تا ۴۵ ثانیه",
    progression: "زاویه عمیق‌تر یا نگه‌داشتن طولانی‌تر.",
    regression: "زاویه کم‌عمق‌تر، نگه‌داشتن کوتاه‌تر.",
  },
  ex_dnf: {
    equipment: "بدون وسیله",
    setsReps: "۳ ست ۱۰ تکرار، نگه‌داشتن ۱۰ ثانیه",
    progression: "اضافه کردن نگه‌داشتن با بلند کردن خفیف سر.",
    regression: "نگه‌داشتن کوتاه‌تر، تکرار کمتر.",
  },
  ex_scap_control: {
    equipment: "دیوار",
    setsReps: "۳ ست ۱۰ تکرار",
    progression: "اضافه کردن کش یا پیشرفت به بارگذاری بالای سر.",
    regression: "کاهش دامنه.",
  },
  ex_ext_rotation: {
    equipment: "دیوار / کش",
    setsReps: "۳ تا ۵ بار نگه‌داشتن ۲۰ تا ۴۵ ثانیه",
    progression: "پیشرفت به چرخش خارجی پویا با کش.",
    regression: "شدت کمتر، نگه‌داشتن کوتاه‌تر.",
  },
  ex_ankle_balance: {
    equipment: "بدون وسیله",
    setsReps: "۳ ست ۳۰ ثانیه برای هر سمت",
    progression: "چشم بسته یا روی سطح نرم.",
    regression: "تکیه با نوک انگشتان به دیوار.",
  },
  ex_calf_raise: {
    equipment: "پله (اختیاری)",
    setsReps: "۳ ست ۱۲ تا ۱۵ تکرار",
    progression: "تک‌پا یا با دامنه کامل لبه پله.",
    regression: "دوپا با تکیه‌گاه.",
  },
  ex_hip_mobility: {
    equipment: "تشک",
    setsReps: "۳ بار نگه‌داشتن ۳۰ ثانیه برای هر سمت",
    progression: "اضافه کردن رساندن ملایم دست به بالای سر.",
    regression: "کاهش جابه‌جایی به جلو.",
  },
};

/* Clinician library text for exercises that have no patient handout yet. */
const libraryOnly: Record<string, ExerciseFa> = {
  ex_glute_med_bridge: {
    name: "صدفی با کش (کلم‌شل)",
    purpose: "فعال‌سازی بخش خلفی سرینی میانی.",
    howTo: [
      "به پهلو دراز بکشید، زانوها حدود ۴۵ درجه خم و کش بالای زانوها.",
      "پاها را کنار هم نگه دارید و زانوی بالایی را باز کنید.",
      "از چرخیدن لگن به عقب جلوگیری کنید.",
      "با کنترل پایین بیاورید.",
    ],
    commonMistakes: ["چرخیدن لگن به عقب", "جدا شدن پاها از هم", "تکرارهای سریع"],
    whenToStop: "با درد تیز لگن توقف شود.",
  },
  ex_step_down: {
    name: "پایین آمدن از پله (استپ داون)",
    purpose: "ایجاد کنترل اکسنتریک چهارسر و لگن برای پله.",
    howTo: [
      "روی یک پله کوتاه بایستید.",
      "پاشنه پای مقابل را آهسته به سمت زمین پایین ببرید.",
      "زانو در راستای انگشتان میانی پا حرکت کند.",
      "با فشار از پای ایستاده برگردید.",
    ],
    commonMistakes: ["جمع شدن زانو به داخل", "پایین آمدن خیلی سریع", "خم شدن بیش از حد تنه"],
    whenToStop: "با درد تیز زانو یا از دست رفتن کنترل توقف شود.",
  },
  ex_dnf: {
    name: "تمرین فلکسورهای عمقی گردن",
    purpose: "بازآموزی فلکسورهای عمقی گردن برای حمایت از ستون گردنی.",
    howTo: [
      "به پشت دراز بکشید و سر را روی زمین بگذارید.",
      "به آرامی مثل «بله» گفتن سر را تکان دهید (چانه به داخل) بدون بلند کردن سر.",
      "این انقباض ملایم را نگه دارید.",
      "شل کنید و تکرار کنید.",
    ],
    commonMistakes: ["استفاده از عضلات سطحی گردن", "بلند کردن سر", "فشار زیاد در جمع کردن چانه"],
    whenToStop: "با سرگیجه یا افزایش علائم دست توقف شود.",
  },
  ex_scap_control: {
    name: "کنترل کتف (سُر دادن روی دیوار)",
    purpose: "بهبود حرکت کتف و ریتم شانه.",
    howTo: [
      "رو به دیوار بایستید و ساعدها را روی دیوار بگذارید.",
      "دست‌ها را با حفظ تماس به بالا سُر دهید.",
      "کتف‌ها را به آرامی به هم نزدیک و به بالا ببرید.",
      "با کنترل پایین بیاورید.",
    ],
    commonMistakes: ["بالا انداختن بیش از حد شانه", "قوس دادن کمر", "از دست دادن تماس با دیوار"],
    whenToStop: "با درد تیز شانه توقف شود.",
  },
  ex_ext_rotation: {
    name: "چرخش خارجی ایزومتریک",
    purpose: "بارگذاری روتیتور کاف با تحریک کم.",
    howTo: [
      "بایستید و آرنج را ۹۰ درجه کنار بدن خم کنید.",
      "پشت دست را به دیوار فشار دهید (چرخش به بیرون).",
      "با شدتی راحت نگه دارید.",
      "شل کنید و تکرار کنید.",
    ],
    commonMistakes: ["بالا انداختن شانه", "فاصله گرفتن آرنج از بدن", "نیروی زیاد در ابتدا"],
    whenToStop: "با درد تیز یا رو به افزایش توقف شود.",
  },
  ex_ankle_balance: {
    name: "تعادل تک‌پا",
    purpose: "بازگرداندن حس عمقی مچ پا و کاهش خطر آسیب مجدد.",
    howTo: [
      "نزدیک یک تکیه‌گاه روی یک پا بایستید.",
      "زانو را کمی خم و وضعیت بدن را ثابت نگه دارید.",
      "تا زمانی که کنترل دارید نگه دارید.",
      "پا را عوض کنید.",
    ],
    commonMistakes: ["قفل کردن زانو", "گرفتن تکیه‌گاه بدون نیاز", "نگاه مداوم به پایین"],
    whenToStop: "با درد تیز مچ پا یا خالی کردن پا توقف شود.",
  },
  ex_calf_raise: {
    name: "بالا رفتن روی پنجه (کاف ریز)",
    purpose: "تقویت مجموعه ساق و آشیل.",
    howTo: [
      "صاف بایستید، پاها به عرض لگن.",
      "روی سینه پا بالا بروید.",
      "در بالا مکث کنید.",
      "آهسته پایین بیایید.",
    ],
    commonMistakes: ["چرخیدن روی لبه خارجی پا", "حرکت جهشی", "دامنه ناقص"],
    whenToStop: "با درد تیز آشیل یا پاشنه توقف شود.",
  },
  ex_hip_mobility: {
    name: "تحرک فلکسور لگن (نیم‌زانو)",
    purpose: "بهبود تحرک باز شدن لگن.",
    howTo: [
      "روی یک زانو در حالت نیم‌زانو قرار بگیرید.",
      "لگن را به آرامی به داخل جمع کنید و وزن را به جلو ببرید.",
      "کشش را جلوی لگن حس کنید.",
      "نگه دارید و برگردید.",
    ],
    commonMistakes: ["قوس دادن کمر", "کشش بیش از حد", "چرخاندن لگن"],
    whenToStop: "با درد گیرکننده کشاله ران یا درد کمر توقف شود.",
  },
};

export function exerciseLibraryFa(id: string): ExerciseLibraryFa | undefined {
  const base = exerciseFa[id] ?? libraryOnly[id];
  const extra = extras[id];
  return base && extra ? { ...base, ...extra } : undefined;
}

/** Exercise card text for the clinician library in the active locale. */
export function localizeExercise(ex: Exercise, locale: Locale): Exercise {
  if (locale !== "fa") return ex;
  const fa = exerciseLibraryFa(ex.id);
  if (!fa) return ex;
  return {
    ...ex,
    name: fa.name,
    purpose: fa.purpose,
    goal: exerciseGoalFa[ex.goal] ?? ex.goal,
    equipment: fa.equipment,
    howTo: fa.howTo,
    setsReps: fa.setsReps,
    commonMistakes: fa.commonMistakes,
    whenToStop: fa.whenToStop,
    progression: fa.progression,
    regression: fa.regression,
  };
}
