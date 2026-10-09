import type { TreatmentPlan, TreatmentPlanInput } from "@/lib/types";
import { bodyRegionsFa } from "@/lib/data/bodyRegionsFa";
import { buildTreatmentPlan } from "@/lib/ai/engine";

/*
 * Persian rendering of the deterministic treatment-plan template.
 * buildTreatmentPlan runs first so the same safety and post-operative
 * gates throw before any Persian text is produced.
 */
export function buildTreatmentPlanFa(input: TreatmentPlanInput): TreatmentPlan {
  buildTreatmentPlan(input);

  const region = bodyRegionsFa[input.region];
  const acute = input.stage === "acute" || input.irritability === "high";
  const postOp = input.stage === "post-op";

  const manualTherapy = postOp
    ? [
        "فقط از تکنیک‌هایی استفاده کنید که پروتکل جراح و احتیاط‌های ثبت‌شده صریحاً اجازه داده‌اند.",
        "درمان دستی را مکمل اختیاری بدانید؛ در صورت بدتر شدن علائم یا نقض احتیاط‌ها متوقف کنید.",
      ]
    : acute
      ? [
          "فقط پس از رد موارد منع، تکنیک‌های ملایم تعدیل علائم را در نظر بگیرید.",
          "پاسخ را حین و پس از درمان دوباره ارزیابی کنید؛ دامنه دردناک را به زور باز نکنید.",
        ]
      : [
          "تکنیک‌های مفصلی یا بافت نرم را فقط وقتی یافته‌های معاینه از آن پشتیبانی می‌کند در نظر بگیرید.",
          "درمان دستی را مکمل توان‌بخشی فعال به کار ببرید و پاسخ را ثبت کنید.",
        ];

  const exerciseTherapy = acute
    ? ["حرکت کم‌بار و هدایت‌شده با درد", "ایزومتریک برای بارگذاری اولیه", "جلسات کوتاه و مکرر"]
    : ["تمرین مقاومتی پیشرونده", "افزایش شدت با کاهش تحریک‌پذیری", "جلسات کمتر و طولانی‌تر"];

  const mobility = region?.exerciseSuggestions.slice(0, 2) ?? ["تمرینات تحرک متناسب با ناحیه"];
  const strengthening = postOp
    ? [
        `جراحی: ${input.postOpDetails?.procedure || "مشخص نشده"}. طبق پروتکل و احتیاط‌های تأییدشده پیش بروید.`,
        `وضعیت تحمل وزن: ${input.postOpDetails?.weightBearingStatus || "مشخص نشده"}.`,
        "بارگذاری زنجیره باز/بسته را فقط با اجازه تیم جراحی پیشرفت دهید.",
      ]
    : [
        `هدف قرار دادن نقص اصلی: ${input.mainImpairment || "ضعف شناسایی‌شده"}`,
        "اضافه‌بار پیشرونده ۲ تا ۳ بار در هفته",
      ];

  const motorControl = ["تمرینات کنترل اختصاصی تکلیف", "بازآموزی کیفیت حرکت", "تمرین تنفس و آرام‌سازی در صورت نیاز"];
  const balance = ["تعادل ایستا و پیشرفت به پویا", "تمرینات حس عمقی", "تمرین اغتشاش (Perturbation) در مراحل بعد"];

  const education = [
    ...(region?.educationPoints.slice(0, 2) ?? []),
    "زمان‌بندی مورد انتظار و نقش توان‌بخشی فعال را توضیح دهید.",
    input.painSeverity >= 9
      ? "درد بسیار شدید پیش از پیشرفت نیاز به ارزیابی مجدد دارد؛ فقط به اطمینان‌بخشی بسنده نکنید."
      : input.painSeverity >= 6
        ? "درد را با دقت و بدون نادیده گرفتن علائم توضیح دهید؛ بار را بر اساس معاینه و غربالگری ایمنی تنظیم کنید."
        : "فعالیت تدریجی را در محدوده قوانین توافق‌شده پاسخ علائم تشویق کنید.",
  ];

  const homeProgram = [
    "۳ تا ۵ تمرین کلیدی که به‌وضوح نمایش داده شود.",
    "راهنمای درد قابل قبول حین/پس از تمرین (مثلاً حداکثر ۳ از ۱۰ و برگشت طی ۲۴ ساعت).",
    "یک دفترچه ساده برای ثبت پایبندی و پیشرفت.",
  ];

  const frequency = acute
    ? "در ابتدا ۲ تا ۳ جلسه در هفته، همراه تمرین خانگی ملایم روزانه."
    : "۱ تا ۲ جلسه در هفته همراه برنامه خانگی پیشرونده.";

  const progression = [
    "وقتی درد و تحریک‌پذیری اجازه می‌دهد پیشرفت کنید (قانون پاسخ ۲۴ ساعته).",
    "پیش از حجم، بار یا پیچیدگی را افزایش دهید.",
    input.stage === "return-to-sport"
      ? "پیش از بازگشت به ورزش از معیارهای عینی بازگشت به ورزش استفاده کنید."
      : "ابزارهای سنجش پیامد را هر ۲ تا ۳ هفته دوباره ارزیابی کنید.",
  ];

  return {
    manualTherapy, exerciseTherapy, mobility, strengthening,
    motorControl, balance, education, homeProgram, frequency, progression,
  };
}
