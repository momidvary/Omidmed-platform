import { L } from "@/lib/clinical/protocols/types";
import type { OutcomeMeasure } from "@/lib/clinical/protocols/types";

/*
 * Outcome measures shared across protocols. A minimal clinically important
 * difference is quoted only where a commonly cited figure exists; clinicians
 * should verify it for their population.
 */

export const NPRS: OutcomeMeasure = {
  name: "NPRS",
  detail: L(
    "Pain intensity 0–10 at baseline and each visit; a change of about 2 points or 30% is commonly treated as clinically important (Farrar et al., Pain 2001).",
    "شدت درد ۰ تا ۱۰ در شروع و هر جلسه؛ تغییر حدود ۲ نمره یا ۳۰٪ معمولاً از نظر بالینی معنادار در نظر گرفته می‌شود (Farrar و همکاران، Pain 2001)."
  ),
};

export const PSFS: OutcomeMeasure = {
  name: "PSFS",
  detail: L(
    "Patient-Specific Functional Scale: 3–5 activities the patient chooses, rated 0–10; a change of about 2 points in the average is commonly used as meaningful.",
    "مقیاس عملکرد اختصاصی بیمار: ۳ تا ۵ فعالیتی که خود بیمار انتخاب می‌کند، نمره ۰ تا ۱۰؛ تغییر حدود ۲ نمره در میانگین معمولاً معنادار در نظر گرفته می‌شود."
  ),
};

export const KOOS: OutcomeMeasure = {
  name: "KOOS",
  detail: L(
    "Knee injury and Osteoarthritis Outcome Score, at baseline and every 4–6 weeks; changes of about 8–10 points in a subscale are commonly treated as meaningful.",
    "پرسشنامه KOOS در شروع و هر ۴ تا ۶ هفته؛ تغییر حدود ۸ تا ۱۰ نمره در هر زیرمقیاس معمولاً معنادار در نظر گرفته می‌شود."
  ),
};

export const AKPS: OutcomeMeasure = {
  name: "AKPS (Kujala)",
  detail: L(
    "Anterior Knee Pain Scale 0–100; a change of about 8–10 points is commonly treated as meaningful (Crossley et al., Arch Phys Med Rehabil 2004).",
    "مقیاس درد قدامی زانو (کوجالا) ۰ تا ۱۰۰؛ تغییر حدود ۸ تا ۱۰ نمره معمولاً معنادار در نظر گرفته می‌شود (Crossley و همکاران، ۲۰۰۴)."
  ),
};

export const VISA_P: OutcomeMeasure = {
  name: "VISA-P",
  detail: L("Patellar tendinopathy severity 0–100, at baseline and monthly.", "شدت تاندینوپاتی کشکک ۰ تا ۱۰۰، در شروع و ماهانه."),
};

export const VISA_A: OutcomeMeasure = {
  name: "VISA-A",
  detail: L("Achilles tendinopathy severity 0–100, at baseline and monthly.", "شدت تاندینوپاتی آشیل ۰ تا ۱۰۰، در شروع و ماهانه."),
};

export const OARSI_TESTS: OutcomeMeasure = {
  name: "30-s chair stand · 40 m fast-paced walk",
  detail: L(
    "OARSI-recommended performance tests for hip and knee osteoarthritis, at baseline and every 6–8 weeks.",
    "آزمون‌های عملکردی پیشنهادی OARSI برای آرتروز لگن و زانو (بلند شدن از صندلی ۳۰ ثانیه، راه رفتن سریع ۴۰ متر)، در شروع و هر ۶ تا ۸ هفته."
  ),
};

export const HOP_LSI: OutcomeMeasure = {
  name: "Hop tests (LSI)",
  detail: L(
    "Single, triple and crossover hop for distance and 6 m timed hop; limb symmetry index of 90% or more before return to pivoting sport.",
    "آزمون‌های پرش تک، سه‌گانه، ضربدری و پرش ۶ متر زمان‌دار؛ شاخص تقارن اندام ۹۰٪ یا بیشتر پیش از بازگشت به ورزش‌های چرخشی."
  ),
};

export const STRENGTH_LSI: OutcomeMeasure = {
  name: "Quadriceps strength (LSI)",
  detail: L(
    "Isometric or isokinetic quadriceps strength compared with the other side; 90% or more is a common return-to-sport criterion.",
    "قدرت چهارسر (ایزومتریک یا ایزوکینتیک) در مقایسه با سمت مقابل؛ ۹۰٪ یا بیشتر معیار رایج بازگشت به ورزش است."
  ),
};

export const ODI: OutcomeMeasure = {
  name: "ODI",
  detail: L(
    "Oswestry Disability Index 0–100; a change of about 10 points or 30% is commonly treated as meaningful (Ostelo et al., Spine 2008).",
    "شاخص ناتوانی اسوستری ۰ تا ۱۰۰؛ تغییر حدود ۱۰ نمره یا ۳۰٪ معمولاً معنادار در نظر گرفته می‌شود (Ostelo و همکاران، Spine 2008)."
  ),
};

export const STARTBACK: OutcomeMeasure = {
  name: "STarT Back",
  detail: L(
    "Screening tool at the first visit to stratify risk of persistent disability (low / medium / high) and match the intensity of care.",
    "ابزار غربالگری در جلسه اول برای طبقه‌بندی خطر ناتوانی ماندگار (کم، متوسط، زیاد) و تنظیم شدت مراقبت."
  ),
};

export const NDI: OutcomeMeasure = {
  name: "NDI",
  detail: L("Neck Disability Index, at baseline and every 4 weeks.", "شاخص ناتوانی گردن، در شروع و هر ۴ هفته."),
};

export const HIT6: OutcomeMeasure = {
  name: "Headache diary · HIT-6",
  detail: L("Headache frequency, intensity and duration, plus the HIT-6 impact score.", "دفترچه سردرد (تعداد، شدت و مدت) و نمره تأثیر سردرد HIT-6."),
};

export const SPADI: OutcomeMeasure = {
  name: "SPADI",
  detail: L("Shoulder Pain and Disability Index, at baseline and every 4–6 weeks.", "شاخص درد و ناتوانی شانه، در شروع و هر ۴ تا ۶ هفته."),
};

export const SHOULDER_ROM: OutcomeMeasure = {
  name: "Shoulder ROM",
  detail: L("Goniometric elevation and external rotation (arm at the side), every 2–4 weeks.", "دامنه حرکتی بالا بردن و چرخش خارجی (دست کنار بدن) با گونیامتر، هر ۲ تا ۴ هفته."),
};

export const HOOS: OutcomeMeasure = {
  name: "HOOS",
  detail: L("Hip disability and Osteoarthritis Outcome Score, at baseline and every 4–6 weeks.", "پرسشنامه HOOS لگن، در شروع و هر ۴ تا ۶ هفته."),
};

export const IHOT_HAGOS: OutcomeMeasure = {
  name: "iHOT-12 / HAGOS",
  detail: L(
    "Hip-specific questionnaires for young and active adults with hip-related pain (including FAI syndrome), recommended by the 2023 nonarthritic hip pain guideline; at baseline and every 4–6 weeks.",
    "پرسشنامه‌های اختصاصی لگن برای بزرگسالان جوان و فعال با درد مرتبط با لگن (از جمله سندرم FAI)، توصیه‌شده در راهنمای ۲۰۲۳ درد غیرآرتروزی لگن؛ در شروع و هر ۴ تا ۶ هفته."
  ),
};

export const LEFS: OutcomeMeasure = {
  name: "LEFS",
  detail: L(
    "Lower Extremity Functional Scale 0–80; a change of about 9 points is commonly treated as meaningful (Binkley et al., Phys Ther 1999).",
    "مقیاس عملکردی اندام تحتانی ۰ تا ۸۰؛ تغییر حدود ۹ نمره معمولاً معنادار در نظر گرفته می‌شود (Binkley و همکاران، ۱۹۹۹)."
  ),
};

export const FAAM: OutcomeMeasure = {
  name: "FAAM",
  detail: L(
    "Foot and Ankle Ability Measure; changes of about 8 points (daily activities) and 9 points (sport) are commonly treated as meaningful (Martin et al., Foot Ankle Int 2005).",
    "مقیاس توانایی مچ و پا؛ تغییر حدود ۸ نمره در زیرمقیاس فعالیت روزانه و ۹ نمره در زیرمقیاس ورزش معمولاً معنادار است (Martin و همکاران، ۲۰۰۵)."
  ),
};

export const HEEL_RAISE: OutcomeMeasure = {
  name: "Single-leg heel raise test",
  detail: L("Repetitions to fatigue on each side; aim for symmetry before return to running.", "تعداد بالا رفتن روی پنجه تک‌پا تا خستگی در هر سمت؛ هدف، تقارن پیش از بازگشت به دویدن."),
};
