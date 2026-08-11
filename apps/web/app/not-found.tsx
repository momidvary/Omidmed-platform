import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-5 text-center">
      <p className="font-mono text-sm text-[var(--color-ink-faint)]">404</p>
      <h1 className="mt-2 text-lg font-bold text-[var(--color-ink)]">
        Page not found
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-soft)]">
        This page doesn&apos;t exist or has moved.
      </p>
      <p
        dir="rtl"
        className="mt-2 text-[13px] leading-relaxed text-[var(--color-ink-faint)] font-[family-name:var(--font-vazirmatn)]"
      >
        این صفحه وجود ندارد یا جابه‌جا شده است.
      </p>
      <div className="mt-5 flex justify-center gap-3">
        <Link
          href="/"
          className="rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-primary-strong)]"
        >
          Dashboard
        </Link>
        <Link
          href="/patient"
          className="rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-muted)] font-[family-name:var(--font-vazirmatn)]"
        >
          پرتال بیمار
        </Link>
      </div>
    </div>
  );
}
