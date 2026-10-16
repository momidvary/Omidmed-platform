import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold whitespace-nowrap transition-all duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-primary)]/25";

const variants: Record<Variant, string> = {
  primary:
    "bg-gradient-to-b from-[#14b8a6] to-[var(--color-primary)] text-white shadow-[0_1px_2px_rgba(13,148,136,0.25),0_6px_16px_-6px_rgba(13,148,136,0.55)] hover:from-[var(--color-primary)] hover:to-[var(--color-primary-strong)]",
  secondary:
    "border border-[var(--color-border)] bg-white text-[var(--color-ink)] shadow-[0_1px_2px_rgba(15,23,42,0.05)] hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-primary-tint)] hover:text-[var(--color-primary-strong)]",
  ghost: "text-[var(--color-primary-strong)] hover:bg-[var(--color-primary-tint)]",
  danger:
    "bg-[var(--color-danger)] text-white shadow-[0_6px_16px_-6px_rgba(220,38,38,0.55)] hover:brightness-95",
};

const sizes: Record<Size, string> = {
  sm: "min-h-9 px-3.5 text-sm",
  md: "min-h-11 px-5 text-sm",
  lg: "min-h-12 px-6 text-base",
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: CommonProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  href,
  children,
}: CommonProps & { href: string }) {
  return (
    <Link
      href={href}
      className={cn(base, variants[variant], sizes[size], className)}
    >
      {children}
    </Link>
  );
}
