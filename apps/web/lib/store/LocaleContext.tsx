"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  localeDir,
  translate,
  type Locale,
} from "@/lib/i18n/translations";
import { usePathname } from "next/navigation";
import { isPatientPortalPath } from "@/lib/routes";

interface LocaleContextValue {
  locale: Locale;
  dir: "ltr" | "rtl";
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

const STORAGE_KEY = "physioai:locale:v1";

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const pathname = usePathname();

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (stored === "en" || stored === "fa" || stored === "ar") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time localStorage hydration; cannot run during SSR
      setLocaleState(stored);
    }
  }, []);

  useEffect(() => {
    const documentLocale = isPatientPortalPath(pathname) ? "fa" : locale;
    document.documentElement.lang = documentLocale;
    document.documentElement.dir = localeDir(documentLocale);
  }, [locale, pathname]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      dir: localeDir(locale),
      setLocale: (l) => {
        setLocaleState(l);
        localStorage.setItem(STORAGE_KEY, l);
      },
      t: (key) => translate(locale, key),
    }),
    [locale]
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}
