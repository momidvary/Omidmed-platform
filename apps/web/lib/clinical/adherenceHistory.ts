import { z } from "zod";
import { getSupabase } from "@/lib/supabase/client";

export const ADHERENCE_PAGE_SIZE = 20;
const eventSchema = z.object({
  id: z.uuid(), prescription_item_id: z.uuid(), prescription_id: z.uuid(),
  local_date: z.iso.date(), timezone_snapshot: z.string(),
  status: z.enum(["complete", "partial", "not_done"]),
  pain_level: z.number().int().min(0).max(10), created_at: z.string(),
  completed_sets: z.number().int().nullable(),
  completed_reps: z.number().int().nullable(),
  completed_duration_seconds: z.number().int().nullable(),
});
export type AdherenceHistoryEvent = z.infer<typeof eventSchema>;

export async function fetchAdherenceHistory(patientId: string, episodeId: string, page: number,
  signal: AbortSignal): Promise<AdherenceHistoryEvent[]> {
  if (!Number.isInteger(page) || page < 0) throw new Error("invalid page");
  const client = getSupabase();
  if (!client) throw new Error("unavailable");
  // User-session client: the database checks the live account link via RLS.
  const { data, error } = await client.from("patient_exercise_completion_events")
    .select("id,prescription_item_id,prescription_id,local_date,timezone_snapshot,status,pain_level,created_at,completed_sets,completed_reps,completed_duration_seconds")
    .eq("patient_id", patientId).eq("episode_id", episodeId)
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .range(page * ADHERENCE_PAGE_SIZE, (page + 1) * ADHERENCE_PAGE_SIZE)
    .abortSignal(signal);
  if (error) throw new Error("history unavailable");
  return z.array(eventSchema).parse(data);
}
