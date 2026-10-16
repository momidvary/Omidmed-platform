"use client";

import { useRef, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import {
  NON_COMPLETION_REASONS,
  localDateIn,
  reasonLabel,
  scheduledDays,
  type ReasonCode,
} from "@/lib/clinical/adherence";
import type { Patient, PrescribedExercise } from "@/lib/types";
import { cn } from "@/lib/utils";

const receiptSchema = z.object({ event: z.object({
  id: z.uuid(), localDate: z.iso.date(),
  prescriptionStatus: z.enum(["published", "suspended", "revoked"]),
  alertCreated: z.boolean(),
}) });

type Status = "complete" | "partial" | "not_done";

const WEEKDAYS_FA = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];
const STATUS_LABELS: Record<Status, string> = {
  complete: "کامل انجام دادم",
  partial: "بخشی از آن را انجام دادم",
  not_done: "امروز انجام ندادم",
};
const fa = (value: number) => value.toLocaleString("fa-IR");

function painTone(level: number, selected: boolean): string {
  if (!selected) return "border-[var(--color-border)] bg-white text-[var(--color-ink-soft)]";
  return level >= 7
    ? "border-[var(--color-danger)] bg-[var(--color-danger)] text-white"
    : level >= 4
      ? "border-[var(--color-warn)] bg-[var(--color-warn)] text-white"
      : "border-[var(--color-success)] bg-[var(--color-success)] text-white";
}

/** Retries retain the exact payload/key until the server resolves the outcome. */
export function ExerciseAdherenceForm({ patient, item, onPaused }: {
  patient: Patient; item: PrescribedExercise; onPaused: () => void;
}) {
  const [status, setStatus] = useState<Status | "">("");
  const [reason, setReason] = useState<ReasonCode | "">("");
  const [pain, setPain] = useState<number | null>(null);
  const [sets, setSets] = useState("");
  const [reps, setReps] = useState("");
  const [seconds, setSeconds] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);
  const pending = useRef<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const timezone = patient.prescription?.scheduleTimezone;
  // Today in the program's timezone, fixed for this view.
  const [today] = useState(() => (timezone ? localDateIn(timezone) : null));

  if (!timezone || !item.scheduledWeekdays?.length || !item.prescriptionItemId) {
    return <p className="text-xs">برای ثبت جداگانهٔ تمرین، از درمانگر بخواهید روزهای برنامه را مشخص کند.</p>;
  }
  const days = item.scheduledWeekdays.map((day) => WEEKDAYS_FA[day]).join("، ");
  const scheduledToday =
    today !== null && scheduledDays(item.scheduledWeekdays, today, today, today, null).length > 0;
  const usesDuration = item.targetDurationSeconds !== undefined;
  const usesSets = !usesDuration && item.targetSets !== undefined;

  function chooseStatus(next: Status) {
    setStatus(next);
    if (next !== "complete") {
      setSets(""); setReps(""); setSeconds("");
      return;
    }
    // A complete report meets the target; prefill it, the patient can raise it.
    setReason("");
    setSets(item.targetSets !== undefined ? String(item.targetSets) : "");
    setReps(item.targetReps !== undefined ? String(item.targetReps) : "");
    setSeconds(item.targetDurationSeconds !== undefined ? String(item.targetDurationSeconds) : "");
  }

  const measurementsMissing =
    status === "partial" &&
    ((usesSets && (sets === "" || reps === "")) || (usesDuration && seconds === ""));
  const ready =
    status !== "" &&
    pain !== null &&
    (status === "complete" || reason !== "") &&
    !measurementsMissing;

  async function submit() {
    if (busy || saved || !patient.episodeId) return;
    if (!pending.current) {
      if (!ready || pain === null) return;
      const notDone = status === "not_done";
      pending.current = JSON.stringify({
        completedSets: usesSets ? (notDone ? 0 : Number(sets)) : null,
        completedReps: usesSets ? (notDone ? 0 : Number(reps)) : null,
        completedDurationSeconds: usesDuration ? (notDone ? 0 : Number(seconds)) : null,
        patientId: patient.id, episodeId: patient.episodeId,
        prescriptionItemId: item.prescriptionItemId, status,
        painLevel: pain, clientSubmissionId: crypto.randomUUID(),
        nonCompletionReason: status === "complete" ? null : reason,
      });
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/patient/adherence", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: pending.current,
      });
      if (!response.ok) {
        if ([400, 401, 403, 409, 413, 422].includes(response.status)) {
          pending.current = null;
          setUncertain(false);
          setMessage(response.status === 422
            ? "ثبت پذیرفته نشد؛ روزهای برنامه و مقدار انجام‌شده را بررسی کنید. اگر به هدف نرسیده‌اید، «بخشی از آن را انجام دادم» را انتخاب کنید."
            : "ثبت پذیرفته نشد. صفحه و وضعیت ورود را به‌روز کنید.");
          return;
        }
        throw new Error("unknown outcome");
      }
      const receipt = receiptSchema.parse(await response.json()).event;
      setSaved(true);
      setUncertain(false);
      pending.current = null;
      setMessage("گزارش امروز این تمرین ثبت شد. ممنون!");
      if (receipt.prescriptionStatus !== "published") onPaused();
    } catch {
      setUncertain(true);
      setMessage("نتیجهٔ ثبت مشخص نیست. برای بررسی و تکمیل همان درخواست، دوباره تلاش کنید.");
    } finally {
      setBusy(false);
    }
  }

  if (!scheduledToday) {
    return <p className="border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-ink-soft)]">
      امروز روز این تمرین نیست. روزهای این تمرین: {days}
    </p>;
  }

  const numberInput = (label: string, value: string, onChange: (v: string) => void, max: number) => (
    <label className="flex items-center gap-2 text-xs text-[var(--color-ink-soft)]">
      {label}
      <input type="number" inputMode="numeric" min={0} max={max} value={value}
        onChange={(e) => onChange(e.target.value)} dir="ltr"
        className="w-20 rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-sm" />
    </label>
  );

  return <div className="space-y-4 border-t border-[var(--color-border)] pt-3">
    <div className="flex items-center justify-between gap-2">
      <p className="text-sm font-bold text-[var(--color-ink)]">گزارش امروز این تمرین</p>
      <p className="text-xs text-[var(--color-ink-faint)]">روزهای تمرین: {days}</p>
    </div>
    <fieldset disabled={busy || uncertain || saved} className="space-y-4">
      <div role="group" aria-label="وضعیت انجام تمرین" className="grid gap-2 sm:grid-cols-3">
        {(Object.keys(STATUS_LABELS) as Status[]).map((value) => (
          <button key={value} type="button" aria-pressed={status === value}
            onClick={() => chooseStatus(value)}
            className={cn("rounded-xl border px-3 py-3 text-sm font-medium transition-colors",
              status === value
                ? "border-[var(--color-primary)] bg-[var(--color-primary-tint)] text-[var(--color-primary-strong)]"
                : "border-[var(--color-border)] bg-white text-[var(--color-ink-soft)]")}>
            {STATUS_LABELS[value]}
          </button>
        ))}
      </div>

      {(status === "complete" || status === "partial") && (usesSets || usesDuration) && (
        <div className="flex flex-wrap gap-4 rounded-xl bg-[var(--color-surface-muted)] p-3">
          {usesDuration
            ? numberInput(`مدت انجام‌شده (ثانیه) · هدف ${fa(item.targetDurationSeconds ?? 0)}`, seconds, setSeconds, 21600)
            : <>
              {numberInput(`ست · هدف ${fa(item.targetSets ?? 0)}`, sets, setSets, 50)}
              {numberInput(`تکرار در هر ست · هدف ${fa(item.targetReps ?? 0)}`, reps, setReps, 1000)}
            </>}
        </div>
      )}

      {(status === "partial" || status === "not_done") && (
        <div role="group" aria-label="دلیل" className="space-y-2">
          <p className="text-xs font-medium text-[var(--color-ink)]">چرا کامل انجام نشد؟</p>
          <div className="flex flex-wrap gap-2">
            {NON_COMPLETION_REASONS.map((code) => (
              <button key={code} type="button" aria-pressed={reason === code}
                onClick={() => setReason(code)}
                className={cn("rounded-full border px-3 py-1.5 text-xs",
                  reason === code
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-tint)] text-[var(--color-primary-strong)]"
                    : "border-[var(--color-border)] bg-white text-[var(--color-ink-soft)]")}>
                {reasonLabel(code, "fa")}
              </button>
            ))}
          </div>
        </div>
      )}

      {status !== "" && (
        <div role="group" aria-label="درد پس از تمرین از ۰ تا ۱۰" className="space-y-2">
          <p className="text-xs font-medium text-[var(--color-ink)]">
            درد پس از تمرین (۰ یعنی بدون درد، ۱۰ یعنی بدترین درد)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 11 }, (_, level) => (
              <button key={level} type="button" aria-pressed={pain === level}
                aria-label={`درد ${fa(level)} از ۱۰`}
                onClick={() => setPain(level)}
                className={cn("grid h-9 w-9 place-items-center rounded-lg border text-sm font-semibold",
                  painTone(level, pain === level))}>
                {fa(level)}
              </button>
            ))}
          </div>
        </div>
      )}
    </fieldset>

    {pain !== null && pain >= 7 && <p role="alert" className="rounded-lg bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">
      تمرین را متوقف کنید و با درمانگر یا مرکز درمانی تماس بگیرید. برای علائم اورژانسی منتظر پاسخ برنامه نمانید.
    </p>}

    <Button onClick={submit} disabled={busy || saved || (!uncertain && !ready)}>
      {busy ? "در حال ثبت…" : uncertain ? "تلاش مجدد همان درخواست" : saved ? "ثبت شد" : "ثبت گزارش"}
    </Button>
    {message && <p role="status" className="text-xs">{message}</p>}
  </div>;
}
