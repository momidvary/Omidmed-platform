import type { LocalizedText } from "@/lib/clinical/reasoning/knowledge";
import type { BodyRegionId } from "@/lib/types";

/*
 * Condition-based rehabilitation protocols (decision support).
 *
 * A protocol is a reference template for a provisional clinical hypothesis:
 * criteria-based phases (not fixed weeks), library exercises for each phase,
 * other interventions, criteria for progressing, outcome measures and the
 * guidelines it draws on. It never replaces examination, clinical judgement
 * or the treating clinician's choice of exercises and dose, and nothing here
 * is prescribed automatically: exercises still reach a patient only through
 * the home-program builder.
 */

export const PROTOCOLS_VERSION = "physio-protocols-1";

export interface ProtocolPhase {
  id: string;
  name: LocalizedText;
  /** Typical, not fixed, duration; progression is by criteria. */
  typical: LocalizedText;
  goals: LocalizedText[];
  /** Exercise library ids, easiest first. */
  exercises: string[];
  /** Education, manual therapy, activity advice, load management… */
  other: LocalizedText[];
  /** Criteria to move to the next phase (empty for the last phase). */
  progressWhen: LocalizedText[];
}

export interface OutcomeMeasure {
  name: string;
  detail: LocalizedText;
}

export interface Protocol {
  id: string;
  region: BodyRegionId;
  /** Knowledge-base hypothesis ids this protocol serves. */
  hypotheses: string[];
  title: LocalizedText;
  summary: LocalizedText;
  principles: LocalizedText[];
  phases: ProtocolPhase[];
  outcomes: OutcomeMeasure[];
  /** Findings that call for re-assessment or referral during rehab. */
  watchFor: LocalizedText[];
  references: string[];
}

export const L = (en: string, fa: string): LocalizedText => ({ en, fa });
