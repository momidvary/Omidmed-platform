"use client";

import { useLocale } from "@/lib/store/LocaleContext";
import type { Locale } from "@/lib/i18n/translations";

/**
 * Page-level UI text. Each page keeps its strings beside a typed English
 * source; Persian must translate every key (the type enforces it), Arabic
 * may translate a subset and falls back to English for the rest.
 */
export interface PageText<T extends object> {
  en: T;
  fa: T;
  ar?: Partial<T>;
}

export function pickText<T extends object>(text: PageText<T>, locale: Locale): T {
  if (locale === "fa") return text.fa;
  if (locale === "ar") return { ...text.en, ...text.ar };
  return text.en;
}

export function useText<T extends object>(text: PageText<T>): T {
  const { locale } = useLocale();
  return pickText(text, locale);
}

/** Intl locale tag for dates and numbers in the clinician interface. */
export function intlLocale(locale: Locale): string {
  return locale === "fa" ? "fa-IR" : locale === "ar" ? "ar" : "en-GB";
}
