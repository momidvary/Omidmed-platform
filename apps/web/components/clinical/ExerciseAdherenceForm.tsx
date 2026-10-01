"use client";

import { useRef, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import type { Patient, PrescribedExercise } from "@/lib/types";

const receiptSchema = z.object({ event: z.object({
  id: z.uuid(), localDate: z.iso.date(),
  prescriptionStatus: z.enum(["published", "suspended", "revoked"]),
  alertCreated: z.boolean(),
}) });

/** Retries retain the exact payload/key until the server resolves the outcome. */
export function ExerciseAdherenceForm({ patient, item, onPaused }: {
  patient: Patient; item: PrescribedExercise; onPaused: () => void;
}) {
  const [status, setStatus] = useState("");
  const [pain, setPain] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);
  const pending = useRef<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const timezone = patient.prescription?.scheduleTimezone;
  if (!timezone || !item.scheduledWeekdays?.length || !item.prescriptionItemId) {
    return <p className="text-xs">برای ثبت جداگانهٔ تمرین، از درمانگر بخواهید روزهای برنامه را مشخص کند.</p>;
  }
  async function submit() {
    if (busy || saved || !patient.episodeId) return;
    if (!pending.current) {
      if (!status || pain === "") return;
      pending.current = JSON.stringify({
        patientId: patient.id, episodeId: patient.episodeId,
        prescriptionItemId: item.prescriptionItemId, status,
        painLevel: Number(pain), clientSubmissionId: crypto.randomUUID(),
        nonCompletionReason: status === "complete" ? null :
          status === "partial" ? "Patient reported partial completion" : "Patient reported not attempted",
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
            ? "ثبت پذیرفته نشد؛ ممکن است امروز در برنامهٔ این تمرین نباشد. برنامه را بررسی کنید."
            : "ثبت پذیرفته نشد. صفحه و وضعیت ورود را به‌روز کنید.");
          return;
        }
        throw new Error("unknown outcome");
      }
      const receipt = receiptSchema.parse(await response.json()).event;
      setSaved(true);
      setUncertain(false);
      pending.current = null;
      setMessage(`گزارش تمرین برای ${receipt.localDate} ثبت شد.`);
      if (receipt.prescriptionStatus !== "published") onPaused();
    } catch {
      setUncertain(true);
      setMessage("نتیجهٔ ثبت مشخص نیست. برای بررسی و تکمیل همان درخواست، دوباره تلاش کنید.");
    } finally {
      setBusy(false);
    }
  }
  return <div className="space-y-3 border-t border-[var(--color-border)] pt-3">
    <p className="text-xs">گزارش این تمرین · منطقهٔ زمانی {timezone}</p>
    <p className="text-xs">روزهای برنامه: {item.scheduledWeekdays.map((day) =>
      ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"][day]).join("، ")}</p>
    <fieldset disabled={busy || uncertain || saved} className="space-y-2">
      <legend className="text-sm">وضعیت انجام تمرین</legend>
      <label className="block text-xs">وضعیت
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="mx-2 border p-1">
          <option value="">انتخاب کنید</option><option value="complete">کامل انجام شد</option>
          <option value="partial">بخشی انجام شد</option><option value="not_done">انجام نشد</option>
        </select>
      </label>
      <label className="block text-xs">درد پس از تمرین (۰ تا ۱۰)
        <input type="number" min={0} max={10} step={1} value={pain}
          onChange={(e) => setPain(e.target.value)} className="mx-2 w-16 border p-1" />
      </label>
    </fieldset>
    {Number(pain) >= 7 && <p role="alert" className="text-sm text-[var(--color-danger)]">
      تمرین را متوقف کنید و با درمانگر یا مرکز درمانی تماس بگیرید. برای علائم اورژانسی منتظر پاسخ برنامه نمانید.
    </p>}
    <Button size="sm" onClick={submit} disabled={busy || saved || (!uncertain &&
      (!status || pain === "" || !Number.isInteger(Number(pain)) || Number(pain) < 0 || Number(pain) > 10))}>
      {busy ? "در حال ثبت…" : uncertain ? "تلاش مجدد همان درخواست" : saved ? "ثبت شد" : "ثبت گزارش این تمرین"}
    </Button>
    {message && <p role="status" className="text-xs">{message}</p>}
  </div>;
}
