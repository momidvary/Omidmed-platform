"use client";

import { useMemo, useRef, useState } from "react";
import { usePatient } from "@/lib/store/PatientContext";
import { exerciseFa } from "@/lib/data/exerciseFa";
import {
  buildPatientChatReply,
  buildTicketAutoReply,
  patientSuggestedPrompts,
} from "@/lib/ai/engine";
import type { ChatMessage, Patient, ProgressEntry, Ticket } from "@/lib/types";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { Disclaimer, Spinner } from "@/components/ui/Misc";
import { cn, localDateValue, uid, uuid } from "@/lib/utils";
import { useAuth } from "@/lib/store/AuthContext";
import { isMockMode } from "@/lib/config";
import { SaveStatusPill } from "@/components/ui/SaveStatusPill";
import { detectSafetySignals } from "@/lib/clinical/safety";

const statusLabelsFa = {
  connected: "متصل",
  saving: "در حال ذخیره…",
  saved: "ذخیره شد",
  offline: "آفلاین",
  save_failed: "ذخیره ناموفق",
} as const;

const fa = (n: number) => n.toLocaleString("fa-IR");
const faDate = (iso: string) =>
  new Date(iso).toLocaleDateString("fa-IR", { month: "long", day: "numeric" });

type Tab = "program" | "progress" | "tickets" | "assistant";

export type DailyAggregateCompletionChoice =
  | "complete"
  | "incomplete"
  | null;

/**
 * Build the legacy daily aggregate only from an explicit patient choice.
 * Pain is intentionally independent: neither a low nor a high score implies
 * whether the whole program was completed.
 */
export function buildDailyAggregateProgressEntry(
  date: string,
  painLevel: number,
  completionChoice: DailyAggregateCompletionChoice
): ProgressEntry | null {
  if (completionChoice === null) return null;
  return {
    date,
    painLevel,
    completed: completionChoice === "complete",
  };
}

const tabs: { id: Tab; label: string; icon: React.ComponentProps<typeof Icon>["name"] }[] = [
  { id: "program", label: "برنامه من", icon: "exercise" },
  { id: "progress", label: "پیشرفت من", icon: "analysis" },
  { id: "tickets", label: "تیکت‌ها", icon: "flag" },
  { id: "assistant", label: "دستیار هوشمند", icon: "chat" },
];

export default function PatientPortalPage() {
  const {
    patient,
    patients,
    hydrated,
    loadError,
    selectPatient,
    reloadPatients,
  } = usePatient();
  const { session, loading } = useAuth();

  const waiting = !hydrated || (!isMockMode && loading);
  // Signed in but not yet linked to a patient record by the clinic.
  const unlinked =
    !isMockMode && session && hydrated && !loadError && patients.length === 0;
  const needsSelection =
    !isMockMode &&
    session &&
    hydrated &&
    !loadError &&
    patients.length > 1 &&
    !patient;

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-[var(--color-bg)] font-[family-name:var(--font-vazirmatn)]"
    >
      {waiting ? (
        <Spinner label="در حال بارگذاری…" />
      ) : !isMockMode && loadError ? (
        <PortalLoadError onRetry={reloadPatients} />
      ) : patient ? (
        <PatientDashboard
          key={`${patient.id}:${patient.episodeId ?? "no-episode"}`}
          patient={patient}
        />
      ) : needsSelection ? (
        <LinkedPatientPicker patients={patients} onSelect={selectPatient} />
      ) : unlinked ? (
        <UnlinkedNotice />
      ) : (
        <PatientEntry />
      )}
    </div>
  );
}

function PortalLoadError({ onRetry }: { onRetry: () => void }) {
  const { signOut } = useAuth();
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-10 text-center">
      <Card>
        <CardBody className="space-y-4">
          <p role="alert" className="text-sm font-semibold text-[var(--color-danger)]">
            اطلاعات پرتال بارگذاری نشد
          </p>
          <p className="text-xs leading-relaxed text-[var(--color-ink-soft)]">
            این وضعیت به معنی نداشتن پرونده نیست. اتصال اینترنت را بررسی کنید و
            دوباره تلاش کنید؛ اطلاعات بیمار قبلی نمایش داده نمی‌شود.
          </p>
          <Button className="w-full" onClick={onRetry}>
            تلاش دوباره
          </Button>
          <Button variant="secondary" className="w-full" onClick={signOut}>
            خروج از حساب
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}

function LinkedPatientPicker({
  patients,
  onSelect,
}: {
  patients: Patient[];
  onSelect: (patientId: string) => void;
}) {
  const { signOut } = useAuth();
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-10">
      <Card>
        <CardBody className="space-y-4">
          <div>
            <h1 className="text-base font-bold text-[var(--color-ink)]">
              انتخاب پرونده بیمار
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-[var(--color-ink-soft)]">
              این حساب به چند بیمار متصل است. برای جلوگیری از ثبت اطلاعات در
              پرونده اشتباه، بیمار را صریحاً انتخاب کنید.
            </p>
          </div>
          <div className="space-y-2">
            {patients.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                onClick={() => onSelect(candidate.id)}
                className="w-full rounded-xl border border-[var(--color-border)] bg-white px-4 py-3 text-right transition-colors hover:border-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
              >
                <span className="block text-sm font-semibold text-[var(--color-ink)]">
                  {candidate.nameFa}
                </span>
                <span className="mt-1 block text-xs text-[var(--color-ink-soft)]">
                  {candidate.conditionFa}
                </span>
              </button>
            ))}
          </div>
          <Button variant="secondary" className="w-full" onClick={signOut}>
            خروج از حساب
          </Button>
        </CardBody>
      </Card>
      <Disclaimer fa className="mt-6" />
    </div>
  );
}

/** Signed in, but the clinic hasn't linked this account to a patient yet. */
function UnlinkedNotice() {
  const { signOut } = useAuth();
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-10 text-center">
      <Card>
        <CardBody className="space-y-4">
          <p className="text-sm font-semibold text-[var(--color-ink)]">
            حساب شما هنوز به پرونده‌ای متصل نشده است
          </p>
          <p className="text-xs leading-relaxed text-[var(--color-ink-soft)]">
            ورود شما موفق بود، اما کلینیک هنوز حساب شما را به پرونده‌ای دارای
            دوره درمان فعال متصل نکرده است. لطفاً با کلینیک تماس بگیرید و ایمیل
            ثبت‌نامی‌تان را اعلام کنید.
          </p>
          <Button variant="secondary" className="w-full" onClick={signOut}>
            خروج از حساب
          </Button>
        </CardBody>
      </Card>
      <Disclaimer fa className="mt-6" />
    </div>
  );
}

/* ── Entry (auth in Supabase mode, demo picker in mock mode) ───── */

function PatientEntry() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[var(--color-primary)] text-white">
          <Icon name="sparkle" width={26} height={26} />
        </span>
        <h1 className="mt-4 text-xl font-bold text-[var(--color-ink)]">
          پرتال بیمار PhysioAI
        </h1>
        <p className="mt-1.5 text-sm text-[var(--color-ink-soft)]">
          برنامه تمرینی، روند پیشرفت و ارتباط با فیزیوتراپیست شما — همه در یک‌جا
        </p>
      </div>

      {isMockMode ? <DemoPicker /> : <PatientAuth />}

      <Disclaimer fa className="mt-6" />
    </div>
  );
}

/** Mock/dev mode only: open a demo patient without authentication. */
function DemoPicker() {
  const { openDemoPatient } = usePatient();
  return (
    <Card>
      <CardBody className="space-y-3">
        <p className="text-sm font-semibold text-[var(--color-ink)]">
          حالت دمو (بدون ورود)
        </p>
        <p className="text-xs leading-relaxed text-[var(--color-ink-soft)]">
          این نسخه آزمایشی است و داده‌ها فقط در همین مرورگر ذخیره می‌شوند. در
          نسخه اصلی، بیماران با ایمیل و رمز عبور وارد می‌شوند.
        </p>
        <Button className="w-full" onClick={() => openDemoPatient(0)}>
          بیمار دمو ۱ — توان‌بخشی زانو
        </Button>
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => openDemoPatient(1)}
        >
          بیمار دمو ۲ — کمردرد مزمن
        </Button>
      </CardBody>
    </Card>
  );
}

/** Supabase mode: real sign-in / sign-up with Supabase Auth. */
function PatientAuth() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const err =
      mode === "signin"
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password, fullName.trim());
    setBusy(false);
    if (err) {
      setError(err);
    } else if (mode === "signup") {
      setNotice(
        "حساب ساخته شد. اگر تأیید ایمیل فعال باشد، ابتدا ایمیل خود را تأیید کنید؛ سپس کلینیک باید حساب شما را به پرونده‌تان متصل کند."
      );
    }
  }

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex gap-1 rounded-xl bg-[var(--color-surface-muted)] p-1">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={cn(
                "flex-1 rounded-lg py-2 text-[13px] font-medium transition-colors",
                mode === m
                  ? "bg-white text-[var(--color-ink)] shadow-sm"
                  : "text-[var(--color-ink-faint)]"
              )}
            >
              {m === "signin" ? "ورود" : "ثبت‌نام"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <Field label="نام و نام خانوادگی" required>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="مثلاً رضا کریمی"
              />
            </Field>
          )}
          <Field label="ایمیل" required>
            <Input
              type="email"
              dir="ltr"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </Field>
          <Field
            label="رمز عبور"
            required
            error={error ?? undefined}
            hint={mode === "signup" ? "حداقل ۶ کاراکتر" : undefined}
          >
            <Input
              type="password"
              dir="ltr"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "لطفاً صبر کنید…" : mode === "signin" ? "ورود به پرتال" : "ساخت حساب"}
          </Button>
          {mode === "signin" && (
            <a
              href="/auth/forgot-password"
              className="block text-center text-xs text-[var(--color-primary-strong)] underline"
            >
              بازیابی رمز عبور
            </a>
          )}
        </form>

        {notice && (
          <p className="rounded-lg bg-[var(--color-success-soft)] px-3 py-2 text-[12px] leading-relaxed text-[var(--color-success)]">
            {notice}
          </p>
        )}
        <p className="text-[11px] leading-relaxed text-[var(--color-ink-faint)]">
          پس از ثبت‌نام، کلینیک شما باید حساب‌تان را به پرونده درمانی‌تان متصل
          کند تا برنامه تمرینی را ببینید. کد ملی دیگر برای ورود استفاده نمی‌شود.
        </p>
      </CardBody>
    </Card>
  );
}

/* ── Dashboard shell ───────────────────────────────────────────── */

function PatientDashboard({ patient }: { patient: Patient }) {
  const { closeDemoPatient, patients, selectPatient } = usePatient();
  const { signOut } = useAuth();
  const [tab, setTab] = useState<Tab>("program");
  const openTickets = patient.tickets.filter(
    (ticket) => ticket.status === "open" || ticket.status === "acknowledged"
  ).length;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-10 sm:px-6">
      {/* Header */}
      <header className="flex items-center gap-3 py-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--color-primary)] text-white">
          <Icon name="sparkle" width={20} height={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-[var(--color-ink-faint)]">پرتال بیمار</p>
          <h1 className="truncate text-[15px] font-bold text-[var(--color-ink)]">
            سلام، {patient.nameFa} 👋
          </h1>
        </div>
        {!isMockMode && patients.length > 1 && (
          <Select
            aria-label="تعویض پرونده بیمار"
            value={patient.id}
            onChange={(event) => selectPatient(event.target.value)}
            className="max-w-44"
          >
            {patients.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.nameFa}
              </option>
            ))}
          </Select>
        )}
        <SaveStatusPill labels={statusLabelsFa} />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => (isMockMode ? closeDemoPatient() : signOut())}
        >
          خروج
        </Button>
      </header>

      {/* Condition banner */}
      <Card className="mb-4">
        <CardBody className="space-y-2">
          <p className="text-sm font-semibold text-[var(--color-primary-strong)]">
            {patient.conditionFa}
          </p>
          <p className="text-xs leading-relaxed text-[var(--color-ink-soft)]">
            <span className="font-medium text-[var(--color-ink)]">
              یادداشت فیزیوتراپیست:{" "}
            </span>
            {patient.therapistNoteFa}
          </p>
          {patient.prescription && (
            <div className="space-y-2 border-t border-[var(--color-border)] pt-3 text-xs leading-relaxed">
              <p className="text-[var(--color-ink-soft)]">
                نسخه برنامه {fa(patient.prescription.version)} · بازبینی بعدی:{" "}
                {faDate(patient.prescription.reviewDate)}
              </p>
              <p className="rounded-lg bg-[var(--color-warn-soft)] px-3 py-2 text-[var(--color-warn)]">
                <span className="font-semibold">احتیاط‌ها: </span>
                {patient.prescription.precautionsFa}
              </p>
              <p className="rounded-lg bg-[var(--color-danger-soft)] px-3 py-2 text-[var(--color-danger)]">
                <span className="font-semibold">چه زمانی تمرین را متوقف کنم: </span>
                {patient.prescription.stopRulesFa}
              </p>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Tabs */}
      <nav className="mb-5 flex gap-1.5 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium transition-colors",
              tab === t.id
                ? "bg-[var(--color-primary)] text-white"
                : "bg-white text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-muted)]"
            )}
          >
            <Icon name={t.icon} width={15} height={15} />
            {t.label}
            {t.id === "tickets" && openTickets > 0 && (
              <span
                className={cn(
                  "grid h-5 w-5 place-items-center rounded-full text-[10px]",
                  tab === t.id
                    ? "bg-white/25 text-white"
                    : "bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
                )}
              >
                {fa(openTickets)}
              </span>
            )}
          </button>
        ))}
      </nav>

      {tab === "program" && <ProgramTab patient={patient} />}
      {tab === "progress" && <ProgressTab patient={patient} />}
      {tab === "tickets" && <TicketsTab patient={patient} />}
      {tab === "assistant" && <AssistantTab patient={patient} />}

      <Disclaimer fa className="mt-6" />
    </div>
  );
}

/* ── Tab 1: prescribed program + today's log ───────────────────── */

function ProgramTab({ patient }: { patient: Patient }) {
  const { logProgress } = usePatient();
  const [openId, setOpenId] = useState<string | null>(null);
  const today = localDateValue();
  const todayEntry = patient.progress.find((e) => e.date === today);
  const [pain, setPain] = useState(todayEntry?.painLevel ?? 3);
  const [completionChoice, setCompletionChoice] =
    useState<DailyAggregateCompletionChoice>(null);
  const [savingProgress, setSavingProgress] = useState(false);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [progressNotice, setProgressNotice] = useState<string | null>(null);
  const [programPaused, setProgramPaused] = useState(
    (todayEntry?.painLevel ?? 0) >= 7
  );

  async function saveProgress() {
    if (savingProgress) return;
    setProgressError(null);
    setProgressNotice(null);
    const entry = buildDailyAggregateProgressEntry(
      today,
      pain,
      completionChoice
    );
    if (!entry) {
      setProgressError(
        "پیش از ثبت، مشخص کنید کل برنامه امروز کامل انجام شده است یا کامل انجام نشده است."
      );
      return;
    }
    setSavingProgress(true);
    const saved = await logProgress(entry);
    setSavingProgress(false);
    if (!saved) {
      setProgressError(
        "ثبت گزارش انجام نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید."
      );
      return;
    }
    setCompletionChoice(null);
    if (pain >= 7) {
      setProgramPaused(true);
      setProgressNotice(
        isMockMode
          ? "در حالت نمایشی فقط توقف برنامه شبیه‌سازی شد و هیچ هشدار واقعی برای درمانگر ارسال نشد."
          : "گزارش ثبت شد، یک هشدار بالینی برای درمانگر مسئول ساخته شد و برنامه تا بررسی ایمنی متوقف است. برای وضعیت اورژانسی منتظر پاسخ برنامه نمانید."
      );
    } else {
      setProgressNotice("گزارش امروز با موفقیت ثبت شد.");
    }
  }

  return (
    <div className="space-y-4">
      {/* Today's session log */}
      <Card className="border-[var(--color-primary)]/30 bg-[var(--color-primary-tint)]">
        <CardBody className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[var(--color-ink)]">
              جلسه امروز
            </h3>
            {todayEntry && (
              <span
                className={cn(
                  "flex items-center gap-1 text-xs font-medium",
                  todayEntry.completed
                    ? "text-[var(--color-success)]"
                    : "text-[var(--color-ink-soft)]"
                )}
              >
                {todayEntry.completed && (
                  <Icon name="check" width={14} height={14} />
                )}
                آخرین گزارش: {todayEntry.completed ? "کامل" : "کامل‌نشده"}
              </span>
            )}
          </div>
          <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs leading-relaxed text-[var(--color-ink-soft)]">
            این فرم یک گزارش کلی روزانه است و انجام هر تمرین را جداگانه ثبت
            نمی‌کند. وضعیت واقعی کل برنامه را خودتان انتخاب کنید؛ نمره درد این
            انتخاب را تعیین یا تغییر نمی‌دهد.
          </p>
          <fieldset className="space-y-2">
            <legend className="text-xs font-bold text-[var(--color-ink)]">
              وضعیت کل برنامه امروز
            </legend>
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-ink-soft)]">
              <input
                type="radio"
                name="daily-program-completion"
                value="complete"
                checked={completionChoice === "complete"}
                disabled={savingProgress}
                onChange={() => {
                  setCompletionChoice("complete");
                  setProgressError(null);
                  setProgressNotice(null);
                }}
              />
              <span>کل برنامه تمرینی امروز کامل انجام شد.</span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-ink-soft)]">
              <input
                type="radio"
                name="daily-program-completion"
                value="incomplete"
                checked={completionChoice === "incomplete"}
                disabled={savingProgress}
                onChange={() => {
                  setCompletionChoice("incomplete");
                  setProgressError(null);
                  setProgressNotice(null);
                }}
              />
              <span>کل برنامه تمرینی امروز کامل انجام نشد.</span>
            </label>
          </fieldset>
          <label className="block text-xs text-[var(--color-ink-soft)]">
            میزان درد بعد از تمرین: <strong>{fa(pain)} از ۱۰</strong>
            <input
              type="range"
              min={0}
              max={10}
              value={pain}
              onChange={(e) => {
                setPain(Number(e.target.value));
                setProgressNotice(null);
              }}
              dir="ltr"
              className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-full bg-gradient-to-r from-[var(--color-success)] via-[var(--color-warn)] to-[var(--color-danger)]"
            />
          </label>
          {pain >= 7 && (
            <div
              role="alert"
              className="rounded-xl bg-[var(--color-danger-soft)] px-3 py-2 text-xs leading-relaxed text-[var(--color-danger)]"
            >
              درد شدید است. تمرین را فعلاً ادامه ندهید و همین امروز با
              فیزیوتراپیست یا مرکز درمانی تماس بگیرید. اگر درد قفسه سینه، تنگی
              نفس شدید، ضعف پیشرونده، بی‌اختیاری جدید یا بی‌حسی ناحیه زینی
              دارید، منتظر پاسخ داخل برنامه نمانید و با اورژانس ۱۱۵ تماس بگیرید.
            </div>
          )}
          {progressError && (
            <p role="alert" className="text-xs text-[var(--color-danger)]">
              {progressError}
            </p>
          )}
          {progressNotice && (
            <p
              role="status"
              className={cn(
                "rounded-xl px-3 py-2 text-xs leading-relaxed",
                pain >= 7
                  ? "bg-[var(--color-warn-soft)] text-[var(--color-ink)]"
                  : "bg-[var(--color-success-soft)] text-[var(--color-success)]"
              )}
            >
              {progressNotice}
            </p>
          )}
          <Button
            size="sm"
            onClick={saveProgress}
            disabled={savingProgress || completionChoice === null}
          >
            <Icon name="check" width={14} height={14} />
            {savingProgress
              ? "در حال ذخیره…"
              : pain >= 7
                ? "ثبت گزارش کلی و درد شدید"
                : todayEntry
                  ? "به‌روزرسانی گزارش کلی امروز"
                  : "ثبت گزارش کلی امروز"}
          </Button>
        </CardBody>
      </Card>

      {/* Prescribed exercises */}
      {programPaused ? (
        <Card className="border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)]">
          <CardBody>
            <div className="flex items-start gap-3">
              <Icon name="alert" width={20} height={20} />
              <div>
                <h3 className="text-sm font-bold text-[var(--color-danger)]">
                  برنامه تمرینی متوقف است
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-[var(--color-ink-soft)]">
                  تا ارزیابی مجدد و فعال‌سازی توسط درمانگر، تمرین‌های نسخه را
                  ادامه ندهید. این پیام جایگزین تماس با اورژانس نیست.
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      ) : patient.program.map((item) => {
        const content =
          item.contentSnapshot ??
          (isMockMode ? exerciseFa[item.exerciseId] : undefined);
        if (!content) {
          return (
            <Card key={item.exerciseId} className="border-[var(--color-danger)]/30">
              <CardBody>
                <p className="text-sm font-bold text-[var(--color-danger)]">
                  راهنمای فارسی این تمرین در دسترس نیست
                </p>
                <p className="mt-2 text-xs leading-relaxed text-[var(--color-ink-soft)]">
                  کد تمرین: {item.exerciseId} — {item.dosageFa}. تا زمانی که
                  فیزیوتراپیست روش صحیح را توضیح نداده است، این تمرین را انجام
                  ندهید و از بخش تیکت‌ها درخواست راهنما کنید.
                </p>
              </CardBody>
            </Card>
          );
        }
        const open = openId === item.exerciseId;
        return (
          <Card key={item.exerciseId}>
            <button
              type="button"
              onClick={() => setOpenId(open ? null : item.exerciseId)}
              className="w-full px-5 py-4 text-right"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-[var(--color-ink)]">
                    {content.name}
                  </h3>
                  <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                    {content.purpose}
                  </p>
                  <p className="mt-2 inline-block rounded-full bg-[var(--color-primary-soft)] px-3 py-1 text-[11px] font-medium text-[var(--color-primary-strong)]">
                    {item.dosageFa}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 text-[var(--color-ink-faint)] transition-transform",
                    open ? "rotate-90" : "-scale-x-100"
                  )}
                >
                  <Icon name="arrow" width={16} height={16} />
                </span>
              </div>
            </button>
            {open && (
              <CardBody className="space-y-3 border-t border-[var(--color-border)]">
                <div>
                  <h4 className="mb-1.5 text-xs font-bold text-[var(--color-ink-faint)]">
                    نحوه انجام
                  </h4>
                  <ol className="list-decimal space-y-1.5 pr-5 text-[13px] leading-relaxed text-[var(--color-ink-soft)]">
                    {content.howTo.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </div>
                <div>
                  <h4 className="mb-1.5 text-xs font-bold text-[var(--color-ink-faint)]">
                    اشتباه‌های رایج
                  </h4>
                  <p className="text-[13px] text-[var(--color-ink-soft)]">
                    {content.commonMistakes.join("، ")}
                  </p>
                </div>
                <p className="rounded-lg bg-[var(--color-danger-soft)] px-3 py-2 text-[12px] leading-relaxed text-[var(--color-danger)]">
                  {content.whenToStop}
                </p>
              </CardBody>
            )}
          </Card>
        );
      })}
    </div>
  );
}

/* ── Tab 2: progress ───────────────────────────────────────────── */

function ProgressTab({ patient }: { patient: Patient }) {
  const sorted = useMemo(
    () => [...patient.progress].sort((a, b) => a.date.localeCompare(b.date)),
    [patient.progress]
  );
  const last14 = sorted.slice(-14);

  const [weekAgo] = useState(() =>
    localDateValue(new Date(Date.now() - 7 * 864e5))
  );
  const thisWeek = sorted.filter((e) => e.date > weekAgo);
  const doneThisWeek = thisWeek.filter((e) => e.completed).length;
  const incompleteThisWeek = thisWeek.length - doneThisWeek;
  const weekAvgPain =
    thisWeek.length > 0
      ? thisWeek.reduce((s, e) => s + e.painLevel, 0) / thisWeek.length
      : null;
  const painChange =
    sorted.length >= 2 ? sorted[sorted.length - 1].painLevel - sorted[0].painLevel : null;

  return (
    <div className="space-y-4">
      {/* Stat tiles */}
      <div className="grid grid-cols-3 gap-3">
        <StatTile
          value={`${fa(thisWeek.length)} گزارش`}
          label={`${fa(doneThisWeek)} کامل · ${fa(incompleteThisWeek)} کامل‌نشده`}
        />
        <StatTile
          value={weekAvgPain === null ? "—" : fa(Math.round(weekAvgPain * 10) / 10)}
          label="میانگین درد (۷ روز)"
        />
        <StatTile
          value={
            painChange === null
              ? "—"
              : painChange <= 0
                ? `${fa(Math.abs(painChange))}− نمره`
                : `${fa(painChange)}+ نمره`
          }
          label="تغییر درد از شروع"
          good={painChange !== null && painChange < 0}
        />
      </div>
      <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs leading-relaxed text-[var(--color-ink-soft)]">
        هدف نسخه {fa(patient.weeklyTarget)} روز در هفته است. تعداد گزارش‌های
        ثبت‌شده جدا از این هدف نمایش داده می‌شود؛ نبود گزارش به معنی انجام‌نشدن
        تمرین نیست و از این داده‌های کلی درصد پایبندی محاسبه نمی‌شود.
      </p>

      {/* Pain trend */}
      <Card>
        <CardBody>
          <h3 className="mb-1 text-sm font-bold text-[var(--color-ink)]">
            روند درد شما
          </h3>
          <p className="mb-4 text-xs text-[var(--color-ink-faint)]">
            نمره درد (۰ تا ۱۰) در روزهایی که گزارش کرده‌اید — {fa(last14.length)} گزارش اخیر
          </p>
          {last14.length >= 2 ? (
            <PainTrendChart entries={last14} />
          ) : (
            <p className="py-6 text-center text-sm text-[var(--color-ink-faint)]">
              بعد از ثبت چند جلسه، نمودار روند درد اینجا نمایش داده می‌شود.
            </p>
          )}
        </CardBody>
      </Card>

      {/* Explicit daily aggregate reports; missing days are unknown. */}
      <Card>
        <CardBody>
          <h3 className="mb-1 text-sm font-bold text-[var(--color-ink)]">
            گزارش‌های کلی روزانه
          </h3>
          <p className="mb-4 text-xs text-[var(--color-ink-faint)]">
            فقط {fa(last14.length)} روز گزارش‌شده نمایش داده می‌شود. علامت ✓
            یعنی بیمار صریحاً انجام کامل کل برنامه آن روز را ثبت کرده است؛ روز
            بدون گزارش، وضعیت نامشخص دارد و عدم پایبندی محسوب نمی‌شود.
          </p>
          <div dir="ltr" className="flex flex-wrap justify-center gap-2">
            {last14.map((e) => (
              <span
                key={e.date}
                title={`${faDate(e.date)} — ${e.completed ? "انجام شد" : "انجام نشد"}`}
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-full text-[11px]",
                  e.completed
                    ? "bg-[var(--color-primary)] text-white"
                    : "border-2 border-dashed border-[var(--color-ink-faint)] text-[var(--color-ink-faint)]"
                )}
              >
                {e.completed ? <Icon name="check" width={13} height={13} /> : "×"}
              </span>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function StatTile({
  value,
  label,
  good,
}: {
  value: string;
  label: string;
  good?: boolean;
}) {
  return (
    <Card>
      <CardBody className="px-3 py-4 text-center">
        <p
          className={cn(
            "text-lg font-bold",
            good ? "text-[var(--color-success)]" : "text-[var(--color-ink)]"
          )}
        >
          {value}
        </p>
        <p className="mt-1 text-[11px] leading-snug text-[var(--color-ink-faint)]">
          {label}
        </p>
      </CardBody>
    </Card>
  );
}

/** Single-series line chart of pain scores (SVG, no dependencies). */
function PainTrendChart({
  entries,
}: {
  entries: { date: string; painLevel: number }[];
}) {
  const W = 560;
  const H = 180;
  const pad = { top: 14, right: 16, bottom: 26, left: 30 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;

  const x = (i: number) =>
    pad.left + (entries.length === 1 ? innerW / 2 : (i / (entries.length - 1)) * innerW);
  const y = (pain: number) => pad.top + (1 - pain / 10) * innerH;

  const path = entries
    .map((e, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(e.painLevel).toFixed(1)}`)
    .join(" ");
  const last = entries[entries.length - 1];

  return (
    <div dir="ltr" className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="min-w-[420px]"
        role="img"
        aria-label="نمودار روند درد"
      >
        {/* gridlines at 0 / 5 / 10 */}
        {[0, 5, 10].map((v) => (
          <g key={v}>
            <line
              x1={pad.left}
              x2={W - pad.right}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--color-border)"
              strokeWidth={1}
            />
            <text
              x={pad.left - 8}
              y={y(v) + 3.5}
              textAnchor="end"
              fontSize={10}
              fill="var(--color-ink-faint)"
            >
              {fa(v)}
            </text>
          </g>
        ))}
        {/* first / last date labels */}
        <text
          x={x(0)}
          y={H - 8}
          textAnchor="start"
          fontSize={10}
          fill="var(--color-ink-faint)"
        >
          {faDate(entries[0].date)}
        </text>
        <text
          x={x(entries.length - 1)}
          y={H - 8}
          textAnchor="end"
          fontSize={10}
          fill="var(--color-ink-faint)"
        >
          {faDate(last.date)}
        </text>

        <path d={path} fill="none" stroke="var(--color-primary)" strokeWidth={2} />

        {entries.map((e, i) => (
          <g key={e.date} className="group">
            {/* enlarged invisible hit target */}
            <circle cx={x(i)} cy={y(e.painLevel)} r={11} fill="transparent">
              <title>{`${faDate(e.date)} — درد ${fa(e.painLevel)} از ${fa(10)}`}</title>
            </circle>
            <circle
              cx={x(i)}
              cy={y(e.painLevel)}
              r={4}
              fill="var(--color-primary)"
              stroke="var(--color-surface)"
              strokeWidth={2}
              className="pointer-events-none"
            />
          </g>
        ))}

        {/* direct label on the latest point only */}
        <text
          x={x(entries.length - 1)}
          y={y(last.painLevel) - 10}
          textAnchor="middle"
          fontSize={11}
          fontWeight={600}
          fill="var(--color-ink)"
        >
          {fa(last.painLevel)}
        </text>
      </svg>
    </div>
  );
}

/* ── Tab 3: tickets ────────────────────────────────────────────── */

function TicketsTab({ patient }: { patient: Patient }) {
  const { addTicket, replyToTicket } = usePatient();
  const [exerciseId, setExerciseId] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyingTicketId, setReplyingTicketId] = useState<string | null>(null);
  const [replyErrors, setReplyErrors] = useState<Record<string, string>>({});
  const safetySignals = useMemo(
    () => detectSafetySignals(message),
    [message]
  );
  const hasEmergencySignal = safetySignals.some(
    (signal) => signal.disposition === "emergency"
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    if (!subject.trim() || !message.trim()) {
      setError("موضوع و متن پیام را بنویسید.");
      return;
    }
    setSending(true);
    setError(null);
    // 🔌 REAL AI API INTEGRATION POINT — the auto-reply comes from the
    // mock triage helper; replace with a real AI triage call if desired.
    const ticket: Ticket = {
      id: uuid(),
      createdAt: new Date().toISOString(),
      exerciseId: exerciseId || null,
      subject: subject.trim(),
      message: message.trim(),
      status: "open",
      priority: hasEmergencySignal
        ? "emergency"
        : safetySignals.length > 0
          ? "urgent"
          : "routine",
      replies: [
        {
          id: uuid(),
          from: "ai",
          content: buildTicketAutoReply(message),
          createdAt: new Date().toISOString(),
        },
      ],
    };
    const ok = await addTicket(ticket);
    setSending(false);
    if (!ok) {
      // Keep every field intact so nothing the patient typed is lost.
      setError("ذخیره ناموفق بود — متن شما پاک نشده؛ لطفاً دوباره تلاش کنید.");
      return;
    }
    setSubject("");
    setMessage("");
    setExerciseId("");
    setSent(true);
    setTimeout(() => setSent(false), 2500);
  }

  async function submitReply(event: React.FormEvent, ticketId: string) {
    event.preventDefault();
    if (replyingTicketId) return;
    const content = (replyDrafts[ticketId] ?? "").trim();
    if (!content) {
      setReplyErrors((current) => ({
        ...current,
        [ticketId]: "متن پاسخ را بنویسید.",
      }));
      return;
    }
    setReplyingTicketId(ticketId);
    setReplyErrors((current) => ({ ...current, [ticketId]: "" }));
    const ok = await replyToTicket(ticketId, content);
    setReplyingTicketId(null);
    if (!ok) {
      setReplyErrors((current) => ({
        ...current,
        [ticketId]: "پاسخ ذخیره نشد؛ متن شما پاک نشده است. دوباره تلاش کنید.",
      }));
      return;
    }
    setReplyDrafts((current) => ({ ...current, [ticketId]: "" }));
  }

  return (
    <div className="space-y-4">
      {/* New ticket */}
      <Card>
        <CardBody className="space-y-3">
          <h3 className="text-sm font-bold text-[var(--color-ink)]">
            تیکت جدید برای فیزیوتراپیست
          </h3>
          <p className="text-xs text-[var(--color-ink-soft)]">
            مثلاً: «موقع تمرین پل باسن در کمرم درد حس می‌کنم.»
          </p>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="تمرین مربوطه (اختیاری)">
                <Select
                  value={exerciseId}
                  onChange={(e) => setExerciseId(e.target.value)}
                >
                  <option value="">— انتخاب تمرین —</option>
                  {patient.program.map((item) => (
                    <option key={item.exerciseId} value={item.exerciseId}>
                      {exerciseFa[item.exerciseId]?.name ?? item.exerciseId}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="موضوع" required>
                <Input
                  value={subject}
                  maxLength={160}
                  required
                  onChange={(e) => {
                    setSubject(e.target.value);
                    setError(null);
                  }}
                  placeholder="مثلاً: درد هنگام تمرین"
                />
              </Field>
            </div>
            <Field label="توضیح" required error={error ?? undefined}>
              <Textarea
                value={message}
                maxLength={4000}
                required
                onChange={(e) => {
                  setMessage(e.target.value);
                  setError(null);
                }}
                placeholder="بنویسید چه اتفاقی افتاد، کجا و چه زمانی…"
              />
            </Field>
            {safetySignals.length > 0 && (
              <div
                role="alert"
                className="rounded-xl bg-[var(--color-danger-soft)] px-3 py-2 text-xs leading-relaxed text-[var(--color-danger)]"
              >
                {hasEmergencySignal
                  ? "این توضیح می‌تواند نشانه یک وضعیت اورژانسی باشد. منتظر پاسخ تیکت نمانید؛ فعالیت را متوقف کنید و همین حالا با اورژانس ۱۱۵ یا نزدیک‌ترین مرکز اورژانس تماس بگیرید."
                  : "این توضیح نیازمند بررسی سریع پزشکی است. فعالیت را متوقف کنید و امروز با فیزیوتراپیست یا مرکز درمانی تماس بگیرید؛ تیکت جای ارزیابی فوری را نمی‌گیرد."}
              </div>
            )}
            <Button type="submit" size="sm" disabled={sending}>
              <Icon name="send" width={14} height={14} className="-scale-x-100" />
              {sending ? "در حال ارسال…" : sent ? "ارسال شد ✓" : "ارسال تیکت"}
            </Button>
          </form>
        </CardBody>
      </Card>

      {/* Ticket list */}
      {patient.tickets.length === 0 ? (
        <p className="py-4 text-center text-sm text-[var(--color-ink-faint)]">
          هنوز تیکتی ثبت نکرده‌اید.
        </p>
      ) : (
        patient.tickets.map((t) => (
          <Card key={t.id}>
            <CardBody className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-[var(--color-ink)]">
                    {t.subject}
                  </h4>
                  <p className="mt-0.5 text-[11px] text-[var(--color-ink-faint)]">
                    {faDate(t.createdAt)}
                    {t.exerciseId && exerciseFa[t.exerciseId]
                      ? ` · ${exerciseFa[t.exerciseId].name}`
                      : ""}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium",
                    t.status === "answered" || t.status === "closed"
                      ? "bg-[var(--color-success-soft)] text-[var(--color-success)]"
                      : "bg-[var(--color-warn-soft)] text-[var(--color-warn)]"
                  )}
                >
                  {t.status === "closed"
                    ? "بسته شده"
                    : t.status === "answered"
                      ? "پاسخ داده شد"
                      : t.status === "acknowledged"
                        ? "دیده شده؛ در حال بررسی"
                        : "در انتظار فیزیوتراپیست"}
                </span>
              </div>
              <p className="rounded-xl bg-[var(--color-surface-muted)] px-3.5 py-2.5 text-[13px] leading-relaxed text-[var(--color-ink)]">
                {t.message}
              </p>
              {t.replies.map((r) => (
                <div
                  key={r.id}
                  className={cn(
                    "rounded-xl border px-3.5 py-2.5 text-[13px] leading-relaxed",
                    r.from === "therapist"
                      ? "border-[var(--color-primary)]/30 bg-[var(--color-primary-tint)] text-[var(--color-ink)]"
                      : "border-[var(--color-accent)]/20 bg-[var(--color-accent-soft)]/40 text-[var(--color-ink-soft)]"
                  )}
                >
                  <p className="mb-1 text-[10px] font-bold text-[var(--color-ink-faint)]">
                    {r.from === "therapist"
                      ? "🩺 فیزیوتراپیست"
                      : r.from === "patient"
                        ? "🙋 شما"
                        : "🤖 دستیار هوشمند"}
                  </p>
                  {r.content}
                </div>
              ))}
              {t.status === "closed" ? (
                <p className="rounded-xl bg-[var(--color-surface-muted)] px-3.5 py-2.5 text-xs text-[var(--color-ink-soft)]">
                  این گفت‌وگو بسته شده است. برای موضوع جدید یک تیکت تازه بسازید.
                  {t.closureNote ? ` یادداشت پایان: ${t.closureNote}` : ""}
                </p>
              ) : (
                <form
                  className="space-y-2 border-t border-[var(--color-border)] pt-3"
                  onSubmit={(event) => submitReply(event, t.id)}
                >
                  <Field
                    label="پاسخ شما"
                    error={replyErrors[t.id] || undefined}
                  >
                    <Textarea
                      value={replyDrafts[t.id] ?? ""}
                      maxLength={4000}
                      required
                      onChange={(event) => {
                        const value = event.target.value;
                        setReplyDrafts((current) => ({
                          ...current,
                          [t.id]: value,
                        }));
                        setReplyErrors((current) => ({
                          ...current,
                          [t.id]: "",
                        }));
                      }}
                      placeholder="اگر توضیح یا علامت تازه‌ای دارید اینجا بنویسید…"
                    />
                  </Field>
                  <Button
                    type="submit"
                    size="sm"
                    variant="secondary"
                    disabled={replyingTicketId !== null}
                  >
                    <Icon
                      name="send"
                      width={14}
                      height={14}
                      className="-scale-x-100"
                    />
                    {replyingTicketId === t.id
                      ? "در حال ارسال…"
                      : "ارسال پاسخ"}
                  </Button>
                </form>
              )}
            </CardBody>
          </Card>
        ))
      )}
    </div>
  );
}

/* ── Tab 4: AI assistant chat ──────────────────────────────────── */

function AssistantTab({ patient }: { patient: Patient }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  function send(text: string) {
    const content = text.trim();
    if (!content || thinking) return;
    setMessages((prev) => [...prev, { id: uid("msg"), role: "user", content }]);
    setInput("");
    setThinking(true);
    // 🔌 REAL AI API INTEGRATION POINT — replace with a streaming AI call
    // (see buildPatientChatReply in lib/ai/engine.ts).
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: uid("msg"),
          role: "assistant",
          content: buildPatientChatReply(content, patient, exerciseFa),
        },
      ]);
      setThinking(false);
      requestAnimationFrame(() =>
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth",
        })
      );
    }, 700);
  }

  return (
    <Card className="flex min-h-[480px] flex-col">
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 py-8 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--color-primary-tint)] text-[var(--color-primary)]">
              <Icon name="chat" width={24} height={24} />
            </span>
            <p className="max-w-xs text-sm text-[var(--color-ink-soft)]">
              درباره تمرین‌هایتان سؤال بپرسید — مثلاً نحوه انجام یک تمرین یا روند
              پیشرفت‌تان.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {patientSuggestedPrompts.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => send(p)}
                  className="rounded-full border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary-strong)]"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn("flex", msg.role === "user" ? "justify-start" : "justify-end")}
          >
            <div
              className={cn(
                "max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-3 text-[13px] leading-relaxed",
                msg.role === "user"
                  ? "rounded-br-md bg-[var(--color-primary)] text-white"
                  : "rounded-bl-md bg-[var(--color-surface-muted)] text-[var(--color-ink)]"
              )}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {thinking && (
          <div className="flex justify-end">
            <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-[var(--color-surface-muted)] px-4 py-3">
              <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--color-ink-faint)] [animation-delay:0ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--color-ink-faint)] [animation-delay:120ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--color-ink-faint)] [animation-delay:240ms]" />
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-end gap-2 border-t border-[var(--color-border)] p-3"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          placeholder="سؤال خود را بنویسید…"
          className="max-h-28 flex-1 resize-none rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-[13px] placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
        />
        <Button type="submit" size="sm" disabled={!input.trim() || thinking} aria-label="ارسال">
          <Icon name="send" width={15} height={15} className="-scale-x-100" />
        </Button>
      </form>
    </Card>
  );
}
