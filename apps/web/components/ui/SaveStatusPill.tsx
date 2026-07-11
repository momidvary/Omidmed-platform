"use client";

import { useEffect, useRef, useState } from "react";
import { subscribeSaveStatus, type SaveStatus } from "@/lib/supabase/db";
import { isMockMode } from "@/lib/config";
import { cn } from "@/lib/utils";

const tones: Record<SaveStatus, string> = {
  connected: "bg-[var(--color-success-soft)] text-[var(--color-success)]",
  saving: "bg-[var(--color-accent-soft)] text-[var(--color-accent)]",
  saved: "bg-[var(--color-success-soft)] text-[var(--color-success)]",
  offline: "bg-[var(--color-warn-soft)] text-[var(--color-warn)]",
  save_failed: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
};

/**
 * Live storage indicator: Connected / Saving / Saved / Offline / Save
 * failed. Hidden in mock mode (there is no remote storage to report).
 */
export function SaveStatusPill({
  labels,
}: {
  labels: Record<SaveStatus, string>;
}) {
  const [status, setStatus] = useState<SaveStatus>("connected");
  const revertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return subscribeSaveStatus((s) => {
      setStatus(s);
      if (revertTimer.current) clearTimeout(revertTimer.current);
      if (s === "saved") {
        revertTimer.current = setTimeout(() => setStatus("connected"), 2500);
      }
    });
  }, []);

  if (isMockMode) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
        tones[status]
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full bg-current",
          status === "saving" && "animate-pulse"
        )}
      />
      {labels[status]}
    </span>
  );
}
