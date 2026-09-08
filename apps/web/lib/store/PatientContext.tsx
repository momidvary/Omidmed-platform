"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Patient, ProgressEntry, Ticket } from "@/lib/types";
import { samplePatients } from "@/lib/data/samplePatients";
import { isMockMode } from "@/lib/config";
import {
  createPatientTicket,
  fetchMyPatients,
  requestAiReply,
  replyToPatientTicket,
  upsertProgress,
} from "@/lib/supabase/db";
import { useAuth } from "@/lib/store/AuthContext";

interface PatientContextValue {
  /** The active patient (mock demo selection, or the signed-in patient). */
  patient: Patient | null;
  /** All patient records explicitly linked to this account. */
  patients: Patient[];
  hydrated: boolean;
  loadError: boolean;
  /** Real mode requires an explicit choice when an account has >1 patient. */
  selectPatient: (patientId: string) => void;
  reloadPatients: () => void;
  /** Mock mode only: open a demo patient by index. */
  openDemoPatient: (index: number) => void;
  closeDemoPatient: () => void;
  /** Resolves true only after the progress entry is stored. */
  logProgress: (entry: ProgressEntry) => Promise<boolean>;
  /** Resolves true when the ticket is stored (or in mock mode). */
  addTicket: (ticket: Ticket) => Promise<boolean>;
  /** Adds an attributed patient reply and reopens the active thread. */
  replyToTicket: (ticketId: string, content: string) => Promise<boolean>;
}

const PatientContext = createContext<PatientContextValue | null>(null);

const STORAGE_KEY = "physioai:patients:v2";

interface PatientState {
  /** Mock-mode demo patients (persisted locally in dev). */
  patients: Patient[];
  demoPatientId: string | null;
  /** Supabase mode: every record linked to the signed-in account. */
  remotePatients: Patient[];
  remotePatientId: string | null;
  remoteLoadError: boolean;
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
  const { session } = useAuth();
  const accountScope = session?.user.id ?? "signed-out";
  const accountScopeRef = useRef(accountScope);
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<PatientState>({
    patients: samplePatients,
    demoPatientId: null,
    remotePatients: [],
    remotePatientId: null,
    remoteLoadError: false,
    hydrated: false,
  });

  useEffect(() => {
    accountScopeRef.current = accountScope;
    return () => {
      if (accountScopeRef.current === accountScope) {
        accountScopeRef.current = "";
      }
    };
  }, [accountScope]);

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
      setState((prev) => ({
        ...prev,
        remotePatients: [],
        remotePatientId: null,
        remoteLoadError: false,
        hydrated: true,
      }));
      return;
    }
    let cancelled = false;
    // Never keep the previous account's patient visible during a switch.
    setState((prev) => ({
      ...prev,
      remotePatients: [],
      remotePatientId: null,
      remoteLoadError: false,
      hydrated: false,
    }));
    fetchMyPatients(session.user.id).then((patients) => {
      if (cancelled) return;
      setState((prev) => ({
        ...prev,
        remotePatients: patients ?? [],
        remotePatientId: patients?.length === 1 ? patients[0].id : null,
        remoteLoadError: patients === null,
        hydrated: true,
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [session, reloadToken]);

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
    const remotePatient =
      state.remotePatients.find((p) => p.id === state.remotePatientId) ?? null;
    const patient = isMockMode ? demoPatient : remotePatient;
    const availablePatients = isMockMode ? state.patients : state.remotePatients;

    const updatePatient = (patientId: string, fn: (p: Patient) => Patient) =>
      setState((prev) => ({
        ...prev,
        patients: prev.patients.map((p) =>
          p.id === patientId ? fn(p) : p
        ),
        remotePatients: prev.remotePatients.map((p) =>
          p.id === patientId ? fn(p) : p
        ),
      }));

    return {
      patient,
      patients: availablePatients,
      hydrated: state.hydrated,
      loadError: state.remoteLoadError,
      selectPatient: (patientId) => {
        if (!availablePatients.some((candidate) => candidate.id === patientId)) {
          return;
        }
        setState((prev) =>
          isMockMode
            ? { ...prev, demoPatientId: patientId }
            : { ...prev, remotePatientId: patientId }
        );
      },
      reloadPatients: () => setReloadToken((value) => value + 1),
      openDemoPatient: (index) => {
        const target = state.patients[index];
        if (isMockMode && target) {
          setState((prev) => ({ ...prev, demoPatientId: target.id }));
        }
      },
      closeDemoPatient: () =>
        setState((prev) => ({ ...prev, demoPatientId: null })),
      logProgress: async (entry) => {
        if (!patient) return false;
        const writeScope = accountScope;
        if (!isMockMode) {
          if (!patient.episodeId) return false;
          const saved = await upsertProgress(patient.episodeId, entry);
          if (!saved) return false;
          if (accountScopeRef.current !== writeScope) return true;
        }
        updatePatient(patient.id, (p) => ({
          ...p,
          progress: [
            ...p.progress.filter((e) => e.date !== entry.date),
            entry,
          ].sort((a, b) => a.date.localeCompare(b.date)),
        }));
        return true;
      },
      addTicket: async (ticket) => {
        if (isMockMode) {
          // Demo mode keeps the locally generated AI reply.
          if (!patient) return false;
          updatePatient(patient.id, (p) => ({
            ...p,
            tickets: [ticket, ...p.tickets],
          }));
          return true;
        }
        if (!patient?.episodeId) return false;
        const writeScope = accountScope;
        // Real mode creates the ticket through a same-origin authenticated API
        // so safety priority is classified on the server, not trusted from UI.
        const bare = { ...ticket, replies: [] };
        const saved = await createPatientTicket(
          patient.id,
          patient.episodeId,
          bare
        );
        if (!saved) return false;
        if (accountScopeRef.current !== writeScope) return true;
        updatePatient(patient.id, (p) => ({
          ...p,
          tickets: [saved, ...p.tickets],
        }));
        void requestAiReply(saved.id).then((reply) => {
          if (!reply || accountScopeRef.current !== writeScope) return;
          updatePatient(patient.id, (p) => ({
            ...p,
            tickets: p.tickets.map((t) =>
              t.id === saved.id
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
      replyToTicket: async (ticketId, content) => {
        if (!patient) return false;
        const target = patient.tickets.find((ticket) => ticket.id === ticketId);
        if (!target || target.status === "closed") return false;
        const writeScope = accountScope;
        if (isMockMode) {
          const createdAt = new Date().toISOString();
          updatePatient(patient.id, (p) => ({
            ...p,
            tickets: p.tickets.map((ticket) =>
              ticket.id === ticketId
                ? {
                    ...ticket,
                    status: "open",
                    replies: [
                      ...ticket.replies,
                      {
                        id: `local-patient-${Date.now()}`,
                        from: "patient",
                        content: content.trim(),
                        createdAt,
                      },
                    ],
                  }
                : ticket
            ),
          }));
          return true;
        }
        const saved = await replyToPatientTicket(ticketId, content);
        if (!saved) return false;
        if (accountScopeRef.current !== writeScope) return true;
        updatePatient(patient.id, (p) => ({
          ...p,
          tickets: p.tickets.map((ticket) =>
            ticket.id === ticketId
              ? {
                  ...ticket,
                  status: saved.status,
                  priority: saved.priority,
                  acknowledgedBy: null,
                  acknowledgedAt: null,
                  replies: [...ticket.replies, saved.reply],
                }
              : ticket
          ),
        }));
        return true;
      },
    };
  }, [state, accountScope]);

  return (
    <PatientContext.Provider value={value}>{children}</PatientContext.Provider>
  );
}

export function usePatient() {
  const ctx = useContext(PatientContext);
  if (!ctx) throw new Error("usePatient must be used within PatientProvider");
  return ctx;
}
