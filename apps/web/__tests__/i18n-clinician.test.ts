import { describe, expect, it } from "vitest";
import { pickText } from "@/lib/i18n/text";
import { bodyRegions } from "@/lib/data/bodyRegions";
import { bodyRegionsFa, localizeRegion, regionLabel } from "@/lib/data/bodyRegionsFa";
import { localizedRedFlag, redFlagCategories, redFlagCategoryFa, redFlagFa, redFlags } from "@/lib/data/redFlags";
import { buildReasoningFa } from "@/lib/ai/reasoningFa";
import { buildReasoning } from "@/lib/ai/engine";
import type { PatientCase } from "@/lib/types";

const persian = /[؀-ۿ]/;

describe("page text selection", () => {
  const text = {
    en: { a: "A", b: "B" },
    fa: { a: "الف", b: "ب" },
    ar: { a: "أ" },
  };

  it("uses Persian for fa and falls back to English for missing Arabic keys", () => {
    expect(pickText(text, "fa")).toEqual({ a: "الف", b: "ب" });
    expect(pickText(text, "ar")).toEqual({ a: "أ", b: "B" });
    expect(pickText(text, "en")).toEqual({ a: "A", b: "B" });
  });
});

describe("Persian clinical reference content", () => {
  it("translates every body-region list item one-to-one", () => {
    for (const region of bodyRegions) {
      const fa = bodyRegionsFa[region.id];
      expect(fa.label).toMatch(persian);
      for (const key of [
        "commonConditions",
        "assessmentQuestions",
        "specialTests",
        "functionalTests",
        "treatmentIdeas",
        "exerciseSuggestions",
        "educationPoints",
      ] as const) {
        expect(fa[key]).toHaveLength(region[key].length);
        for (const item of fa[key]) expect(item).toMatch(persian);
      }
      expect(localizeRegion(region, "fa").id).toBe(region.id);
      expect(localizeRegion(region, "en")).toBe(region);
      expect(regionLabel(region.id, "fa")).toBe(fa.label);
    }
  });

  it("translates every red flag and category", () => {
    for (const flag of redFlags) {
      expect(redFlagFa[flag.id]?.label).toMatch(persian);
      expect(localizedRedFlag(flag, "fa").id).toBe(flag.id);
    }
    for (const category of redFlagCategories) {
      expect(redFlagCategoryFa[category]).toMatch(persian);
    }
  });
});

describe("Persian intake reasoning template", () => {
  const base: PatientCase = {
    id: "case-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    name: "Test",
    age: 40,
    gender: "female",
    mainComplaint: "Knee pain on stairs",
    painLocation: "anterior knee",
    painIntensity: 4,
    duration: "6 weeks",
    mechanism: "gradual",
    aggravating: "stairs",
    easing: "rest",
    medicalHistory: "",
    surgicalHistory: "",
    imaging: "",
    medications: "",
    functionalLimitations: "",
    patientGoal: "",
    region: "knee",
  };

  it("keeps the same safety gating as the English template", () => {
    const unscreened = buildReasoningFa(base);
    expect(unscreened.redFlags[0]).toMatch(/غربالگری ایمنی کامل نشده/);

    const concern = buildReasoningFa({
      ...base,
      safetyScreen: {
        screenedAt: "2026-01-01T00:00:00.000Z",
        selectedFlagIds: ["rf_fever"],
        disposition: "medical-review",
      },
    });
    expect(concern.redFlags[0]).toContain(redFlagFa.rf_fever.label);
    expect(concern.hypotheses.length).toBe(buildReasoning(base).hypotheses.length);
    expect(concern.subjective[0]).toMatch(persian);
  });
});
