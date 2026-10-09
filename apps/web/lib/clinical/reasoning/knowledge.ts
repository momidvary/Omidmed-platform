import type { BodyRegionId } from "@/lib/types";

/*
 * Structured clinical reasoning knowledge base (decision support only).
 *
 * Each region lists:
 * - intake questions answered yes / no / unknown during history taking;
 * - examination tests recorded as positive / negative / equivocal;
 * - provisional hypotheses with transparent, hand-set evidence weights.
 *
 * Weights express the direction and rough strength of a finding for a
 * hypothesis (±1 weak, ±2 moderate, ±3 strong: a positive high-specificity
 * test, or a negative high-sensitivity test). They are NOT probabilities
 * and the resulting ranking is NOT a diagnosis. Published accuracy figures
 * are shown only where a commonly cited source exists; clinicians must
 * verify them against current literature.
 *
 * Bump KNOWLEDGE_VERSION whenever content or weights change — saved
 * findings record the version they were captured with.
 */

export const KNOWLEDGE_VERSION = "physio-kb-1";

export type Answer = "yes" | "no" | "unknown";
export type TestResult = "positive" | "negative" | "equivocal";

export interface LocalizedText {
  en: string;
  fa: string;
}

export interface IntakeQuestion extends LocalizedText {
  id: string;
}

export interface TestAccuracy {
  /** Target condition the figures refer to. */
  target: string;
  sensitivity?: number;
  specificity?: number;
  /** Extra published figure, e.g. a cluster likelihood ratio. */
  note?: string;
  source: string;
}

export interface ExamTest extends LocalizedText {
  id: string;
  accuracy?: TestAccuracy;
}

export interface HypothesisRule {
  id: string;
  label: LocalizedText;
  /** Small base weight reflecting how common the presentation is. */
  prior?: number;
  /** Serious or non-physiotherapy pathology: support → medical review. */
  requiresMedicalReview?: boolean;
  features: { question: string; when: "yes" | "no"; weight: number }[];
  tests: { test: string; positive: number; negative: number }[];
  age?: { atLeast?: number; below?: number; weight: number }[];
}

export interface ScreeningRule extends LocalizedText {
  source: string;
}

export interface RegionKnowledge {
  region: BodyRegionId;
  questions: IntakeQuestion[];
  tests: ExamTest[];
  hypotheses: HypothesisRule[];
  screeningRules: ScreeningRule[];
}

/* ── Knee ─────────────────────────────────────────────────────────── */

const knee: RegionKnowledge = {
  region: "knee",
  questions: [
    { id: "k_squat_stairs", en: "Anterior knee pain with squatting, stairs or prolonged sitting", fa: "درد جلوی زانو هنگام اسکوات، پله یا نشستن طولانی" },
    { id: "k_gradual", en: "Gradual onset without a specific injury", fa: "شروع تدریجی بدون آسیب مشخص" },
    { id: "k_twisting", en: "Twisting injury with the foot planted", fa: "آسیب پیچشی در حالی که پا روی زمین ثابت بوده" },
    { id: "k_pop_rapid_swelling", en: "Pop at injury with rapid swelling (within ~2 hours)", fa: "صدای پاپ هنگام آسیب با تورم سریع (حدود ۲ ساعت)" },
    { id: "k_delayed_swelling", en: "Swelling developing over hours or the next day", fa: "تورمی که طی چند ساعت یا روز بعد ایجاد شده" },
    { id: "k_giving_way", en: "Episodes of giving way / instability", fa: "خالی کردن یا بی‌ثباتی زانو" },
    { id: "k_locking", en: "Locking or catching", fa: "قفل شدن یا گیر کردن زانو" },
    { id: "k_jump_load", en: "Pain at the inferior patella linked to jumping/landing load", fa: "درد زیر کشکک مرتبط با پرش و فرود" },
    { id: "k_valgus_blow", en: "Valgus blow or stress at the time of injury", fa: "ضربه یا فشار از بیرون به داخل (والگوس) هنگام آسیب" },
    { id: "k_morning_stiffness_short", en: "Morning stiffness of 30 minutes or less", fa: "خشکی صبحگاهی ۳۰ دقیقه یا کمتر" },
    { id: "k_crepitus", en: "Crepitus with active movement", fa: "صدای خرت‌خرت (کریپیتوس) هنگام حرکت" },
  ],
  tests: [
    { id: "k_lachman", en: "Lachman test", fa: "تست لاکمن", accuracy: { target: "ACL rupture", sensitivity: 0.85, specificity: 0.94, source: "Benjaminse et al., JOSPT 2006 (meta-analysis)" } },
    { id: "k_pivot_shift", en: "Pivot shift test", fa: "تست پیوت شیفت", accuracy: { target: "ACL rupture", sensitivity: 0.24, specificity: 0.98, source: "Benjaminse et al., JOSPT 2006 (meta-analysis)" } },
    { id: "k_anterior_drawer", en: "Anterior drawer test (knee)", fa: "تست کشوی قدامی زانو" },
    { id: "k_valgus_stress_30", en: "Valgus stress test at 30° flexion", fa: "تست استرس والگوس در ۳۰ درجه فلکشن" },
    { id: "k_mcmurray", en: "McMurray test", fa: "تست مک‌موری", accuracy: { target: "Meniscal tear", sensitivity: 0.7, specificity: 0.71, source: "Hegedus et al., JOSPT 2007 (meta-analysis)" } },
    { id: "k_joint_line_tenderness", en: "Joint line tenderness", fa: "حساسیت خط مفصلی در لمس", accuracy: { target: "Meniscal tear", sensitivity: 0.63, specificity: 0.77, source: "Hegedus et al., JOSPT 2007 (meta-analysis)" } },
    { id: "k_thessaly", en: "Thessaly test (20°)", fa: "تست تسالی (۲۰ درجه)" },
    { id: "k_squat_pain", en: "Pain during squatting", fa: "درد هنگام اسکوات", accuracy: { target: "Patellofemoral pain", sensitivity: 0.91, specificity: 0.5, source: "Nunes et al., Phys Ther Sport 2013 (systematic review)" } },
    { id: "k_patellar_tendon_palpation", en: "Inferior pole patellar tendon tenderness", fa: "حساسیت قطب تحتانی تاندون کشکک در لمس" },
    { id: "k_decline_squat", en: "Single-leg decline squat reproduces tendon pain", fa: "اسکوات تک‌پا روی سطح شیبدار درد تاندون را بازتولید می‌کند" },
  ],
  hypotheses: [
    {
      id: "k_pfp",
      label: { en: "Patellofemoral pain", fa: "درد پاتلوفمورال" },
      prior: 1,
      features: [
        { question: "k_squat_stairs", when: "yes", weight: 2 },
        { question: "k_gradual", when: "yes", weight: 1 },
        { question: "k_pop_rapid_swelling", when: "yes", weight: -2 },
        { question: "k_locking", when: "yes", weight: -1 },
      ],
      tests: [{ test: "k_squat_pain", positive: 1, negative: -2 }],
      age: [{ below: 40, weight: 1 }],
    },
    {
      id: "k_oa",
      label: { en: "Knee osteoarthritis", fa: "آرتروز زانو" },
      prior: 1,
      features: [
        { question: "k_morning_stiffness_short", when: "yes", weight: 2 },
        { question: "k_crepitus", when: "yes", weight: 1 },
        { question: "k_gradual", when: "yes", weight: 1 },
        { question: "k_pop_rapid_swelling", when: "yes", weight: -1 },
      ],
      tests: [],
      age: [{ atLeast: 50, weight: 2 }, { below: 40, weight: -2 }],
    },
    {
      id: "k_meniscus",
      label: { en: "Meniscal lesion", fa: "ضایعه منیسک" },
      features: [
        { question: "k_twisting", when: "yes", weight: 2 },
        { question: "k_locking", when: "yes", weight: 2 },
        { question: "k_delayed_swelling", when: "yes", weight: 1 },
      ],
      tests: [
        { test: "k_mcmurray", positive: 1, negative: -1 },
        { test: "k_joint_line_tenderness", positive: 1, negative: -1 },
        { test: "k_thessaly", positive: 1, negative: -1 },
      ],
    },
    {
      id: "k_acl",
      label: { en: "ACL injury", fa: "آسیب رباط صلیبی قدامی (ACL)" },
      features: [
        { question: "k_pop_rapid_swelling", when: "yes", weight: 3 },
        { question: "k_giving_way", when: "yes", weight: 2 },
        { question: "k_twisting", when: "yes", weight: 1 },
        { question: "k_gradual", when: "yes", weight: -2 },
      ],
      tests: [
        { test: "k_lachman", positive: 3, negative: -2 },
        { test: "k_pivot_shift", positive: 3, negative: 0 },
        { test: "k_anterior_drawer", positive: 2, negative: -1 },
      ],
    },
    {
      id: "k_mcl",
      label: { en: "Medial collateral ligament sprain", fa: "پیچ‌خوردگی رباط جانبی داخلی (MCL)" },
      features: [{ question: "k_valgus_blow", when: "yes", weight: 3 }],
      tests: [{ test: "k_valgus_stress_30", positive: 3, negative: -2 }],
    },
    {
      id: "k_patellar_tendinopathy",
      label: { en: "Patellar tendinopathy", fa: "تاندینوپاتی کشکک" },
      features: [
        { question: "k_jump_load", when: "yes", weight: 3 },
        { question: "k_gradual", when: "yes", weight: 1 },
      ],
      tests: [
        { test: "k_patellar_tendon_palpation", positive: 1, negative: -2 },
        { test: "k_decline_squat", positive: 2, negative: -1 },
      ],
    },
  ],
  screeningRules: [
    {
      en: "After acute knee trauma apply the Ottawa knee rule (age ≥55, isolated patellar tenderness, fibular head tenderness, cannot flex to 90°, cannot bear weight 4 steps) — any positive item → refer for radiography.",
      fa: "پس از ضربه حاد زانو قانون اتاوا را اجرا کنید (سن ۵۵ سال یا بیشتر، حساسیت فقط روی کشکک، حساسیت سر نازک‌نی، ناتوانی در خم کردن تا ۹۰ درجه، ناتوانی در تحمل وزن برای ۴ قدم) — هر مورد مثبت ← ارجاع برای رادیوگرافی.",
      source: "Stiell et al., JAMA 1996; Bachmann et al., Ann Intern Med 2004",
    },
  ],
};

/* ── Shoulder ─────────────────────────────────────────────────────── */

const shoulder: RegionKnowledge = {
  region: "shoulder",
  questions: [
    { id: "s_overhead", en: "Pain with overhead or reaching activities", fa: "درد با فعالیت‌های بالای سر یا دست دراز کردن" },
    { id: "s_night_lying", en: "Night pain lying on the affected side", fa: "درد شبانه هنگام خوابیدن روی شانه درگیر" },
    { id: "s_weak_lift", en: "Marked weakness lifting the arm", fa: "ضعف واضح در بالا بردن دست" },
    { id: "s_trauma", en: "Onset after a fall or trauma", fa: "شروع پس از زمین خوردن یا ضربه" },
    { id: "s_progressive_stiffness", en: "Progressive global stiffness (dressing, hand behind back)", fa: "خشکی پیشرونده در همه جهات (لباس پوشیدن، دست پشت کمر)" },
    { id: "s_diabetes_thyroid", en: "Diabetes or thyroid disease", fa: "دیابت یا بیماری تیروئید" },
    { id: "s_dislocation_history", en: "Previous dislocation/subluxation or apprehension in abduction–external rotation", fa: "سابقه دررفتگی/نیمه‌دررفتگی یا ترس در وضعیت ابداکشن–چرخش خارجی" },
    { id: "s_top_pain", en: "Pain localized to the top of the shoulder", fa: "درد محدود به روی شانه (بالای شانه)" },
    { id: "s_neck_arm_symptoms", en: "Neck pain with symptoms below the elbow or paraesthesia", fa: "گردن‌درد همراه علائم زیر آرنج یا گزگز" },
  ],
  tests: [
    { id: "s_painful_arc", en: "Painful arc", fa: "قوس دردناک", accuracy: { target: "Subacromial impingement", sensitivity: 0.74, specificity: 0.81, note: "Cluster (painful arc + Hawkins-Kennedy + resisted ER) all positive: LR+ ≈ 10.6", source: "Park et al., JBJS Am 2005" } },
    { id: "s_hawkins", en: "Hawkins-Kennedy test", fa: "تست هاوکینز-کندی", accuracy: { target: "Subacromial impingement", sensitivity: 0.72, specificity: 0.66, source: "Park et al., JBJS Am 2005" } },
    { id: "s_resisted_er", en: "Resisted external rotation: pain or weakness", fa: "چرخش خارجی مقاومتی: درد یا ضعف", accuracy: { target: "Rotator cuff pathology", sensitivity: 0.42, specificity: 0.9, note: "Painful arc + drop arm + resisted ER weakness all positive for full-thickness tear: LR+ ≈ 15.6", source: "Park et al., JBJS Am 2005" } },
    { id: "s_drop_arm", en: "Drop arm sign", fa: "علامت افتادن دست (Drop arm)" },
    { id: "s_er_lag", en: "External rotation lag sign", fa: "علامت تأخیر چرخش خارجی (ER lag)" },
    { id: "s_passive_er_loss", en: "Passive external rotation markedly restricted", fa: "محدودیت واضح چرخش خارجی پاسیو" },
    { id: "s_apprehension", en: "Apprehension test", fa: "تست اپری‌هنشن", accuracy: { target: "Anterior instability", sensitivity: 0.72, specificity: 0.96, source: "Farber et al., JBJS Am 2006" } },
    { id: "s_relocation", en: "Relocation test", fa: "تست ریلوکیشن", accuracy: { target: "Anterior instability", sensitivity: 0.81, specificity: 0.92, source: "Farber et al., JBJS Am 2006" } },
    { id: "s_cross_body", en: "Cross-body adduction test", fa: "تست اداکشن از روی بدن (Cross-body)" },
    { id: "s_acj_palpation", en: "AC joint tenderness", fa: "حساسیت مفصل آکرومیوکلاویکولار در لمس" },
    { id: "s_spurling", en: "Spurling test (cervical screen)", fa: "تست اسپرلینگ (غربالگری گردن)" },
  ],
  hypotheses: [
    {
      id: "s_rcrsp",
      label: { en: "Rotator cuff related shoulder pain (subacromial)", fa: "درد شانه مرتبط با روتاتور کاف (ساب‌آکرومیال)" },
      prior: 2,
      features: [
        { question: "s_overhead", when: "yes", weight: 2 },
        { question: "s_night_lying", when: "yes", weight: 1 },
        { question: "s_progressive_stiffness", when: "yes", weight: -1 },
      ],
      tests: [
        { test: "s_painful_arc", positive: 2, negative: -1 },
        { test: "s_hawkins", positive: 1, negative: -1 },
        { test: "s_resisted_er", positive: 1, negative: 0 },
        { test: "s_passive_er_loss", positive: -2, negative: 1 },
      ],
    },
    {
      id: "s_cuff_tear",
      label: { en: "Full-thickness rotator cuff tear", fa: "پارگی تمام‌ضخامت روتاتور کاف" },
      features: [
        { question: "s_weak_lift", when: "yes", weight: 2 },
        { question: "s_trauma", when: "yes", weight: 1 },
      ],
      tests: [
        { test: "s_er_lag", positive: 3, negative: -1 },
        { test: "s_drop_arm", positive: 2, negative: 0 },
        { test: "s_resisted_er", positive: 2, negative: -1 },
      ],
      age: [{ atLeast: 60, weight: 2 }, { below: 40, weight: -1 }],
    },
    {
      id: "s_frozen",
      label: { en: "Frozen shoulder (adhesive capsulitis)", fa: "شانه منجمد (کپسولیت چسبنده)" },
      features: [
        { question: "s_progressive_stiffness", when: "yes", weight: 2 },
        { question: "s_diabetes_thyroid", when: "yes", weight: 1 },
        { question: "s_night_lying", when: "yes", weight: 1 },
      ],
      tests: [{ test: "s_passive_er_loss", positive: 3, negative: -3 }],
      age: [{ below: 35, weight: -2 }],
    },
    {
      id: "s_instability",
      label: { en: "Anterior glenohumeral instability", fa: "بی‌ثباتی قدامی مفصل گلنوهومرال" },
      features: [{ question: "s_dislocation_history", when: "yes", weight: 3 }],
      tests: [
        { test: "s_apprehension", positive: 3, negative: -1 },
        { test: "s_relocation", positive: 2, negative: -1 },
      ],
      age: [{ below: 40, weight: 1 }],
    },
    {
      id: "s_acj",
      label: { en: "Acromioclavicular joint pain", fa: "درد مفصل آکرومیوکلاویکولار" },
      features: [
        { question: "s_top_pain", when: "yes", weight: 2 },
        { question: "s_trauma", when: "yes", weight: 1 },
      ],
      tests: [
        { test: "s_cross_body", positive: 2, negative: -1 },
        { test: "s_acj_palpation", positive: 1, negative: -2 },
      ],
    },
    {
      id: "s_cervical",
      label: { en: "Referred pain from the cervical spine", fa: "درد ارجاعی از ستون فقرات گردنی" },
      features: [{ question: "s_neck_arm_symptoms", when: "yes", weight: 3 }],
      tests: [
        { test: "s_spurling", positive: 2, negative: -1 },
        { test: "s_painful_arc", positive: -1, negative: 1 },
      ],
    },
  ],
  screeningRules: [
    {
      en: "Acute traumatic loss of active elevation after a fall (especially age >40) needs prompt imaging/orthopaedic referral to exclude acute cuff tear or dislocation.",
      fa: "از دست رفتن حاد بالا بردن فعال دست پس از زمین خوردن (به‌ویژه بالای ۴۰ سال) نیازمند تصویربرداری یا ارجاع سریع ارتوپدی برای رد پارگی حاد کاف یا دررفتگی است.",
      source: "Clinical consensus; verify against local referral pathways",
    },
  ],
};

/* ── Low back ─────────────────────────────────────────────────────── */

const lowBack: RegionKnowledge = {
  region: "low-back",
  questions: [
    { id: "lb_leg_below_knee", en: "Dominant leg pain radiating below the knee", fa: "درد غالب پا که تا زیر زانو انتشار دارد" },
    { id: "lb_dermatomal", en: "Dermatomal numbness or paraesthesia", fa: "بی‌حسی یا گزگز در مسیر درماتوم" },
    { id: "lb_cough_sneeze", en: "Leg pain worse with cough or sneeze", fa: "بدتر شدن درد پا با سرفه یا عطسه" },
    { id: "lb_walk_relief_sitting", en: "Leg symptoms with walking/standing, relieved by sitting or bending forward", fa: "علائم پا با راه رفتن/ایستادن که با نشستن یا خم شدن به جلو بهتر می‌شود" },
    { id: "lb_mechanical", en: "Pain varies with posture/movement and eases with position change", fa: "درد با وضعیت و حرکت تغییر می‌کند و با تغییر وضعیت کم می‌شود" },
    { id: "lb_below_l5", en: "Pain mainly below L5 over the PSIS/buttock, little lumbar pain", fa: "درد عمدتاً زیر L5 روی PSIS/باسن با درد کمری کم" },
    { id: "lb_inflammatory_onset", en: "Back pain began before age 45 and has lasted over 3 months", fa: "کمردرد قبل از ۴۵ سالگی شروع شده و بیش از ۳ ماه طول کشیده" },
    { id: "lb_morning_stiffness_long", en: "Morning stiffness over 30 minutes that improves with exercise, not rest", fa: "خشکی صبحگاهی بیش از ۳۰ دقیقه که با ورزش بهتر می‌شود نه با استراحت" },
    { id: "lb_night_second_half", en: "Waking from pain in the second half of the night", fa: "بیدار شدن از درد در نیمه دوم شب" },
  ],
  tests: [
    { id: "lb_slr", en: "Straight leg raise", fa: "تست بالا بردن مستقیم پا (SLR)", accuracy: { target: "Disc herniation with radiculopathy", sensitivity: 0.91, specificity: 0.26, source: "Devillé et al., Spine 2000 (meta-analysis)" } },
    { id: "lb_crossed_slr", en: "Crossed straight leg raise", fa: "SLR متقاطع", accuracy: { target: "Disc herniation with radiculopathy", sensitivity: 0.29, specificity: 0.88, source: "Devillé et al., Spine 2000 (meta-analysis)" } },
    { id: "lb_slump", en: "Slump test", fa: "تست اسلامپ", accuracy: { target: "Lumbar disc herniation", sensitivity: 0.84, specificity: 0.83, source: "Majlesi et al., J Clin Rheumatol 2008" } },
    { id: "lb_neuro_deficit", en: "Myotomal/dermatomal/reflex deficit matching one root", fa: "نقص میوتوم/درماتوم/رفلکس منطبق با یک ریشه" },
    { id: "lb_sij_cluster", en: "SIJ provocation cluster (≥3 of 5 positive)", fa: "کلاستر تحریک مفصل ساکروایلیاک (۳ از ۵ مثبت)", accuracy: { target: "SIJ pain (diagnostic block)", sensitivity: 0.91, specificity: 0.78, source: "Laslett et al., Man Ther 2005" } },
    { id: "lb_centralisation", en: "Centralisation with repeated movements", fa: "مرکزی شدن علائم با حرکات تکراری" },
  ],
  hypotheses: [
    {
      id: "lb_nonspecific",
      label: { en: "Non-specific (mechanical) low back pain", fa: "کمردرد غیراختصاصی (مکانیکی)" },
      prior: 2,
      features: [
        { question: "lb_mechanical", when: "yes", weight: 1 },
        { question: "lb_leg_below_knee", when: "yes", weight: -2 },
        { question: "lb_morning_stiffness_long", when: "yes", weight: -1 },
      ],
      tests: [
        { test: "lb_centralisation", positive: 1, negative: 0 },
        { test: "lb_neuro_deficit", positive: -2, negative: 1 },
      ],
    },
    {
      id: "lb_radiculopathy",
      label: { en: "Lumbar radiculopathy (nerve root)", fa: "رادیکولوپاتی کمری (درگیری ریشه عصبی)" },
      features: [
        { question: "lb_leg_below_knee", when: "yes", weight: 3 },
        { question: "lb_dermatomal", when: "yes", weight: 2 },
        { question: "lb_cough_sneeze", when: "yes", weight: 1 },
      ],
      tests: [
        { test: "lb_slr", positive: 1, negative: -3 },
        { test: "lb_crossed_slr", positive: 3, negative: 0 },
        { test: "lb_slump", positive: 2, negative: -2 },
        { test: "lb_neuro_deficit", positive: 3, negative: -1 },
      ],
    },
    {
      id: "lb_stenosis",
      label: { en: "Lumbar spinal stenosis (neurogenic claudication)", fa: "تنگی کانال نخاعی کمری (لنگش نوروژنیک)" },
      features: [
        { question: "lb_walk_relief_sitting", when: "yes", weight: 3 },
        { question: "lb_leg_below_knee", when: "yes", weight: 1 },
      ],
      tests: [{ test: "lb_slr", positive: -1, negative: 1 }],
      age: [{ atLeast: 60, weight: 2 }, { below: 45, weight: -2 }],
    },
    {
      id: "lb_sij",
      label: { en: "Sacroiliac joint pain", fa: "درد مفصل ساکروایلیاک" },
      features: [{ question: "lb_below_l5", when: "yes", weight: 2 }],
      tests: [{ test: "lb_sij_cluster", positive: 3, negative: -3 }],
    },
    {
      id: "lb_axspa",
      label: { en: "Inflammatory back pain (possible axial spondyloarthritis)", fa: "کمردرد التهابی (احتمال اسپوندیلوآرتریت محوری)" },
      prior: -1,
      requiresMedicalReview: true,
      features: [
        { question: "lb_inflammatory_onset", when: "yes", weight: 2 },
        { question: "lb_morning_stiffness_long", when: "yes", weight: 2 },
        { question: "lb_night_second_half", when: "yes", weight: 2 },
        { question: "lb_mechanical", when: "yes", weight: -1 },
      ],
      tests: [],
    },
  ],
  screeningRules: [
    {
      en: "Complete the structured red-flag screen (cauda equina, malignancy, infection, fracture) before treatment; any positive item follows the escalation pathway.",
      fa: "پیش از درمان غربالگری ساختاریافته پرچم قرمز (دم اسب، بدخیمی، عفونت، شکستگی) را کامل کنید؛ هر مورد مثبت طبق مسیر ارجاع پیگیری شود.",
      source: "NICE NG59; Finucane et al., JOSPT 2020 (international red-flag framework)",
    },
  ],
};

/* ── Neck ─────────────────────────────────────────────────────────── */

const neck: RegionKnowledge = {
  region: "neck",
  questions: [
    { id: "n_posture", en: "Pain related to sustained posture / screen time", fa: "درد مرتبط با وضعیت ثابت طولانی / کار با صفحه نمایش" },
    { id: "n_arm_paraesthesia", en: "Arm pain or paraesthesia in a dermatomal pattern", fa: "درد یا گزگز بازو در مسیر درماتوم" },
    { id: "n_headache", en: "Unilateral headache provoked by neck movement or sustained posture", fa: "سردرد یک‌طرفه که با حرکت گردن یا وضعیت ثابت تحریک می‌شود" },
    { id: "n_whiplash", en: "Onset after a motor-vehicle collision (whiplash)", fa: "شروع پس از تصادف خودرو (ویپلش)" },
    { id: "n_clumsy_gait", en: "Hand clumsiness, balance or gait disturbance", fa: "بی‌مهارتی دست‌ها، اختلال تعادل یا راه رفتن" },
    { id: "n_bilateral", en: "Bilateral arm symptoms", fa: "علائم دوطرفه در دست‌ها" },
  ],
  tests: [
    { id: "n_spurling", en: "Spurling test", fa: "تست اسپرلینگ", accuracy: { target: "Cervical radiculopathy", sensitivity: 0.5, specificity: 0.86, note: "Wainner cluster (ULTT-A, distraction, Spurling, ipsilateral rotation <60°): 4/4 positive LR+ ≈ 30", source: "Wainner et al., Spine 2003" } },
    { id: "n_distraction", en: "Cervical distraction test", fa: "تست دیستراکشن گردنی", accuracy: { target: "Cervical radiculopathy", sensitivity: 0.44, specificity: 0.9, source: "Wainner et al., Spine 2003" } },
    { id: "n_ultt_a", en: "Upper limb tension test A (median)", fa: "تست کشش اندام فوقانی A (مدیان)", accuracy: { target: "Cervical radiculopathy", sensitivity: 0.97, specificity: 0.22, source: "Wainner et al., Spine 2003" } },
    { id: "n_rotation_lt_60", en: "Ipsilateral cervical rotation below 60°", fa: "چرخش گردن به سمت درگیر کمتر از ۶۰ درجه" },
    { id: "n_cfrt", en: "Cervical flexion-rotation test", fa: "تست فلکشن-روتیشن گردن", accuracy: { target: "Cervicogenic headache (C1–2)", sensitivity: 0.7, specificity: 0.7, source: "Hall et al., JOSPT 2010" } },
    { id: "n_hoffmann", en: "Hoffmann sign", fa: "علامت هافمن" },
    { id: "n_babinski", en: "Babinski sign", fa: "علامت بابینسکی" },
    { id: "n_inverted_supinator", en: "Inverted supinator sign", fa: "علامت سوپیناتور معکوس" },
    { id: "n_gait_deviation", en: "Observed gait deviation", fa: "انحراف مشاهده‌شده در راه رفتن" },
  ],
  hypotheses: [
    {
      id: "n_mechanical",
      label: { en: "Mechanical neck pain", fa: "گردن‌درد مکانیکی" },
      prior: 2,
      features: [
        { question: "n_posture", when: "yes", weight: 1 },
        { question: "n_arm_paraesthesia", when: "yes", weight: -2 },
        { question: "n_clumsy_gait", when: "yes", weight: -2 },
      ],
      tests: [],
    },
    {
      id: "n_radiculopathy",
      label: { en: "Cervical radiculopathy", fa: "رادیکولوپاتی گردنی" },
      features: [{ question: "n_arm_paraesthesia", when: "yes", weight: 3 }],
      tests: [
        { test: "n_spurling", positive: 2, negative: -1 },
        { test: "n_distraction", positive: 2, negative: 0 },
        { test: "n_ultt_a", positive: 1, negative: -3 },
        { test: "n_rotation_lt_60", positive: 1, negative: 0 },
      ],
    },
    {
      id: "n_cgh",
      label: { en: "Cervicogenic headache", fa: "سردرد با منشأ گردنی" },
      features: [{ question: "n_headache", when: "yes", weight: 3 }],
      tests: [{ test: "n_cfrt", positive: 2, negative: -2 }],
    },
    {
      id: "n_wad",
      label: { en: "Whiplash-associated disorder", fa: "اختلال مرتبط با ویپلش" },
      features: [{ question: "n_whiplash", when: "yes", weight: 3 }],
      tests: [],
    },
    {
      id: "n_myelopathy",
      label: { en: "Possible cervical myelopathy", fa: "احتمال میلوپاتی گردنی" },
      prior: -1,
      requiresMedicalReview: true,
      features: [
        { question: "n_clumsy_gait", when: "yes", weight: 3 },
        { question: "n_bilateral", when: "yes", weight: 2 },
      ],
      tests: [
        { test: "n_hoffmann", positive: 2, negative: 0 },
        { test: "n_babinski", positive: 2, negative: 0 },
        { test: "n_inverted_supinator", positive: 2, negative: 0 },
        { test: "n_gait_deviation", positive: 2, negative: 0 },
      ],
      age: [{ atLeast: 45, weight: 1 }],
    },
  ],
  screeningRules: [
    {
      en: "Screen for cervical arterial dysfunction (dizziness, diplopia, dysarthria, dysphagia, drop attacks, nystagmus, nausea, numbness) and upper cervical instability before manual therapy.",
      fa: "پیش از درمان دستی، اختلال شریانی گردن (سرگیجه، دوبینی، اختلال تکلم، اختلال بلع، افتادن ناگهانی، نیستاگموس، تهوع، بی‌حسی) و بی‌ثباتی فوقانی گردن را غربال کنید.",
      source: "IFOMPT cervical framework (Rushton et al., 2020/2023)",
    },
    {
      en: "Myelopathy cluster: ≥3 of gait deviation, Hoffmann, inverted supinator, Babinski, age >45 → LR+ ≈ 30; refer for medical assessment.",
      fa: "کلاستر میلوپاتی: حداقل ۳ مورد از انحراف راه رفتن، هافمن، سوپیناتور معکوس، بابینسکی، سن بالای ۴۵ ← LR+ حدود ۳۰؛ ارجاع برای ارزیابی پزشکی.",
      source: "Cook et al., JOSPT 2010",
    },
  ],
};

/* ── Hip ──────────────────────────────────────────────────────────── */

const hip: RegionKnowledge = {
  region: "hip",
  questions: [
    { id: "h_groin", en: "Groin or anterior hip pain", fa: "درد کشاله ران یا جلوی لگن" },
    { id: "h_lateral_lying", en: "Lateral hip pain, worse lying on the side", fa: "درد کنار لگن که با خوابیدن به پهلو بدتر می‌شود" },
    { id: "h_stairs_single_leg", en: "Lateral pain climbing stairs or standing on one leg", fa: "درد کناری هنگام بالا رفتن از پله یا ایستادن روی یک پا" },
    { id: "h_morning_stiffness_short", en: "Morning stiffness of 60 minutes or less", fa: "خشکی صبحگاهی ۶۰ دقیقه یا کمتر" },
    { id: "h_squat_aggravates", en: "Squatting aggravates the pain", fa: "اسکوات درد را تشدید می‌کند" },
    { id: "h_young_active", en: "Young, active; pain in deep flexion or pivoting", fa: "فرد جوان و فعال؛ درد در فلکشن عمیق یا چرخش" },
    { id: "h_back_leg", en: "Low back pain with leg symptoms", fa: "کمردرد همراه علائم پا" },
    { id: "h_runner_load", en: "Rapid training-load increase with groin pain on weight bearing", fa: "افزایش سریع حجم تمرین با درد کشاله هنگام تحمل وزن" },
  ],
  tests: [
    { id: "h_ir_restricted", en: "Passive internal rotation restricted (<15° or clearly reduced)", fa: "محدودیت چرخش داخلی پاسیو (کمتر از ۱۵ درجه یا کاهش واضح)" },
    { id: "h_flexion_restricted", en: "Hip flexion restricted (≤115°)", fa: "محدودیت فلکشن ران (۱۱۵ درجه یا کمتر)" },
    { id: "h_scour", en: "Scour test reproduces pain", fa: "تست اسکور درد را بازتولید می‌کند", accuracy: { target: "Hip osteoarthritis", note: "Cluster of 5 (squatting aggravates, active flexion lateral pain, scour with adduction pain, active extension pain, IR ≤25°): ≥4 positive LR+ ≈ 24", source: "Sutlive et al., JOSPT 2008" } },
    { id: "h_fadir", en: "FADIR test", fa: "تست FADIR", accuracy: { target: "FAI syndrome / labral pathology", sensitivity: 0.94, specificity: 0.09, source: "Reiman et al., Br J Sports Med 2015 (systematic review)" } },
    { id: "h_gt_palpation", en: "Greater trochanter tenderness", fa: "حساسیت تروکانتر بزرگ در لمس", accuracy: { target: "Gluteal tendinopathy (MRI)", sensitivity: 0.8, specificity: 0.47, source: "Grimaldi et al., Am J Sports Med 2017" } },
    { id: "h_sls30", en: "Lateral pain within 30 s single-leg stance", fa: "درد کناری در ایستادن ۳۰ ثانیه روی یک پا" },
    { id: "h_resisted_abduction", en: "Resisted abduction reproduces lateral pain", fa: "ابداکشن مقاومتی درد کناری را بازتولید می‌کند" },
    { id: "h_lumbar_screen", en: "Lumbar screen reproduces the hip/leg pain", fa: "غربالگری کمر درد ران/پا را بازتولید می‌کند" },
    { id: "h_hop_pain", en: "Pain with hopping on the affected leg", fa: "درد با لی‌لی روی پای درگیر" },
  ],
  hypotheses: [
    {
      id: "h_oa",
      label: { en: "Hip osteoarthritis", fa: "آرتروز لگن (هیپ)" },
      prior: 1,
      features: [
        { question: "h_groin", when: "yes", weight: 1 },
        { question: "h_morning_stiffness_short", when: "yes", weight: 1 },
        { question: "h_squat_aggravates", when: "yes", weight: 1 },
      ],
      tests: [
        { test: "h_ir_restricted", positive: 2, negative: -2 },
        { test: "h_flexion_restricted", positive: 1, negative: -1 },
        { test: "h_scour", positive: 1, negative: -1 },
      ],
      age: [{ atLeast: 50, weight: 2 }, { below: 40, weight: -2 }],
    },
    {
      id: "h_gtps",
      label: { en: "Gluteal tendinopathy (greater trochanteric pain)", fa: "تاندینوپاتی گلوتئال (درد تروکانتر بزرگ)" },
      prior: 1,
      features: [
        { question: "h_lateral_lying", when: "yes", weight: 3 },
        { question: "h_stairs_single_leg", when: "yes", weight: 1 },
        { question: "h_groin", when: "yes", weight: -1 },
      ],
      tests: [
        { test: "h_gt_palpation", positive: 1, negative: -2 },
        { test: "h_sls30", positive: 2, negative: -1 },
        { test: "h_resisted_abduction", positive: 1, negative: 0 },
      ],
    },
    {
      id: "h_fai",
      label: { en: "FAI syndrome / labral pathology", fa: "سندرم گیرافتادگی فموروستابولار / ضایعه لابروم" },
      features: [
        { question: "h_young_active", when: "yes", weight: 2 },
        { question: "h_groin", when: "yes", weight: 2 },
      ],
      tests: [{ test: "h_fadir", positive: 1, negative: -3 }],
      age: [{ atLeast: 50, weight: -1 }],
    },
    {
      id: "h_lumbar",
      label: { en: "Referred pain from the lumbar spine", fa: "درد ارجاعی از ستون فقرات کمری" },
      features: [{ question: "h_back_leg", when: "yes", weight: 3 }],
      tests: [{ test: "h_lumbar_screen", positive: 2, negative: -2 }],
    },
    {
      id: "h_stress_fracture",
      label: { en: "Possible femoral neck stress fracture", fa: "احتمال شکستگی استرسی گردن فمور" },
      prior: -1,
      requiresMedicalReview: true,
      features: [{ question: "h_runner_load", when: "yes", weight: 3 }],
      tests: [{ test: "h_hop_pain", positive: 2, negative: -1 }],
    },
  ],
  screeningRules: [
    {
      en: "Groin pain on weight bearing after a load increase (runners, military) — stop loading and refer for imaging to exclude a femoral neck stress fracture.",
      fa: "درد کشاله هنگام تحمل وزن پس از افزایش بار تمرین (دوندگان، نظامیان) — بارگذاری را متوقف و برای رد شکستگی استرسی گردن فمور جهت تصویربرداری ارجاع دهید.",
      source: "Clinical consensus; verify against local referral pathways",
    },
  ],
};

/* ── Ankle & foot ─────────────────────────────────────────────────── */

const ankleFoot: RegionKnowledge = {
  region: "ankle-foot",
  questions: [
    { id: "a_inversion", en: "Inversion (rolling over) injury", fa: "آسیب اینورژن (پیچ خوردن مچ به بیرون)" },
    { id: "a_external_rotation", en: "External rotation / forced dorsiflexion injury", fa: "آسیب چرخش خارجی / دورسی‌فلکشن اجباری" },
    { id: "a_lateral_swelling", en: "Lateral swelling or bruising", fa: "تورم یا کبودی سمت خارج مچ" },
    { id: "a_calf_pop", en: "Sudden 'kicked in the calf' pain or pop with push-off weakness", fa: "درد ناگهانی «انگار به پشت ساق لگد خورده» یا صدای پاپ با ضعف در هل دادن" },
    { id: "a_achilles_load", en: "Gradual Achilles pain with running/jumping and morning stiffness", fa: "درد تدریجی آشیل با دویدن/پرش و خشکی صبحگاهی" },
    { id: "a_first_step_heel", en: "First-step heel pain in the morning", fa: "درد کف پاشنه در اولین قدم‌های صبح" },
  ],
  tests: [
    { id: "a_anterior_drawer", en: "Anterior drawer test (ankle)", fa: "تست کشوی قدامی مچ پا" },
    { id: "a_atfl_palpation", en: "ATFL tenderness", fa: "حساسیت رباط ATFL در لمس" },
    { id: "a_squeeze", en: "Squeeze test (syndesmosis)", fa: "تست فشردن (سیندسموز)" },
    { id: "a_er_test", en: "External rotation stress test (syndesmosis)", fa: "تست استرس چرخش خارجی (سیندسموز)" },
    { id: "a_syndesmosis_palpation", en: "Anterior syndesmosis tenderness", fa: "حساسیت سیندسموز قدامی در لمس" },
    { id: "a_thompson", en: "Thompson (calf squeeze) test", fa: "تست تامپسون (فشردن ساق)", accuracy: { target: "Achilles tendon rupture", sensitivity: 0.96, specificity: 0.93, source: "Maffulli, Am J Sports Med 1998" } },
    { id: "a_achilles_palpation", en: "Mid-portion Achilles tenderness (2–6 cm above insertion)", fa: "حساسیت بخش میانی آشیل (۲ تا ۶ سانتی‌متر بالای محل اتصال)" },
    { id: "a_windlass", en: "Windlass test", fa: "تست ویندلس", accuracy: { target: "Plantar fasciopathy", sensitivity: 0.32, specificity: 1, source: "De Garceau et al., Foot Ankle Int 2003" } },
    { id: "a_heel_palpation", en: "Medial calcaneal tubercle tenderness", fa: "حساسیت برجستگی داخلی پاشنه در لمس" },
  ],
  hypotheses: [
    {
      id: "a_lateral_sprain",
      label: { en: "Lateral ankle ligament sprain", fa: "پیچ‌خوردگی رباط‌های خارجی مچ پا" },
      prior: 1,
      features: [
        { question: "a_inversion", when: "yes", weight: 3 },
        { question: "a_lateral_swelling", when: "yes", weight: 1 },
      ],
      tests: [
        { test: "a_anterior_drawer", positive: 2, negative: -2 },
        { test: "a_atfl_palpation", positive: 1, negative: -2 },
      ],
    },
    {
      id: "a_syndesmosis",
      label: { en: "Syndesmosis (high ankle) sprain", fa: "پیچ‌خوردگی سیندسموز (پیچ‌خوردگی بالای مچ)" },
      features: [{ question: "a_external_rotation", when: "yes", weight: 3 }],
      tests: [
        { test: "a_squeeze", positive: 2, negative: 0 },
        { test: "a_er_test", positive: 2, negative: 0 },
        { test: "a_syndesmosis_palpation", positive: 1, negative: -2 },
      ],
    },
    {
      id: "a_achilles_tendinopathy",
      label: { en: "Achilles tendinopathy", fa: "تاندینوپاتی آشیل" },
      features: [{ question: "a_achilles_load", when: "yes", weight: 3 }],
      tests: [{ test: "a_achilles_palpation", positive: 2, negative: -1 }],
    },
    {
      id: "a_achilles_rupture",
      label: { en: "Achilles tendon rupture", fa: "پارگی تاندون آشیل" },
      requiresMedicalReview: true,
      features: [{ question: "a_calf_pop", when: "yes", weight: 3 }],
      tests: [{ test: "a_thompson", positive: 3, negative: -3 }],
    },
    {
      id: "a_plantar_heel",
      label: { en: "Plantar heel pain (plantar fasciopathy)", fa: "درد کف پاشنه (فاشیوپاتی پلانتار)" },
      features: [{ question: "a_first_step_heel", when: "yes", weight: 3 }],
      tests: [
        { test: "a_windlass", positive: 2, negative: 0 },
        { test: "a_heel_palpation", positive: 2, negative: -2 },
      ],
    },
  ],
  screeningRules: [
    {
      en: "Apply the Ottawa ankle and foot rules after acute injury (bone tenderness at the posterior malleolar edge/tip, navicular or 5th metatarsal base, or inability to bear weight 4 steps) → refer for radiography.",
      fa: "پس از آسیب حاد، قوانین اتاوای مچ و پا را اجرا کنید (حساسیت استخوانی در لبه/نوک خلفی قوزک، استخوان ناویکولار یا قاعده متاتارس پنجم، یا ناتوانی در تحمل وزن برای ۴ قدم) ← ارجاع برای رادیوگرافی.",
      source: "Stiell et al., JAMA 1993; Bachmann et al., BMJ 2003",
    },
  ],
};

export const regionKnowledge: Partial<Record<BodyRegionId, RegionKnowledge>> = {
  knee,
  shoulder,
  "low-back": lowBack,
  neck,
  hip,
  "ankle-foot": ankleFoot,
};

export function getRegionKnowledge(
  region: BodyRegionId | null | undefined
): RegionKnowledge | undefined {
  return region ? regionKnowledge[region] : undefined;
}
