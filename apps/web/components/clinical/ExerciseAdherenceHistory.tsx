"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { ADHERENCE_PAGE_SIZE, fetchAdherenceHistory, type AdherenceHistoryEvent } from "@/lib/clinical/adherenceHistory";
import type { Patient } from "@/lib/types";

export function ExerciseAdherenceHistory({ patient }: { patient: Patient }) {
  // Remount immediately on a changed patient/episode; never display the previous scope.
  return <HistoryPage key={`${patient.id}:${patient.episodeId}`} patient={patient} />;
}
function HistoryPage({ patient }: { patient: Patient }) {
  const [page, setPage] = useState(0);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{
    page: number; retry: number; rows: AdherenceHistoryEvent[]; error: boolean;
  } | null>(null);
  useEffect(() => {
    if (!patient.episodeId) return;
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(() => controller.abort(), 8000);
    fetchAdherenceHistory(patient.id, patient.episodeId, page, controller.signal)
      .then((rows) => { if (active) setResult({ page, retry, rows, error: false }); })
      .catch(() => { if (active) setResult({ page, retry, rows: [], error: true }); })
      .finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [patient.id, patient.episodeId, page, retry]);
  if (!patient.episodeId) return null;
  const current = result?.page === page && result.retry === retry ? result : null;
  const labels = { complete: "کامل انجام شد", partial: "بخشی انجام شد", not_done: "انجام نشد" };
  return <Card><CardBody className="space-y-3">
    <h3 className="text-sm font-bold">سابقهٔ گزارش هر تمرین</h3>
    {!current ? <p role="status">در حال دریافت گزارش‌ها…</p> : current.error ?
      <p role="alert">گزارش‌ها دریافت نشدند. برای تلاش دوباره، به‌روزرسانی را بزنید.</p> : <>
        {current.rows.length === 0 ? <p>در این صفحه گزارشی ثبت نشده است.</p> :
          <ul className="space-y-3">{current.rows.slice(0, ADHERENCE_PAGE_SIZE).map((event) => {
            const exercise = patient.program.find((item) => item.prescriptionItemId === event.prescription_item_id);
            return <li key={event.id} className="rounded-lg border border-[var(--color-border)] p-3 text-sm">
              <p>{exercise?.contentSnapshot?.name ?? "تمرین نسخهٔ قبلی؛ نام در دسترس نیست"}</p>
              <p>{labels[event.status]} · درد: {event.pain_level.toLocaleString("fa-IR")} از ۱۰</p>
              <p className="text-xs">{event.local_date} · {event.timezone_snapshot}</p>
            </li>;
          })}</ul>}
        <p className="text-xs">این موارد گزارش‌های ثبت‌شده‌اند؛ نبود گزارش به معنی انجام‌نشدن تمرین نیست.</p>
      </>}
    <div className="flex gap-2">
      <Button size="sm" variant="secondary" disabled={!current || page === 0}
        onClick={() => setPage((value) => value - 1)}>صفحهٔ قبل</Button>
      <Button size="sm" variant="secondary" disabled={!current || current.error || current.rows.length <= ADHERENCE_PAGE_SIZE}
        onClick={() => setPage((value) => value + 1)}>صفحهٔ بعد</Button>
      <Button size="sm" variant="secondary" disabled={!current}
        onClick={() => { setPage(0); setRetry((value) => value + 1); }}>به‌روزرسانی</Button>
    </div>
  </CardBody></Card>;
}
