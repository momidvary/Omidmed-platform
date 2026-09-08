"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Icon } from "@/components/ui/Icon";
import { navItems } from "@/lib/nav";
import { useLocale } from "@/lib/store/LocaleContext";
import { locales } from "@/lib/i18n/translations";
import type { Locale } from "@/lib/i18n/translations";
import { ClinicianGate } from "@/components/auth/ClinicianGate";
import { SaveStatusPill } from "@/components/ui/SaveStatusPill";
import { useAuth } from "@/lib/store/AuthContext";
import { isMockMode } from "@/lib/config";
import { isPatientPortalPath, isPublicAuthPath } from "@/lib/routes";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { t, dir, locale, setLocale } = useLocale();
  const {
    session,
    profile,
    activeClinicId,
    setActiveClinicId,
    signOut,
  } = useAuth();

  // The patient portal is patient-facing (Persian, RTL) and must not show
  // the clinician sidebar/topbar — it brings its own minimal chrome.
  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileOpen(false);
        menuButtonRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen]);

  if (isPatientPortalPath(pathname) || isPublicAuthPath(pathname)) {
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
        <div
          className="fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setMobileOpen(false)}
          />
          <div
            ref={drawerRef}
            className="absolute inset-y-0 start-0 w-72 border-e border-[var(--color-border)] bg-white shadow-xl"
          >
            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => {
                setMobileOpen(false);
                menuButtonRef.current?.focus();
              }}
              className="absolute end-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-lg text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-muted)]"
              aria-label="Close menu"
            >
              <Icon name="close" />
            </button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--color-border)] bg-white/80 px-4 py-3 backdrop-blur sm:px-6">
          <button
            ref={menuButtonRef}
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

          <SaveStatusPill
            labels={{
              connected: t("status.connected"),
              saving: t("status.saving"),
              saved: t("status.saved"),
              offline: t("status.offline"),
              save_failed: t("status.save_failed"),
            }}
          />

          {!isMockMode && session && profile && profile.clinics.length > 0 && (
            <select
              value={activeClinicId ?? ""}
              onChange={(event) => setActiveClinicId(event.target.value)}
              aria-label="Active clinic"
              className="max-w-44 rounded-lg border border-[var(--color-border)] bg-white px-2 py-1.5 text-xs text-[var(--color-ink-soft)] focus:border-[var(--color-primary)] focus:outline-none"
            >
              {profile.clinics.length > 1 && (
                <option value="" disabled>
                  Select clinic
                </option>
              )}
              {profile.clinics.map((clinic) => (
                <option key={clinic.id} value={clinic.id}>
                  {clinic.name}
                </option>
              ))}
            </select>
          )}

          <div className="hidden items-center gap-2 rounded-full bg-[var(--color-primary-tint)] px-3 py-1.5 text-xs font-medium text-[var(--color-primary-strong)] sm:flex">
            <Icon name="shield" width={14} height={14} />
            {t("shell.evidence")}
          </div>

          {!isMockMode && session && (
            <button
              type="button"
              onClick={signOut}
              className="rounded-lg px-2.5 py-1.5 text-xs text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-muted)]"
            >
              {t("auth.signout")}
            </button>
          )}
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <ClinicianGate>{children}</ClinicianGate>
        </main>
      </div>
    </div>
  );
}
