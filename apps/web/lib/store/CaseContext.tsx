"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { PatientCase } from "@/lib/types";
import { sampleCases } from "@/lib/data/sampleCases";
import { isMockMode } from "@/lib/config";
import { fetchCases, insertCase } from "@/lib/supabase/db";
import { useAuth } from "@/lib/store/AuthContext";

interface CaseContextValue {
  cases: PatientCase[];
  currentCaseId: string | null;
  currentCase: PatientCase | null;
  /** Resolves true when the case is stored (or in mock mode). */
  addCase: (c: PatientCase) => Promise<boolean>;
  setCurrentCase: (id: string | null) => void;
  hydrated: boolean;
}

const CaseContext = createContext<CaseContextValue | null>(null);

const STORAGE_KEY = "physioai:cases:v1";

interface CaseState {
  cases: PatientCase[];
  currentCaseId: string | null;
  hydrated: boolean;
}

function loadPersisted(): Pick<CaseState, "cases" | "currentCaseId"> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        cases?: PatientCase[];
        currentCaseId?: string | null;
      };
      return {
        cases: parsed.cases?.length ? parsed.cases : sampleCases,
        currentCaseId: parsed.currentCaseId ?? null,
      };
    }
  } catch {
    /* ignore corrupt storage */
  }
  return { cases: sampleCases, currentCaseId: null };
}

export function CaseProvider({ children }: { children: React.ReactNode }) {
  const { session, profile, activeClinicId } = useAuth();
  const [state, setState] = useState<CaseState>({
    cases: isMockMode ? sampleCases : [],
    currentCaseId: null,
    hydrated: false,
  });

  // Mock mode: hydrate from localStorage (dev/demo only).
  useEffect(() => {
    if (!isMockMode) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time localStorage hydration; cannot run during SSR
    setState({ ...loadPersisted(), hydrated: true });
  }, []);

  // Supabase mode: the database (scoped by RLS) is the only source.
  useEffect(() => {
    if (isMockMode) return;
    if (!session) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on sign-out
      setState({ cases: [], currentCaseId: null, hydrated: true });
      return;
    }
    fetchCases().then((rows) => {
      setState((prev) => ({
        ...prev,
        cases: rows ?? prev.cases,
        hydrated: true,
      }));
    });
  }, [session]);

  // Persist locally only in mock mode.
  useEffect(() => {
    if (!state.hydrated || !isMockMode) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ cases: state.cases, currentCaseId: state.currentCaseId })
    );
  }, [state]);

  const value = useMemo<CaseContextValue>(
    () => ({
      cases: state.cases,
      currentCaseId: state.currentCaseId,
      currentCase:
        state.cases.find((c) => c.id === state.currentCaseId) ?? null,
      addCase: async (c) => {
        if (!isMockMode) {
          // The clinic comes from the topbar selector, not from whichever
          // membership happens to be first — a therapist working across two
          // clinics would otherwise file cases against the wrong one.
          if (!activeClinicId || !profile) return false;
          const ok = await insertCase(c, activeClinicId, profile.id);
          if (!ok) return false;
        }
        setState((prev) => ({
          ...prev,
          cases: [c, ...prev.cases],
          currentCaseId: c.id,
        }));
        return true;
      },
      setCurrentCase: (id) =>
        setState((prev) => ({ ...prev, currentCaseId: id })),
      hydrated: state.hydrated,
    }),
    [state, profile, activeClinicId]
  );

  return <CaseContext.Provider value={value}>{children}</CaseContext.Provider>;
}

export function useCases() {
  const ctx = useContext(CaseContext);
  if (!ctx) throw new Error("useCases must be used within CaseProvider");
  return ctx;
}
