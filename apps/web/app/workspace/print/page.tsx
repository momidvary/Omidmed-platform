"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ExerciseFigureSvg } from "@/components/clinical/ExerciseAnimation";
import { Button } from "@/components/ui/Button";
import { EmptyState, Spinner } from "@/components/ui/Misc";
import { motionFor } from "@/lib/animation/motions";
import { describeDosage } from "@/lib/clinical/dosage";
import { WEEK_ORDER_EN, WEEK_ORDER_FA } from "@/lib/clinical/scheduleDefaults";
import { isMockMode } from "@/lib/config";
import { exercises } from "@/lib/data/exercises";
import { localizeExercise } from "@/lib/data/exerciseLibraryFa";
import { useText } from "@/lib/i18n/text";
import { formatJalali, todayIso } from "@/lib/jalali";
import { useAuth } from "@/lib/store/AuthContext";
import { useLocale } from "@/lib/store/LocaleContext";
import { fetchPatientRegistry, fetchPrescriptionHistory } from "@/lib/supabase/db";
import { isUuid } from "@/lib/utils";
import { useSection } from "../useSection";

const text = {
  en: {
    title: "Home exercise program",
    print: "Print / save as PDF",
    back: "Back to the patient",
    patient: "Patient",
    clinic: "Clinic",
    printed: "Printed",
    version: (n: number) => `Version ${n}`,
    start: "Start date",
    review: "Review date",
    days: "Days",
    everyDay: "Every day",
    weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    howTo: "How to do it",
    startPosition: "Start",
    endPosition: "End",
    stopWhen: "Stop if",
    precautions: "Precautions",
    stopRules: "When to stop and contact the clinic",
    footer:
      "This program was prescribed for this patient only by their physiotherapist. Do not change the dose without asking. It is not a substitute for medical care in an emergency.",
    loading: "Loading the home program…",
    failed: "The home program could not be loaded.",
    noneTitle: "No published home program",
    noneBody: "Publish a home program first; only the published version can be printed.",
    demoTitle: "Not available in demo mode",
    demoBody: "Printing uses the patient's published program in the real clinic database.",
  },
  fa: {
    title: "برنامه تمرین در منزل",
    print: "چاپ / ذخیره PDF",
    back: "بازگشت به پرونده بیمار",
    patient: "بیمار",
    clinic: "کلینیک",
    printed: "تاریخ چاپ",
    version: (n: number) => `نسخه ${n.toLocaleString("fa-IR")}`,
    start: "تاریخ شروع",
    review: "تاریخ بازبینی",
    days: "روزها",
    everyDay: "هر روز",
    weekdays: ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"],
    howTo: "روش انجام",
    startPosition: "شروع",
    endPosition: "پایان",
    stopWhen: "توقف کنید اگر",
    precautions: "احتیاط‌ها",
    stopRules: "چه زمانی تمرین را متوقف و با کلینیک تماس بگیرید",
    footer:
      "این برنامه فقط برای همین بیمار و توسط فیزیوتراپیست او تجویز شده است. دوز را بدون مشورت تغییر ندهید. در شرایط اورژانسی جایگزین مراقبت پزشکی نیست.",
    loading: "در حال بارگیری برنامه خانگی…",
    failed: "برنامه خانگی بارگیری نشد.",
    noneTitle: "برنامه خانگی منتشرشده‌ای وجود ندارد",
    noneBody: "ابتدا برنامه خانگی را منتشر کنید؛ فقط نسخه منتشرشده قابل چاپ است.",
    demoTitle: "در حالت نمایشی در دسترس نیست",
    demoBody: "چاپ از برنامه منتشرشده بیمار در پایگاه داده واقعی کلینیک انجام می‌شود.",
  },
};

function PrintableProgram() {
  const t = useText(text);
  const { locale } = useLocale();
  const lang = locale === "fa" ? "fa" : "en";
  const patientId = useSearchParams().get("patient");
  const { profile, activeClinicId } = useAuth();
  const canAccess = profile?.role === "clinic_owner" || profile?.role === "therapist";
  const enabled = !isMockMode && canAccess && Boolean(activeClinicId) && isUuid(patientId);
  const key = enabled ? `${activeClinicId}:${patientId}` : null;

  const patient = useSection(key, async () => {
    const result = await fetchPatientRegistry({
      clinicId: activeClinicId as string,
      patientId: patientId as string,
      pageSize: 1,
    });
    return result?.patients.find((row) => row.id === patientId && row.clinicId === activeClinicId) ?? null;
  });
  const episodeId = patient.data?.activeEpisode?.id ?? null;
  const programs = useSection(key && episodeId ? `${key}:${episodeId}` : null, () =>
    fetchPrescriptionHistory(episodeId as string)
  );

  const day = (iso: string) =>
    lang === "fa"
      ? formatJalali(iso)
      : new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { dateStyle: "medium", timeZone: "UTC" });

  if (isMockMode) return <EmptyState icon="shield" title={t.demoTitle} description={t.demoBody} />;
  if (!enabled) return <EmptyState icon="user" title={t.noneTitle} description={t.noneBody} />;
  if (patient.loading || (episodeId && programs.loading)) return <Spinner label={t.loading} />;
  if (patient.failed || programs.failed) {
    return (
      <p role="alert" className="text-sm text-[var(--color-danger)]">
        {t.failed}
      </p>
    );
  }

  const program = [...(programs.data ?? [])]
    .filter((row) => row.status === "published")
    .sort((a, b) => b.version - a.version)[0];
  const backHref = `/workspace?patient=${encodeURIComponent(patientId as string)}`;
  if (!patient.data || !program) {
    return (
      <EmptyState
        icon="exercise"
        title={t.noneTitle}
        description={t.noneBody}
        action={<Link href={backHref} className="text-sm font-semibold text-[var(--color-primary-strong)] underline">{t.back}</Link>}
      />
    );
  }

  const clinicName = profile?.clinics.find((clinic) => clinic.id === activeClinicId)?.name ?? "";
  const order = lang === "fa" ? WEEK_ORDER_FA : WEEK_ORDER_EN;

  return (
    <article className="mx-auto max-w-3xl space-y-6 bg-white text-[var(--color-ink)] print:max-w-none">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={backHref} className="text-sm font-semibold text-[var(--color-primary-strong)] underline">
          {t.back}
        </Link>
        <Button onClick={() => window.print()}>{t.print}</Button>
      </div>

      <header className="space-y-2 border-b border-[var(--color-border)] pb-4">
        <h1 className="text-2xl font-extrabold">{t.title}</h1>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-[var(--color-ink-faint)]">{t.patient}</dt>
            <dd className="font-semibold" dir="auto">{patient.data.fullName}</dd>
          </div>
          {clinicName && (
            <div>
              <dt className="text-xs text-[var(--color-ink-faint)]">{t.clinic}</dt>
              <dd dir="auto">{clinicName}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-[var(--color-ink-faint)]">{t.printed}</dt>
            <dd>{day(todayIso())}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-ink-faint)]">{t.start}</dt>
            <dd>{day(program.startDate)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-ink-faint)]">{t.review}</dt>
            <dd>{day(program.reviewDate)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-ink-faint)]">{t.version(program.version)}</dt>
          </div>
        </dl>
      </header>

      <ol className="space-y-5">
        {program.items.map((item, index) => {
          const library = exercises.find((exercise) => exercise.id === item.exerciseId);
          const localized = library ? localizeExercise(library, locale) : null;
          // The published snapshot is what the patient was prescribed.
          const content = item.contentSnapshot ?? localized;
          const name = content?.name ?? item.exerciseId;
          const weekdays = item.scheduledWeekdays ?? [];
          const days =
            weekdays.length === 7 || weekdays.length === 0
              ? t.everyDay
              : order.filter((d) => weekdays.includes(d)).map((d) => t.weekdays[d]).join("، ");
          const dose = describeDosage(item, lang);
          const motion = motionFor(item.exerciseId);
          return (
            <li key={`${item.exerciseId}-${index}`} className="break-inside-avoid rounded-2xl border border-[var(--color-border)] p-4">
              <div className="flex gap-4">
                {motion && (
                  <div className="flex w-56 shrink-0 gap-1.5">
                    {[0, 1].map((p) => (
                      <figure key={p} className="w-1/2">
                        <ExerciseFigureSvg
                          motion={motion}
                          p={p}
                          glow={0}
                          guide={false}
                          className="block aspect-[5/4] h-auto w-full rounded-lg"
                        />
                        <figcaption className="mt-0.5 text-center text-[11px] text-[var(--color-ink-faint)]">
                          {p === 0 ? t.startPosition : t.endPosition}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                )}
                <div className="min-w-0 space-y-1.5">
                  <h2 className="text-lg font-bold">
                    {(index + 1).toLocaleString(lang === "fa" ? "fa-IR" : "en-US")}. {name}
                  </h2>
                  <p className="text-sm font-semibold text-[var(--color-primary-strong)]">
                    {dose.length > 0 ? dose.join(" · ") : item.dosageFa}
                  </p>
                  <p className="text-sm">
                    <span className="text-[var(--color-ink-faint)]">{t.days}: </span>
                    {days}
                  </p>
                </div>
              </div>
              {content && content.howTo.length > 0 && (
                <div className="mt-3">
                  <h3 className="text-xs font-semibold text-[var(--color-ink-soft)]">{t.howTo}</h3>
                  <ol className={`mt-1 space-y-0.5 ps-5 text-sm ${lang === "fa" ? "[list-style-type:persian]" : "list-decimal"}`}>
                    {content.howTo.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </div>
              )}
              {content?.whenToStop && (
                <p className="mt-2 text-sm">
                  <span className="font-semibold text-[var(--color-danger)]">{t.stopWhen}: </span>
                  {content.whenToStop}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      <section className="break-inside-avoid space-y-3 rounded-2xl bg-[var(--color-surface-muted)] p-4 text-sm print:border print:border-[var(--color-border)]">
        <div>
          <h2 className="font-bold">{t.precautions}</h2>
          <p className="mt-1 whitespace-pre-wrap" dir="auto">{program.precautions}</p>
        </div>
        <div>
          <h2 className="font-bold text-[var(--color-danger)]">{t.stopRules}</h2>
          <p className="mt-1 whitespace-pre-wrap" dir="auto">{program.stopRules}</p>
        </div>
      </section>

      <p className="text-xs text-[var(--color-ink-faint)]">{t.footer}</p>
    </article>
  );
}

export default function PrintProgramPage() {
  return (
    <Suspense fallback={<Spinner label="…" />}>
      <PrintableProgram />
    </Suspense>
  );
}
