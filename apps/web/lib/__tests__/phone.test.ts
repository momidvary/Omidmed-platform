import { describe, expect, it } from "vitest";
import {
  maskPhone,
  normalizeIranianPhoneNumber,
  toEnglishDigits,
} from "@/lib/phone";
import { roleHomePath } from "@/lib/auth/redirect";

describe("normalizeIranianPhoneNumber", () => {
  const expected = "+989123456789";

  it.each([
    "09123456789",
    "9123456789",
    "989123456789",
    "+989123456789",
    "00989123456789",
    "0912 345 6789",
    "0912-345-6789",
  ])("normalizes %s to E.164", (input) => {
    expect(normalizeIranianPhoneNumber(input)).toEqual({
      ok: true,
      e164: expected,
    });
  });

  it("converts Persian digits", () => {
    expect(normalizeIranianPhoneNumber("۰۹۱۲۳۴۵۶۷۸۹")).toEqual({
      ok: true,
      e164: expected,
    });
  });

  it("converts Arabic digits", () => {
    expect(normalizeIranianPhoneNumber("٠٩١٢٣٤٥٦٧٨٩")).toEqual({
      ok: true,
      e164: expected,
    });
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["0912345", "invalid"],       // too short
    ["091234567890", "invalid"],  // too long
    ["08123456789", "invalid"],   // not a mobile prefix
    ["abc9123456", "invalid"],    // letters
    ["+449123456789", "invalid"], // wrong country for the IR normalizer
  ])("rejects %s (%s)", (input, reason) => {
    expect(normalizeIranianPhoneNumber(input)).toEqual({ ok: false, reason });
  });
});

describe("toEnglishDigits", () => {
  it("maps every Persian and Arabic digit", () => {
    expect(toEnglishDigits("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
    expect(toEnglishDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
  });
});

describe("maskPhone", () => {
  it("masks the middle of the number", () => {
    const m = maskPhone("+989123456789");
    expect(m).toBe("+98912***6789");
    expect(m).not.toContain("34567");
  });
});

describe("roleHomePath", () => {
  it("routes every role to its dashboard, never letting the client pick", () => {
    expect(roleHomePath("platform_admin")).toBe("/");
    expect(roleHomePath("clinic_owner")).toBe("/");
    expect(roleHomePath("therapist")).toBe("/");
    expect(roleHomePath("clinic_staff")).toBe("/");
    expect(roleHomePath("patient")).toBe("/patient");
  });
});
