import type {
  ClinicalReasoning,
  Patient,
  PatientCase,
  TreatmentPlan,
  TreatmentPlanInput,
} from "@/lib/types";
import { getRegion } from "@/lib/data/bodyRegions";
import type { ExerciseFa } from "@/lib/data/exerciseFa";

/*
 * ─────────────────────────────────────────────────────────────
 *  MOCK AI ENGINE
 *  These functions produce structured, clinically-flavoured output
 *  from local heuristics so the UI is fully usable without a backend.
 *
 *  🔌 REAL AI API INTEGRATION POINT
 *  Replace each function body with a call to your AI provider
 *  (e.g. the Claude Messages API). Send the structured case/input as
 *  context and ask the model to return JSON matching the return type.
 *  Keep the function signatures identical so the UI needs no changes.
 * ─────────────────────────────────────────────────────────────
 */

/** Simulate async latency so loading states are exercised. */
export function delay<T>(value: T, ms = 700): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

const RED_FLAG_KEYWORDS: { pattern: RegExp; message: string }[] = [
  { pattern: /weight loss|cancer|tumou?r|malignan/i, message: "History/features suggestive of malignancy — screen carefully and consider referral." },
  { pattern: /night pain|constant pain|unremitting/i, message: "Constant/night pain reported — screen for serious pathology." },
  { pattern: /fever|infection|chills/i, message: "Possible infective features — screen and refer if indicated." },
  { pattern: /bladder|bowel|saddle|incontinen/i, message: "Possible cauda equina features — urgent medical referral if present." },
  { pattern: /trauma|fall|accident|fracture/i, message: "Significant trauma — consider fracture screening/imaging." },
  { pattern: /chest pain|short(ness)? of breath|palpitation/i, message: "Cardiorespiratory symptoms — screen and refer if indicated." },
  { pattern: /calf|dvt|clot|swollen leg/i, message: "Possible DVT features — screen (e.g. Wells) and refer urgently if suspected." },
];

/** Generate structured clinical reasoning from a patient case. */
export function buildReasoning(c: PatientCase): ClinicalReasoning {
  const region = c.region ? getRegion(c.region) : undefined;

  const subjective = [
    c.mainComplaint && `Main complaint: ${c.mainComplaint}.`,
    c.painLocation && `Pain located at ${c.painLocation}, intensity ${c.painIntensity}/10.`,
    c.duration && `Symptom duration: ${c.duration}.`,
    c.mechanism && `Mechanism/onset: ${c.mechanism}.`,
    c.aggravating && `Aggravated by: ${c.aggravating}.`,
    c.easing && `Eased by: ${c.easing}.`,
    c.functionalLimitations && `Functional limitations: ${c.functionalLimitations}.`,
    c.patientGoal && `Patient goal: ${c.patientGoal}.`,
  ].filter(Boolean) as string[];

  const objective = [
    "To be completed on examination:",
    ...(region?.functionalTests.map((t) => `Functional test — ${t}.`) ?? []),
    "Observation, palpation and neurological screen as indicated.",
  ];

  const hypotheses = region
    ? region.commonConditions.map(
        (cond) => `Possible: ${cond} (confirm on examination).`
      )
    : ["Select a body region to generate region-specific hypotheses."];

  const differentials = region
    ? [
        `Consider referred pain and adjacent joints for ${region.label.toLowerCase()}.`,
        "Consider systemic or non-musculoskeletal contributors.",
        "Consider pain mechanism: nociceptive vs neuropathic vs nociplastic.",
      ]
    : ["Add region and history detail to refine differentials."];

  const yellowFlags: string[] = [];
  if (c.painIntensity >= 7) yellowFlags.push("High reported pain intensity — assess distress and beliefs.");
  if (/(work|job|sitting at work)/i.test(c.functionalLimitations)) yellowFlags.push("Work-related limitation — explore fear of movement and workplace factors.");
  if (/(chronic|months|weeks)/i.test(c.duration) && c.painIntensity >= 5) yellowFlags.push("Persistent symptoms — screen for unhelpful beliefs and low activity.");
  if (yellowFlags.length === 0) yellowFlags.push("No obvious psychosocial flags from the intake — confirm in interview.");

  const redFlags: string[] = [];
  const haystack = [
    c.mainComplaint, c.mechanism, c.medicalHistory, c.surgicalHistory,
    c.medications, c.functionalLimitations, c.imaging, c.aggravating,
  ].join(" ");
  for (const rf of RED_FLAG_KEYWORDS) {
    if (rf.pattern.test(haystack)) redFlags.push(rf.message);
  }
  if (redFlags.length === 0) redFlags.push("No red flags detected from the intake text — complete a full safety screen to confirm.");

  const missingInfo = [
    !c.imaging || /not performed|none/i.test(c.imaging) ? "Any imaging results, if available." : null,
    "24-hour symptom behaviour (morning vs evening).",
    "Neurological symptoms (pins & needles, weakness, numbness).",
    "General health, red-flag screening questions, and medications review.",
    "Previous episodes and response to prior treatment.",
  ].filter(Boolean) as string[];

  const suggestedTests = region?.specialTests ?? [
    "Region-specific special tests once a region is selected.",
  ];

  const outcomeMeasures = pickOutcomeMeasures(c);

  return {
    subjective,
    objective,
    hypotheses,
    differentials,
    yellowFlags,
    redFlags,
    missingInfo,
    suggestedTests,
    outcomeMeasures,
  };
}

function pickOutcomeMeasures(c: PatientCase): string[] {
  const common = ["Numeric Pain Rating Scale (NPRS)", "Patient-Specific Functional Scale (PSFS)"];
  const byRegion: Record<string, string[]> = {
    "low-back": ["Oswestry Disability Index", "Roland-Morris Questionnaire", "STarT Back tool"],
    neck: ["Neck Disability Index"],
    shoulder: ["SPADI", "QuickDASH"],
    knee: ["KOOS", "Lower Extremity Functional Scale"],
    hip: ["HOOS", "Lower Extremity Functional Scale"],
    "ankle-foot": ["FAAM", "Lower Extremity Functional Scale"],
    "post-op": ["Lower Extremity Functional Scale", "Timed Up and Go"],
    neuro: ["Berg Balance Scale", "Timed Up and Go", "10-metre walk test"],
    sports: ["Lower Extremity Functional Scale", "Hop test battery"],
  };
  return [...common, ...(c.region ? byRegion[c.region] ?? [] : [])];
}

/** Generate a structured treatment plan from planner inputs. */
export function buildTreatmentPlan(input: TreatmentPlanInput): TreatmentPlan {
  const region = getRegion(input.region);
  const acute = input.stage === "acute" || input.irritability === "high";
  const postOp = input.stage === "post-op";

  const manualTherapy = acute
    ? ["Gentle soft-tissue techniques for pain relief", "Grade I–II joint mobilisation as tolerated"]
    : ["Grade III–IV mobilisation to restore range", "Soft-tissue work as an adjunct to exercise"];

  const exerciseTherapy = acute
    ? ["Low-load, pain-guided movement", "Isometrics for early loading", "Frequent short sessions"]
    : ["Progressive resistance loading", "Higher intensity as irritability lowers", "Fewer, longer sessions"];

  const mobility = region?.exerciseSuggestions.slice(0, 2) ?? ["Region-appropriate mobility drills"];
  const strengthening = postOp
    ? ["Isometric activation of key muscles", "Progress to open/closed chain per protocol"]
    : ["Target the main impairment: " + (input.mainImpairment || "identified weakness"), "Progressive overload 2–3×/week"];

  const motorControl = ["Task-specific control drills", "Quality-of-movement retraining", "Breathing and relaxation as needed"];
  const balance = ["Static balance progressing to dynamic", "Proprioception drills", "Perturbation training in later stages"];

  const education = [
    ...(region?.educationPoints.slice(0, 2) ?? []),
    "Explain expected timeline and the role of active rehab.",
    input.painSeverity >= 6 ? "Pain-science education: hurt does not always equal harm." : "Reassure and encourage graded activity.",
  ];

  const homeProgram = [
    "3–5 key exercises, clearly demonstrated.",
    "Guidance on acceptable pain during/after (e.g. ≤ 3/10, settling within 24h).",
    "A simple log to track adherence and progress.",
  ];

  const frequency = acute
    ? "2–3 sessions/week initially, daily gentle home exercises."
    : "1–2 sessions/week with a progressive home program.";

  const progression = [
    "Progress when pain and irritability allow (use the 24-hour response rule).",
    "Increase load/complexity before volume.",
    input.stage === "return-to-sport"
      ? "Use objective return-to-sport criteria before progressing to sport."
      : "Re-assess outcome measures every 2–3 weeks.",
  ];

  return {
    manualTherapy, exerciseTherapy, mobility, strengthening,
    motorControl, balance, education, homeProgram, frequency, progression,
  };
}

/** Generate a plain-language patient education handout. */
export function buildEducation(c: PatientCase): {
  problem: string;
  avoid: string[];
  exercises: string[];
  contact: string[];
  homeAdvice: string[];
} {
  const region = c.region ? getRegion(c.region) : undefined;
  const area = c.painLocation || region?.label.toLowerCase() || "the affected area";

  return {
    problem: `You have pain around ${area}${c.duration ? ` that has lasted about ${c.duration}` : ""}. In most cases this kind of problem is not dangerous and improves with the right activity and a gradual plan. Your therapist will confirm the cause with a hands-on examination.`,
    avoid: [
      c.aggravating ? `For now, limit activities that clearly flare it up (e.g. ${c.aggravating}).` : "Limit activities that clearly flare up your pain for now.",
      "Avoid complete rest — gentle movement usually helps.",
      "Avoid pushing into sharp or worsening pain.",
    ],
    exercises: region?.exerciseSuggestions.slice(0, 3).map((e) => `${e} — as guided by your therapist.`) ?? [
      "Gentle, pain-guided movement of the area.",
      "General walking within comfort.",
    ],
    contact: [
      "Contact your therapist if pain rapidly worsens or new symptoms appear.",
      "Seek urgent medical care for: loss of bladder/bowel control, numbness around the groin, severe unexplained pain, chest pain, or a swollen, painful calf.",
    ],
    homeAdvice: [
      "Keep moving little and often through the day.",
      "Use heat or ice for short-term comfort if it helps.",
      "Pace activity — gradually do a bit more each week.",
      "Prioritise good sleep and general activity.",
    ],
  };
}

/*
 * 🔌 REAL AI API INTEGRATION POINT (chat)
 * Replace this keyword responder with a streaming call to your AI
 * provider. Pass the active case as context (see `caseContext`) plus
 * the conversation history, and return the assistant text.
 */
export function buildChatReply(question: string, caseContext?: PatientCase): string {
  const q = question.toLowerCase();
  const ctx = caseContext
    ? `Considering ${caseContext.name || "this patient"} (${caseContext.region ?? "unspecified region"}, pain ${caseContext.painIntensity}/10): `
    : "";

  if (/red flag/.test(q)) {
    return `${ctx}Key red flags in low back pain include: saddle anaesthesia, bladder/bowel dysfunction, progressive neurological deficit, significant trauma, features of malignancy (history of cancer, unexplained weight loss, constant night pain), and infection signs (fever). If any are present, refer for urgent medical assessment. This is decision-support only — confirm clinically.`;
  }
  if (/test/.test(q)) {
    const region = caseContext?.region ? getRegion(caseContext.region) : undefined;
    if (region) return `${ctx}Suggested tests for ${region.label}: ${region.specialTests.join(", ")}. Combine with a neurological screen and functional tests, and interpret in the context of the full history.`;
    return `${ctx}Choose tests based on the region and hypotheses: a neurological screen, relevant special tests, and functional tests. Tell me the region for a specific list.`;
  }
  if (/tka|knee replacement|after surgery|post.?op/.test(q)) {
    return `${ctx}Safe early exercises after TKA typically include ankle pumps, quad sets, assisted heel slides for flexion ROM, and short-arc quads — always within the surgeon's protocol and weight-bearing status. Manage swelling with elevation and ice, and progress load gradually. Confirm precautions with the operating team.`;
  }
  if (/osteoarthritis|oa\b|knee oa/.test(q)) {
    return `${ctx}For knee osteoarthritis, exercise therapy is first-line: quadriceps and hip strengthening, aerobic activity, and education. Progress load gradually; some discomfort during exercise that settles is acceptable. Weight management helps where relevant.`;
  }
  if (/progress/.test(q)) {
    return `${ctx}Progress using the 24-hour response rule: if symptoms settle within a day and control is good, increase load or complexity before volume. Re-check outcome measures every 2–3 weeks and progress toward the patient's functional goal.`;
  }
  if (/treatment plan|plan for/.test(q)) {
    return `${ctx}A structured plan combines: manual therapy (adjunct), progressive exercise therapy, mobility, strengthening, motor control, balance, education, and a focused home program. Match the intensity to stage and irritability. Use the Treatment Planner to generate a full plan.`;
  }
  return `${ctx}I can help with assessment, clinical reasoning, tests, treatment planning, exercise selection, and progression. Try asking about red flags, suitable tests, a treatment plan for a specific condition, or how to progress a patient. Remember this is decision-support only — confirm findings with clinical examination.`;
}

/*
 * ── Patient portal AI (Persian) ─────────────────────────────────
 *
 * 🔌 REAL AI API INTEGRATION POINT (patient chat)
 * Replace this keyword responder with a call to your AI provider.
 * Pass the patient's prescribed program + the Persian exercise content
 * as context and instruct the model to answer in simple Persian,
 * never diagnose, and route safety issues to the therapist.
 */
export function buildPatientChatReply(
  question: string,
  patient: Patient,
  faContent: Record<string, ExerciseFa>
): string {
  const q = question.replace(/[‌\s]+/g, " ").toLowerCase();

  // 1) Safety first: pain / worrying symptoms → guidance + ticket nudge.
  if (/(درد|ورم|تورم|گزگز|بی[\s‌]?حس|سوزش)/.test(q)) {
    return (
      "توضیح شما ثبت شد. 🌡 اگر هنگام تمرین درد تیز، ورم جدید، گزگز یا بی‌حسی دارید، همان تمرین را فعلاً متوقف کنید و ادامه ندهید.\n\n" +
      "پیشنهاد می‌کنم از بخش «تیکت‌ها» یک تیکت برای فیزیوتراپیست خود ثبت کنید و بنویسید کدام تمرین و کدام قسمت بدن بود تا برنامه‌تان بررسی و در صورت نیاز اصلاح شود.\n\n" +
      "⚠️ اگر درد شدید و ناگهانی، تب، یا از دست دادن کنترل ادرار/مدفوع دارید، همین امروز با پزشک تماس بگیرید یا به اورژانس مراجعه کنید."
    );
  }

  // 2) Exercise explanation: match a prescribed exercise by its Persian
  //    (or English) name appearing in the question.
  for (const item of patient.program) {
    const fa = faContent[item.exerciseId];
    if (!fa) continue;
    const nameTokens = fa.name
      .replace(/[()]/g, " ")
      .split(/[\s‌-]+/)
      .filter((t) => t.length >= 3);
    const hit = nameTokens.some((t) => q.includes(t.toLowerCase()));
    if (hit) {
      return (
        `«${fa.name}» — ${fa.purpose}.\n\n` +
        `نحوه انجام:\n${fa.howTo.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\n` +
        `دوز تجویزشده برای شما: ${item.dosageFa}\n\n` +
        `اشتباه‌های رایج: ${fa.commonMistakes.join("، ")}.\n\n` +
        `${fa.whenToStop}\n\n` +
        "این توضیح جنبه راهنمایی دارد؛ اگر مطمئن نیستید درست انجامش می‌دهید، در جلسه بعدی از فیزیوتراپیست بخواهید حرکت را برایتان نمایش دهد."
      );
    }
  }

  // 3) Progress questions.
  if (/(پیشرفت|بهتر|خوب شدم|روند)/.test(q)) {
    const recent = patient.progress.slice(-7);
    const avg =
      recent.length > 0
        ? (recent.reduce((s, e) => s + e.painLevel, 0) / recent.length).toFixed(1)
        : "—";
    return (
      `طبق گزارش‌های خودتان، میانگین درد شما در هفته اخیر حدود ${avg} از ۱۰ بوده است. ` +
      "روند کلی شما در تب «پیشرفت من» قابل مشاهده است. بهبود تدریجی طبیعی است؛ مهم، ادامه منظم تمرین‌هاست. " +
      "ارزیابی دقیق پیشرفت را فیزیوتراپیست شما در جلسه حضوری انجام می‌دهد."
    );
  }

  // 4) Fallback: explain capabilities.
  return (
    "من دستیار هوشمند برنامه توان‌بخشی شما هستم. می‌توانید از من بپرسید:\n" +
    "• «تمرین پل باسن را چطور انجام دهم؟» (نام هر تمرین برنامه‌تان)\n" +
    "• «روند پیشرفتم چطور است؟»\n" +
    "• یا اگر جایی درد داشتید، برایم توضیح دهید تا راهنمایی‌تان کنم.\n\n" +
    "توجه: من تشخیص پزشکی نمی‌دهم؛ تصمیم نهایی همیشه با فیزیوتراپیست شماست."
  );
}

/*
 * 🔌 REAL AI API INTEGRATION POINT (ticket triage)
 * Immediate AI acknowledgement posted on new tickets before the
 * therapist responds. Replace with a real triage call if desired.
 */
export function buildTicketAutoReply(message: string): string {
  const hasPain = /(درد|ورم|تورم|گزگز|بی[\s‌]?حس)/.test(message);
  if (hasPain) {
    return (
      "پیام شما ثبت شد و برای فیزیوتراپیست ارسال گردید. تا زمان بررسی، همان تمرین را متوقف یا با دامنه و شدت کمتر انجام دهید. " +
      "اگر درد شدید، ورم ناگهانی، تب یا بی‌حسی پیشرونده دارید، منتظر پاسخ نمانید و با پزشک یا اورژانس تماس بگیرید. (پاسخ اولیه خودکار — فیزیوتراپیست به‌زودی پاسخ می‌دهد)"
    );
  }
  return (
    "پیام شما ثبت شد و برای فیزیوتراپیست ارسال گردید. معمولاً در اولین فرصت کاری پاسخ داده می‌شود. (پاسخ اولیه خودکار)"
  );
}

/*
 * ── Posture analysis ────────────────────────────────────────────
 *
 * 🔌 REAL AI API INTEGRATION POINT (vision)
 * Replace this mock with a vision-capable AI call (e.g. the Claude
 * Messages API with image blocks): send each uploaded photo with its
 * view label and ask for structured findings matching PostureReport.
 * Photos must be sent from a server-side route handler — never call
 * the provider with an API key from the browser.
 */

export type PostureView = "front" | "side" | "back";

export interface PostureFinding {
  /** i18n-resolved display strings, generated per locale */
  title: string;
  detail: string;
  severity: "mild" | "moderate" | "marked";
}

export interface PostureReport {
  perView: { view: PostureView; findings: PostureFinding[] }[];
  summary: string;
  recommendations: string[];
  /** 0-1 mock screening confidence */
  confidence: number;
}

type PostureLocale = "en" | "fa" | "ar";

const postureContent: Record<
  PostureLocale,
  {
    findings: Record<PostureView, [string, string, PostureFinding["severity"]][]>;
    summary: string;
    recommendations: string[];
  }
> = {
  en: {
    findings: {
      front: [
        ["Right shoulder elevation", "The right shoulder sits slightly higher than the left — check upper trapezius tone and scapular resting position.", "mild"],
        ["Mild pelvic obliquity", "The pelvis appears slightly higher on the right — screen leg-length and hip abductor strength.", "mild"],
        ["Knee alignment", "Slight genu valgum tendency on the left — assess hip control with a single-leg squat.", "moderate"],
      ],
      side: [
        ["Forward head posture", "The ear sits anterior to the acromion — screen deep neck flexor endurance and thoracic mobility.", "moderate"],
        ["Rounded shoulders", "Protracted scapulae with increased thoracic kyphosis — assess pectoral tightness and mid-back strength.", "moderate"],
        ["Anterior pelvic tilt", "Increased lumbar lordosis suggests anterior tilt — screen hip flexor length and gluteal/abdominal control.", "mild"],
      ],
      back: [
        ["Scapular asymmetry", "The right scapula sits slightly winged/abducted — assess serratus anterior and lower trapezius control.", "mild"],
        ["Spinal alignment", "No obvious lateral curvature at screening quality — confirm with Adams forward-bend test if indicated.", "mild"],
        ["Calcaneal position", "Mild rearfoot valgus on the left — check foot posture and single-leg balance.", "mild"],
      ],
    },
    summary:
      "The screening pattern is consistent with an upper-crossed posture tendency (forward head, rounded shoulders) with mild pelvic asymmetry. These are photographic observations only — confirm each with hands-on assessment before treating.",
    recommendations: [
      "Deep neck flexor training and thoracic extension mobility",
      "Scapular control work (serratus anterior, lower trapezius)",
      "Hip flexor mobility plus gluteal strengthening",
      "Re-photograph in 6–8 weeks to compare",
    ],
  },
  fa: {
    findings: {
      front: [
        ["بالاتر بودن شانه راست", "شانه راست کمی بالاتر از چپ است — تون ذوزنقه فوقانی و وضعیت استراحت کتف بررسی شود.", "mild"],
        ["انحراف خفیف لگن", "لگن در سمت راست کمی بالاتر به نظر می‌رسد — اختلاف طول پا و قدرت ابداکتورهای ران غربال شود.", "mild"],
        ["راستای زانو", "تمایل خفیف به زانوی ضربدری در سمت چپ — کنترل ران با اسکوات تک‌پا ارزیابی شود.", "moderate"],
      ],
      side: [
        ["سر به جلو", "گوش جلوتر از زائده آخرومی قرار دارد — استقامت فلکسورهای عمقی گردن و تحرک توراسیک بررسی شود.", "moderate"],
        ["شانه‌های گرد", "کتف‌ها پروترکت و کایفوز پشتی افزایش‌یافته — کوتاهی سینه‌ای و قدرت میان‌پشت ارزیابی شود.", "moderate"],
        ["تیلت قدامی لگن", "افزایش لوردوز کمری نشانه تیلت قدامی است — طول فلکسورهای ران و کنترل شکم/باسن غربال شود.", "mild"],
      ],
      back: [
        ["عدم تقارن کتف", "کتف راست کمی بالدار/دور شده است — کنترل دندانه‌ای قدامی و ذوزنقه تحتانی ارزیابی شود.", "mild"],
        ["راستای ستون فقرات", "در حد کیفیت غربالگری، انحنای جانبی واضحی دیده نمی‌شود — در صورت نیاز با تست خم‌شدن آدامز تأیید شود.", "mild"],
        ["وضعیت پاشنه", "والگوس خفیف پاشنه چپ — پاسچر پا و تعادل تک‌پا بررسی شود.", "mild"],
      ],
    },
    summary:
      "الگوی غربالگری با تمایل به پاسچر متقاطع فوقانی (سر به جلو، شانه‌های گرد) همراه با عدم تقارن خفیف لگن سازگار است. این‌ها فقط مشاهده از روی عکس‌اند — پیش از درمان، هر مورد با معاینه دستی تأیید شود.",
    recommendations: [
      "تمرین فلکسورهای عمقی گردن و تحرک اکستنشن توراسیک",
      "کار کنترل کتف (دندانه‌ای قدامی، ذوزنقه تحتانی)",
      "موبیلیتی فلکسور ران به‌همراه تقویت باسن",
      "عکس‌برداری مجدد بعد از ۶ تا ۸ هفته برای مقایسه",
    ],
  },
  ar: {
    findings: {
      front: [
        ["ارتفاع الكتف الأيمن", "الكتف الأيمن أعلى قليلًا من الأيسر — افحص توتر الرافعة العلوية ووضعية اللوح.", "mild"],
        ["ميلان حوضي خفيف", "يبدو الحوض أعلى قليلًا في الجهة اليمنى — افحص فرق طول الساقين وقوة مبعّدات الورك.", "mild"],
        ["محاذاة الركبة", "ميل خفيف للركبة الروحاء في الجهة اليسرى — قيّم التحكم بالورك باختبار القرفصاء بساق واحدة.", "moderate"],
      ],
      side: [
        ["تقدّم الرأس", "الأذن أمام النتوء الأخرمي — افحص تحمّل عاضلات الرقبة العميقة وحركة الصدر.", "moderate"],
        ["استدارة الكتفين", "لوحا الكتف منسحبان للأمام مع زيادة الحدب الصدري — قيّم شدّ الصدر وقوة منتصف الظهر.", "moderate"],
        ["إمالة الحوض الأمامية", "زيادة القعس القطني توحي بإمالة أمامية — افحص طول عاضلات الورك وتحكم البطن والألوية.", "mild"],
      ],
      back: [
        ["عدم تناظر اللوحين", "اللوح الأيمن مجنّح/مبعّد قليلًا — قيّم المنشارية الأمامية والرافعة السفلية.", "mild"],
        ["محاذاة العمود الفقري", "لا انحناء جانبي واضح بجودة الفحص — أكِّد باختبار انحناء آدمز عند الحاجة.", "mild"],
        ["وضعية العقب", "روح خفيف في عقب القدم اليسرى — افحص وضعية القدم والتوازن بساق واحدة.", "mild"],
      ],
    },
    summary:
      "نمط الفحص يتوافق مع ميل للقوام المتقاطع العلوي (تقدّم الرأس، استدارة الكتفين) مع عدم تناظر حوضي خفيف. هذه ملاحظات من الصور فقط — أكِّد كل بند بالفحص اليدوي قبل العلاج.",
    recommendations: [
      "تدريب عاضلات الرقبة العميقة وحركة بسط الصدر",
      "تمارين التحكم باللوح (المنشارية الأمامية، الرافعة السفلية)",
      "إطالة عاضلات الورك مع تقوية الألوية",
      "إعادة التصوير بعد ٦–٨ أسابيع للمقارنة",
    ],
  },
};

export function buildPostureReport(
  views: PostureView[],
  locale: PostureLocale
): PostureReport {
  const content = postureContent[locale];
  return {
    perView: views.map((view) => ({
      view,
      findings: content.findings[view].map(([title, detail, severity]) => ({
        title,
        detail,
        severity,
      })),
    })),
    summary: content.summary,
    recommendations: content.recommendations,
    confidence: 0.6 + views.length * 0.1,
  };
}

export const patientSuggestedPrompts = [
  "تمرین پل باسن را چطور انجام دهم؟",
  "روند پیشرفتم چطور است؟",
  "موقع تمرین کمی درد دارم، طبیعی است؟",
];

export const suggestedPrompts = [
  "What tests should I do for this patient?",
  "Give me a treatment plan for knee osteoarthritis.",
  "What exercises are safe after TKA?",
  "How do I progress this patient?",
  "What are the red flags in low back pain?",
];
