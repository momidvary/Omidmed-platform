import { describe, expect, it } from "vitest";
import {
  ClinicalDraftCaseContextSchema,
  ClinicalDraftSchema,
  clinicalDraftSafetyViolation,
  type StructuredFindingsContext,
} from "@/lib/ai/clinicalDraftSchema";
import {
  CLINICAL_AI_LIMIT_DEFAULTS,
  clinicalAiFreeText,
  minimizeClinicalAiPayload,
  redactDirectIdentifiers,
  resolveClinicalAiLimits,
} from "@/lib/ai/clinicalDraftPolicy";
import { buildStructuredFindingsContext } from "@/lib/clinical/reasoning/aiContext";

const validDraft = {
  answer:
    "This is a provisional reasoning draft. Verify the history and physical examination before using it.",
  possibleHypotheses: [
    {
      label: "Possible load-related knee pain",
      supportingContext: ["Symptoms increase with stairs"],
      conflictingOrMissingContext: ["No objective examination is available"],
    },
  ],
  assessmentPriorities: ["Confirm symptom behaviour and functional baseline"],
  treatmentConsiderations: ["Consider graded activity after examination"],
  contraindicationsAndStopRules: ["Stop and reassess if symptoms worsen"],
  missingInformation: ["Objective strength and neurological findings"],
  verificationItems: ["Verify all hypotheses against the examination"],
  requiresMedicalReview: false,
  abstained: false,
  abstainReason: null,
};

const validContext = {
  age: 42,
  gender: "female",
  region: "knee",
  mainComplaint: "Knee pain when climbing stairs",
  painLocation: "anterior knee",
  painIntensity: 4,
  duration: "six weeks",
  mechanism: "gradual onset",
  aggravating: "stairs",
  easing: "relative rest",
  medicalHistory: "none reported",
  surgicalHistory: "none reported",
  imaging: "none",
  medications: "not recorded",
  functionalLimitations: "stairs",
  patientGoal: "return to walking",
  structuredFindings: null as StructuredFindingsContext | null,
};

describe("clinical draft schema", () => {
  it("accepts a bounded, explicitly provisional draft", () => {
    expect(ClinicalDraftSchema.safeParse(validDraft).success).toBe(true);
  });

  it("requires abstained drafts to remove hypotheses and treatment", () => {
    const parsed = ClinicalDraftSchema.safeParse({
      ...validDraft,
      abstained: true,
      abstainReason: "The supplied record is insufficient.",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts a complete abstention", () => {
    const parsed = ClinicalDraftSchema.safeParse({
      ...validDraft,
      possibleHypotheses: [],
      treatmentConsiderations: [],
      abstained: true,
      abstainReason: "The supplied record is insufficient.",
    });
    expect(parsed.success).toBe(true);
  });

  it("requires medical-review drafts to remove progression advice", () => {
    const parsed = ClinicalDraftSchema.safeParse({
      ...validDraft,
      requiresMedicalReview: true,
    });
    expect(parsed.success).toBe(false);
  });

  it("requires a stop rule when medical review is needed", () => {
    const parsed = ClinicalDraftSchema.safeParse({
      ...validDraft,
      treatmentConsiderations: [],
      contraindicationsAndStopRules: [],
      requiresMedicalReview: true,
    });
    expect(parsed.success).toBe(false);
  });

  it.each([
    "The diagnosis is a meniscal tear.",
    "تشخیص قطعی: پارگی منیسک",
    "التشخيص المؤكد: تمزق الغضروف الهلالي",
  ])("rejects definitive diagnosis language: %s", (answer) => {
    const candidate = { ...validDraft, answer };
    expect(clinicalDraftSafetyViolation(candidate)).toBe(
      "definitive_diagnosis"
    );
    expect(ClinicalDraftSchema.safeParse(candidate).success).toBe(false);
  });

  it.each([
    "Perform 3 sets of 10 repetitions.",
    "این تمرین را ۳ ست انجام دهید.",
    "نفذ ٣ مجموعات من التمرين.",
  ])("rejects numeric exercise prescriptions: %s", (answer) => {
    const candidate = { ...validDraft, answer };
    expect(clinicalDraftSafetyViolation(candidate)).toBe(
      "prescriptive_instruction"
    );
    expect(ClinicalDraftSchema.safeParse(candidate).success).toBe(false);
  });
});

describe("clinical draft case context", () => {
  it("accepts the audited bounded context shape", () => {
    expect(ClinicalDraftCaseContextSchema.safeParse(validContext).success).toBe(
      true
    );
  });

  it("rejects unknown fields and invalid clinical ranges", () => {
    expect(
      ClinicalDraftCaseContextSchema.safeParse({
        ...validContext,
        painIntensity: 11,
        patientName: "must not be sent",
      }).success
    ).toBe(false);
  });

  it("rejects a context snapshot larger than the audited byte limit", () => {
    expect(
      ClinicalDraftCaseContextSchema.safeParse({
        ...validContext,
        medicalHistory: "x".repeat(20_000),
        surgicalHistory: "y".repeat(20_000),
        imaging: "z".repeat(20_000),
      }).success
    ).toBe(false);
  });
});

describe("clinical AI quota configuration", () => {
  it("uses conservative defaults for blank configuration", () => {
    const result = resolveClinicalAiLimits({});
    expect(result).toEqual({ ok: true, limits: CLINICAL_AI_LIMIT_DEFAULTS });
  });

  it("accepts bounded explicit quota values", () => {
    expect(
      resolveClinicalAiLimits({
        CLINICAL_AI_PER_MINUTE_LIMIT: "3",
        CLINICAL_AI_DAILY_USER_LIMIT: "25",
        CLINICAL_AI_DAILY_CLINIC_LIMIT: "250",
      })
    ).toEqual({
      ok: true,
      limits: { perMinute: 3, perUserPerDay: 25, perClinicPerDay: 250 },
    });
  });

  it.each([
    ["CLINICAL_AI_PER_MINUTE_LIMIT", "0"],
    ["CLINICAL_AI_PER_MINUTE_LIMIT", "21"],
    ["CLINICAL_AI_DAILY_USER_LIMIT", "1.5"],
    ["CLINICAL_AI_DAILY_CLINIC_LIMIT", "unlimited"],
  ] as const)("fails closed for invalid %s", (key, value) => {
    const result = resolveClinicalAiLimits({ [key]: value });
    expect(result).toEqual({ ok: false, invalidKey: key });
  });
});

describe("clinical AI data minimization", () => {
  it("redacts email, URL and direct numeric identifiers", () => {
    const minimized = redactDirectIdentifiers(
      "email test@example.com phone +98 912 123 4567 profile https://example.com/p/42"
    );
    expect(minimized.text).not.toContain("test@example.com");
    expect(minimized.text).not.toContain("912 123 4567");
    expect(minimized.text).not.toContain("https://example.com");
    expect(minimized.redactionCount).toBe(3);
  });

  it("redacts Persian and Arabic digit identifiers from the audited payload", () => {
    const minimized = minimizeClinicalAiPayload(
      "شناسه ۱۲۳۴۵۶۷۸۹۰ و الرقم ١٢٣٤٥٦٧٨٩٠",
      {
        ...validContext,
        medicalHistory: "تماس ۰۹۱۲۱۲۳۴۵۶۷؛ سابقه فشار خون",
      }
    );
    const serialized = JSON.stringify(minimized);
    expect(serialized).not.toContain("۱۲۳۴۵۶۷۸۹۰");
    expect(serialized).not.toContain("١٢٣٤٥٦٧٨٩٠");
    expect(serialized).not.toContain("۰۹۱۲۱۲۳۴۵۶۷");
    expect(minimized.caseContext.painIntensity).toBe(4);
    expect(minimized.redactionCount).toBe(3);
  });
});

describe("structured findings in the AI case context", () => {
  const row = {
    region: "knee",
    knowledge_version: "physio-kb-1",
    findings: {
      intake: {
        answers: { k_pop_rapid_swelling: "yes", k_locking: "no", k_twisting: "unknown" },
        irritability: "moderate",
      },
      exam: {
        tests: { k_lachman: "positive", k_mcmurray: "equivocal" },
        notes: { rom: "Flexion 100°, call 09121234567 if needed", other: "  " },
      },
    },
  };

  it("labels recorded findings and includes the rule-based ranking to critique", () => {
    const context = buildStructuredFindingsContext(row, "knee", 23)!;
    expect(context.history).toEqual([
      { item: "Pop at injury with rapid swelling (within ~2 hours)", answer: "yes" },
      { item: "Locking or catching", answer: "no" },
    ]);
    expect(context.examTests.map((t) => [t.test, t.result])).toEqual([
      ["Lachman test", "positive"],
      ["McMurray test", "equivocal"],
    ]);
    expect(context.examTests[0].accuracy).toContain("Benjaminse");
    expect(context.examNotes).toEqual([
      { field: "rom", note: "Flexion 100°, call 09121234567 if needed" },
    ]);
    expect(context.ruleBasedRanking[0].hypothesis).toBe("ACL injury");
    expect(context.ruleBasedRanking[0].reasons.join(" ")).toContain("Lachman test");
    expect(
      ClinicalDraftCaseContextSchema.safeParse({ ...validContext, structuredFindings: context })
        .success
    ).toBe(true);
  });

  it("omits findings that are absent, empty, invalid or from another region", () => {
    expect(buildStructuredFindingsContext(null, "knee", 30)).toBeNull();
    expect(buildStructuredFindingsContext(row, "hip", 30)).toBeNull();
    expect(buildStructuredFindingsContext(row, null, 30)).toBeNull();
    expect(
      buildStructuredFindingsContext({ ...row, findings: { intake: {} } }, "knee", 30)
    ).toBeNull();
    expect(
      buildStructuredFindingsContext(
        {
          ...row,
          findings: {
            intake: { answers: { k_locking: "unknown" }, irritability: null },
            exam: { tests: {}, notes: {} },
          },
        },
        "knee",
        30
      )
    ).toBeNull();
  });

  it("redacts identifiers in examination notes before audit and generation", () => {
    const structuredFindings = buildStructuredFindingsContext(row, "knee", 23)!;
    const minimized = minimizeClinicalAiPayload("Rank the differential", {
      ...validContext,
      structuredFindings,
    });
    expect(JSON.stringify(minimized)).not.toContain("09121234567");
    expect(minimized.caseContext.structuredFindings?.examNotes[0].note).toContain(
      "[REDACTED_IDENTIFIER]"
    );
    expect(minimized.redactionCount).toBe(1);
    expect(minimized.caseContext.structuredFindings?.history).toEqual(
      structuredFindings.history
    );
  });

  it("scans examination notes but not knowledge-base labels for safety signals", () => {
    const structuredFindings = buildStructuredFindingsContext(row, "knee", 23)!;
    const text = clinicalAiFreeText("question", {
      ...validContext,
      structuredFindings: {
        ...structuredFindings,
        examNotes: [{ field: "neuro", note: "new saddle numbness reported" }],
      },
    });
    expect(text).toContain("new saddle numbness reported");
    expect(text).not.toContain("Lachman test");
    expect(text).toContain(validContext.mainComplaint);
  });
});
