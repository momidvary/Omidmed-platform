import type { Protocol, ProtocolPhase } from "@/lib/clinical/protocols/types";
import { exercises } from "@/lib/data/exercises";
import { localizeExercise } from "@/lib/data/exerciseLibraryFa";
import type { BodyRegionId, TreatmentPlan } from "@/lib/types";

/*
 * Region- and protocol-aware parts of the deterministic plan template.
 * These are decision-support text, not model output; the clinician edits and
 * signs the plan before it has any effect.
 */

type Lang = "en" | "fa";

/** A chosen protocol phase that shapes the generated plan text. */
export interface PlanGuide {
  protocol: Protocol;
  phase: ProtocolPhase;
}

const lowerLimb: BodyRegionId[] = ["hip", "knee", "ankle-foot", "sports"];

const motorControl: Partial<Record<BodyRegionId, Record<Lang, string[]>>> = {
  neck: {
    en: [
      "Deep neck flexor activation (cranio-cervical flexion) with pressure feedback when available",
      "Scapular setting and postural endurance in sustained work positions",
    ],
    fa: [
      "فعال‌سازی فلکسورهای عمقی گردن (فلکشن کرانیوسرویکال) در صورت امکان با بازخورد فشار",
      "کنترل کتف و استقامت وضعیتی در موقعیت‌های کاری طولانی",
    ],
  },
  shoulder: {
    en: [
      "Scapular control during elevation (upward rotation, posterior tilt)",
      "Rotator cuff control in progressively more elevated positions",
    ],
    fa: [
      "کنترل کتف هنگام بالا بردن بازو (چرخش رو به بالا، تیلت خلفی)",
      "کنترل روتاتور کاف در وضعیت‌های به‌تدریج بالاتر",
    ],
  },
  "low-back": {
    en: [
      "Graded exposure to feared or avoided movements",
      "Trunk control during functional tasks (lifting, bending, sit-to-stand)",
    ],
    fa: [
      "مواجهه تدریجی با حرکات ترسناک یا اجتناب‌شده",
      "کنترل تنه در تکالیف عملکردی (بلند کردن، خم شدن، برخاستن از صندلی)",
    ],
  },
  hip: {
    en: ["Pelvic control in single-leg stance", "Hip–knee alignment during step and squat tasks"],
    fa: ["کنترل لگن در ایستادن تک‌پا", "هم‌راستایی هیپ و زانو در تکالیف پله و اسکوات"],
  },
  knee: {
    en: ["Hip–knee–foot alignment in squat, step and landing tasks", "Quadriceps control through range"],
    fa: ["هم‌راستایی هیپ، زانو و پا در اسکوات، پله و فرود", "کنترل چهارسر ران در طول دامنه"],
  },
  "ankle-foot": {
    en: ["Foot and ankle control in single-leg stance", "Controlled push-off and landing mechanics"],
    fa: ["کنترل پا و مچ در ایستادن تک‌پا", "کنترل هل دادن و فرود"],
  },
};

const balance: Record<Lang, string[]> = {
  en: [
    "Static single-leg balance progressing to dynamic tasks",
    "Proprioceptive and reactive balance drills as the phase allows",
  ],
  fa: [
    "تعادل ایستای تک‌پا و پیشرفت به تکالیف پویا",
    "تمرینات حس عمقی و تعادل واکنشی متناسب با فاز",
  ],
};

const generic: Record<Lang, string[]> = {
  en: ["Task-specific control drills", "Quality-of-movement retraining"],
  fa: ["تمرینات کنترل اختصاصی تکلیف", "بازآموزی کیفیت حرکت"],
};

/** Motor-control items for the region (never perturbation work for the neck). */
export function regionMotorControl(region: BodyRegionId, lang: Lang): string[] {
  return motorControl[region]?.[lang] ?? generic[lang];
}

/** Balance training applies to lower-limb and post-operative lower-limb work only. */
export function regionBalance(region: BodyRegionId, lang: Lang): string[] {
  return lowerLimb.includes(region) ? balance[lang] : [];
}

function exerciseName(id: string, lang: Lang): string | null {
  const source = exercises.find((exercise) => exercise.id === id);
  if (!source) return null;
  return localizeExercise(source, lang).name;
}

/** Merge the chosen protocol phase into a generated plan. */
export function applyPlanGuide(plan: TreatmentPlan, guide: PlanGuide, lang: Lang): TreatmentPlan {
  const { protocol, phase } = guide;
  const names = phase.exercises
    .map((id) => exerciseName(id, lang))
    .filter((name): name is string => Boolean(name));
  const cap = (items: string[]) => items.slice(0, 12);

  const header =
    lang === "fa"
      ? `بر اساس پروتکل «${protocol.title.fa}» — ${phase.name.fa} (معمولاً ${phase.typical.fa}).`
      : `Based on the "${protocol.title.en}" protocol — ${phase.name.en} (typically ${phase.typical.en}).`;

  return {
    ...plan,
    exerciseTherapy: cap([header, ...phase.goals.map((goal) => goal[lang]), ...plan.exerciseTherapy]),
    strengthening: cap(
      names.length > 0
        ? [
            lang === "fa"
              ? `تمرین‌های این فاز: ${names.join("، ")}.`
              : `Exercises for this phase: ${names.join(", ")}.`,
            ...plan.strengthening,
          ]
        : plan.strengthening
    ),
    // Phase "other" items are education, activity advice and load management.
    education: cap([
      ...phase.other.map((item) => item[lang]),
      ...protocol.principles.slice(0, 2).map((item) => item[lang]),
      ...plan.education,
    ]),
    progression: cap(
      phase.progressWhen.length > 0
        ? [
            lang === "fa" ? "معیار رفتن به فاز بعد:" : "Criteria for the next phase:",
            ...phase.progressWhen.map((item) => item[lang]),
            ...plan.progression,
          ]
        : plan.progression
    ),
  };
}
