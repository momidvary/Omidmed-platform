/*
 * Phone-number normalization for authentication.
 * Iranian mobile numbers are first-class; the country table is
 * extensible so more countries can be added without touching callers.
 */

export interface CountrySpec {
  /** E.164 dial code without '+', e.g. "98" */
  dialCode: string;
  label: string;
  flag: string;
  /** Validates the national significant number (without dial code). */
  nationalPattern: RegExp;
  /** Example national number for the input placeholder. */
  placeholder: string;
}

export const countries: CountrySpec[] = [
  {
    dialCode: "98",
    label: "ایران (+98)",
    flag: "🇮🇷",
    // Iranian mobiles: 9xxxxxxxxx (10 digits, starting with 9)
    nationalPattern: /^9\d{9}$/,
    placeholder: "9123456789",
  },
  // Add more countries here — no other code changes needed.
];

/** Convert Persian (۰-۹) and Arabic (٠-٩) digits to ASCII digits. */
export function toEnglishDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

export type NormalizeResult =
  | { ok: true; e164: string }
  | { ok: false; reason: "empty" | "invalid" };

/**
 * Normalize a phone number to E.164 for the given country.
 * Accepts local (09…, 9…), international (98…, +98…, 0098…) forms and
 * Persian/Arabic digits. Returns { ok:false } instead of throwing.
 */
export function normalizePhoneNumber(
  raw: string,
  country: CountrySpec
): NormalizeResult {
  if (!raw || !raw.trim()) return { ok: false, reason: "empty" };

  // Strip spaces, dashes, dots, parentheses; convert eastern digits.
  let s = toEnglishDigits(raw).replace(/[\s\-().]/g, "");

  if (s.startsWith("+")) s = s.slice(1);
  if (/\D/.test(s)) return { ok: false, reason: "invalid" };

  if (s.startsWith("00" + country.dialCode)) {
    s = s.slice(2 + country.dialCode.length);
  } else if (s.startsWith(country.dialCode)) {
    s = s.slice(country.dialCode.length);
  } else if (s.startsWith("0")) {
    s = s.slice(1);
  }

  if (!country.nationalPattern.test(s)) return { ok: false, reason: "invalid" };
  return { ok: true, e164: `+${country.dialCode}${s}` };
}

/** Convenience wrapper for Iranian numbers (the required entry point). */
export function normalizeIranianPhoneNumber(raw: string): NormalizeResult {
  return normalizePhoneNumber(raw, countries[0]);
}

/** Mask an E.164 number for display/logs: +98912***6789 */
export function maskPhone(e164: string): string {
  if (e164.length < 8) return "***";
  return `${e164.slice(0, 6)}***${e164.slice(-4)}`;
}
