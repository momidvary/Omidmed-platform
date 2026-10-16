/**
 * A number that keeps its numeric value (comparisons and arithmetic still
 * work) but prints with Persian digits inside template strings.
 */
export function persianNumber(value: number): number {
  const printed = value.toLocaleString("fa-IR", { useGrouping: false, maximumFractionDigits: 2 });
  const boxed = new Number(value);
  return Object.assign(boxed, { toString: () => printed }) as unknown as number;
}

const persianTextCache = new WeakMap<object, object>();

/**
 * Persian page text with every numeric argument of its text functions
 * printed in Persian digits, so "درد 5/10" cannot appear next to Persian
 * words. String arguments (names, IDs, phone numbers) are left unchanged.
 */
export function withPersianNumbers<T extends object>(text: T): T {
  const cached = persianTextCache.get(text);
  if (cached) return cached as T;
  const out: Record<string, unknown> = Array.isArray(text) ? [] as unknown as Record<string, unknown> : {};
  for (const [key, value] of Object.entries(text)) {
    if (typeof value === "function") {
      out[key] = (...args: unknown[]) =>
        value(...args.map((arg) => (typeof arg === "number" && Number.isFinite(arg) ? persianNumber(arg) : arg)));
    } else if (value && typeof value === "object") {
      out[key] = withPersianNumbers(value as object);
    } else {
      out[key] = value;
    }
  }
  persianTextCache.set(text, out);
  return out as T;
}
