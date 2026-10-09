"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavActive, sidebarItems, type NavItem } from "@/lib/nav";
import { Icon } from "@/components/ui/Icon";
import { useAttention } from "@/lib/store/AttentionContext";
import { useLocale } from "@/lib/store/LocaleContext";
import { cn } from "@/lib/utils";

function NavLink({
  item,
  active,
  count,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  count: number | null;
  onNavigate?: () => void;
}) {
  const { t, locale } = useLocale();
  const label = t(`nav.${item.key}`);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
        active
          ? "bg-[var(--color-primary-tint)] text-[var(--color-primary-strong)]"
          : "text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-muted)]"
      )}
    >
      <span
        className={cn(
          active
            ? "text-[var(--color-primary)]"
            : "text-[var(--color-ink-faint)] group-hover:text-[var(--color-ink-soft)]"
        )}
      >
        <Icon name={item.icon} />
      </span>
      <span className="flex-1 font-medium">{label}</span>
      {count !== null && count > 0 && (
        <span
          className={cn(
            "min-w-6 rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold",
            item.badge === "alerts"
              ? "bg-[var(--color-danger)] text-white"
              : "bg-[var(--color-warn-soft)] text-[var(--color-warn)]"
          )}
        >
          <span aria-hidden="true">
            {count > 99 ? "99+" : count.toLocaleString(locale === "fa" ? "fa-IR" : "en-US")}
          </span>
          <span className="sr-only">
            {count} {t("nav.waiting")}
          </span>
        </span>
      )}
    </Link>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { t } = useLocale();
  const { counts } = useAttention();
  const tools = sidebarItems("tools");
  const toolActive = tools.some((item) => isNavActive(item, pathname));
  const [toolsChoice, setToolsChoice] = useState<boolean | null>(null);
  const toolsOpen = toolsChoice ?? toolActive;

  const link = (item: NavItem) => (
    <NavLink
      key={item.href}
      item={item}
      active={isNavActive(item, pathname)}
      count={item.badge && counts ? counts[item.badge] : null}
      onNavigate={onNavigate}
    />
  );

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--color-primary)] text-white">
          <Icon name="sparkle" width={20} height={20} />
        </span>
        <div className="leading-tight">
          <p className="text-[15px] font-semibold text-[var(--color-ink)]">PhysioAI</p>
          <p className="text-[11px] text-[var(--color-ink-faint)]">
            {t("shell.brand.sub")}
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {sidebarItems("main").map(link)}

        <div className="pt-3">
          <button
            type="button"
            onClick={() => setToolsChoice(!toolsOpen)}
            aria-expanded={toolsOpen}
            aria-controls="sidebar-tools"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-muted)]"
          >
            <Icon name="tools" width={18} height={18} />
            <span className="flex-1 text-start">{t("nav.tools")}</span>
            <Icon
              name="chevron"
              width={16}
              height={16}
              className={cn("transition-transform", toolsOpen && "rotate-180")}
            />
          </button>
          {toolsOpen && (
            <div id="sidebar-tools" className="mt-0.5 space-y-0.5">
              {tools.map(link)}
            </div>
          )}
        </div>

        <div className="pt-3">{sidebarItems("footer").map(link)}</div>
      </nav>

      <div className="space-y-3 border-t border-[var(--color-border)] p-4">
        <Link
          href="/patient"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-xl border border-dashed border-[var(--color-border)] px-3 py-2.5 text-sm font-medium text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary-strong)]"
        >
          <Icon name="user" width={18} height={18} />
          {t("nav.patient-portal")}
        </Link>
        <div className="flex items-start gap-2 rounded-xl bg-[var(--color-surface-muted)] p-3 text-[11px] leading-relaxed text-[var(--color-ink-soft)]">
          <span className="mt-0.5 text-[var(--color-warn)]">
            <Icon name="shield" width={16} height={16} />
          </span>
          <p>{t("shell.disclaimer")}</p>
        </div>
      </div>
    </div>
  );
}
