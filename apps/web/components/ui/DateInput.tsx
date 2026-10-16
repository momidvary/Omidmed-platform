"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { JALALI_MONTHS, fromJalali, jalaliMonthLength, toJalali, todayIso } from "@/lib/jalali";
import { useLocale } from "@/lib/store/LocaleContext";

const control =
  "min-h-11 rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm text-[var(--color-ink)] transition-colors hover:border-[#cbd5e1] focus:border-[var(--color-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--color-primary)]/15 disabled:cursor-not-allowed disabled:bg-[var(--color-surface-muted)]";

type ChangeEvent = { target: { value: string } };

interface Props {
  /** ISO "yyyy-mm-dd", or "yyyy-mm-ddTHH:MM" with `withTime`. */
  value: string;
  onChange: (event: ChangeEvent) => void;
  withTime?: boolean;
  min?: string;
  max?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  className?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

interface Parts {
  year: string;
  month: string;
  day: string;
  time: string;
}

function partsOf(value: string): Parts {
  const [datePart = "", time = ""] = value.split("T");
  const jalali = datePart ? toJalali(datePart) : null;
  return {
    year: jalali ? String(jalali.year) : "",
    month: jalali ? String(jalali.month) : "",
    day: jalali ? String(jalali.day) : "",
    time: time.slice(0, 5),
  };
}

const fa = (value: number) => value.toLocaleString("fa-IR", { useGrouping: false });

/**
 * Date (and optional time) field. The Persian interface shows Solar Hijri
 * day / month / year selectors; other languages use the browser's native
 * control. The value is always an ISO Gregorian string, so stored data and
 * database validation are unchanged.
 */
export function DateInput({
  value,
  onChange,
  withTime = false,
  min,
  max,
  disabled,
  required,
  id,
  className,
  ...aria
}: Props) {
  const { locale } = useLocale();
  const [parts, setParts] = useState<Parts>(() => partsOf(value));
  const [seenValue, setSeenValue] = useState(value);
  // A new value from outside (for example a reopened draft) replaces the
  // selection; values this control emitted itself already match it.
  if (value !== seenValue) {
    setSeenValue(value);
    setParts(partsOf(value));
  }

  if (locale !== "fa") {
    return (
      <input
        id={id}
        type={withTime ? "datetime-local" : "date"}
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        required={required}
        onChange={onChange}
        className={cn(control, "w-full", className)}
        {...aria}
      />
    );
  }

  const thisYear = toJalali(todayIso())?.year ?? 1405;
  const minYear = (min && toJalali(min.slice(0, 10))?.year) || thisYear - 5;
  const maxYear = (max && toJalali(max.slice(0, 10))?.year) || thisYear + 3;
  const years: number[] = [];
  for (let year = maxYear; year >= minYear; year -= 1) years.push(year);
  const dayCount =
    parts.year && parts.month ? jalaliMonthLength(Number(parts.year), Number(parts.month)) : 31;

  function update(patch: Partial<Parts>) {
    const next = { ...parts, ...patch };
    if (next.year && next.month && next.day) {
      const length = jalaliMonthLength(Number(next.year), Number(next.month));
      if (Number(next.day) > length) next.day = String(length);
    }
    setParts(next);
    const iso =
      next.year && next.month && next.day
        ? fromJalali({ year: Number(next.year), month: Number(next.month), day: Number(next.day) })
        : null;
    const emitted = iso ? (withTime ? (next.time ? `${iso}T${next.time}` : "") : iso) : "";
    setSeenValue(emitted);
    onChange({ target: { value: emitted } });
  }

  const select = cn(control, "select-chevron cursor-pointer appearance-none");

  return (
    <div className={cn("flex flex-wrap gap-2", className)} role="group">
      <select
        id={id}
        aria-label="روز"
        value={parts.day}
        disabled={disabled}
        required={required}
        onChange={(event) => update({ day: event.target.value })}
        className={cn(select, "w-20")}
        {...aria}
      >
        <option value="">روز</option>
        {Array.from({ length: dayCount }, (_, index) => index + 1).map((day) => (
          <option key={day} value={day}>
            {fa(day)}
          </option>
        ))}
      </select>
      <select
        aria-label="ماه"
        value={parts.month}
        disabled={disabled}
        required={required}
        onChange={(event) => update({ month: event.target.value })}
        className={cn(select, "min-w-28 flex-1")}
      >
        <option value="">ماه</option>
        {JALALI_MONTHS.map((name, index) => (
          <option key={name} value={index + 1}>
            {name}
          </option>
        ))}
      </select>
      <select
        aria-label="سال"
        value={parts.year}
        disabled={disabled}
        required={required}
        onChange={(event) => update({ year: event.target.value })}
        className={cn(select, "w-24")}
      >
        <option value="">سال</option>
        {years.map((year) => (
          <option key={year} value={year}>
            {fa(year)}
          </option>
        ))}
      </select>
      {withTime && (
        <input
          type="time"
          aria-label="ساعت"
          value={parts.time}
          disabled={disabled}
          required={required}
          onChange={(event) => update({ time: event.target.value })}
          className={cn(control, "w-32")}
          dir="ltr"
        />
      )}
    </div>
  );
}
