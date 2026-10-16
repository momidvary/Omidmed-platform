"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCases } from "@/lib/store/CaseContext";
import { useAuth } from "@/lib/store/AuthContext";
import { useAttention } from "@/lib/store/AttentionContext";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, Disclaimer } from "@/components/ui/Misc";
import { isMockMode } from "@/lib/config";
import { cn, formatDate } from "@/lib/utils";
import { useLocale } from "@/lib/store/LocaleContext";
import { useText, type PageText } from "@/lib/i18n/text";
import { FollowUpSection } from "./FollowUpSection";

const en = {
  greeting: (name: string | null) => (name ? `Hello, ${name}` : "Hello"),
  intro: "Start with a patient: register someone new or find an existing patient.",
  newPatient: "Register new patient",
  newAssessment: "New assessment",
  searchLabel: "Find a patient",
  searchPlaceholder: "Patient name…",
  search: "Find",
  attention: "Needs your attention",
  alerts: "Unresolved clinical alerts",
  alertsNone: "No unresolved alerts",
  messages: "Messages awaiting a reply",
  messagesNone: "No messages waiting",
  unknownCount: "—",
  open: "Open",
  recent: "Recent patients",
  recentHint: "Continue where you left off",
  noCases: "No assessments yet",
  noCasesHint: "Register a patient and start their first assessment.",
  unnamed: "Unnamed patient",
  pain: (value: number) => `Pain ${value}/10`,
  regions: "Body-region reference",
};

const text: PageText<typeof en> = {
  en,
  fa: {
    greeting: (name) => (name ? `سلام، ${name}` : "سلام"),
    intro: "کار را از بیمار شروع کنید: بیمار جدید ثبت کنید یا بیمار قبلی را پیدا کنید.",
    newPatient: "ثبت بیمار جدید",
    newAssessment: "ارزیابی جدید",
    searchLabel: "پیدا کردن بیمار",
    searchPlaceholder: "نام بیمار…",
    search: "جستجو",
    attention: "نیاز به رسیدگی شما",
    alerts: "هشدارهای بالینی رفع‌نشده",
    alertsNone: "هشدار رفع‌نشده‌ای نیست",
    messages: "پیام‌های منتظر پاسخ",
    messagesNone: "پیامی منتظر پاسخ نیست",
    unknownCount: "—",
    open: "باز کردن",
    recent: "بیماران اخیر",
    recentHint: "از جایی که ماندید ادامه دهید",
    noCases: "هنوز ارزیابی‌ای ثبت نشده",
    noCasesHint: "یک بیمار ثبت کنید و اولین ارزیابی او را شروع کنید.",
    unnamed: "بیمار بدون نام",
    pain: (value) => `درد ${value.toLocaleString("fa-IR")} از ۱۰`,
    regions: "مرجع سریع نواحی بدن",
  },
  ar: {
    greeting: (name) => (name ? `مرحبًا، ${name}` : "مرحبًا"),
    intro: "ابدأ بالمريض: سجّل مريضًا جديدًا أو ابحث عن مريض موجود.",
    newPatient: "تسجيل مريض جديد",
    newAssessment: "تقييم جديد",
    searchLabel: "البحث عن مريض",
    searchPlaceholder: "اسم المريض…",
    search: "بحث",
    attention: "يحتاج إلى متابعتك",
    alerts: "تنبيهات سريرية غير محلولة",
    messages: "رسائل بانتظار الرد",
    recent: "المرضى الأخيرون",
    noCases: "لا توجد تقييمات بعد",
    unnamed: "مريض بلا اسم",
    pain: (value) => `الألم ${value}/10`,
    regions: "مرجع مناطق الجسم",
  },
};

function AttentionCard({
  href,
  icon,
  label,
  noneLabel,
  count,
  unknown,
  tone,
}: {
  href: string;
  icon: "alert" | "inbox";
  label: string;
  noneLabel: string;
  count: number | null;
  unknown: string;
  tone: "danger" | "warn";
}) {
  const { locale } = useLocale();
  const active = count !== null && count > 0;
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-4 rounded-2xl border p-4 transition-shadow hover:shadow-md",
        active && tone === "danger"
          ? "border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)]"
          : active
            ? "border-[var(--color-warn)]/40 bg-[var(--color-warn-soft)]"
            : "border-[var(--color-border)] bg-white"
      )}
    >
      <span
        className={cn(
          "grid h-11 w-11 shrink-0 place-items-center rounded-xl",
          active && tone === "danger"
            ? "bg-[var(--color-danger)] text-white"
            : active
              ? "bg-[var(--color-warn)] text-white"
              : "bg-[var(--color-surface-muted)] text-[var(--color-ink-faint)]"
        )}
      >
        <Icon name={icon} width={22} height={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-2xl font-bold text-[var(--color-ink)]">
          {count === null ? unknown : count.toLocaleString(locale === "fa" ? "fa-IR" : "en-US")}
        </span>
        <span className="block text-xs text-[var(--color-ink-soft)]">
          {count === 0 ? noneLabel : label}
        </span>
      </span>
      <Icon name="arrow" width={16} height={16} className="text-[var(--color-ink-faint)] rtl:rotate-180" />
    </Link>
  );
}

export default function DashboardPage() {
  const { cases, setCurrentCase } = useCases();
  const { profile } = useAuth();
  const { counts } = useAttention();
  const { locale } = useLocale();
  const router = useRouter();
  const t = useText(text);
  const [search, setSearch] = useState("");
  const today = new Date().toLocaleDateString(locale === "fa" ? "fa-IR" : locale === "ar" ? "ar" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const clinical =
    profile?.role === "clinic_owner" || profile?.role === "therapist";
  const displayName = profile?.fullName?.trim() || null;

  function openCase(caseId: string, patientId: string | undefined) {
    setCurrentCase(caseId);
    router.push(
      patientId && !isMockMode
        ? `/workspace?patient=${encodeURIComponent(patientId)}`
        : "/case-analysis"
    );
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f766e] via-[#0d9488] to-[#14b8a6] p-6 text-white shadow-[0_18px_40px_-20px_rgba(13,148,136,0.7)] sm:p-8">
        <p className="text-sm text-white/80">{today}</p>
        <h2 className="mt-1 text-2xl font-bold sm:text-3xl">
          {t.greeting(isMockMode ? null : displayName)}
        </h2>
        <p className="mt-2 max-w-xl text-sm text-white/85">{t.intro}</p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          {!isMockMode && (
            <form
              role="search"
              className="relative flex-1"
              onSubmit={(event) => {
                event.preventDefault();
                const q = search.trim();
                router.push(q ? `/patients?q=${encodeURIComponent(q)}` : "/patients");
              }}
            >
              <Icon
                name="search"
                width={18}
                height={18}
                className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-[var(--color-ink-faint)]"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t.searchPlaceholder}
                aria-label={t.searchLabel}
                maxLength={80}
                enterKeyHint="search"
                className="min-h-12 w-full rounded-2xl border-0 bg-white ps-11 pe-4 text-base text-[var(--color-ink)] shadow-sm placeholder:text-[var(--color-ink-faint)] focus:outline-none focus:ring-4 focus:ring-white/40"
              />
            </form>
          )}
          <ButtonLink
            href={isMockMode ? "/new-case" : "/patients?new=1"}
            size="lg"
            variant="secondary"
            className="border-0 text-[var(--color-primary-strong)]"
          >
            <Icon name="plus" width={20} height={20} />
            {isMockMode ? t.newAssessment : t.newPatient}
          </ButtonLink>
        </div>
      </section>

      {!isMockMode && clinical && (
        <section aria-labelledby="attention-heading">
          <h3
            id="attention-heading"
            className="mb-3 text-sm font-semibold text-[var(--color-ink)]"
          >
            {t.attention}
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <AttentionCard
              href="/alerts"
              icon="alert"
              label={t.alerts}
              noneLabel={t.alertsNone}
              count={counts?.alerts ?? null}
              unknown={t.unknownCount}
              tone="danger"
            />
            <AttentionCard
              href="/tickets"
              icon="inbox"
              label={t.messages}
              noneLabel={t.messagesNone}
              count={counts?.tickets ?? null}
              unknown={t.unknownCount}
              tone="warn"
            />
          </div>
        </section>
      )}

      {!isMockMode && clinical && <FollowUpSection />}

      <Card>
        <CardHeader
          title={t.recent}
          subtitle={t.recentHint}
          icon={<Icon name="clock" width={18} height={18} />}
        />
        <CardBody className="p-0">
          {cases.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon="users"
                title={t.noCases}
                description={t.noCasesHint}
                action={
                  <ButtonLink href={isMockMode ? "/new-case" : "/patients?new=1"}>
                    {isMockMode ? t.newAssessment : t.newPatient}
                  </ButtonLink>
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {cases.slice(0, 6).map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => openCase(c.id, c.patientId)}
                    className="flex w-full items-center gap-4 px-5 py-3.5 text-start transition-colors hover:bg-[var(--color-surface-muted)]"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--color-primary-tint)] text-sm font-semibold text-[var(--color-primary-strong)]">
                      {c.name ? c.name.charAt(0).toUpperCase() : "?"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[var(--color-ink)]" dir="auto">
                        {c.name || t.unnamed}
                      </span>
                      <span className="block truncate text-xs text-[var(--color-ink-faint)]" dir="auto">
                        {c.mainComplaint}
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-end sm:block">
                      <Badge tone={c.painIntensity >= 7 ? "danger" : c.painIntensity >= 4 ? "warn" : "success"}>
                        {t.pain(c.painIntensity)}
                      </Badge>
                      <span className="mt-1 block text-xs text-[var(--color-ink-faint)]">
                        {formatDate(c.createdAt, locale)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Disclaimer />
    </div>
  );
}
