import { addDays } from "@/lib/clinical/adherence";

/*
 * Clinic-wide follow-up list for the dashboard: published home programs whose
 * review date has arrived, and programs with no patient report for a week.
 * A missing report is not proof the patient stopped exercising; it is a
 * prompt to check in. Pain of 7/10 or more already raises a clinical alert.
 */

export interface FollowUpProgram {
  prescriptionId: string;
  patientId: string;
  patientName: string;
  episodeId: string;
  version: number;
  reviewDate: string;
  publishedAt: string;
}

export interface FollowUpReport {
  prescriptionId: string;
  localDate: string;
}

export interface FollowUpItem {
  patientId: string;
  patientName: string;
  /** Review date for "review due"; last report date (or null) for "silent". */
  date: string | null;
}

/** Days without any report before a program is listed as silent. */
export const SILENT_DAYS = 7;

export function clinicFollowUps(
  programs: readonly FollowUpProgram[],
  reports: readonly FollowUpReport[],
  today: string
): { reviewDue: FollowUpItem[]; silent: FollowUpItem[] } {
  // Only the newest published version of each episode counts.
  const latest = new Map<string, FollowUpProgram>();
  for (const program of programs) {
    const current = latest.get(program.episodeId);
    if (!current || program.version > current.version) latest.set(program.episodeId, program);
  }

  const lastReport = new Map<string, string>();
  for (const report of reports) {
    const seen = lastReport.get(report.prescriptionId);
    if (!seen || report.localDate > seen) lastReport.set(report.prescriptionId, report.localDate);
  }

  const silentSince = addDays(today, -SILENT_DAYS);
  const reviewDue: FollowUpItem[] = [];
  const silent: FollowUpItem[] = [];
  for (const program of latest.values()) {
    if (program.reviewDate <= today) {
      reviewDue.push({ patientId: program.patientId, patientName: program.patientName, date: program.reviewDate });
    }
    const last = lastReport.get(program.prescriptionId) ?? null;
    const publishedDay = program.publishedAt.slice(0, 10);
    if (publishedDay <= silentSince && (!last || last <= silentSince)) {
      silent.push({ patientId: program.patientId, patientName: program.patientName, date: last });
    }
  }
  reviewDue.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  silent.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  return { reviewDue, silent };
}
