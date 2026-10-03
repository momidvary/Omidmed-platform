/*
 * Iranian mobile numbers for patient phone sign-in.
 * Accepts 0912…, 912…, 98912…, +98912…, 0098912… with Persian/Arabic
 * digits, spaces or dashes, and returns E.164 (+98912…).
 */

/** Convert Persian (۰-۹) and Arabic (٠-٩) digits to ASCII digits. */
export function toEnglishDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

/** E.164 ("+98912…") for a valid Iranian mobile number, otherwise null. */
export function normalizeIranianMobile(raw: string): string | null {
  let s = toEnglishDigits(raw ?? "").replace(/[\s\-().]/g, "");
  if (s.startsWith("+")) s = s.slice(1);
  if (!s || /\D/.test(s)) return null;
  if (s.startsWith("0098")) s = s.slice(4);
  else if (s.startsWith("98")) s = s.slice(2);
  else if (s.startsWith("0")) s = s.slice(1);
  return /^9\d{9}$/.test(s) ? `+98${s}` : null;
}

/** Display form for a stored number: "98912…" / "+98912…" → "0912 345 6789". */
export function formatIranianMobile(stored: string | null | undefined): string {
  const e164 = stored ? normalizeIranianMobile(stored) : null;
  if (!e164) return stored ?? "";
  const local = `0${e164.slice(3)}`;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

/** Masked display: +98912***6789 */
export function maskMobile(e164: string): string {
  return e164.length < 8 ? "***" : `${e164.slice(0, 6)}***${e164.slice(-4)}`;
}
