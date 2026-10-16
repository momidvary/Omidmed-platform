import { cn } from "@/lib/utils";
import { cloneElement, useId } from "react";

interface FieldControlProps {
  id?: string;
  required?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactElement<FieldControlProps>;
}) {
  const generatedId = useId();
  const controlId = children.props.id ?? generatedId;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const describedBy = [
    children.props["aria-describedby"],
    error ? errorId : hint ? hintId : null,
  ]
    .filter(Boolean)
    .join(" ") || undefined;
  const control = cloneElement(children, {
    id: controlId,
    required: required || children.props.required || undefined,
    "aria-invalid": error ? true : children.props["aria-invalid"],
    "aria-describedby": describedBy,
  });

  return (
    <label className="block" htmlFor={controlId}>
      <span className="mb-1.5 flex items-center gap-1 text-sm font-medium text-[var(--color-ink)]">
        {label}
        {required && (
          <span aria-hidden="true" className="text-[var(--color-danger)]">
            *
          </span>
        )}
      </span>
      {control}
      {hint && !error && (
        <span
          id={hintId}
          className="mt-1 block text-xs text-[var(--color-ink-faint)]"
        >
          {hint}
        </span>
      )}
      {error && (
        <span
          id={errorId}
          role="alert"
          className="mt-1 block text-xs text-[var(--color-danger)]"
        >
          {error}
        </span>
      )}
    </label>
  );
}

const control =
  "min-h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm text-[var(--color-ink)] shadow-[inset_0_1px_1px_rgba(15,23,42,0.03)] placeholder:text-[var(--color-ink-faint)] transition-colors hover:border-[#cbd5e1] focus:border-[var(--color-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--color-primary)]/15 disabled:cursor-not-allowed disabled:bg-[var(--color-surface-muted)]";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(control, props.className)} />;
}

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>
) {
  return (
    <textarea {...props} className={cn(control, "min-h-24 resize-y", props.className)} />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cn(control, "select-chevron cursor-pointer appearance-none", props.className)} />
  );
}
