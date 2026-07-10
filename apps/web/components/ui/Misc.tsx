import { Icon, type IconName } from "./Icon";
import { cn } from "@/lib/utils";

export function PageIntro({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-[var(--color-ink)]">
          {title}
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-[var(--color-ink-soft)]">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon = "search",
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] bg-white px-6 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--color-surface-muted)] text-[var(--color-ink-faint)]">
        <Icon name={icon} width={24} height={24} />
      </span>
      <h3 className="mt-4 text-sm font-semibold text-[var(--color-ink)]">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-[var(--color-ink-soft)]">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Disclaimer({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border border-[var(--color-warn)]/30 bg-[var(--color-warn-soft)]/60 px-4 py-3 text-xs leading-relaxed text-[var(--color-warn)]",
        className
      )}
    >
      <span className="mt-0.5 shrink-0">
        <Icon name="shield" width={16} height={16} />
      </span>
      <p>
        <strong className="font-semibold">Clinical safety notice.</strong> PhysioAI
        provides decision-support only and does not give a definitive medical
        diagnosis. All hypotheses must be confirmed by hands-on clinical
        examination. Refer to a physician or emergency care when clinically
        indicated.
      </p>
    </div>
  );
}

export function Spinner({ label = "Analyzing…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-sm text-[var(--color-ink-soft)]">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-primary)]" />
      {label}
    </div>
  );
}

export function BulletList({
  items,
  tone = "neutral",
}: {
  items: string[];
  tone?: "neutral" | "primary" | "danger" | "warn" | "success";
}) {
  const dot: Record<string, string> = {
    neutral: "bg-[var(--color-ink-faint)]",
    primary: "bg-[var(--color-primary)]",
    danger: "bg-[var(--color-danger)]",
    warn: "bg-[var(--color-warn)]",
    success: "bg-[var(--color-success)]",
  };
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-sm text-[var(--color-ink-soft)]">
          <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", dot[tone])} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
