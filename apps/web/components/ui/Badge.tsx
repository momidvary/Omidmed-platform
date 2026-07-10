import { cn } from "@/lib/utils";

type Tone = "neutral" | "primary" | "accent" | "warn" | "danger" | "success";

const tones: Record<Tone, string> = {
  neutral: "bg-[var(--color-surface-muted)] text-[var(--color-ink-soft)]",
  primary: "bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]",
  accent: "bg-[var(--color-accent-soft)] text-[var(--color-accent)]",
  warn: "bg-[var(--color-warn-soft)] text-[var(--color-warn)]",
  danger: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
  success: "bg-[var(--color-success-soft)] text-[var(--color-success)]",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
