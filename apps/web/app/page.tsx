"use client";

import Link from "next/link";
import { useCases } from "@/lib/store/CaseContext";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, Disclaimer } from "@/components/ui/Misc";
import { localizedRegions } from "@/lib/data/bodyRegionsFa";
import { exercises } from "@/lib/data/exercises";
import { formatDate } from "@/lib/utils";
import { useLocale } from "@/lib/store/LocaleContext";
import { useText, type PageText } from "@/lib/i18n/text";

const en = {
  eyebrow: "PhysioAI Assistant",
  heroTitle: "Clinical reasoning, treatment planning and exercise prescription — organised in minutes.",
  heroBody:
    "Enter a case, screen for safety, and generate a structured, evidence-informed starting point you refine with your own examination.",
  newCase: "New Patient Case",
  askAi: "Ask the AI Assistant",
  quickTools: "Quick Clinical Tools",
  tools: {
    "/new-case": ["New Patient Case", "Start a structured intake"],
    "/ai-assistant": ["AI Clinical Assistant", "Ask a clinical question"],
    "/red-flags": ["Red Flag Checker", "Run a safety screen"],
    "/treatment-planner": ["Treatment Planner", "Build a rehab plan"],
    "/exercise-library": ["Exercise Library", `${exercises.length} exercises ready`],
    "/patient-education": ["Patient Education", "Generate a handout"],
  } as Record<string, [string, string]>,
  recentCases: "Recent Cases",
  recentHint: "Pick up where you left off",
  newShort: "New",
  noCases: "No cases yet",
  noCasesHint: "Create your first patient case to start clinical reasoning.",
  unnamed: "Unnamed patient",
  pain: (value: number) => `Pain ${value}/10`,
  regions: "Body Region Modules",
  regionsHint: "Assessment & treatment references",
};

const text: PageText<typeof en> = {
  en,
  fa: {
    eyebrow: "دستیار PhysioAI",
    heroTitle: "استدلال بالینی، برنامه‌ریزی درمان و تجویز تمرین — در چند دقیقه.",
    heroBody:
      "کیس را وارد کنید، غربالگری ایمنی را انجام دهید و یک نقطه شروع ساختاریافته و مبتنی بر شواهد بسازید که با معاینه خودتان کاملش می‌کنید.",
    newCase: "پرونده جدید بیمار",
    askAi: "پرسش از دستیار هوشمند",
    quickTools: "ابزارهای سریع بالینی",
    tools: {
      "/new-case": ["پرونده جدید بیمار", "شروع پذیرش ساختاریافته"],
      "/ai-assistant": ["دستیار بالینی هوشمند", "طرح یک پرسش بالینی"],
      "/red-flags": ["بررسی پرچم قرمز", "انجام غربالگری ایمنی"],
      "/treatment-planner": ["برنامه‌ریز درمان", "ساخت برنامه توان‌بخشی"],
      "/exercise-library": ["کتابخانه تمرین", `${exercises.length} تمرین آماده`],
      "/patient-education": ["آموزش بیمار", "ساخت برگه آموزشی"],
    },
    recentCases: "پرونده‌های اخیر",
    recentHint: "از جایی که ماندید ادامه دهید",
    newShort: "جدید",
    noCases: "هنوز پرونده‌ای ندارید",
    noCasesHint: "برای شروع استدلال بالینی، اولین پرونده بیمار را بسازید.",
    unnamed: "بیمار بدون نام",
    pain: (value) => `درد ${value}/10`,
    regions: "ماژول‌های نواحی بدن",
    regionsHint: "مرجع ارزیابی و درمان",
  },
  ar: {
    eyebrow: "مساعد PhysioAI",
    heroTitle: "الاستدلال السريري وتخطيط العلاج ووصف التمارين — منظَّمة في دقائق.",
    heroBody:
      "أدخل الحالة، وأجرِ فحص السلامة، وأنشئ نقطة بداية منظمة مستندة إلى الأدلة تكملها بفحصك.",
    newCase: "حالة مريض جديدة",
    askAi: "اسأل المساعد الذكي",
    quickTools: "أدوات سريرية سريعة",
    tools: {
      "/new-case": ["حالة مريض جديدة", "ابدأ استمارة منظمة"],
      "/ai-assistant": ["المساعد السريري الذكي", "اطرح سؤالاً سريرياً"],
      "/red-flags": ["فحص العلامات الحمراء", "أجرِ فحص السلامة"],
      "/treatment-planner": ["مخطط العلاج", "أنشئ خطة تأهيل"],
      "/exercise-library": ["مكتبة التمارين", `${exercises.length} تمرين جاهز`],
      "/patient-education": ["تثقيف المريض", "أنشئ نشرة"],
    },
    recentCases: "الحالات الأخيرة",
    recentHint: "تابع من حيث توقفت",
    newShort: "جديد",
    noCases: "لا توجد حالات بعد",
    noCasesHint: "أنشئ أول حالة مريض لبدء الاستدلال السريري.",
    unnamed: "مريض بلا اسم",
    pain: (value) => `الألم ${value}/10`,
    regions: "وحدات مناطق الجسم",
    regionsHint: "مراجع التقييم والعلاج",
  },
};

const quickTools = [
  { href: "/new-case", icon: "new-case", tone: "bg-[var(--color-primary-tint)] text-[var(--color-primary)]" },
  { href: "/ai-assistant", icon: "chat", tone: "bg-[var(--color-accent-soft)] text-[var(--color-accent)]" },
  { href: "/red-flags", icon: "flag", tone: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]" },
  { href: "/treatment-planner", icon: "treatment", tone: "bg-[var(--color-success-soft)] text-[var(--color-success)]" },
  { href: "/exercise-library", icon: "exercise", tone: "bg-[var(--color-warn-soft)] text-[var(--color-warn)]" },
  { href: "/patient-education", icon: "education", tone: "bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]" },
] as const;

export default function DashboardPage() {
  const { cases, setCurrentCase } = useCases();
  const { locale } = useLocale();
  const t = useText(text);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <Card className="overflow-hidden">
        <div className="relative bg-gradient-to-br from-[var(--color-primary)] to-[#0b7285] px-6 py-8 text-white sm:px-8">
          <p className="text-xs font-medium uppercase tracking-wider text-teal-100">
            {t.eyebrow}
          </p>
          <h2 className="mt-2 max-w-xl text-2xl font-semibold leading-snug">
            {t.heroTitle}
          </h2>
          <p className="mt-2 max-w-xl text-sm text-teal-50/90">
            {t.heroBody}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <ButtonLink href="/new-case" variant="secondary" className="border-0">
              <Icon name="plus" width={16} height={16} />
              {t.newCase}
            </ButtonLink>
            <ButtonLink
              href="/ai-assistant"
              variant="ghost"
              className="text-white hover:bg-white/10"
            >
              {t.askAi}
              <Icon name="arrow" width={16} height={16} className="rtl:rotate-180" />
            </ButtonLink>
          </div>
        </div>
      </Card>

      {/* Quick tools */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
          {t.quickTools}
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickTools.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="group flex items-center gap-4 rounded-2xl border border-[var(--color-border)] bg-white p-4 transition-shadow hover:shadow-md"
            >
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tool.tone}`}>
                <Icon name={tool.icon} width={22} height={22} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[var(--color-ink)]">
                  {t.tools[tool.href][0]}
                </span>
                <span className="block truncate text-xs text-[var(--color-ink-faint)]">
                  {t.tools[tool.href][1]}
                </span>
              </span>
              <span className="ms-auto text-[var(--color-ink-faint)] transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5">
                <Icon name="arrow" width={16} height={16} className="rtl:rotate-180" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Recent cases */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader
              title={t.recentCases}
              subtitle={t.recentHint}
              icon={<Icon name="clock" width={18} height={18} />}
              action={
                <ButtonLink href="/new-case" variant="secondary" size="sm">
                  <Icon name="plus" width={14} height={14} />
                  {t.newShort}
                </ButtonLink>
              }
            />
            <CardBody className="p-0">
              {cases.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    icon="new-case"
                    title={t.noCases}
                    description={t.noCasesHint}
                    action={<ButtonLink href="/new-case">{t.newCase}</ButtonLink>}
                  />
                </div>
              ) : (
                <ul className="divide-y divide-[var(--color-border)]">
                  {cases.slice(0, 5).map((c) => (
                    <li key={c.id}>
                      <Link
                        href="/case-analysis"
                        onClick={() => setCurrentCase(c.id)}
                        className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-[var(--color-surface-muted)]"
                      >
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--color-primary-tint)] text-sm font-semibold text-[var(--color-primary-strong)]">
                          {c.name ? c.name.charAt(0).toUpperCase() : "?"}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-[var(--color-ink)]">
                            {c.name || t.unnamed}
                          </span>
                          <span className="block truncate text-xs text-[var(--color-ink-faint)]">
                            {c.mainComplaint}
                          </span>
                        </span>
                        <span className="hidden shrink-0 text-end sm:block">
                          <Badge tone={c.painIntensity >= 7 ? "danger" : c.painIntensity >= 4 ? "warn" : "success"}>
                            {t.pain(c.painIntensity)}
                          </Badge>
                          <span className="mt-1 block text-[11px] text-[var(--color-ink-faint)]">
                            {formatDate(c.createdAt, locale)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Body region modules */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              title={t.regions}
              subtitle={t.regionsHint}
              icon={<Icon name="analysis" width={18} height={18} />}
            />
            <CardBody className="p-3">
              <div className="grid grid-cols-1 gap-1">
                {localizedRegions(locale).map((region) => (
                  <Link
                    key={region.id}
                    href={`/case-analysis?region=${region.id}`}
                    className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-[var(--color-ink-soft)] transition-colors hover:bg-[var(--color-surface-muted)]"
                  >
                    <span className="text-base">{region.emoji}</span>
                    <span className="font-medium">{region.label}</span>
                    <span className="ms-auto text-[var(--color-ink-faint)]">
                      <Icon name="arrow" width={14} height={14} className="rtl:rotate-180" />
                    </span>
                  </Link>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      <Disclaimer />
    </div>
  );
}
