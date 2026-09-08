import type {
  ClinicalReasoning,
  Patient,
  PatientCase,
  TreatmentPlan,
  TreatmentPlanInput,
} from "@/lib/types";
import { getRegion } from "@/lib/data/bodyRegions";
import type { ExerciseFa } from "@/lib/data/exerciseFa";
import {
  detectSafetySignals,
  hasClinicalSafetyClearance,
  safetyFlagLabels,
} from "@/lib/clinical/safety";

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

  const yellowFlags: string[] = [
    "Psychosocial risk has not been established by this intake. Ask validated questions about distress, recovery expectations, fear, sleep, work and social context.",
  ];

  const redFlags: string[] = [];
  const haystack = [
    c.mainComplaint, c.mechanism, c.medicalHistory, c.surgicalHistory,
    c.medications, c.functionalLimitations, c.imaging, c.aggravating,
    c.painLocation,
  ].join(" ");
  const structuredFlags = c.safetyScreen?.selectedFlagIds ?? [];
  if (!c.safetyScreen?.screenedAt) {
    redFlags.push(
      "Safety screen incomplete — absence of detected keywords is not clinical clearance."
    );
  } else if (structuredFlags.length > 0) {
    redFlags.push(
      ...safetyFlagLabels(structuredFlags).map(
        (label) =>
          `Structured screen concern: ${label}. Follow the recorded escalation pathway.`
      )
    );
  } else {
    redFlags.push(
      "Structured screen completed with no selected concerns; continue to verify throughout examination."
    );
  }

  for (const signal of detectSafetySignals(haystack)) {
    redFlags.push(
      `Supplemental text warning (${signal.disposition}): ${signal.id}. Verify immediately using the structured screen.`
    );
  }

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
  if (!input.safetyConfirmed) {
    throw new Error(
      "A completed clinical safety screen is required before treatment planning."
    );
  }
  if (input.stage === "post-op" && !input.postOpDetails?.protocolConfirmed) {
    throw new Error(
      "The surgical protocol, precautions and weight-bearing status must be confirmed before post-operative planning."
    );
  }

  const region = getRegion(input.region);
  const acute = input.stage === "acute" || input.irritability === "high";
  const postOp = input.stage === "post-op";

  const manualTherapy = postOp
    ? [
        "Use only techniques explicitly permitted by the surgeon's protocol and documented precautions.",
        "Treat manual therapy as an optional adjunct; stop if symptoms worsen or precautions are breached.",
      ]
    : acute
      ? [
          "Consider gentle symptom-modulation techniques only after contraindications are excluded.",
          "Reassess the response during and after treatment; avoid forcing painful range.",
        ]
      : [
          "Consider joint or soft-tissue techniques only when examination findings support them.",
          "Use manual therapy as an adjunct to active rehabilitation, with documented response.",
        ];

  const exerciseTherapy = acute
    ? ["Low-load, pain-guided movement", "Isometrics for early loading", "Frequent short sessions"]
    : ["Progressive resistance loading", "Higher intensity as irritability lowers", "Fewer, longer sessions"];

  const mobility = region?.exerciseSuggestions.slice(0, 2) ?? ["Region-appropriate mobility drills"];
  const strengthening = postOp
    ? [
        `Procedure: ${input.postOpDetails?.procedure || "not specified"}. Follow the confirmed protocol and precautions.`,
        `Weight-bearing status: ${input.postOpDetails?.weightBearingStatus || "not specified"}.`,
        "Progress open/closed-chain loading only when permitted by the operating team.",
      ]
    : ["Target the main impairment: " + (input.mainImpairment || "identified weakness"), "Progressive overload 2–3×/week"];

  const motorControl = ["Task-specific control drills", "Quality-of-movement retraining", "Breathing and relaxation as needed"];
  const balance = ["Static balance progressing to dynamic", "Proprioception drills", "Perturbation training in later stages"];

  const education = [
    ...(region?.educationPoints.slice(0, 2) ?? []),
    "Explain expected timeline and the role of active rehab.",
    input.painSeverity >= 9
      ? "Very high pain requires reassessment before progression; do not rely on reassurance alone."
      : input.painSeverity >= 6
        ? "Explain pain carefully without dismissing symptoms; use the examination and safety screen to guide load."
        : "Encourage graded activity within the agreed symptom-response rules.",
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
  if (!hasClinicalSafetyClearance(c.safetyScreen)) {
    throw new Error(
      "Patient advice cannot be generated until the structured safety screen is complete and clear."
    );
  }
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

  const safetySignals = detectSafetySignals(q);
  if (safetySignals.some((signal) => signal.disposition === "emergency")) {
    return (
      "⚠️ توضیح شما می‌تواند با یک وضعیت اورژانسی سازگار باشد. تمرین را متوقف کنید و منتظر پاسخ تیکت یا این گفت‌وگو نمانید. " +
      "همین حالا با اورژانس محل زندگی تماس بگیرید (در ایران ۱۱۵) یا به نزدیک‌ترین اورژانس مراجعه کنید. اگر تنها هستید از فرد دیگری کمک بخواهید. " +
      "این پیام تشخیص پزشکی نیست و این گفت‌وگو به‌صورت خودکار برای درمانگر ارسال نمی‌شود."
    );
  }
  if (safetySignals.some((signal) => signal.disposition === "urgent")) {
    return (
      "⚠️ این علامت نیازمند ارزیابی سریع پزشکی است. تمرین را فعلاً متوقف کنید و امروز با پزشک یا مرکز درمانی تماس بگیرید. " +
      "اگر علائم شدید یا رو به بدترشدن است، با اورژانس محل زندگی تماس بگیرید (در ایران ۱۱۵). منتظر پاسخ تیکت نمانید."
    );
  }

  // 1) Safety first: pain / worrying symptoms → guidance + ticket nudge.
  if (/(درد|ورم|تورم|گزگز|بی[\s‌]?حس|سوزش)/.test(q)) {
    return (
      "اگر هنگام تمرین درد تیز، ورم جدید، گزگز یا بی‌حسی دارید، همان تمرین را فعلاً متوقف کنید و ادامه ندهید.\n\n" +
      "پیشنهاد می‌کنم از بخش «تیکت‌ها» یک تیکت برای فیزیوتراپیست خود ثبت کنید و بنویسید کدام تمرین و کدام قسمت بدن بود تا برنامه‌تان بررسی و در صورت نیاز اصلاح شود.\n\n" +
      "این گفت‌وگو ذخیره یا خودکار برای درمانگر ارسال نمی‌شود؛ فقط تیکت ثبت‌شده قابل مشاهده است.\n\n" +
      "⚠️ اگر درد شدید و ناگهانی، تب، تنگی نفس، درد قفسه سینه یا از دست دادن کنترل ادرار/مدفوع دارید، منتظر پاسخ نمانید و با اورژانس تماس بگیرید."
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
    const worsening =
      recent.length >= 2 &&
      (recent.at(-1)?.painLevel ?? 0) - (recent[0]?.painLevel ?? 0) >= 2;
    if (worsening || (recent.at(-1)?.painLevel ?? 0) >= 7) {
      return (
        `میانگین درد ثبت‌شده اخیر شما حدود ${avg} از ۱۰ است و روند نیاز به بررسی دارد. ` +
        "تا زمان بررسی، شدت تمرین را افزایش ندهید و برای فیزیوتراپیست تیکت ثبت کنید. اگر درد شدید یا علامت نگران‌کننده دارید، منتظر تیکت نمانید و ارزیابی پزشکی بگیرید."
      );
    }
    return (
      `طبق گزارش‌های خودتان، میانگین درد شما در هفته اخیر حدود ${avg} از ۱۰ بوده است. ` +
      "روند کلی شما در تب «پیشرفت من» قابل مشاهده است. فقط در محدوده تجویزشده ادامه دهید و شدت را خودسرانه افزایش ندهید. " +
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
  const normalized = message.normalize("NFKC");
  const isArabic =
    /[أإؤئءةى]|(?:ألم|الصدر|ضيق|التنفس|تورم|خدر|حمى|البول|الأمعاء)/.test(
      normalized
    );
  const isPersian = /[\u0600-\u06ff]/.test(normalized) && !isArabic;
  const language = isArabic ? "ar" : isPersian ? "fa" : "en";
  const signals = detectSafetySignals(normalized);
  const disposition = signals[0]?.disposition;

  if (disposition === "emergency") {
    if (language === "fa") {
      return (
        "⚠️ تیکت ثبت شد، اما هنوز مشاهده آن توسط درمانگر تأیید نشده است. متن شما می‌تواند با یک وضعیت اورژانسی سازگار باشد. " +
        "تمرین را متوقف کنید و همین حالا با اورژانس محل زندگی تماس بگیرید (در ایران ۱۱۵) یا به نزدیک‌ترین اورژانس مراجعه کنید. منتظر پاسخ تیکت نمانید. این پیام خودکار و تشخیص پزشکی نیست."
      );
    }
    if (language === "ar") {
      return (
        "⚠️ تم تسجيل التذكرة، لكن لم يتم تأكيد اطلاع المعالج عليها. قد تتوافق الأعراض المكتوبة مع حالة طارئة. " +
        "أوقف التمرين واتصل بخدمات الطوارئ المحلية الآن (115 في إيران) أو اذهب إلى أقرب قسم طوارئ. لا تنتظر رداً على التذكرة. هذه رسالة آلية وليست تشخيصاً طبياً."
      );
    }
    return (
      "⚠️ Your ticket was recorded, but clinician review is not confirmed. The symptoms described may require emergency assessment. " +
      "Stop exercising and contact local emergency services now (115 in Iran, where applicable) or go to the nearest emergency department. Do not wait for a ticket reply. This is an automated acknowledgement, not a diagnosis."
    );
  }

  if (disposition === "urgent") {
    if (language === "fa") {
      return (
        "⚠️ تیکت ثبت شد، اما هنوز مشاهده آن توسط درمانگر تأیید نشده است. علامت نوشته‌شده نیازمند ارزیابی سریع پزشکی است؛ تمرین را فعلاً متوقف کنید و امروز با پزشک یا مرکز درمانی تماس بگیرید. " +
        "اگر علامت شدید یا رو به بدترشدن است، با اورژانس تماس بگیرید و منتظر پاسخ تیکت نمانید. این پیام خودکار است."
      );
    }
    if (language === "ar") {
      return (
        "⚠️ تم تسجيل التذكرة، لكن لم يتم تأكيد اطلاع المعالج عليها. تحتاج الأعراض المكتوبة إلى تقييم طبي سريع؛ أوقف التمرين مؤقتاً واتصل بطبيب أو مركز صحي اليوم. " +
        "إذا كانت الأعراض شديدة أو تتفاقم فاتصل بالطوارئ ولا تنتظر رداً على التذكرة. هذه رسالة آلية."
      );
    }
    return (
      "⚠️ Your ticket was recorded, but clinician review is not confirmed. The symptom described needs prompt medical assessment; pause exercise and contact a doctor or medical service today. " +
      "If it is severe or worsening, contact emergency services and do not wait for a ticket reply. This is an automated acknowledgement."
    );
  }

  const hasExerciseSymptom =
    /(درد|ورم|تورم|گزگز|بی[\s‌-]?حس|pain|swelling|tingling|numb|ألم|تورم|خدر)/i.test(
      normalized
    );

  if (language === "fa") {
    return hasExerciseSymptom
      ? "تیکت ثبت شد، اما هنوز مشاهده آن توسط درمانگر تأیید نشده است. تمرین علامت‌زا را فعلاً متوقف کنید و برای علائم فوری یا نگران‌کننده از تیکت استفاده نکنید؛ با پزشک یا اورژانس تماس بگیرید. این فقط پاسخ خودکار است."
      : "تیکت ثبت شد، اما این پاسخ خودکار به معنای مشاهده یا پذیرش آن توسط درمانگر نیست. تیکت مسیر اورژانسی نیست؛ برای علائم فوری با پزشک یا اورژانس تماس بگیرید.";
  }
  if (language === "ar") {
    return hasExerciseSymptom
      ? "تم تسجيل التذكرة، لكن لم يتم تأكيد اطلاع المعالج عليها. أوقف التمرين المسبب للأعراض مؤقتاً، ولا تستخدم التذكرة للحالات العاجلة؛ اتصل بطبيب أو بالطوارئ. هذه رسالة آلية فقط."
      : "تم تسجيل التذكرة، لكن هذه الرسالة الآلية لا تعني أن المعالج شاهدها أو قبلها. التذاكر ليست قناة طوارئ؛ اتصل بطبيب أو بالطوارئ عند وجود أعراض عاجلة.";
  }
  return hasExerciseSymptom
    ? "Your ticket was recorded, but clinician review is not confirmed. Pause the symptom-provoking exercise for now. Tickets are not an emergency channel; contact a doctor or emergency service for urgent symptoms. This is an automated acknowledgement."
    : "Your ticket was recorded, but this automated acknowledgement does not confirm clinician review or acceptance. Tickets are not an emergency channel; contact a doctor or emergency service for urgent symptoms.";
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
