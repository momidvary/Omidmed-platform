// Core domain types for PhysioAI Assistant.
// All data is mock/local for the MVP; these types are shaped so a real
// backend or AI API can populate them later without UI changes.

export type Gender = "male" | "female" | "other";
export type Stage = "acute" | "subacute" | "chronic" | "post-op" | "return-to-sport";
export type Irritability = "low" | "moderate" | "high";
export type Difficulty = "beginner" | "intermediate" | "advanced";

export type BodyRegionId =
  | "neck"
  | "shoulder"
  | "low-back"
  | "hip"
  | "knee"
  | "ankle-foot"
  | "post-op"
  | "neuro"
  | "sports";

export interface PatientCase {
  id: string;
  createdAt: string;
  name: string;
  age: number | null;
  gender: Gender | null;
  mainComplaint: string;
  painLocation: string;
  painIntensity: number; // 0-10
  duration: string;
  mechanism: string;
  aggravating: string;
  easing: string;
  medicalHistory: string;
  surgicalHistory: string;
  imaging: string;
  medications: string;
  functionalLimitations: string;
  patientGoal: string;
  region?: BodyRegionId;
}

export interface ClinicalReasoning {
  subjective: string[];
  objective: string[];
  hypotheses: string[];
  differentials: string[];
  yellowFlags: string[];
  redFlags: string[];
  missingInfo: string[];
  suggestedTests: string[];
  outcomeMeasures: string[];
}

export interface Exercise {
  id: string;
  name: string;
  region: BodyRegionId;
  goal: string;
  difficulty: Difficulty;
  equipment: string;
  stage: Stage[];
  purpose: string;
  howTo: string[];
  setsReps: string;
  commonMistakes: string[];
  whenToStop: string;
  progression: string;
  regression: string;
}

export interface BodyRegionModule {
  id: BodyRegionId;
  label: string;
  emoji: string;
  commonConditions: string[];
  assessmentQuestions: string[];
  specialTests: string[];
  functionalTests: string[];
  treatmentIdeas: string[];
  exerciseSuggestions: string[];
  educationPoints: string[];
}

export interface RedFlagItem {
  id: string;
  category: string;
  label: string;
  detail: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

// ── Patient portal ──────────────────────────────────────────────

export interface PrescribedExercise {
  exerciseId: string;
  /** Prescribed dosage, e.g. "۳ ست × ۱۰ تکرار — هر روز" */
  dosageFa: string;
  daysPerWeek: number;
}

export interface ProgressEntry {
  /** ISO date (yyyy-mm-dd) */
  date: string;
  /** 0-10 pain reported after the session */
  painLevel: number;
  /** Whether the day's program was completed */
  completed: boolean;
}

export interface TicketReply {
  id: string;
  from: "ai" | "therapist" | "patient";
  content: string;
  createdAt: string;
  /** Display name of the author, when the reader is allowed to see it. */
  authorName?: string;
}

export interface Ticket {
  id: string;
  createdAt: string;
  exerciseId: string | null;
  subject: string;
  message: string;
  status: "open" | "answered";
  replies: TicketReply[];
}

export interface Patient {
  id: string;
  /** Active care episode id (Supabase mode); empty in mock mode. */
  episodeId?: string;
  /** National ID on file — an identifier only, never a login credential. */
  nationalId: string;
  nameFa: string;
  age: number;
  conditionFa: string;
  therapistNoteFa: string;
  /** Weekly session target used for progress percentage */
  weeklyTarget: number;
  program: PrescribedExercise[];
  progress: ProgressEntry[];
  tickets: Ticket[];
}

// ── Clinician workspace ─────────────────────────────────────────

export type MemberRole = "clinic_owner" | "therapist" | "clinic_staff";
export type EpisodeStatus = "active" | "completed" | "paused";

export interface Clinic {
  id: string;
  name: string;
  city: string | null;
}

export interface ClinicMember {
  userId: string;
  memberRole: MemberRole;
  fullName: string;
  email: string | null;
}

/** A patient row as the clinic sees it (distinct from the portal's `Patient`). */
export interface PatientRecord {
  id: string;
  clinicId: string;
  fullName: string;
  nationalId: string | null;
  phone: string | null;
  birthYear: number | null;
  gender: Gender | null;
  createdAt: string;
  /** Therapists assigned to this patient. */
  therapistIds: string[];
  /** Auth accounts that may sign in as this patient. */
  linkedUsers: { userId: string; fullName: string; email: string | null }[];
  episodes: CareEpisode[];
}

/** Summary row for the patient list — cheap to fetch in bulk. */
export interface PatientListItem {
  id: string;
  fullName: string;
  phone: string | null;
  birthYear: number | null;
  createdAt: string;
  activeEpisodeTitle: string | null;
  hasLinkedAccount: boolean;
  isMine: boolean;
  openTickets: number;
}

export interface CareEpisode {
  id: string;
  titleFa: string;
  therapistNoteFa: string;
  weeklyTarget: number;
  status: EpisodeStatus;
  startedAt: string;
  program: PrescribedExercise[];
  /** Most recent daily logs, newest last. */
  progress: ProgressEntry[];
}

/** A ticket as the clinic inbox sees it — carries the patient's name. */
export interface ClinicTicket {
  id: string;
  patientId: string;
  patientName: string;
  episodeId: string | null;
  exerciseId: string | null;
  subject: string;
  message: string;
  status: "open" | "answered";
  createdAt: string;
  replies: TicketReply[];
}

export interface TreatmentPlanInput {
  region: BodyRegionId;
  stage: Stage;
  painSeverity: number;
  irritability: Irritability;
  mainImpairment: string;
  patientGoal: string;
}

export interface TreatmentPlan {
  manualTherapy: string[];
  exerciseTherapy: string[];
  mobility: string[];
  strengthening: string[];
  motorControl: string[];
  balance: string[];
  education: string[];
  homeProgram: string[];
  frequency: string;
  progression: string[];
}
