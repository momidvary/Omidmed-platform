import { redFlags } from "@/lib/data/redFlags";
import type {
  CaseSafetyScreen,
  SafetyDisposition,
} from "@/lib/types";

const dispositionRank: Record<SafetyDisposition, number> = {
  "not-screened": 0,
  clear: 1,
  "medical-review": 2,
  urgent: 3,
  emergency: 4,
};

/** Conservative routing level for each structured screening item. */
export const redFlagDisposition: Record<string, SafetyDisposition> = {
  rf_cancer: "medical-review",
  rf_weightloss: "medical-review",
  rf_nightpain: "medical-review",
  rf_fracture_trauma: "urgent",
  rf_fracture_osteo: "urgent",
  rf_steroids: "medical-review",
  rf_fever: "urgent",
  rf_ivdu: "urgent",
  rf_immuno: "medical-review",
  rf_ce_saddle: "emergency",
  rf_ce_bladder: "emergency",
  rf_ce_sexual: "emergency",
  rf_neuro_progressive: "urgent",
  rf_neuro_bilateral: "urgent",
  rf_dvt_calf: "urgent",
  rf_dvt_risk: "medical-review",
  rf_cardiac_chest: "emergency",
  rf_cardiac_breath: "emergency",
  rf_severe_pain: "urgent",
};

export function evaluateSafetyScreen(
  selectedFlagIds: string[],
  completed: boolean
): SafetyDisposition {
  if (!completed) return "not-screened";
  if (selectedFlagIds.length === 0) return "clear";

  return selectedFlagIds.reduce<SafetyDisposition>((highest, id) => {
    const next = redFlagDisposition[id] ?? "medical-review";
    return dispositionRank[next] > dispositionRank[highest] ? next : highest;
  }, "medical-review");
}

export function hasClinicalSafetyClearance(
  screen: CaseSafetyScreen | undefined
): boolean {
  return screen?.disposition === "clear" && Boolean(screen.screenedAt);
}

export function safetyFlagLabels(ids: string[]): string[] {
  const selected = new Set(ids);
  return redFlags.filter((flag) => selected.has(flag.id)).map((flag) => flag.label);
}

export interface SafetySignal {
  id: string;
  disposition: "urgent" | "emergency";
}

interface SignalRule extends SafetySignal {
  patterns: RegExp[];
}

const signalRules: SignalRule[] = [
  {
    id: "cauda-equina",
    disposition: "emergency",
    patterns: [
      /\b(?:acute|new(?:[\s-]?onset)?)?\s*urinary retention\b/i,
      /\b(?:cannot|can't|unable to|not able to)\s+(?:urinate|pass urine|pee)\b/i,
      /\b(?:difficulty|trouble)\s+(?:starting|initiating)\s+(?:urination|urine flow|to urinate)\b/i,
      /\b(?:loss|change)\s+of\s+(?:bladder|bowel)\s+control\b|\b(?:urinary|fa?ecal)\s+incontin(?:ence|ance)\b/i,
      /\b(?:saddle|perineal|perianal|genital)\s+(?:ana?esthesia|numbness|sensory loss|loss of sensation)\b/i,
      /احتباس\s*ادرار|بند\s*آمدن\s*ادرار/i,
      /(?:نمی|نمي)[\s-]*(?:توانم|تواند).{0,12}ادرار\s*(?:کنم|کند)|قادر\s+نیست.{0,12}ادرار/i,
      /مشکل.{0,15}(?:شروع|آغاز).{0,10}ادرار/i,
      /(?:بی|بى)[\s-]?اختیار(?:ی)?.{0,12}(?:ادرار|مدفوع)|(?:کنترل|اختیار).{0,15}(?:ادرار|مدفوع).{0,15}(?:از\s+دست\s+(?:داده|رفته)|ندار(?:م|د)?)/i,
      /(?:بی|بى)[\s-]?حسی.{0,20}(?:زینی|پرینه|بین\s*پاها?|ناحیه\s*تناسلی|اطراف\s*مقعد)/i,
      /احتباس\s+البول|لا\s+أستطيع\s+التبول|عاجز.{0,10}التبول/i,
      /صعوبة.{0,12}(?:بدء|بداية)\s+التبول/i,
      /سلس\s+(?:البول|البراز)|فقدان\s+السيطرة\s+على\s+(?:البول|الأمعاء|البراز)/i,
      /خدر.{0,20}(?:السرج|العجان|بين\s+الساقين|الأعضاء\s+التناسلية|حول\s+الشرج)/i,
    ],
  },
  {
    id: "cardiorespiratory",
    disposition: "emergency",
    patterns: [
      /\bchest\s+(?:pain|pressure|tightness|heaviness)\b|\bcrushing\s+(?:chest\s+)?pain\b/i,
      /\b(?:severe\s+)?shortness\s+of\s+breath\b|\bdyspn(?:ea|oea)\b|\bdifficulty\s+breathing\b/i,
      /(?:درد|فشار|سنگینی|گرفتگی).{0,12}(?:قفسه\s*)?سینه|فشار\s+روی\s+سینه/i,
      /تنگی[\s-]*نفس|مشکل.{0,10}(?:نفس|تنفس)|نفس.{0,8}(?:نمی|نمي)[\s-]*رسد/i,
      /(?:ألم|ضغط|ثقل|ضيق).{0,10}(?:في\s+)?الصدر/i,
      /ضيق\s+(?:شديد\s+)?(?:في\s+)?التنفس|صعوبة\s+التنفس/i,
    ],
  },
  {
    id: "progressive-neurology",
    disposition: "urgent",
    patterns: [
      /\b(?:progressive|worsening|increasing)\s+(?:bilateral\s+)?(?:weakness|numbness|neurolog(?:ic|ical)\s+deficit)\b/i,
      /\b(?:bilateral|both)\s+(?:leg|arm|limb)s?\s+weakness.{0,25}\b(?:progressive|worsening|increasing)\b/i,
      /\b(?:weakness|numbness).{0,25}\b(?:both|bilateral)\s+(?:leg|arm|limb)s?\b.{0,20}\b(?:worsening|progressive)\b/i,
      /(?:ضعف|بی[\s-]?حسی).{0,25}(?:پیشرونده|رو\s+به\s+(?:افزایش|بدتر)|بدتر\s+می[\s-]?شود)/i,
      /ضعف.{0,20}(?:هر\s*دو|دو[\s-]*طرفه).{0,16}(?:پا|دست).{0,20}(?:بدتر|پیشرونده|افزایش)/i,
      /(?:ضعف|خدر).{0,25}(?:متزايد|يتفاقم|يزداد)/i,
      /ضعف.{0,20}(?:ثنائي|كلتا\s+الساقين|الساقين).{0,20}(?:متزايد|يتفاقم|يزداد)/i,
    ],
  },
  {
    id: "infection",
    disposition: "urgent",
    patterns: [
      /\bfever\s+(?:and|with)\s+(?:chills|rigors)\b|\bhigh\s+fever\b/i,
      /\b(?:immunosuppress(?:ed|ion|ive)?|immunocompromised)\b/i,
      /\b(?:chemotherapy|chemo)\b.{0,30}\bfever\b|\bfever\b.{0,30}\b(?:chemotherapy|chemo)\b/i,
      /تب\s*(?:و|همراه)\s*لرز|تب\s+(?:بالا|شدید)/i,
      /(?:نقص|سرکوب).{0,12}(?:سیستم\s*)?ایمنی|ضعف\s+سیستم\s+ایمنی/i,
      /شیمی[\s-]*درمانی.{0,25}تب|تب.{0,25}شیمی[\s-]*درمانی/i,
      /حمى\s*(?:مع|و)\s*(?:قشعريرة|رجفة)|حمى\s+(?:شديدة|مرتفعة)/i,
      /(?:نقص|تثبيط).{0,12}المناعة|مثبط\s+المناعة/i,
      /(?:العلاج\s+الكيميائي|كيماوي).{0,25}حمى|حمى.{0,25}(?:العلاج\s+الكيميائي|كيماوي)/i,
    ],
  },
  {
    id: "dvt-pe",
    disposition: "urgent",
    patterns: [
      /\b(?:unilateral|one[\s-]?sided|left|right)\s+(?:calf|lower\s+leg).{0,24}\b(?:pain|swelling|swollen|tenderness)\b/i,
      /\b(?:pain|swelling|swollen|tenderness)\b.{0,24}\b(?:unilateral|one[\s-]?sided|left|right)\s+(?:calf|lower\s+leg)\b/i,
      /\b(?:left|right)\s+calf\s+(?:is|became|looks?)\s+(?:swollen|painful|tender)\b/i,
      /(?:ساق|پشت\s*ساق)\s+(?:راست|چپ).{0,24}(?:ورم|متورم|درد|حساس)/i,
      /(?:ورم|متورم|درد|حساس).{0,24}(?:ساق|پشت\s*ساق)\s+(?:راست|چپ)/i,
      /(?:یک|يك)[\s-]*طرفه.{0,12}(?:ساق|پشت\s*ساق).{0,20}(?:ورم|متورم|درد)|(?:ورم|متورم|درد).{0,20}(?:یک|يك)[\s-]*طرفه.{0,12}(?:ساق|پشت\s*ساق)/i,
      /(?:ربلة|بطة\s+الساق|الساق)\s+(?:اليمنى|اليسرى).{0,24}(?:تورم|متورمة|ألم|مؤلمة)/i,
      /(?:تورم|متورمة|ألم|مؤلمة).{0,24}(?:ربلة|بطة\s+الساق|الساق)\s+(?:اليمنى|اليسرى)/i,
      /(?:أحادي|من\s+جهة\s+واحدة).{0,15}(?:ربلة|بطة\s+الساق).{0,20}(?:تورم|ألم)/i,
      /(?:تورم|ألم).{0,20}(?:أحادي|من\s+جهة\s+واحدة).{0,15}(?:ربلة|بطة\s+الساق)/i,
    ],
  },
];

const beforeNegations = [
  /\b(?:no|not|den(?:y|ies|ied)|without|never\s+had|negative\s+for)\b/i,
  /(?:بدون|فاقد|هیچ|انکار\s*(?:می[\s-]?(?:کنم|کند)|شده)|ندار(?:م|د)|نداشت(?:م|ه|ند)?)/i,
  /(?:لا\s+يوجد|ليس\s+لدي|ليس\s+عندي|لا\s+أعاني(?:\s+من)?|ينفي|أنكر|بدون)/i,
];

const afterNegations = [
  /\b(?:(?:is|are|was|were|has\s+been|have\s+been)\s+)?(?:absent|denied|resolved|gone|not\s+present)\b|\bno\s+longer\b|\bnot\s+now\b/i,
  /(?:ندار(?:م|د)|نداشت(?:م|ه|ند)?|نیست|نبوده|وجود\s+ندارد|رفع\s+شده|برطرف\s+شده|بهبود\s+یافته)/i,
  /(?:غير\s+موجود|لا\s+يوجد|لا\s+أعاني\s+منه|ليست\s+موجودة|انتفى|اختفى|زالت)/i,
];

const historicalMarker =
  /\b(?:previously|in\s+the\s+past|used\s+to|last\s+(?:year|month|week))\b|(?:قبلا|قبلاً|در\s+گذشته|سال\s+قبل|ماه\s+قبل)|(?:سابقا|سابقاً|في\s+السابق|الماضي)/i;
const explicitCurrentAbsence =
  /\b(?:do(?:es)?\s+not\s+(?:have|report|experience)(?:\s+it)?\s+(?:now|currently)|no\s+longer\s+(?:has|have|reports?|experiences?)|not\s+present\s+now|resolved\s+now|gone\s+now)\b|(?:الان|اکنون|در\s+حال\s+حاضر).{0,24}(?:ندار(?:م|د)|نیست|وجود\s+ندارد)|(?:الآن|حاليا|حالياً).{0,24}(?:لا\s+أعاني|لا\s+يوجد|ليس\s+لدي|غير\s+موجود)/i;
const currentContext =
  /\b(?:now|currently|today|new(?:ly)?)\b|(?:الان|اکنون|امروز|جدید)|(?:الآن|حاليا|حالياً|اليوم|جديد)/i;

function normalizeClinicalText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, " ")
    .replace(/[\t\r ]+/g, " ")
    .trim();
}

function removeResolvedHistory(text: string): string {
  return text
    .split(/([.!?؟؛;\n]+)/)
    .map((part) =>
      historicalMarker.test(part) && explicitCurrentAbsence.test(part) ? " " : part
    )
    .join(" ");
}

function splitClinicalClauses(text: string): string[] {
  return removeResolvedHistory(text)
    .replace(/\b(?:but|however|nevertheless)\b|(?:اما|ولی|با\s+این\s+حال)|(?:لكن|ولكن)/gi, ".")
    .split(/[.!?؟؛;\n]+/)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function asGlobal(pattern: RegExp): RegExp {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return new RegExp(pattern.source, flags);
}

function tokenCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function lastNearbyNegation(text: string): RegExpExecArray | null {
  let latest: RegExpExecArray | null = null;

  for (const pattern of beforeNegations) {
    const regex = asGlobal(pattern);
    let match = regex.exec(text);
    while (match) {
      if (!latest || match.index > latest.index) latest = match;
      match = regex.exec(text);
    }
  }

  return latest;
}

function isNegated(clause: string, matchIndex: number, matchLength: number): boolean {
  const before = clause.slice(Math.max(0, matchIndex - 80), matchIndex);
  const after = clause.slice(matchIndex + matchLength, matchIndex + matchLength + 60);
  const priorNegation = lastNearbyNegation(before);

  if (priorNegation) {
    const between = before.slice(priorNegation.index + priorNegation[0].length);
    if (tokenCount(between) <= 6 && !currentContext.test(between)) return true;
  }

  return afterNegations.some((pattern) => {
    const match = pattern.exec(after);
    return Boolean(match && tokenCount(after.slice(0, match.index)) <= 6);
  });
}

/**
 * Supplemental multilingual free-text warning detector. It must never be
 * used to declare a patient safe; only the structured screen can do that.
 */
export function detectSafetySignals(text: string): SafetySignal[] {
  const normalized = normalizeClinicalText(text);
  if (!normalized) return [];

  const found = new Map<string, SafetySignal>();
  const clauses = splitClinicalClauses(normalized);

  for (const rule of signalRules) {
    ruleSearch: for (const clause of clauses) {
      for (const pattern of rule.patterns) {
        const regex = asGlobal(pattern);
        let match = regex.exec(clause);

        while (match) {
          if (!isNegated(clause, match.index, match[0].length)) {
            found.set(rule.id, { id: rule.id, disposition: rule.disposition });
            break ruleSearch;
          }
          match = regex.exec(clause);
        }
      }
    }
  }

  return [...found.values()].sort(
    (a, b) => dispositionRank[b.disposition] - dispositionRank[a.disposition]
  );
}
