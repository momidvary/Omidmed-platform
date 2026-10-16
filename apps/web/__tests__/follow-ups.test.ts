import { describe, expect, it } from "vitest";
import { clinicFollowUps, type FollowUpProgram } from "@/lib/clinical/followUps";

const program = (overrides: Partial<FollowUpProgram>): FollowUpProgram => ({
  prescriptionId: "rx1",
  patientId: "p1",
  patientName: "رضا",
  episodeId: "e1",
  version: 1,
  reviewDate: "2026-10-30",
  publishedAt: "2026-10-01T09:00:00Z",
  ...overrides,
});

describe("clinic follow-ups", () => {
  const today = "2026-10-16";

  it("lists programs whose review date has arrived", () => {
    const result = clinicFollowUps(
      [program({ reviewDate: "2026-10-16" }), program({ prescriptionId: "rx2", patientId: "p2", episodeId: "e2" })],
      [
        { prescriptionId: "rx1", localDate: "2026-10-15" },
        { prescriptionId: "rx2", localDate: "2026-10-15" },
      ],
      today
    );
    expect(result.reviewDue.map((item) => item.patientId)).toEqual(["p1"]);
    expect(result.silent).toEqual([]);
  });

  it("flags a program with no report for a week, but not a newly published one", () => {
    const result = clinicFollowUps(
      [
        program({}),
        program({ prescriptionId: "rx2", patientId: "p2", episodeId: "e2", publishedAt: "2026-10-14T09:00:00Z" }),
        program({ prescriptionId: "rx3", patientId: "p3", episodeId: "e3" }),
      ],
      [
        { prescriptionId: "rx1", localDate: "2026-10-05" },
        { prescriptionId: "rx3", localDate: "2026-10-12" },
      ],
      today
    );
    expect(result.silent).toEqual([{ patientId: "p1", patientName: "رضا", date: "2026-10-05" }]);
  });

  it("uses only the newest published version of an episode", () => {
    const result = clinicFollowUps(
      [program({ reviewDate: "2026-10-01" }), program({ prescriptionId: "rx9", version: 2, reviewDate: "2026-11-01" })],
      [{ prescriptionId: "rx9", localDate: "2026-10-15" }],
      today
    );
    expect(result.reviewDue).toEqual([]);
    expect(result.silent).toEqual([]);
  });
});
