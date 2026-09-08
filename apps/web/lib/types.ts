// Core domain types shared by mock/demo and authenticated Supabase modes.
import type { ClinicalDraft } from "@/lib/ai/clinicalDraftSchema";

export type Gender = "male" | "female" | "other";
export type Stage = "acute" | "subacute" | "chronic" | "post-op" | "return-to-sport";
export type Irritability = "low" | "moderate" | "high";
export type Difficulty = "beginner" | "intermediate" | "advanced";
export type SafetyDisposition =
  | "not-screened"
  | "clear"
  | "medical-review"
  | "urgent"
  | "emergency";

export interface CaseSafetyScreen {
  screenedAt: string | null;
  selectedFlagIds: string[];
  disposition: SafetyDisposition;
  notes?: string;
  actionTaken?: string;
}

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
  /** Owning clinic in real-data mode; absent for local demo records. */
  clinicId?: string;
  /** Registry patient linkage in real-data mode; absent for legacy/mock cases. */
  patientId?: string;
  /** Active care episode selected when this intake was created. */
  episodeId?: string;
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
  safetyScreen?: CaseSafetyScreen;
}

/** Complete clinician-authored intake snapshot accepted by migration 020. */
export type CaseAssessmentPayload = Pick<
  PatientCase,
  | "name"
  | "age"
  | "gender"
  | "mainComplaint"
  | "painLocation"
  | "painIntensity"
  | "duration"
  | "mechanism"
  | "aggravating"
  | "easing"
  | "medicalHistory"
  | "surgicalHistory"
  | "imaging"
  | "medications"
  | "functionalLimitations"
  | "patientGoal"
> & { region: BodyRegionId };

export type CaseAssessmentChangeType =
  | "initial"
  | "correction"
  | "reassessment";

export type CaseAssessmentVersion = Omit<
  CaseAssessmentPayload,
  "gender" | "region"
> & {
  id: string;
  caseId: string;
  patientId: string | null;
  episodeId: string | null;
  version: number;
  changeType: CaseAssessmentChangeType;
  assessedAt: string;
  /** Legacy imports may retain a value outside the current controlled list. */
  gender: string | null;
  /** Legacy imports may retain a value outside the current controlled list. */
  region: string | null;
  authoredBy: string | null;
  createdAt: string;
  supersedesId: string | null;
  changeReason: string | null;
  source: "clinician" | "legacy-import";
  isCurrent: boolean;
};

export interface CaseAssessmentRevisionInput {
  caseId: string;
  supersedesId: string;
  changeType: Exclude<CaseAssessmentChangeType, "initial">;
  changeReason: string;
  assessedAt: string;
  assessment: CaseAssessmentPayload;
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
  clinicalDraft?: ClinicalDraft;
  aiMetadata?: {
    auditId: string;
    model: string;
    promptVersion: string;
    reviewStatus: "pending" | "accepted" | "edited" | "rejected";
  };
}

// ── Patient portal ──────────────────────────────────────────────

export interface PrescribedExercise {
  exerciseId: string;
  exerciseVersion?: number;
  /** Immutable reviewed patient instructions stored with the prescription. */
  contentSnapshot?: PatientExerciseContent;
  /** Prescribed dosage, e.g. "۳ ست × ۱۰ تکرار — هر روز" */
  dosageFa: string;
  daysPerWeek: number;
}

export interface PatientExerciseContent {
  name: string;
  purpose: string;
  howTo: string[];
  commonMistakes: string[];
  whenToStop: string;
}

export interface PatientPrescriptionSummary {
  id: string;
  version: number;
  startDate: string;
  endDate: string | null;
  precautionsFa: string;
  stopRulesFa: string;
  reviewDate: string;
  publishedAt: string;
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
  /** Auth user that authored a patient/therapist reply; null for AI replies. */
  senderUserId?: string | null;
}

export type TicketPriority = "routine" | "urgent" | "emergency";
export type TicketStatus = "open" | "acknowledged" | "answered" | "closed";

export interface Ticket {
  id: string;
  createdAt: string;
  exerciseId: string | null;
  subject: string;
  message: string;
  status: TicketStatus;
  priority: TicketPriority;
  acknowledgedBy?: string | null;
  acknowledgedAt?: string | null;
  closedBy?: string | null;
  closedAt?: string | null;
  closureNote?: string | null;
  replies: TicketReply[];
}

/** Clinic-scoped ticket projection used by the clinician inbox. */
export interface ClinicianTicket extends Ticket {
  patientId: string;
  patientName: string;
  clinicId: string;
  assignedTherapistIds: string[];
  /** True when the patient has activity newer than the latest therapist reply. */
  unread: boolean;
  lastPatientActivityAt: string;
  lastClinicianActivityAt: string | null;
}

export type ClinicalAlertStatus = "open" | "acknowledged" | "resolved";

/** Bounded clinician queue projection; free-text patient content is excluded. */
export interface ClinicalAlert {
  id: string;
  clinicId: string;
  patientId: string;
  patientName: string;
  episodeId: string;
  caseId: string | null;
  prescriptionId: string | null;
  alertType: "high-pain" | "ticket-urgent" | "ticket-emergency";
  severity: "urgent" | "emergency";
  status: ClinicalAlertStatus;
  metricValue: number | null;
  sourceTable: "patient_daily_logs" | "tickets" | "ticket_replies";
  sourceId: string;
  sourceRecordedAt: string;
  createdAt: string;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

/** Lightweight clinician-facing projection for the clinic patient registry. */
export interface PatientRegistryItem {
  id: string;
  clinicId: string;
  fullName: string;
  phone: string | null;
  birthYear: number | null;
  gender: Gender | null;
  createdAt: string;
  activeEpisode: {
    id: string;
    titleFa: string;
    weeklyTarget: number;
    startedAt: string;
  } | null;
  latestEpisode: {
    id: string;
    titleFa: string;
    weeklyTarget: number;
    status: "active" | "paused" | "completed";
    startedAt: string;
    endedAt: string | null;
  } | null;
  assignedTherapists: {
    id: string;
    fullName: string;
  }[];
  accountLinks: PatientAccountLink[];
}

export type PatientAccountRelationship =
  | "self"
  | "parent"
  | "guardian"
  | "caregiver";

export interface PatientAccountLink {
  userId: string;
  fullName: string;
  email: string | null;
  relationship: PatientAccountRelationship;
  authorizedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface PatientRegistryResult {
  patients: PatientRegistryItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreatePatientEpisodeInput {
  clinicId: string;
  fullName: string;
  phone: string | null;
  birthYear: number | null;
  gender: Gender | null;
  titleFa: string;
  weeklyTarget: number;
  assignedTherapistId: string | null;
}

export interface UpdatePatientRecordInput {
  patientId: string;
  fullName: string;
  phone: string | null;
  birthYear: number | null;
  gender: Gender | null;
}

export interface StartPatientEpisodeInput {
  patientId: string;
  titleFa: string;
  weeklyTarget: number;
  assignedTherapistId: string | null;
}

export interface InvitePatientAccountInput {
  patientId: string;
  email: string;
  relationship: PatientAccountRelationship;
  expiresAt: string | null;
  authorityAttested: boolean;
}

export interface OutcomeInstrument {
  key: string;
  version: number;
  displayName: string;
  scoreMin: number;
  scoreMax: number;
  unit: string;
  direction: "higher-better" | "higher-worse";
}

export interface ClinicalSessionNote {
  id: string;
  episodeId: string;
  caseId: string | null;
  occurredAt: string;
  subjective: string;
  objective: string;
  interventions: string;
  response: string;
  plan: string;
  authoredBy: string;
  createdAt: string;
  supersedesId: string | null;
  correctionReason: string | null;
  isCurrent: boolean;
}

export interface OutcomeMeasurement {
  id: string;
  episodeId: string;
  caseId: string | null;
  instrumentKey: string;
  instrumentVersion: number;
  instrumentName: string;
  score: number;
  scoreMin: number;
  scoreMax: number;
  unit: string;
  direction: "higher-better" | "higher-worse";
  measuredAt: string;
  notes: string | null;
  authoredBy: string;
  createdAt: string;
  supersedesId: string | null;
  correctionReason: string | null;
  isCurrent: boolean;
}

export interface ClinicalDocumentation {
  sessionNotes: ClinicalSessionNote[];
  outcomeMeasurements: OutcomeMeasurement[];
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
  /** Metadata for the current explicitly published prescription. */
  prescription?: PatientPrescriptionSummary;
  program: PrescribedExercise[];
  progress: ProgressEntry[];
  tickets: Ticket[];
}

export interface TreatmentPlanInput {
  region: BodyRegionId;
  stage: Stage;
  painSeverity: number;
  irritability: Irritability;
  mainImpairment: string;
  patientGoal: string;
  safetyConfirmed: boolean;
  postOpDetails?: {
    procedure: string;
    surgeryDate: string;
    precautions: string;
    weightBearingStatus: string;
    protocolConfirmed: boolean;
  };
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

export type TreatmentPlanStatus =
  | "draft"
  | "approved"
  | "rejected"
  | "superseded";

export interface TreatmentPlanRecord {
  id: string;
  clinicId: string;
  patientId: string;
  episodeId: string;
  caseId: string;
  version: number;
  status: TreatmentPlanStatus;
  input: TreatmentPlanInput;
  plan: TreatmentPlan;
  createdBy: string;
  createdAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
}

export type PrescriptionStatus =
  | "draft"
  | "published"
  | "suspended"
  | "revoked";

export interface PrescriptionItemInput {
  exerciseId: string;
  exerciseVersion?: number;
  contentSnapshot?: PatientExerciseContent;
  dosageFa: string;
  daysPerWeek: number;
}

export interface PrescriptionRecord {
  id: string;
  treatmentPlanId: string;
  episodeId: string;
  version: number;
  status: PrescriptionStatus;
  startDate: string;
  endDate: string | null;
  precautions: string;
  stopRules: string;
  reviewDate: string;
  createdAt: string;
  publishedAt: string | null;
  revokedAt: string | null;
  items: PrescriptionItemInput[];
}
