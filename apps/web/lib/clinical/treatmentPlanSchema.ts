import { z } from "zod";
import type { TreatmentPlan } from "@/lib/types";

const planItem = z.string().trim().min(1).max(1_000);
const optionalSection = z.array(planItem).max(12);
const requiredSection = optionalSection.min(1);

export const TreatmentPlanSchema = z
  .object({
    manualTherapy: optionalSection,
    exerciseTherapy: requiredSection,
    mobility: optionalSection,
    strengthening: optionalSection,
    motorControl: optionalSection,
    balance: optionalSection,
    education: requiredSection,
    homeProgram: requiredSection,
    frequency: z.string().trim().min(1).max(500),
    progression: requiredSection,
  })
  .strict();

export type ValidatedTreatmentPlan = z.infer<typeof TreatmentPlanSchema>;

export function normalizeTreatmentPlan(plan: TreatmentPlan): TreatmentPlan {
  const normalizeItems = (items: string[]) =>
    items.map((item) => item.trim()).filter(Boolean);
  return {
    manualTherapy: normalizeItems(plan.manualTherapy),
    exerciseTherapy: normalizeItems(plan.exerciseTherapy),
    mobility: normalizeItems(plan.mobility),
    strengthening: normalizeItems(plan.strengthening),
    motorControl: normalizeItems(plan.motorControl),
    balance: normalizeItems(plan.balance),
    education: normalizeItems(plan.education),
    homeProgram: normalizeItems(plan.homeProgram),
    frequency: plan.frequency.trim(),
    progression: normalizeItems(plan.progression),
  };
}
