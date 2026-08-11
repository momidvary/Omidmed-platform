"use client";

import { isMockMode } from "@/lib/config";
import { Icon } from "@/components/ui/Icon";

/*
 * Two guards that keep the running mode impossible to mistake.
 *
 * `DemoBanner` — mock mode serves fabricated patient records with no
 * authentication. That is fine for a demo and dangerous if anyone
 * believes it is real, so the banner is permanent and cannot be closed.
 *
 * `ConfigError` — real mode with no Supabase configuration. The app
 * refuses to render rather than degrading into mock mode.
 */

export function DemoBanner() {
  if (!isMockMode) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-[var(--color-warn)] px-4 py-1.5 text-center text-[11px] font-medium text-white"
    >
      <Icon name="alert" width={13} height={13} />
      <span>
        Demo mode — sample data only, no sign-in, nothing is saved to a
        server. <span dir="rtl">حالت نمایشی: داده‌ها واقعی نیستند.</span>
      </span>
    </div>
  );
}

export function ConfigError() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-5 py-10">
      <div className="rounded-2xl border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] p-6">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--color-danger)] text-white">
          <Icon name="alert" width={22} height={22} />
        </span>
        <h1 className="mt-4 text-base font-bold text-[var(--color-ink)]">
          Configuration incomplete
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-soft)]">
          This deployment has no Supabase connection, so there is no
          authentication and no database. The app will not start in this
          state — a clinical tool must never fall back to unauthenticated
          demo data.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-soft)]">
          Set <code className="rounded bg-white/70 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
          and{" "}
          <code className="rounded bg-white/70 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>{" "}
          for this environment and redeploy — these are read at build time,
          so a rebuild is required. To run the offline demo on purpose, set{" "}
          <code className="rounded bg-white/70 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_DATA_MODE=mock</code>.
        </p>
        <p
          dir="rtl"
          className="mt-4 border-t border-[var(--color-danger)]/25 pt-3 text-[13px] leading-relaxed text-[var(--color-ink-soft)] font-[family-name:var(--font-vazirmatn)]"
        >
          اتصال به Supabase تنظیم نشده است. برای راهنمای فارسی راه‌اندازی، فایل{" "}
          <code dir="ltr" className="rounded bg-white/70 px-1.5 py-0.5 text-xs">docs/RAHNAMA-FA.md</code>{" "}
          را ببینید.
        </p>
      </div>
    </div>
  );
}
