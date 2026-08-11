"use client";

import { useEffect } from "react";
import Link from "next/link";

/*
 * Route-level error boundary. Deliberately uses no context hooks: the
 * thing that threw may BE a provider, and reading its context here would
 * throw again inside the boundary. Text is bilingual for the same reason
 * — the locale provider may be the casualty.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 🔌 ERROR REPORTING INTEGRATION POINT — send to Sentry or similar.
    // Without this, production failures are invisible.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-5 text-center">
      <h1 className="text-lg font-bold text-[var(--color-ink)]">
        Something went wrong
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-soft)]">
        This page failed to load. Nothing you entered has been sent anywhere.
        Try again, and if it keeps happening, reload the app.
      </p>
      <p
        dir="rtl"
        className="mt-2 text-[13px] leading-relaxed text-[var(--color-ink-faint)] font-[family-name:var(--font-vazirmatn)]"
      >
        بارگذاری این صفحه با خطا مواجه شد. اطلاعاتی که وارد کرده‌اید جایی ارسال
        نشده است. دوباره تلاش کنید.
      </p>
      {error.digest && (
        <p className="mt-3 font-mono text-[11px] text-[var(--color-ink-faint)]">
          ref: {error.digest}
        </p>
      )}
      <div className="mt-5 flex justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-primary-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-muted)]"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
