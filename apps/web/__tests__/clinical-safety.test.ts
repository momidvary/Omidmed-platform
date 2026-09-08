import { describe, expect, it } from "vitest";
import {
  detectSafetySignals,
  evaluateSafetyScreen,
  hasClinicalSafetyClearance,
} from "@/lib/clinical/safety";

describe("evaluateSafetyScreen", () => {
  it("keeps an incomplete screen in the not-screened state", () => {
    expect(evaluateSafetyScreen([], false)).toBe("not-screened");
    expect(evaluateSafetyScreen(["rf_fever"], false)).toBe("not-screened");
  });

  it("marks a completed screen with no selected concerns as clear", () => {
    expect(evaluateSafetyScreen([], true)).toBe("clear");
  });

  it("routes urgent and emergency flags conservatively", () => {
    expect(evaluateSafetyScreen(["rf_fever"], true)).toBe("urgent");
    expect(evaluateSafetyScreen(["rf_ce_bladder"], true)).toBe("emergency");
    expect(
      evaluateSafetyScreen(["rf_weightloss", "rf_fever", "rf_ce_bladder"], true)
    ).toBe("emergency");
  });

  it("falls back to medical review for an unknown selected flag", () => {
    expect(evaluateSafetyScreen(["unknown-flag"], true)).toBe("medical-review");
  });
});

describe("hasClinicalSafetyClearance", () => {
  it("requires both a clear disposition and a screening timestamp", () => {
    expect(hasClinicalSafetyClearance(undefined)).toBe(false);
    expect(
      hasClinicalSafetyClearance({
        disposition: "not-screened",
        screenedAt: null,
        selectedFlagIds: [],
      })
    ).toBe(false);
    expect(
      hasClinicalSafetyClearance({
        disposition: "clear",
        screenedAt: null,
        selectedFlagIds: [],
      })
    ).toBe(false);
    expect(
      hasClinicalSafetyClearance({
        disposition: "clear",
        screenedAt: "2026-08-11T09:00:00.000Z",
        selectedFlagIds: [],
      })
    ).toBe(true);
  });
});

const positiveMatrix = [
  { label: "en cauda urinary retention", text: "New-onset urinary retention.", id: "cauda-equina", disposition: "emergency" },
  { label: "en cauda cannot void", text: "The patient cannot urinate.", id: "cauda-equina", disposition: "emergency" },
  { label: "en cauda spelling variant", text: "New urinary incontinance is reported.", id: "cauda-equina", disposition: "emergency" },
  { label: "en cauda British spelling", text: "There is saddle anaesthesia.", id: "cauda-equina", disposition: "emergency" },
  { label: "fa cauda retention", text: "از صبح احتباس ادرار دارم.", id: "cauda-equina", disposition: "emergency" },
  { label: "fa cauda ZWNJ", text: "نمی‌توانم ادرار کنم.", id: "cauda-equina", disposition: "emergency" },
  { label: "fa cauda incontinence", text: "بی‌اختیاری مدفوع تازه شروع شده است.", id: "cauda-equina", disposition: "emergency" },
  { label: "fa cauda saddle region", text: "بی حسی ناحیه تناسلی ایجاد شده.", id: "cauda-equina", disposition: "emergency" },
  { label: "ar cauda retention", text: "لدي احتباس البول منذ الصباح.", id: "cauda-equina", disposition: "emergency" },
  { label: "ar cauda inability", text: "لا أستطيع التبول.", id: "cauda-equina", disposition: "emergency" },
  { label: "ar cauda control", text: "حدث فقدان السيطرة على البول.", id: "cauda-equina", disposition: "emergency" },
  { label: "ar cauda saddle region", text: "ظهر خدر في العجان.", id: "cauda-equina", disposition: "emergency" },
  { label: "en cardiac paired symptoms", text: "Chest pressure with dyspnoea.", id: "cardiorespiratory", disposition: "emergency" },
  { label: "en respiratory", text: "Sudden difficulty breathing.", id: "cardiorespiratory", disposition: "emergency" },
  { label: "en respiratory punctuation", text: "No fever. Later: severe shortness of breath.", id: "cardiorespiratory", disposition: "emergency" },
  { label: "fa cardiac ZWNJ", text: "فشار روی سینه و تنگی‌نفس دارم.", id: "cardiorespiratory", disposition: "emergency" },
  { label: "fa respiratory spelling", text: "احساس می‌کنم نفس نمی‌رسد.", id: "cardiorespiratory", disposition: "emergency" },
  { label: "fa current overrides old negation", text: "قبلاً نداشتم، الان تنگی نفس دارم.", id: "cardiorespiratory", disposition: "emergency" },
  { label: "ar cardiac paired symptoms", text: "ضغط في الصدر وضيق التنفس.", id: "cardiorespiratory", disposition: "emergency" },
  { label: "ar respiratory", text: "بدأت صعوبة التنفس فجأة.", id: "cardiorespiratory", disposition: "emergency" },
  { label: "ar current after remote negation", text: "ليس لدي حمى. الآن ألم الصدر.", id: "cardiorespiratory", disposition: "emergency" },
  { label: "en progressive bilateral weakness", text: "Progressive bilateral weakness is present.", id: "progressive-neurology", disposition: "urgent" },
  { label: "en bilateral legs worsening", text: "Bilateral leg weakness is worsening.", id: "progressive-neurology", disposition: "urgent" },
  { label: "fa progressive weakness", text: "ضعف دو طرفه پا پیشرونده است.", id: "progressive-neurology", disposition: "urgent" },
  { label: "fa progressive numbness", text: "بی‌حسی پا رو به افزایش است.", id: "progressive-neurology", disposition: "urgent" },
  { label: "ar bilateral worsening", text: "ضعف الساقين يزداد بسرعة.", id: "progressive-neurology", disposition: "urgent" },
  { label: "ar progressive numbness", text: "يوجد خدر متزايد.", id: "progressive-neurology", disposition: "urgent" },
  { label: "en fever rigors", text: "Fever with rigors began today.", id: "infection", disposition: "urgent" },
  { label: "en immune suppression", text: "The patient is immunocompromised.", id: "infection", disposition: "urgent" },
  { label: "en chemotherapy fever", text: "On chemotherapy with a new fever.", id: "infection", disposition: "urgent" },
  { label: "fa fever ZWNJ", text: "تب‌و‌لرز شدید شروع شده.", id: "infection", disposition: "urgent" },
  { label: "fa immune suppression", text: "سرکوب سیستم ایمنی دارد.", id: "infection", disposition: "urgent" },
  { label: "ar fever diacritics", text: "لديه حُمّى مع قشعريرة.", id: "infection", disposition: "urgent" },
  { label: "ar immune suppression", text: "المريض لديه نقص المناعة.", id: "infection", disposition: "urgent" },
  { label: "en unilateral calf swelling", text: "There is unilateral calf swelling.", id: "dvt-pe", disposition: "urgent" },
  { label: "en reordered calf swelling", text: "Swelling developed in the left lower leg.", id: "dvt-pe", disposition: "urgent" },
  { label: "en right calf pain", text: "The right calf is painful.", id: "dvt-pe", disposition: "urgent" },
  { label: "fa unilateral calf ZWNJ", text: "ورم یک‌طرفه ساق ایجاد شده.", id: "dvt-pe", disposition: "urgent" },
  { label: "fa left calf", text: "ساق چپ متورم و حساس است.", id: "dvt-pe", disposition: "urgent" },
  { label: "ar right calf", text: "الساق اليمنى بها تورم.", id: "dvt-pe", disposition: "urgent" },
  { label: "ar reordered calf", text: "تورم في الساق اليسرى.", id: "dvt-pe", disposition: "urgent" },
  { label: "ar unilateral calf", text: "تورم أحادي الجانب في ربلة الساق.", id: "dvt-pe", disposition: "urgent" },
] as const;

describe("detectSafetySignals clinician-oriented matrix", () => {
  it("keeps a matrix of at least 30 multilingual critical inputs", () => {
    expect(positiveMatrix.length).toBeGreaterThanOrEqual(30);
  });

  it.each(positiveMatrix)("detects $label", ({ text, id, disposition }) => {
    expect(detectSafetySignals(text)).toContainEqual({ id, disposition });
  });

  it.each([
    "No chest pain or pressure.",
    "The patient denies fever with chills.",
    "No urinary retention, urinary incontinence, or saddle numbness.",
    "Progressive bilateral weakness is denied.",
    "No unilateral calf swelling.",
    "Chest pain is not present.",
    "No chest pain but no difficulty breathing.",
    "درد قفسه سینه ندارم.",
    "تب و لرز ندارم.",
    "بی‌حسی زینی وجود ندارد.",
    "ضعف پیشرونده ندارم.",
    "ورم یک‌طرفه ساق ندارم.",
    "ليس لدي ألم الصدر.",
    "لا أعاني من ضيق التنفس.",
    "لا يوجد احتباس البول.",
    "ينفي خدر متزايد.",
    "لا يوجد تورم في الساق اليمنى.",
  ])("does not warn for a locally negated finding: %s", (text) => {
    expect(detectSafetySignals(text)).toEqual([]);
  });

  it.each([
    "I had chest pain last year, but I do not have it now.",
    "قبلاً تنگی نفس داشتم ولی الان ندارم.",
    "سابقاً كان لدي ألم الصدر لكن الآن لا أعاني منه.",
  ])("does not treat a resolved historical symptom as current: %s", (text) => {
    expect(detectSafetySignals(text)).toEqual([]);
  });

  it.each([
    ["No fever in the morning. At noon the patient developed chest pressure.", "cardiorespiratory"],
    ["No bladder symptoms earlier; today there is new urinary retention.", "cauda-equina"],
    ["No chest pain, but severe shortness of breath.", "cardiorespiratory"],
    ["The patient denies fever and chills, but is immunocompromised.", "infection"],
    ["قبلاً تب نداشتم؛ امروز تب و لرز دارم.", "infection"],
    ["لا يوجد ضعف سابقا؛ الآن خدر متزايد.", "progressive-neurology"],
    ["No bladder difficulty earlier, now acute urinary retention.", "cauda-equina"],
  ] as const)("does not let a remote/earlier negation hide a current signal: %s", (text, id) => {
    expect(detectSafetySignals(text)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id })])
    );
  });

  it.each([
    "Routine knee pain after exercise.",
    "Generalized swelling around both ankles.",
    "Bilateral calf soreness after a long run.",
    "درد عمومی زانو و ورم هر دو مچ پا.",
    "تورم دوطرفه مچ پا.",
    "ألم الركبة وتورم الكاحلين.",
  ])("does not infer DVT from generic pain or swelling: %s", (text) => {
    expect(detectSafetySignals(text)).toEqual([]);
  });

  it("returns warnings only and never manufactures clinical clearance", () => {
    expect(detectSafetySignals("")).toEqual([]);
    expect(detectSafetySignals("No concerning symptoms are reported.")).toEqual([]);

    for (const signal of detectSafetySignals("Chest pain and high fever.")) {
      expect(signal).not.toHaveProperty("disposition", "clear");
      expect(["urgent", "emergency"]).toContain(signal.disposition);
    }
  });
});
