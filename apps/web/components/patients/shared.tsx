"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Spinner, EmptyState } from "@/components/ui/Misc";
import { isMockMode } from "@/lib/config";
import { maskPhone } from "@/lib/phone";

type Tone = "neutral" | "primary" | "accent" | "warn" | "danger" | "success";

const statusTones: Record<string, Tone> = {
  active: "success", completed: "primary", inactive: "neutral",
  archived: "neutral", draft: "warn", paused: "warn",
  discharged: "primary", referred: "accent", scheduled: "accent",
  in_progress: "warn", cancelled: "neutral", no_show: "danger",
  rescheduled: "accent", finalised: "primary",
};

/** DB statuses stay English/stable; only the UI label is translated. */
export function StatusBadge({
  status,
  t,
}: {
  status: string;
  t: (k: string) => string;
}) {
  return <Badge tone={statusTones[status] ?? "neutral"}>{t(`st.${status}`)}</Badge>;
}

export type LoadState = "loading" | "ready" | "error" | "denied" | "empty";

export function PageState({
  state,
  t,
  onRetry,
}: {
  state: Exclude<LoadState, "ready">;
  t: (k: string) => string;
  onRetry?: () => void;
}) {
  if (isMockMode) {
    return (
      <EmptyState icon="shield" title={t("pm.requiresDb")} description="" />
    );
  }
  if (state === "loading") return <Spinner label="…" />;
  if (state === "denied")
    return <EmptyState icon="shield" title={t("pm.denied")} description="" />;
  if (state === "empty")
    return <EmptyState icon="user" title={t("pm.empty")} description="" />;
  return (
    <EmptyState
      icon="alert"
      title={t("pm.error")}
      description=""
      action={
        onRetry ? (
          <Button variant="secondary" onClick={onRetry}>
            {t("pm.retry")}
          </Button>
        ) : undefined
      }
    />
  );
}

export function displayName(p: {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
}): string {
  const split = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
  return split || p.full_name || "—";
}

export function maskedPhone(phone: string | null | undefined): string {
  return phone ? maskPhone(phone) : "—";
}

export function ageFrom(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 864e5));
}
