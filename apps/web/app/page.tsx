"use client";

import Link from "next/link";
import { useCases } from "@/lib/store/CaseContext";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, Disclaimer } from "@/components/ui/Misc";
import { bodyRegions } from "@/lib/data/bodyRegions";
import { exercises } from "@/lib/data/exercises";
import { formatDate } from "@/lib/utils";

const quickTools = [
  { href: "/new-case", label: "New Patient Case", icon: "new-case", desc: "Start a structured intake", tone: "bg-[var(--color-primary-tint)] text-[var(--color-primary)]" },
  { href: "/ai-assistant", label: "AI Clinical Assistant", icon: "chat", desc: "Ask a clinical question", tone: "bg-[var(--color-accent-soft)] text-[var(--color-accent)]" },
  { href: "/red-flags", label: "Red Flag Checker", icon: "flag", desc: "Run a safety screen", tone: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]" },
  { href: "/treatment-planner", label: "Treatment Planner", icon: "treatment", desc: "Build a rehab plan", tone: "bg-[var(--color-success-soft)] text-[var(--color-success)]" },
  { href: "/exercise-library", label: "Exercise Library", icon: "exercise", desc: `${exercises.length} exercises ready`, tone: "bg-[var(--color-warn-soft)] text-[var(--color-warn)]" },
  { href: "/patient-education", label: "Patient Education", icon: "education", desc: "Generate a handout", tone: "bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]" },
] as const;

export default function DashboardPage() {
  const { cases, setCurrentCase } = useCases();

  return (
    <div className="space-y-6">
      {/* Hero */}
      <Card className="overflow-hidden">
        <div className="relative bg-gradient-to-br from-[var(--color-primary)] to-[#0b7285] px-6 py-8 text-white sm:px-8">
          <p className="text-xs font-medium uppercase tracking-wider text-teal-100">
            PhysioAI Assistant
          </p>
          <h2 className="mt-2 max-w-xl text-2xl font-semibold leading-snug">
            Clinical reasoning, treatment planning and exercise prescription —
            organised in minutes.
          </h2>
          <p className="mt-2 max-w-xl text-sm text-teal-50/90">
            Enter a case, screen for safety, and generate a structured,
            evidence-informed starting point you refine with your own examination.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <ButtonLink href="/new-case" variant="secondary" className="border-0">
              <Icon name="plus" width={16} height={16} />
              New Patient Case
            </ButtonLink>
            <ButtonLink
              href="/ai-assistant"
              variant="ghost"
              className="text-white hover:bg-white/10"
            >
              Ask the AI Assistant
              <Icon name="arrow" width={16} height={16} />
            </ButtonLink>
          </div>
        </div>
      </Card>

      {/* Quick tools */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
          Quick Clinical Tools
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
                  {tool.label}
                </span>
                <span className="block truncate text-xs text-[var(--color-ink-faint)]">
                  {tool.desc}
                </span>
              </span>
              <span className="ml-auto text-[var(--color-ink-faint)] transition-transform group-hover:translate-x-0.5">
                <Icon name="arrow" width={16} height={16} />
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
              title="Recent Cases"
              subtitle="Pick up where you left off"
              icon={<Icon name="clock" width={18} height={18} />}
              action={
                <ButtonLink href="/new-case" variant="secondary" size="sm">
                  <Icon name="plus" width={14} height={14} />
                  New
                </ButtonLink>
              }
            />
            <CardBody className="p-0">
              {cases.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    icon="new-case"
                    title="No cases yet"
                    description="Create your first patient case to start clinical reasoning."
                    action={<ButtonLink href="/new-case">New Patient Case</ButtonLink>}
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
                            {c.name || "Unnamed patient"}
                          </span>
                          <span className="block truncate text-xs text-[var(--color-ink-faint)]">
                            {c.mainComplaint}
                          </span>
                        </span>
                        <span className="hidden shrink-0 text-right sm:block">
                          <Badge tone={c.painIntensity >= 7 ? "danger" : c.painIntensity >= 4 ? "warn" : "success"}>
                            Pain {c.painIntensity}/10
                          </Badge>
                          <span className="mt-1 block text-[11px] text-[var(--color-ink-faint)]">
                            {formatDate(c.createdAt)}
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
              title="Body Region Modules"
              subtitle="Assessment & treatment references"
              icon={<Icon name="analysis" width={18} height={18} />}
            />
            <CardBody className="p-3">
              <div className="grid grid-cols-1 gap-1">
                {bodyRegions.map((region) => (
                  <Link
                    key={region.id}
                    href={`/case-analysis?region=${region.id}`}
                    className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-[var(--color-ink-soft)] transition-colors hover:bg-[var(--color-surface-muted)]"
                  >
                    <span className="text-base">{region.emoji}</span>
                    <span className="font-medium">{region.label}</span>
                    <span className="ml-auto text-[var(--color-ink-faint)]">
                      <Icon name="arrow" width={14} height={14} />
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
