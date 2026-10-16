/*
 * Solar Hijri (Jalali) dates for the Persian interface.
 *
 * Values are always stored and sent as ISO Gregorian "yyyy-mm-dd" strings;
 * only the controls and labels use the Jalali calendar. Conversion relies on
 * the platform's Intl Persian calendar, so leap years follow the same rules
 * the browser uses to display dates elsewhere in the app.
 */

export interface JalaliDate {
  year: number;
  month: number;
  day: number;
}

export const JALALI_MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];

const persianParts = new Intl.DateTimeFormat("en-u-ca-persian-nu-latn", {
  timeZone: "UTC",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

function utcNoon(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** ISO Gregorian date → Jalali parts (null for an invalid date). */
export function toJalali(iso: string): JalaliDate | null {
  const date = utcNoon(iso);
  if (!date) return null;
  const parts = Object.fromEntries(
    persianParts.formatToParts(date).map((part) => [part.type, part.value])
  );
  return { year: Number.parseInt(parts.year, 10), month: Number(parts.month), day: Number(parts.day) };
}

function compare(a: JalaliDate, b: JalaliDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

/** Jalali parts → ISO Gregorian date, or null if that day does not exist. */
export function fromJalali({ year, month, day }: JalaliDate): string | null {
  if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  // 1 Farvardin falls on 20–21 March; start there and step to the exact day.
  const offset = month <= 6 ? (month - 1) * 31 : 186 + (month - 7) * 30;
  const guess = new Date(Date.UTC(year + 621, 2, 21 + offset + day - 1, 12));
  const target = { year, month, day };
  for (let step = 0; step < 5; step += 1) {
    const current = toJalali(isoOf(guess));
    if (!current) return null;
    const difference = compare(target, current);
    if (difference === 0) return isoOf(guess);
    guess.setUTCDate(guess.getUTCDate() + (difference > 0 ? 1 : -1));
  }
  return null;
}

/** Days in a Jalali month (Esfand has 30 days in leap years). */
export function jalaliMonthLength(year: number, month: number): number {
  if (month <= 6) return 31;
  if (month <= 11) return 30;
  return fromJalali({ year, month: 12, day: 30 }) ? 30 : 29;
}

/** Today in the clinic's local calendar, as ISO. */
export function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** "۲۴ مهر ۱۴۰۵" for an ISO date, for labels and summaries. */
export function formatJalali(iso: string): string {
  const date = toJalali(iso);
  if (!date) return iso;
  const digits = (value: number) => value.toLocaleString("fa-IR", { useGrouping: false });
  return `${digits(date.day)} ${JALALI_MONTHS[date.month - 1]} ${digits(date.year)}`;
}
