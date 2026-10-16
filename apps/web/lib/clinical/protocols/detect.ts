import { protocols } from "@/lib/clinical/protocols";
import type { Protocol, ProtocolPhase } from "@/lib/clinical/protocols/types";
import type { BodyRegionId } from "@/lib/types";

export interface DetectedPhase {
  protocol: Protocol;
  phase: ProtocolPhase;
  index: number;
  next: ProtocolPhase | null;
  /** How the phase was recognised, shown to the clinician. */
  basis: "plan" | "exercises";
}

/**
 * Which protocol phase the patient's current treatment follows.
 *
 * 1. The approved plan names it: plans built from a protocol phase start with
 *    "Based on the … protocol — <phase>" (see lib/ai/planGuide.ts).
 * 2. Otherwise the current home program's exercises match one phase clearly
 *    (at least two shared exercises and more than any other phase).
 *
 * This is a suggestion for the clinician, never a decision: the workspace
 * says how it was recognised and the clinician chooses the next step.
 */
export function detectProtocolPhase(
  planText: string,
  programExerciseIds: readonly string[],
  region?: BodyRegionId
): DetectedPhase | null {
  const result = (protocol: Protocol, index: number, basis: DetectedPhase["basis"]): DetectedPhase => ({
    protocol,
    phase: protocol.phases[index],
    index,
    next: protocol.phases[index + 1] ?? null,
    basis,
  });

  if (planText) {
    for (const protocol of protocols) {
      const named = planText.includes(protocol.title.fa) || planText.includes(protocol.title.en);
      if (!named) continue;
      // The latest phase named wins (a plan regenerated for a later phase).
      for (let index = protocol.phases.length - 1; index >= 0; index -= 1) {
        const phase = protocol.phases[index];
        if (planText.includes(phase.name.fa) || planText.includes(phase.name.en)) {
          return result(protocol, index, "plan");
        }
      }
    }
  }

  const ids = new Set(programExerciseIds);
  if (ids.size === 0) return null;
  let best: { protocol: Protocol; index: number; overlap: number } | null = null;
  let tie = false;
  for (const protocol of protocols.filter((candidate) => !region || candidate.region === region)) {
    protocol.phases.forEach((phase, index) => {
      const overlap = phase.exercises.filter((id) => ids.has(id)).length;
      if (!best || overlap > best.overlap) {
        best = { protocol, index, overlap };
        tie = false;
      } else if (overlap === best.overlap) {
        tie = true;
      }
    });
  }
  const found = best as { protocol: Protocol; index: number; overlap: number } | null;
  if (!found || found.overlap < 2 || tie) return null;
  return result(found.protocol, found.index, "exercises");
}
