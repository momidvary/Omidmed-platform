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
import { isSupabaseConfigured } from "@/lib/supabase/client";
import {
  fetchPatientByNationalId,
  insertTicket,
  upsertProgress,
} from "@/lib/supabase/db";

interface PatientContextValue {
  /** The logged-in patient, or null when logged out. */
  patient: Patient | null;
  hydrated: boolean;
  /** Try to log in with a national id. Resolves false when not found. */
  login: (nationalId: string) => Promise<boolean>;
  logout: () => void;
  logProgress: (entry: ProgressEntry) => void;
  addTicket: (ticket: Ticket) => void;
}

const PatientContext = createContext<PatientContextValue | null>(null);

const STORAGE_KEY = "physioai:patients:v1";
const SESSION_KEY = "physioai:patient-session:v1";

interface PatientState {
  patients: Patient[];
  sessionPatientId: string | null;
  /** DB-mode: the logged-in patient loaded from Supabase. */
  remotePatient: Patient | null;
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
    remotePatient: null,
    hydrated: false,
  });

  useEffect(() => {
    if (isSupabaseConfigured) {
      // DB mode: restore the session by re-fetching the patient. Falls
      // back to local mode automatically if the DB is unreachable.
      const nationalId = localStorage.getItem(SESSION_KEY);
      if (nationalId) {
        fetchPatientByNationalId(nationalId).then((p) => {
          setState((prev) => ({ ...prev, remotePatient: p, hydrated: true }));
        });
        return;
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration; cannot run during SSR
      setState((prev) => ({ ...prev, hydrated: true }));
      return;
    }
    setState((prev) => ({ ...prev, ...loadPersisted(), hydrated: true }));
  }, []);

  useEffect(() => {
    if (!state.hydrated || isSupabaseConfigured) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        patients: state.patients,
        sessionPatientId: state.sessionPatientId,
      })
    );
  }, [state]);

  const value = useMemo<PatientContextValue>(() => {
    const localPatient =
      state.patients.find((p) => p.id === state.sessionPatientId) ?? null;
    // Prefer the DB-loaded patient; fall back to the local session so the
    // app still works when Supabase is configured but unreachable.
    const patient = state.remotePatient ?? localPatient;

    const updateLocalPatient = (fn: (p: Patient) => Patient) =>
      setState((prev) => ({
        ...prev,
        patients: prev.patients.map((p) =>
          p.id === prev.sessionPatientId ? fn(p) : p
        ),
        remotePatient: prev.remotePatient ? fn(prev.remotePatient) : null,
      }));

    return {
      patient,
      hydrated: state.hydrated,
      login: async (nationalId) => {
        const id = nationalId.trim();
        if (isSupabaseConfigured) {
          const remote = await fetchPatientByNationalId(id);
          if (remote) {
            localStorage.setItem(SESSION_KEY, id);
            setState((prev) => ({ ...prev, remotePatient: remote }));
            return true;
          }
          // DB unreachable or patient missing → try the local demo data
          // so the app still works offline.
        }
        const found = state.patients.find((p) => p.nationalId === id);
        if (!found) return false;
        setState((prev) => ({ ...prev, sessionPatientId: found.id }));
        return true;
      },
      logout: () => {
        localStorage.removeItem(SESSION_KEY);
        setState((prev) => ({
          ...prev,
          sessionPatientId: null,
          remotePatient: null,
        }));
      },
      logProgress: (entry) => {
        updateLocalPatient((p) => ({
          ...p,
          progress: [
            ...p.progress.filter((e) => e.date !== entry.date),
            entry,
          ].sort((a, b) => a.date.localeCompare(b.date)),
        }));
        // Write-through to Supabase (no-op when unconfigured/offline).
        if (patient) void upsertProgress(patient.id, entry);
      },
      addTicket: (ticket) => {
        updateLocalPatient((p) => ({ ...p, tickets: [ticket, ...p.tickets] }));
        if (patient) void insertTicket(patient.id, ticket);
      },
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
