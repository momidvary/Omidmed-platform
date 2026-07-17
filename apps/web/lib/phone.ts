/*
 * Phone-number normalization (E.164) — Iranian numbers first-class,
 * extensible per-country. Identical to the copy on the phone-OTP branch
 * so the two branches merge cleanly.
 */

export interface CountrySpec {
  dialCode: string;
  label: string;
  nationalPattern: RegExp;
}

export const countries: CountrySpec[] = [
  { dialCode: "98", label: "ایران (+98)", nationalPattern: /^9\d{9}$/ },
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

export function normalizePhoneNumber(
  raw: string,
  country: CountrySpec
): NormalizeResult {
  if (!raw || !raw.trim()) return { ok: false, reason: "empty" };
  let s = toEnglishDigits(raw).replace(/[\s\-().]/g, "");
  if (s.startsWith("+")) s = s.slice(1);
  if (/\D/.test(s)) return { ok: false, reason: "invalid" };
  if (s.startsWith("00" + country.dialCode)) s = s.slice(2 + country.dialCode.length);
  else if (s.startsWith(country.dialCode)) s = s.slice(country.dialCode.length);
  else if (s.startsWith("0")) s = s.slice(1);
  if (!country.nationalPattern.test(s)) return { ok: false, reason: "invalid" };
  return { ok: true, e164: `+${country.dialCode}${s}` };
}

export function normalizeIranianPhoneNumber(raw: string): NormalizeResult {
  return normalizePhoneNumber(raw, countries[0]);
}

/** Mask an E.164 number for display: +98912***6789 */
export function maskPhone(e164: string): string {
  if (!e164 || e164.length < 8) return "***";
  return `${e164.slice(0, 6)}***${e164.slice(-4)}`;
}
