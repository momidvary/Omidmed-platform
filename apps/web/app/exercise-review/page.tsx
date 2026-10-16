"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ExerciseFigureSvg } from "@/components/clinical/ExerciseAnimation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState, PageIntro, Spinner } from "@/components/ui/Misc";
import { motionFor } from "@/lib/animation/motions";
import { describeDosage } from "@/lib/clinical/dosage";
import { protocols } from "@/lib/clinical/protocols";
import { isMockMode } from "@/lib/config";
import { regionLabel } from "@/lib/data/bodyRegionsFa";
import { exerciseFa } from "@/lib/data/exerciseFa";
import { exercises } from "@/lib/data/exercises";
import { exerciseLibraryFa } from "@/lib/data/exerciseLibraryFa";
import { useText, type PageText } from "@/lib/i18n/text";
import { formatJalali } from "@/lib/jalali";
import { useAuth } from "@/lib/store/AuthContext";
import { useClinicExerciseReviews } from "@/lib/store/useClinicExercises";
import { useLocale } from "@/lib/store/LocaleContext";
import { reviewClinicExercise } from "@/lib/supabase/db";
import type { BodyRegionId, Exercise } from "@/lib/types";
import { cn } from "@/lib/utils";

const en = {
  title: "Exercise review",
  intro:
    "Library exercises become prescribable in this clinic only after the clinic owner reads the patient-facing text and approves it. Exercises used by the most protocol phases come first.",
  progress: (approved: number, total: number) => `${approved} of ${total} approved for this clinic`,
  pending: "Awaiting review",
  approved: "Approved",
  all: "All",
  allRegions: "All regions",
  usedIn: (n: number) => `Used in ${n} protocol phase${n === 1 ? "" : "s"}`,
  notUsed: "Not used by a protocol yet",
  firstPhase: "first phase of",
  dose: "Starting dose",
  purpose: "Purpose",
  howTo: "Steps the patient sees",
  mistakes: "Common mistakes",
  stop: "Stop if",
  start: "Start",
  end: "End",
  attest: "I have read the patient-facing text and dose and approve this exercise for patients of this clinic.",
  approve: "Approve for this clinic",
  revoke: "Withdraw approval",
  approvedOn: (date: string) => `Approved on ${date}`,
  saving: "Saving…",
  failed: "The review could not be saved. Check the connection and that you are the clinic owner.",
  ownerOnly: "Only the clinic owner can approve exercises. You can read the content here.",
  loadFailed: "The clinic's exercise reviews could not be loaded.",
  retry: "Try again",
  demoTitle: "Not available in demo mode",
  demoBody: "Exercise approval is recorded in the clinic database.",
  details: "Full text",
  libraryLink: "Open in the library",
  none: "Nothing in this list.",
  correction: "If the text needs changes, do not approve it; tell the development team which exercise and what to change.",
};

const text: PageText<typeof en> = {
  en,
  fa: {
    title: "بازبینی تمرین‌ها",
    intro:
      "تمرین‌های کتابخانه فقط وقتی در این کلینیک قابل تجویز می‌شوند که مدیر کلینیک متن بیمار را بخواند و تأیید کند. تمرین‌هایی که در فازهای بیشتری از پروتکل‌ها استفاده می‌شوند، اول آمده‌اند.",
    progress: (approved, total) => `${approved} از ${total} تمرین برای این کلینیک تأیید شده`,
    pending: "در انتظار بازبینی",
    approved: "تأییدشده",
    all: "همه",
    allRegions: "همه نواحی",
    usedIn: (n) => `در ${n} فاز پروتکل استفاده می‌شود`,
    notUsed: "هنوز در پروتکلی استفاده نشده",
    firstPhase: "فاز اول",
    dose: "دوز شروع",
    purpose: "هدف",
    howTo: "مراحلی که بیمار می‌بیند",
    mistakes: "اشتباهات رایج",
    stop: "توقف کنید اگر",
    start: "شروع",
    end: "پایان",
    attest: "متن بیمار و دوز این تمرین را خوانده‌ام و آن را برای بیماران این کلینیک تأیید می‌کنم.",
    approve: "تأیید برای این کلینیک",
    revoke: "لغو تأیید",
    approvedOn: (date) => `تأییدشده در ${date}`,
    saving: "در حال ذخیره…",
    failed: "بازبینی ذخیره نشد. اتصال و اینکه مدیر کلینیک هستید را بررسی کنید.",
    ownerOnly: "فقط مدیر کلینیک می‌تواند تمرین‌ها را تأیید کند. محتوا را اینجا می‌توانید بخوانید.",
    loadFailed: "بازبینی تمرین‌های کلینیک بارگیری نشد.",
    retry: "تلاش دوباره",
    demoTitle: "در حالت نمایشی در دسترس نیست",
    demoBody: "تأیید تمرین در پایگاه داده کلینیک ثبت می‌شود.",
    details: "متن کامل",
    libraryLink: "مشاهده در کتابخانه",
    none: "موردی در این فهرست نیست.",
    correction: "اگر متن نیاز به اصلاح دارد، تأیید نکنید؛ نام تمرین و اصلاح لازم را به تیم توسعه اعلام کنید.",
  },
};

const REGIONS: BodyRegionId[] = ["neck", "shoulder", "low-back", "hip", "knee", "ankle-foot", "post-op"];

/** How many protocol phases use an exercise; a first phase counts double. */
function usage(id: string) {
  let phases = 0;
  let weight = 0;
  const firstOf: string[] = [];
  for (const protocol of protocols) {
    protocol.phases.forEach((phase, index) => {
      if (!phase.exercises.includes(id)) return;
      phases += 1;
      weight += index === 0 ? 2 : 1;
      if (index === 0) firstOf.push(protocol.id);
    });
  }
  return { phases, weight, firstOf };
}

/** Exercises that need a clinic review: not in the globally active catalog. */
const reviewable: Exercise[] = exercises
  .filter((exercise) => !(exercise.review === "approved" && exerciseFa[exercise.id]))
  .sort((a, b) => usage(b.id).weight - usage(a.id).weight || a.name.localeCompare(b.name));

export default function ExerciseReviewPage() {
  const t = useText(text);
  const { locale } = useLocale();
  const lang = locale === "fa" ? "fa" : "en";
  const { profile, activeClinicId } = useAuth();
  const { reviews, loading, failed, reload } = useClinicExerciseReviews();
  const isOwner = profile?.role === "clinic_owner";
  const [status, setStatus] = useState<"pending" | "approved" | "all">("pending");
  const [region, setRegion] = useState<BodyRegionId | "">("");
  const [attested, setAttested] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const approvedSet = useMemo(
    () => new Set([...(reviews?.values() ?? [])].filter((r) => r.decision === "approved").map((r) => r.exerciseId)),
    [reviews]
  );
  const shown = reviewable.filter(
    (exercise) =>
      (!region || exercise.region === region) &&
      (status === "all" || (status === "approved") === approvedSet.has(exercise.id))
  );

  if (isMockMode) return <EmptyState icon="shield" title={t.demoTitle} description={t.demoBody} />;

  async function decide(exerciseId: string, decision: "approved" | "revoked") {
    if (!activeClinicId || busy) return;
    setBusy(exerciseId);
    setError(null);
    const ok = await reviewClinicExercise({ clinicId: activeClinicId, exerciseId, decision });
    setBusy(null);
    if (!ok) {
      setError(t.failed);
      return;
    }
    setAttested(null);
    reload();
  }

  return (
    <div className="space-y-5">
      <PageIntro title={t.title} description={t.intro} />

      {loading ? (
        <Spinner label="…" />
      ) : failed ? (
        <p role="alert" className="flex items-center gap-2 text-sm text-[var(--color-danger)]">
          {t.loadFailed}
          <Button size="sm" variant="secondary" onClick={reload}>{t.retry}</Button>
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="primary">{t.progress(approvedSet.size, reviewable.length)}</Badge>
            {!isOwner && <span className="text-sm text-[var(--color-ink-soft)]">{t.ownerOnly}</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            {(["pending", "approved", "all"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={status === value}
                onClick={() => setStatus(value)}
                className={cn(
                  "min-h-11 rounded-xl border px-4 text-sm font-semibold",
                  status === value
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-tint)] text-[var(--color-primary-strong)]"
                    : "border-[var(--color-border)] bg-white"
                )}
              >
                {t[value]}
              </button>
            ))}
            <select
              aria-label={t.allRegions}
              value={region}
              onChange={(event) => setRegion(event.target.value as BodyRegionId | "")}
              className="select-chevron min-h-11 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm"
            >
              <option value="">{t.allRegions}</option>
              {REGIONS.map((id) => (
                <option key={id} value={id}>{regionLabel(id, locale)}</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-[var(--color-ink-faint)]">{t.correction}</p>
          {error && (
            <p role="alert" className="rounded-xl bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]">{error}</p>
          )}

          {shown.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-soft)]">{t.none}</p>
          ) : (
            <ul className="space-y-4">
              {shown.map((exercise) => {
                const content = exerciseLibraryFa(exercise.id);
                const use = usage(exercise.id);
                const review = reviews?.get(exercise.id);
                const approved = review?.decision === "approved";
                const motion = motionFor(exercise.id);
                return (
                  <li key={exercise.id}>
                    <Card>
                      <CardBody className="space-y-3">
                        <div className="flex flex-wrap items-start gap-4">
                          {motion && (
                            <div className="flex w-48 shrink-0 gap-1.5">
                              {[0, 1].map((p) => (
                                <figure key={p} className="w-1/2">
                                  <ExerciseFigureSvg motion={motion} p={p} glow={0} guide={false} className="block aspect-[5/4] h-auto w-full rounded-lg" />
                                  <figcaption className="text-center text-[11px] text-[var(--color-ink-faint)]">{p === 0 ? t.start : t.end}</figcaption>
                                </figure>
                              ))}
                            </div>
                          )}
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="text-lg font-bold text-[var(--color-ink)]">{content?.name ?? exercise.name}</h2>
                              <Badge tone={approved ? "success" : "warn"}>{approved ? t.approved : t.pending}</Badge>
                            </div>
                            <p className="text-xs text-[var(--color-ink-faint)]" dir="ltr">{exercise.name}</p>
                            <p className="text-sm text-[var(--color-ink-soft)]">
                              {regionLabel(exercise.region, locale)} ·{" "}
                              {use.phases > 0 ? t.usedIn(use.phases) : t.notUsed}
                              {use.firstOf.length > 0 &&
                                ` · ${t.firstPhase}: ${use.firstOf
                                  .map((id) => protocols.find((protocol) => protocol.id === id)?.title[lang] ?? id)
                                  .join("، ")}`}
                            </p>
                            <p className="text-sm">
                              <span className="text-[var(--color-ink-soft)]">{t.dose}: </span>
                              <strong>{describeDosage(exercise.defaultDosage, lang).join(" · ")}</strong>
                            </p>
                          </div>
                        </div>

                        {content && (
                          <details className="rounded-xl border border-[var(--color-border)] px-4 py-2">
                            <summary className="cursor-pointer text-sm font-semibold text-[var(--color-ink-soft)]">{t.details}</summary>
                            <div className="mt-2 space-y-2 text-sm">
                              <p><span className="font-semibold">{t.purpose}: </span>{content.purpose}</p>
                              <div>
                                <p className="font-semibold">{t.howTo}</p>
                                <ol className="list-decimal space-y-0.5 ps-5">
                                  {content.howTo.map((step) => <li key={step}>{step}</li>)}
                                </ol>
                              </div>
                              <p><span className="font-semibold">{t.mistakes}: </span>{content.commonMistakes.join("، ")}</p>
                              <p><span className="font-semibold text-[var(--color-danger)]">{t.stop}: </span>{content.whenToStop}</p>
                              <Link href={`/exercise-library/${exercise.id}`} className="inline-block text-sm font-semibold text-[var(--color-primary-strong)] underline">
                                {t.libraryLink}
                              </Link>
                            </div>
                          </details>
                        )}

                        {approved ? (
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="text-sm text-[var(--color-success)]">
                              {t.approvedOn(lang === "fa" ? formatJalali(review!.reviewedAt.slice(0, 10)) : review!.reviewedAt.slice(0, 10))}
                            </span>
                            {isOwner && (
                              <Button size="sm" variant="ghost" disabled={busy === exercise.id} onClick={() => void decide(exercise.id, "revoked")}>
                                {busy === exercise.id ? t.saving : t.revoke}
                              </Button>
                            )}
                          </div>
                        ) : (
                          isOwner && (
                            <div className="space-y-2">
                              <label className="flex items-start gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  className="mt-1 h-5 w-5"
                                  checked={attested === exercise.id}
                                  onChange={(event) => setAttested(event.target.checked ? exercise.id : null)}
                                />
                                <span>{t.attest}</span>
                              </label>
                              <Button
                                disabled={attested !== exercise.id || Boolean(busy)}
                                onClick={() => void decide(exercise.id, "approved")}
                              >
                                {busy === exercise.id ? t.saving : t.approve}
                              </Button>
                            </div>
                          )
                        )}
                      </CardBody>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
