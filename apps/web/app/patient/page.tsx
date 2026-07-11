"use client";

import { useMemo, useRef, useState } from "react";
import { usePatient } from "@/lib/store/PatientContext";
import { exerciseFa } from "@/lib/data/exerciseFa";
import {
  buildPatientChatReply,
  buildTicketAutoReply,
  patientSuggestedPrompts,
} from "@/lib/ai/engine";
import type { ChatMessage, Patient, Ticket } from "@/lib/types";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { Disclaimer, Spinner } from "@/components/ui/Misc";
import { cn, uid, uuid } from "@/lib/utils";
import { useAuth } from "@/lib/store/AuthContext";
import { isMockMode } from "@/lib/config";
import { SaveStatusPill } from "@/components/ui/SaveStatusPill";

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

const tabs: { id: Tab; label: string; icon: React.ComponentProps<typeof Icon>["name"] }[] = [
  { id: "program", label: "برنامه من", icon: "exercise" },
  { id: "progress", label: "پیشرفت من", icon: "analysis" },
  { id: "tickets", label: "تیکت‌ها", icon: "flag" },
  { id: "assistant", label: "دستیار هوشمند", icon: "chat" },
];

export default function PatientPortalPage() {
  const { patient, hydrated } = usePatient();
  const { session, loading } = useAuth();

  const waiting = !hydrated || (!isMockMode && loading);
  // Signed in but not yet linked to a patient record by the clinic.
  const unlinked = !isMockMode && session && hydrated && !patient;

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-[var(--color-bg)] font-[family-name:var(--font-vazirmatn)]"
    >
      {waiting ? (
        <Spinner label="در حال بارگذاری…" />
      ) : patient ? (
        <PatientDashboard patient={patient} />
      ) : unlinked ? (
        <UnlinkedNotice />
      ) : (
        <PatientEntry />
      )}
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
            ورود شما موفق بود، اما کلینیک هنوز حساب شما را به پرونده درمانی‌تان
            متصل نکرده است. لطفاً با کلینیک خود تماس بگیرید و ایمیل ثبت‌نامی‌تان
            را اعلام کنید.
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
  const { closeDemoPatient } = usePatient();
  const { signOut } = useAuth();
  const [tab, setTab] = useState<Tab>("program");
  const openTickets = patient.tickets.filter((t) => t.status === "open").length;

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
  const today = new Date().toISOString().slice(0, 10);
  const todayEntry = patient.progress.find((e) => e.date === today);
  const [pain, setPain] = useState(todayEntry?.painLevel ?? 3);

  return (
    <div className="space-y-4">
      {/* Today's session log */}
      <Card className="border-[var(--color-primary)]/30 bg-[var(--color-primary-tint)]">
        <CardBody className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[var(--color-ink)]">
              جلسه امروز
            </h3>
            {todayEntry?.completed && (
              <span className="flex items-center gap-1 text-xs font-medium text-[var(--color-success)]">
                <Icon name="check" width={14} height={14} />
                ثبت شد
              </span>
            )}
          </div>
          <label className="block text-xs text-[var(--color-ink-soft)]">
            میزان درد بعد از تمرین: <strong>{fa(pain)} از ۱۰</strong>
            <input
              type="range"
              min={0}
              max={10}
              value={pain}
              onChange={(e) => setPain(Number(e.target.value))}
              dir="ltr"
              className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-full bg-gradient-to-r from-[var(--color-success)] via-[var(--color-warn)] to-[var(--color-danger)]"
            />
          </label>
          <Button
            size="sm"
            onClick={() =>
              logProgress({ date: today, painLevel: pain, completed: true })
            }
          >
            <Icon name="check" width={14} height={14} />
            {todayEntry?.completed ? "به‌روزرسانی جلسه امروز" : "تمرین‌های امروز را انجام دادم"}
          </Button>
        </CardBody>
      </Card>

      {/* Prescribed exercises */}
      {patient.program.map((item) => {
        const content = exerciseFa[item.exerciseId];
        if (!content) return null;
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
    new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)
  );
  const thisWeek = sorted.filter((e) => e.date > weekAgo);
  const doneThisWeek = thisWeek.filter((e) => e.completed).length;
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
          value={`${fa(doneThisWeek)} / ${fa(patient.weeklyTarget)}`}
          label="جلسات این هفته"
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

      {/* Pain trend */}
      <Card>
        <CardBody>
          <h3 className="mb-1 text-sm font-bold text-[var(--color-ink)]">
            روند درد شما
          </h3>
          <p className="mb-4 text-xs text-[var(--color-ink-faint)]">
            نمره درد (۰ تا ۱۰) که بعد از هر جلسه ثبت کرده‌اید — {fa(last14.length)} جلسه اخیر
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

      {/* Adherence */}
      <Card>
        <CardBody>
          <h3 className="mb-1 text-sm font-bold text-[var(--color-ink)]">
            پایبندی به تمرین‌ها
          </h3>
          <p className="mb-4 text-xs text-[var(--color-ink-faint)]">
            {fa(last14.length)} جلسه اخیر — دایره پُر با علامت ✓ یعنی برنامه آن روز کامل انجام شده
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
  const { addTicket } = usePatient();
  const [exerciseId, setExerciseId] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
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
                onChange={(e) => {
                  setMessage(e.target.value);
                  setError(null);
                }}
                placeholder="بنویسید چه اتفاقی افتاد، کجا و چه زمانی…"
              />
            </Field>
            <Button type="submit" size="sm">
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
                    t.status === "answered"
                      ? "bg-[var(--color-success-soft)] text-[var(--color-success)]"
                      : "bg-[var(--color-warn-soft)] text-[var(--color-warn)]"
                  )}
                >
                  {t.status === "answered" ? "پاسخ داده شد" : "در انتظار فیزیوتراپیست"}
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
