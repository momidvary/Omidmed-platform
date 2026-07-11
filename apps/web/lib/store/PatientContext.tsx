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
import { isMockMode } from "@/lib/config";
import {
  fetchMyPatient,
  insertTicket,
  requestAiReply,
  upsertProgress,
} from "@/lib/supabase/db";
import { useAuth } from "@/lib/store/AuthContext";

interface PatientContextValue {
  /** The active patient (mock demo selection, or the signed-in patient). */
  patient: Patient | null;
  hydrated: boolean;
  /** Mock mode only: open a demo patient by index. */
  openDemoPatient: (index: number) => void;
  closeDemoPatient: () => void;
  logProgress: (entry: ProgressEntry) => void;
  /** Resolves true when the ticket is stored (or in mock mode). */
  addTicket: (ticket: Ticket) => Promise<boolean>;
}

const PatientContext = createContext<PatientContextValue | null>(null);

const STORAGE_KEY = "physioai:patients:v2";

interface PatientState {
  /** Mock-mode demo patients (persisted locally in dev). */
  patients: Patient[];
  demoPatientId: string | null;
  /** Supabase mode: the signed-in user's patient record. */
  remotePatient: Patient | null;
  hydrated: boolean;
}

function loadPersisted(): Pick<PatientState, "patients" | "demoPatientId"> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        patients?: Patient[];
        demoPatientId?: string | null;
      };
      return {
        patients: parsed.patients?.length ? parsed.patients : samplePatients,
        demoPatientId: parsed.demoPatientId ?? null,
      };
    }
  } catch {
    /* ignore corrupt storage */
  }
  return { patients: samplePatients, demoPatientId: null };
}

export function PatientProvider({ children }: { children: React.ReactNode }) {
  const { session, profile } = useAuth();
  const [state, setState] = useState<PatientState>({
    patients: samplePatients,
    demoPatientId: null,
    remotePatient: null,
    hydrated: false,
  });

  // Mock mode: local demo data.
  useEffect(() => {
    if (!isMockMode) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time localStorage hydration; cannot run during SSR
    setState((prev) => ({ ...prev, ...loadPersisted(), hydrated: true }));
  }, []);

  // Supabase mode: load the signed-in user's patient record.
  useEffect(() => {
    if (isMockMode) return;
    if (!session) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on sign-out
      setState((prev) => ({ ...prev, remotePatient: null, hydrated: true }));
      return;
    }
    fetchMyPatient(session.user.id).then((p) => {
      setState((prev) => ({ ...prev, remotePatient: p, hydrated: true }));
    });
  }, [session]);

  useEffect(() => {
    if (!state.hydrated || !isMockMode) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        patients: state.patients,
        demoPatientId: state.demoPatientId,
      })
    );
  }, [state]);

  const value = useMemo<PatientContextValue>(() => {
    const demoPatient =
      state.patients.find((p) => p.id === state.demoPatientId) ?? null;
    const patient = isMockMode ? demoPatient : state.remotePatient;

    const updatePatient = (fn: (p: Patient) => Patient) =>
      setState((prev) => ({
        ...prev,
        patients: prev.patients.map((p) =>
          p.id === prev.demoPatientId ? fn(p) : p
        ),
        remotePatient: prev.remotePatient ? fn(prev.remotePatient) : null,
      }));

    return {
      patient,
      hydrated: state.hydrated,
      openDemoPatient: (index) => {
        const target = state.patients[index];
        if (isMockMode && target) {
          setState((prev) => ({ ...prev, demoPatientId: target.id }));
        }
      },
      closeDemoPatient: () =>
        setState((prev) => ({ ...prev, demoPatientId: null })),
      logProgress: (entry) => {
        updatePatient((p) => ({
          ...p,
          progress: [
            ...p.progress.filter((e) => e.date !== entry.date),
            entry,
          ].sort((a, b) => a.date.localeCompare(b.date)),
        }));
        if (!isMockMode && patient?.episodeId) {
          void upsertProgress(patient.episodeId, entry);
        }
      },
      addTicket: async (ticket) => {
        if (isMockMode) {
          // Demo mode keeps the locally generated AI reply.
          updatePatient((p) => ({ ...p, tickets: [ticket, ...p.tickets] }));
          return true;
        }
        if (!patient || !profile) return false;
        // Real mode: the client may not write sender='ai' (RLS). Store the
        // ticket bare, then ask the server route to attach the AI reply.
        const bare = { ...ticket, replies: [] };
        const ok = await insertTicket(
          patient.id,
          patient.episodeId ?? null,
          bare,
          profile.id
        );
        if (!ok) return false;
        updatePatient((p) => ({ ...p, tickets: [bare, ...p.tickets] }));
        void requestAiReply(ticket.id, ticket.message).then((reply) => {
          if (!reply) return;
          updatePatient((p) => ({
            ...p,
            tickets: p.tickets.map((t) =>
              t.id === ticket.id
                ? {
                    ...t,
                    replies: [
                      ...t.replies,
                      { id: reply.id, from: "ai", content: reply.content, createdAt: reply.createdAt },
                    ],
                  }
                : t
            ),
          }));
        });
        return true;
      },
    };
  }, [state, profile]);

  return (
    <PatientContext.Provider value={value}>{children}</PatientContext.Provider>
  );
}

export function usePatient() {
  const ctx = useContext(PatientContext);
  if (!ctx) throw new Error("usePatient must be used within PatientProvider");
  return ctx;
}
