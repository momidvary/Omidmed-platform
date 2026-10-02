"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CaseAssessmentPayload,
  CaseSafetyScreen,
  PatientCase,
} from "@/lib/types";
import { sampleCases } from "@/lib/data/sampleCases";
import { isMockMode } from "@/lib/config";
import {
  fetchCases,
  insertCase,
  recordCaseSafetyScreen,
} from "@/lib/supabase/db";
import { useAuth } from "@/lib/store/AuthContext";
import { evaluateSafetyScreen } from "@/lib/clinical/safety";

interface CaseContextValue {
  cases: PatientCase[];
  currentCaseId: string | null;
  currentCase: PatientCase | null;
  /** Resolves true when the case is stored (or in mock mode). */
  addCase: (c: PatientCase) => Promise<boolean>;
  saveSafetyScreen: (
    caseId: string,
    input: {
      selectedFlagIds: string[];
      notes?: string;
      actionTaken?: string;
    }
  ) => Promise<CaseSafetyScreen | null>;
  setCurrentCase: (id: string | null) => void;
  hydrated: boolean;
  loadError: boolean;
  reloadCases: () => void;
  /** Apply only after the database accepted an append-only assessment revision. */
  applyAssessmentSnapshot: (
    caseId: string,
    assessment: CaseAssessmentPayload
  ) => void;
}

const CaseContext = createContext<CaseContextValue | null>(null);

const STORAGE_KEY = "physioai:cases:v1";

interface CaseState {
  cases: PatientCase[];
  currentCaseId: string | null;
  hydrated: boolean;
  loadError: boolean;
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
  const scopeKey = `${session?.user.id ?? "signed-out"}:${activeClinicId ?? "no-clinic"}`;
  const activeScopeRef = useRef(scopeKey);
  const [state, setState] = useState<CaseState>({
    cases: isMockMode ? sampleCases : [],
    currentCaseId: null,
    hydrated: false,
    loadError: false,
  });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    activeScopeRef.current = scopeKey;
    return () => {
      // Invalidate pending writes before the next identity/tenant effect runs.
      if (activeScopeRef.current === scopeKey) activeScopeRef.current = "";
    };
  }, [scopeKey]);

  // Mock mode: hydrate from localStorage (dev/demo only).
  useEffect(() => {
    if (!isMockMode) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time localStorage hydration; cannot run during SSR
    setState({ ...loadPersisted(), hydrated: true, loadError: false });
  }, []);

  // Supabase mode: the database (scoped by RLS) is the only source.
  useEffect(() => {
    if (isMockMode) return;
    if (!session || !activeClinicId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on sign-out
      setState({
        cases: [],
        currentCaseId: null,
        hydrated: true,
        loadError: false,
      });
      return;
    }
    let cancelled = false;
    // Clear data from a previous account before loading the next account.
    setState({
      cases: [],
      currentCaseId: null,
      hydrated: false,
      loadError: false,
    });
    fetchCases(activeClinicId).then((rows) => {
      if (cancelled) return;
      setState({
        cases: rows ?? [],
        currentCaseId: null,
        hydrated: true,
        loadError: rows === null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [session, activeClinicId, reloadToken]);

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
        const writeScope = scopeKey;
        if (!isMockMode) {
          if (!activeClinicId || !profile) return false;
          const ok = await insertCase(c, activeClinicId, profile.id);
          if (!ok) return false;
          // The database write belongs to the original tenant, but never put
          // it into a different account/clinic state after a scope switch.
          if (activeScopeRef.current !== writeScope) return true;
        }
        const storedCase = isMockMode
          ? c
          : { ...c, clinicId: activeClinicId ?? undefined };
        setState((prev) => ({
          ...prev,
          cases: [storedCase, ...prev.cases],
          currentCaseId: storedCase.id,
          loadError: false,
        }));
        return true;
      },
      saveSafetyScreen: async (caseId, input) => {
        const writeScope = scopeKey;
        const target = state.cases.find((patientCase) => patientCase.id === caseId);
        if (!target) return null;

        const screen = isMockMode
          ? {
              screenedAt: new Date().toISOString(),
              selectedFlagIds: [...new Set(input.selectedFlagIds)],
              disposition: evaluateSafetyScreen(input.selectedFlagIds, true),
              notes: input.notes?.trim() || undefined,
              actionTaken: input.actionTaken?.trim() || undefined,
            }
          : await recordCaseSafetyScreen({ caseId, ...input });
        if (!screen || activeScopeRef.current !== writeScope) return screen;

        setState((prev) => ({
          ...prev,
          cases: prev.cases.map((patientCase) =>
            patientCase.id === caseId
              ? { ...patientCase, safetyScreen: screen }
              : patientCase
          ),
        }));
        return screen;
      },
      setCurrentCase: (id) =>
        setState((prev) => ({ ...prev, currentCaseId: id })),
      hydrated: state.hydrated,
      loadError: state.loadError,
      reloadCases: () => setReloadToken((value) => value + 1),
      applyAssessmentSnapshot: (caseId, assessment) =>
        setState((previous) => ({
          ...previous,
          cases: previous.cases.map((patientCase) =>
            patientCase.id === caseId
              ? { ...patientCase, ...assessment }
              : patientCase
          ),
        })),
    }),
    [state, profile, activeClinicId, scopeKey]
  );

  return <CaseContext.Provider value={value}>{children}</CaseContext.Provider>;
}

export function useCases() {
  const ctx = useContext(CaseContext);
  if (!ctx) throw new Error("useCases must be used within CaseProvider");
  return ctx;
}
