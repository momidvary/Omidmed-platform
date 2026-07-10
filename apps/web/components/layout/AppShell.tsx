"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Icon } from "@/components/ui/Icon";
import { navItems } from "@/lib/nav";
import { useLocale } from "@/lib/store/LocaleContext";
import { locales } from "@/lib/i18n/translations";
import type { Locale } from "@/lib/i18n/translations";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const { t, dir, locale, setLocale } = useLocale();

  // The patient portal is patient-facing (Persian, RTL) and must not show
  // the clinician sidebar/topbar — it brings its own minimal chrome.
  if (pathname.startsWith("/patient")) {
    return <>{children}</>;
  }

  const current =
    navItems.find((n) =>
      n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)
    ) ?? navItems[0];

  return (
    <div
      dir={dir}
      className={
        dir === "rtl"
          ? "flex min-h-screen font-[family-name:var(--font-vazirmatn)]"
          : "flex min-h-screen"
      }
    >
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-e border-[var(--color-border)] lg:block">
        <div className="sticky top-0 h-screen">
          <Sidebar />
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 start-0 w-72 border-e border-[var(--color-border)] shadow-xl">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--color-border)] bg-white/80 px-4 py-3 backdrop-blur sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="grid h-9 w-9 place-items-center rounded-lg text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-muted)] lg:hidden"
            aria-label="Open menu"
          >
            <Icon name="menu" />
          </button>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-semibold text-[var(--color-ink)]">
              {t(`nav.${current.key}`)}
            </h1>
            <p className="truncate text-xs text-[var(--color-ink-faint)]">
              {t(`nav.${current.key}.desc`)}
            </p>
          </div>

          {/* Language switcher */}
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
            aria-label="Language"
            className="rounded-lg border border-[var(--color-border)] bg-white px-2 py-1.5 text-xs text-[var(--color-ink-soft)] focus:border-[var(--color-primary)] focus:outline-none"
          >
            {locales.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>

          <div className="hidden items-center gap-2 rounded-full bg-[var(--color-primary-tint)] px-3 py-1.5 text-xs font-medium text-[var(--color-primary-strong)] sm:flex">
            <Icon name="shield" width={14} height={14} />
            {t("shell.evidence")}
          </div>

          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-full bg-[var(--color-surface-muted)] text-[var(--color-ink-soft)]"
            aria-label="Account"
          >
            <Icon name="user" width={18} height={18} />
          </button>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
