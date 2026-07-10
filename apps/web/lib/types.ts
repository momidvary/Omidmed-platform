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
