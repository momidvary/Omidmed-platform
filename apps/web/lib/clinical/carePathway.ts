/*
 * Care pathway shown in the patient workspace:
 * assessment → examination → treatment plan → home program → sessions.
 *
 * Only presentation: every gate is still enforced by the pages and the
 * database. The pathway never advances past an unresolved safety screen,
 * and a section that failed to load is "unknown", never "not done".
 */

export const CARE_STEPS = ["assessment", "exam", "plan", "program", "sessions"] as const;
export type CareStep = (typeof CARE_STEPS)[number];

export type StepState =
  | "done"
  | "next"
  | "todo"
  | "waiting"
  | "blocked"
  | "locked"
  | "loading"
  | "unknown";

type Load<T extends string> = "loading" | "failed" | T;

export interface CarePathwayInput {
  cases: Load<"ready">;
  hasCase: boolean;
  safetyCleared: boolean;
  findings: Load<"saved" | "none">;
  plan: Load<"approved" | "draft" | "none">;
  program: Load<"published" | "suspended" | "none">;
  hasEpisode: boolean;
  sessions: Load<"some" | "none">;
}

export function carePathwayStates(input: CarePathwayInput): Record<CareStep, StepState> {
  const states: Record<CareStep, StepState> = {
    assessment:
      input.cases === "loading"
        ? "loading"
        : input.cases === "failed"
          ? "unknown"
          : input.hasCase
            ? "done"
            : "todo",
    exam: !input.hasCase
      ? "locked"
      : !input.safetyCleared
        ? "blocked"
        : input.findings === "loading"
          ? "loading"
          : input.findings === "failed"
            ? "unknown"
            : input.findings === "saved"
              ? "done"
              : "todo",
    plan: !input.hasCase || !input.safetyCleared
      ? "locked"
      : input.plan === "loading"
        ? "loading"
        : input.plan === "failed"
          ? "unknown"
          : input.plan === "approved"
            ? "done"
            : input.plan === "draft"
              ? "waiting"
              : "todo",
    program: !input.safetyCleared || input.plan !== "approved"
      ? "locked"
      : input.program === "loading"
        ? "loading"
        : input.program === "failed"
          ? "unknown"
          : input.program === "published"
            ? "done"
            : input.program === "suspended"
              ? "blocked"
              : "todo",
    sessions: !input.hasEpisode
      ? "locked"
      : input.sessions === "loading"
        ? "loading"
        : input.sessions === "failed"
          ? "unknown"
          : input.sessions === "some"
            ? "done"
            : "todo",
  };

  // The first step that still needs work is highlighted as the next step.
  const first = CARE_STEPS.find((step) =>
    ["todo", "waiting", "blocked", "unknown", "loading"].includes(states[step])
  );
  if (first && states[first] === "todo") states[first] = "next";
  return states;
}
