"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Patient, ProgressEntry, Ticket } from "@/lib/types";
import { samplePatients } from "@/lib/data/samplePatients";

interface PatientContextValue {
  /** The logged-in patient, or null when logged out. */
  patient: Patient | null;
  hydrated: boolean;
  /** Try to log in with a national id. Returns false when not found. */
  login: (nationalId: string) => boolean;
  logout: () => void;
  logProgress: (entry: ProgressEntry) => void;
  addTicket: (ticket: Ticket) => void;
}

const PatientContext = createContext<PatientContextValue | null>(null);

const STORAGE_KEY = "physioai:patients:v1";

interface PatientState {
  patients: Patient[];
  sessionPatientId: string | null;
  hydrated: boolean;
}

function loadPersisted(): Pick<PatientState, "patients" | "sessionPatientId"> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        patients?: Patient[];
        sessionPatientId?: string | null;
      };
      return {
        patients: parsed.patients?.length ? parsed.patients : samplePatients,
        sessionPatientId: parsed.sessionPatientId ?? null,
      };
    }
  } catch {
    /* ignore corrupt storage */
  }
  return { patients: samplePatients, sessionPatientId: null };
}

export function PatientProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PatientState>({
    patients: samplePatients,
    sessionPatientId: null,
    hydrated: false,
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time localStorage hydration; cannot run during SSR
    setState({ ...loadPersisted(), hydrated: true });
  }, []);

  useEffect(() => {
    if (!state.hydrated) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        patients: state.patients,
        sessionPatientId: state.sessionPatientId,
      })
    );
  }, [state]);

  const value = useMemo<PatientContextValue>(() => {
    const patient =
      state.patients.find((p) => p.id === state.sessionPatientId) ?? null;

    const updatePatient = (fn: (p: Patient) => Patient) =>
      setState((prev) => ({
        ...prev,
        patients: prev.patients.map((p) =>
          p.id === prev.sessionPatientId ? fn(p) : p
        ),
      }));

    return {
      patient,
      hydrated: state.hydrated,
      login: (nationalId) => {
        const found = state.patients.find(
          (p) => p.nationalId === nationalId.trim()
        );
        if (!found) return false;
        setState((prev) => ({ ...prev, sessionPatientId: found.id }));
        return true;
      },
      logout: () =>
        setState((prev) => ({ ...prev, sessionPatientId: null })),
      logProgress: (entry) =>
        updatePatient((p) => ({
          ...p,
          // One entry per day: replace today's entry if it exists.
          progress: [
            ...p.progress.filter((e) => e.date !== entry.date),
            entry,
          ].sort((a, b) => a.date.localeCompare(b.date)),
        })),
      addTicket: (ticket) =>
        updatePatient((p) => ({ ...p, tickets: [ticket, ...p.tickets] })),
    };
  }, [state]);

  return (
    <PatientContext.Provider value={value}>{children}</PatientContext.Provider>
  );
}

export function usePatient() {
  const ctx = useContext(PatientContext);
  if (!ctx) throw new Error("usePatient must be used within PatientProvider");
  return ctx;
}
