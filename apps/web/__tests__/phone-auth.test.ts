import { describe, expect, it } from "vitest";
import {
  formatIranianMobile,
  maskMobile,
  normalizeIranianMobile,
  toEnglishDigits,
} from "@/lib/phone";
import { classifyPhoneOtpError } from "@/lib/store/AuthContext";

describe("Iranian mobile normalization", () => {
  it.each([
    "09123456789",
    "9123456789",
    "+989123456789",
    "989123456789",
    "00989123456789",
    "0912 345 6789",
    "0912-345-6789",
    "۰۹۱۲۳۴۵۶۷۸۹",
    "٠٩١٢٣٤٥٦٧٨٩",
  ])("accepts %s", (raw) => {
    expect(normalizeIranianMobile(raw)).toBe("+989123456789");
  });

  it.each(["", "0912345678", "02112345678", "091234567890", "0912abc6789", "+19123456789"])(
    "rejects %s",
    (raw) => {
      expect(normalizeIranianMobile(raw)).toBeNull();
    }
  );

  it("formats and masks for display", () => {
    expect(formatIranianMobile("989123456789")).toBe("0912 345 6789");
    expect(maskMobile("+989123456789")).toBe("+98912***6789");
    expect(toEnglishDigits("۱۲۳")).toBe("123");
  });
});

describe("phone OTP error classification", () => {
  it.each([
    [{ code: "otp_disabled", message: "Signups not allowed for otp" }, "not_registered"],
    [{ code: "otp_expired", message: "Token has expired or is invalid" }, "invalid_code"],
    [{ code: "over_sms_send_rate_limit", status: 429 }, "too_many"],
    [{ code: "phone_provider_disabled" }, "not_enabled"],
    [{ code: "sms_send_failed" }, "sms_failed"],
    [{ code: "hook_timeout" }, "sms_failed"],
    [{ code: "unexpected_failure", status: 500 }, "generic"],
  ])("%o → %s", (error, expected) => {
    expect(classifyPhoneOtpError(error)).toBe(expected);
  });
});
