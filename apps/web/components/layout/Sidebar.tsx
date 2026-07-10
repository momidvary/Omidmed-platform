"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "@/lib/nav";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--color-primary)] text-white">
          <Icon name="sparkle" width={20} height={20} />
        </span>
        <div className="leading-tight">
          <p className="text-[15px] font-semibold text-[var(--color-ink)]">PhysioAI</p>
          <p className="text-[11px] text-[var(--color-ink-faint)]">Clinical Assistant</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {navItems.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                active
                  ? "bg-[var(--color-primary-tint)] text-[var(--color-primary-strong)]"
                  : "text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-muted)]"
              )}
            >
              <span
                className={cn(
                  active ? "text-[var(--color-primary)]" : "text-[var(--color-ink-faint)] group-hover:text-[var(--color-ink-soft)]"
                )}
              >
                <Icon name={item.icon} />
              </span>
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-[var(--color-border)] p-4">
        <Link
          href="/patient"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-xl border border-dashed border-[var(--color-border)] px-3 py-2.5 text-sm font-medium text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary-strong)]"
        >
          <Icon name="user" width={18} height={18} />
          Patient Portal
          <span className="ms-auto text-[10px] text-[var(--color-ink-faint)]">
            پرتال بیمار
          </span>
        </Link>
        <div className="flex items-start gap-2 rounded-xl bg-[var(--color-surface-muted)] p-3 text-[11px] leading-relaxed text-[var(--color-ink-soft)]">
          <span className="mt-0.5 text-[var(--color-warn)]">
            <Icon name="shield" width={16} height={16} />
          </span>
          <p>
            Decision-support only. Always confirm with hands-on clinical
            examination and professional judgment.
          </p>
        </div>
      </div>
    </div>
  );
}
