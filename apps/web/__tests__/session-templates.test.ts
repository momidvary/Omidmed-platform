import { describe, expect, it } from "vitest";
import {
  SESSION_TEMPLATE_IDS,
  SOAP_FIELDS,
  appendToField,
  carryForwardFromNote,
  findingsToNoteText,
  stripEmptyPrompts,
  sessionTemplate,
  sessionTemplateLabel,
} from "@/lib/clinical/sessionTemplates";
import { emptyFindings } from "@/lib/clinical/reasoning/findings";

const persian = /[؀-ۿ]/;

describe("session note templates", () => {
  it("provide prompts only — every line is an empty slot to complete", () => {
    for (const id of SESSION_TEMPLATE_IDS) {
      for (const locale of ["en", "fa"] as const) {
        const template = sessionTemplate(id, locale);
        for (const field of SOAP_FIELDS) {
          const lines = template[field].split("\n");
          expect(lines.length).toBeGreaterThan(0);
          for (const line of lines) expect(line.endsWith(": ")).toBe(true);
        }
      }
      expect(sessionTemplateLabel(id, "fa")).toMatch(persian);
      expect(sessionTemplate(id, "fa").plan).toMatch(persian);
      // Arabic falls back to the English prompts.
      expect(sessionTemplate(id, "ar")).toEqual(sessionTemplate(id, "en"));
    }
  });

  it("returns a fresh copy so edits never mutate the template", () => {
    const first = sessionTemplate("initial", "en");
    first.subjective = "changed";
    expect(sessionTemplate("initial", "en").subjective).not.toBe("changed");
  });

  it("carries forward only objective, interventions and plan", () => {
    const draft = carryForwardFromNote({
      subjective: "old report",
      objective: "ROM 0-120",
      interventions: "quad sets",
      response: "old response",
      plan: "progress load",
    });
    expect(draft).toEqual({
      subjective: "",
      objective: "ROM 0-120",
      interventions: "quad sets",
      response: "",
      plan: "progress load",
    });
  });
});

describe("unanswered prompts", () => {
  it("are removed before signing while answered lines stay", () => {
    for (const id of SESSION_TEMPLATE_IDS) {
      for (const locale of ["en", "fa"] as const) {
        const template = sessionTemplate(id, locale);
        for (const field of SOAP_FIELDS) {
          expect(stripEmptyPrompts(template[field])).toBe("");
        }
      }
    }
    const filled = "Pain 0–10 (now / best / worst): 6/3/8\nAggravating / easing: \nMy own heading:";
    expect(stripEmptyPrompts(filled)).toBe(
      "Pain 0–10 (now / best / worst): 6/3/8\nMy own heading:"
    );
    expect(stripEmptyPrompts("درد / تورم: کم\nرعایت احتیاط‌ها: ")).toBe("درد / تورم: کم");
  });
});

describe("findings to note text", () => {
  const findings = emptyFindings();
  findings.intake.answers = {
    k_squat_stairs: "yes",
    k_twisting: "no",
    k_gradual: "unknown",
    not_a_knee_question: "yes",
  };
  findings.intake.irritability = "moderate";
  findings.exam.tests = { k_lachman: "negative", k_pivot_shift: "positive" };
  findings.exam.notes = { rom: "Flexion 0-130", strength: "  " };

  it("includes only recorded, region-valid findings", () => {
    const text = findingsToNoteText(findings, "knee", "en");
    expect(text.subjective).toContain("Reported: Anterior knee pain");
    expect(text.subjective).toContain("Denied: Twisting injury");
    expect(text.subjective).not.toContain("Gradual onset");
    expect(text.subjective).not.toContain("not_a_knee_question");
    expect(text.subjective).toContain("Moderate");
    expect(text.objective).toContain("Lachman test: negative");
    expect(text.objective).toContain("Pivot shift test: positive");
    expect(text.objective).toContain("Flexion 0-130");
    expect(text.objective.split("\n")).toHaveLength(3);
  });

  it("renders Persian labels", () => {
    const text = findingsToNoteText(findings, "knee", "fa");
    expect(text.subjective).toContain("گزارش شد");
    expect(text.objective).toContain("تست لاکمن: منفی");
  });

  it("is empty when nothing was recorded", () => {
    expect(findingsToNoteText(emptyFindings(), "knee", "en")).toEqual({
      subjective: "",
      objective: "",
    });
  });

  it("appends without overwriting clinician text", () => {
    expect(appendToField("", "A")).toBe("A");
    expect(appendToField("Mine\n", "A")).toBe("Mine\nA");
    expect(appendToField("Mine", "  ")).toBe("Mine");
  });
});

describe("navigation", () => {
  it("keeps the patient workspace under the Patients section", async () => {
    const { isNavActive, navItems } = await import("@/lib/nav");
    const active = navItems.filter((item) => isNavActive(item, "/workspace"));
    expect(active.map((item) => item.key)).toEqual(["patients"]);
    expect(navItems.filter((item) => isNavActive(item, "/")).map((i) => i.key)).toEqual(["dashboard"]);
    expect(navItems.filter((item) => isNavActive(item, "/patient")).length).toBe(0);
  });
});

describe("record ids from the URL", () => {
  it("accept only canonical UUIDs", async () => {
    const { isUuid } = await import("@/lib/utils");
    expect(isUuid("00000000-0000-4000-8000-000000000000")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("00000000-0000-4000-8000-000000000000'--")).toBe(false);
    expect(isUuid(null)).toBe(false);
  });
});
