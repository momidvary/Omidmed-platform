import { kneeProtocols } from "@/lib/clinical/protocols/knee";
import { hipProtocols, lowBackProtocols } from "@/lib/clinical/protocols/hipBack";
import { ankleProtocols, neckProtocols, shoulderProtocols } from "@/lib/clinical/protocols/upperAnkle";
import { postOpProtocols } from "@/lib/clinical/protocols/postOp";
import type { Protocol } from "@/lib/clinical/protocols/types";
import { regionKnowledge, type LocalizedText } from "@/lib/clinical/reasoning/knowledge";

export { PROTOCOLS_VERSION } from "@/lib/clinical/protocols/types";
export type { OutcomeMeasure, Protocol, ProtocolPhase } from "@/lib/clinical/protocols/types";

export const protocols: readonly Protocol[] = [
  ...lowBackProtocols,
  ...neckProtocols,
  ...shoulderProtocols,
  ...hipProtocols,
  ...kneeProtocols,
  ...ankleProtocols,
  ...postOpProtocols,
];

export { phaseForWeeks, weeksSince } from "@/lib/clinical/protocols/postOp";

/**
 * Post-operative protocols for a body region, or all of them for a case
 * recorded under the general "post-op" region.
 */
export function postOpProtocolsFor(region: string | null | undefined): Protocol[] {
  const all = !region || region === "post-op";
  const list = postOpProtocols.filter((protocol) => all || protocol.region === region);
  // The ACL protocol also covers rehabilitation after reconstruction.
  if (all || region === "knee") list.push(byId.get("acl")!);
  return list;
}

const byId = new Map(protocols.map((protocol) => [protocol.id, protocol]));

export function protocolById(id: string): Protocol | undefined {
  return byId.get(id);
}

/** The protocol for a knowledge-base hypothesis, if one exists. */
export function protocolForHypothesis(hypothesisId: string): Protocol | undefined {
  return protocols.find((protocol) => protocol.hypotheses.includes(hypothesisId));
}

/** Protocols whose phases use this library exercise. */
export function protocolsUsingExercise(exerciseId: string): Protocol[] {
  return protocols.filter((protocol) => protocol.phases.some((phase) => phase.exercises.includes(exerciseId)));
}


const hypothesisLabels = new Map<string, LocalizedText>(
  Object.values(regionKnowledge).flatMap((region) => region!.hypotheses.map((h) => [h.id, h.label] as const))
);

/** Display label of a knowledge-base hypothesis. */
export function hypothesisLabel(id: string): LocalizedText | undefined {
  return hypothesisLabels.get(id);
}

/**
 * The protocol to offer next to a ranked hypothesis. A serious hypothesis
 * (medical review required) never gets a rehabilitation protocol link.
 */
export function protocolLinkFor(hypothesis: { id: string; requiresMedicalReview: boolean }): Protocol | undefined {
  return hypothesis.requiresMedicalReview ? undefined : protocolForHypothesis(hypothesis.id);
}
