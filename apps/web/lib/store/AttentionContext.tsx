"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { isMockMode } from "@/lib/config";
import { useAuth } from "@/lib/store/AuthContext";
import { fetchAttentionCounts } from "@/lib/supabase/db";
import type { AttentionKey } from "@/lib/nav";

const POLL_INTERVAL_MS = 60_000;

interface AttentionValue {
  /** Null while unknown or unavailable: never show a stale or guessed count. */
  counts: Record<AttentionKey, number> | null;
  refresh: () => void;
}

const AttentionContext = createContext<AttentionValue>({
  counts: null,
  refresh: () => {},
});

/**
 * Items waiting for the clinician in the active clinic (unresolved alerts,
 * tickets awaiting a response). Counts are tagged with the clinic they were
 * loaded for, so switching clinic never shows another tenant's numbers.
 */
export function AttentionProvider({ children }: { children: React.ReactNode }) {
  const { session, profile, activeClinicId } = useAuth();
  const [state, setState] = useState<{
    clinicId: string;
    counts: Record<AttentionKey, number> | null;
  } | null>(null);
  const [token, setToken] = useState(0);

  const clinical =
    profile?.role === "clinic_owner" || profile?.role === "therapist";
  const clinicId =
    !isMockMode && session && clinical && activeClinicId ? activeClinicId : null;

  useEffect(() => {
    if (!clinicId) return;
    let cancelled = false;
    let inFlight = false;
    async function load(id: string) {
      if (inFlight) return;
      inFlight = true;
      const counts = await fetchAttentionCounts(id);
      inFlight = false;
      if (!cancelled) setState({ clinicId: id, counts });
    }
    void load(clinicId);
    const timer = window.setInterval(() => void load(clinicId), POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load(clinicId);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [clinicId, token]);

  const refresh = useCallback(() => setToken((value) => value + 1), []);
  const counts =
    clinicId && state?.clinicId === clinicId ? state.counts : null;

  return (
    <AttentionContext.Provider value={{ counts, refresh }}>
      {children}
    </AttentionContext.Provider>
  );
}

export function useAttention(): AttentionValue {
  return useContext(AttentionContext);
}
