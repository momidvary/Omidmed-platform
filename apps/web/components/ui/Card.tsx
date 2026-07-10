import { cn } from "@/lib/utils";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  icon,
  action,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
      <div className="flex items-start gap-3">
        {icon && (
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--color-primary-tint)] text-[var(--color-primary)]">
            {icon}
          </span>
        )}
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-ink)]">{title}</h3>
          {subtitle && (
            <p className="mt-0.5 text-xs text-[var(--color-ink-faint)]">{subtitle}</p>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}

export function CardBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}
