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
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { fetchCases, insertCase } from "@/lib/supabase/db";

interface CaseContextValue {
  cases: PatientCase[];
  currentCaseId: string | null;
  currentCase: PatientCase | null;
  addCase: (c: PatientCase) => void;
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
  // Server render uses sample data; localStorage is only readable after
  // mount, so hydration must happen in an effect (single state update).
  const [state, setState] = useState<CaseState>({
    cases: sampleCases,
    currentCaseId: null,
    hydrated: false,
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time localStorage hydration; cannot run during SSR
    setState({ ...loadPersisted(), hydrated: true });

    // When Supabase is configured, the database is the source of truth
    // for cases; fall back silently to local data if unreachable.
    if (isSupabaseConfigured) {
      fetchCases().then((rows) => {
        if (rows) {
          setState((prev) => ({ ...prev, cases: rows }));
        }
      });
    }
  }, []);

  useEffect(() => {
    if (!state.hydrated) return;
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
      addCase: (c) => {
        setState((prev) => ({
          ...prev,
          cases: [c, ...prev.cases],
          currentCaseId: c.id,
        }));
        // Write-through to Supabase (no-op when unconfigured/offline).
        void insertCase(c);
      },
      setCurrentCase: (id) =>
        setState((prev) => ({ ...prev, currentCaseId: id })),
      hydrated: state.hydrated,
    }),
    [state]
  );

  return <CaseContext.Provider value={value}>{children}</CaseContext.Provider>;
}

export function useCases() {
  const ctx = useContext(CaseContext);
  if (!ctx) throw new Error("useCases must be used within CaseProvider");
  return ctx;
}
