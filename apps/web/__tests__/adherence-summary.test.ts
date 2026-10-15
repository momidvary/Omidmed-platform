import { describe, expect, it } from "vitest";
import {
  addDays,
  currentReports,
  isReasonCode,
  localDateIn,
  reasonLabel,
  scheduledDays,
  suggestProgression,
  summarizeItem,
  type ExerciseReportLike,
} from "@/lib/clinical/adherence";

let seq = 0;
function report(
  date: string,
  status: ExerciseReportLike["status"],
  pain: number,
  extra: Partial<ExerciseReportLike> = {}
): ExerciseReportLike {
  seq += 1;
  return {
    id: `r${seq}`,
    prescriptionItemId: "item-1",
    localDate: date,
    status,
    painLevel: pain,
    nonCompletionReason: status === "complete" ? null : "other",
    createdAt: `${date}T10:00:${String(seq % 60).padStart(2, "0")}Z`,
    supersedesId: null,
    ...extra,
  };
}

const days = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"];

describe("calendar helpers", () => {
  it("counts scheduled weekdays inside the prescription dates", () => {
    // 2026-10-01 is a Thursday (4). Sunday=0 … Saturday=6.
    expect(scheduledDays([0, 2, 4], "2026-10-01", "2026-10-14", "2026-10-01", null)).toEqual([
      "2026-10-01", "2026-10-04", "2026-10-06", "2026-10-08", "2026-10-11", "2026-10-13",
    ]);
    expect(scheduledDays([4], "2026-09-01", "2026-10-14", "2026-10-02", "2026-10-09")).toEqual([
      "2026-10-08",
    ]);
    expect(scheduledDays(undefined, "2026-10-01", "2026-10-14", "2026-10-01", null)).toEqual([]);
  });

  it("does date arithmetic across month ends and time zones", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-10-01", -14)).toBe("2026-09-17");
    // 21:00 UTC on 9 Oct is already 10 Oct in Tehran.
    expect(localDateIn("Asia/Tehran", new Date("2026-10-09T21:00:00Z"))).toBe("2026-10-10");
  });
});

describe("current reports", () => {
  it("drops corrected reports and keeps one report per exercise per day", () => {
    const original = report(days[0], "complete", 2);
    const retry = report(days[0], "partial", 4);
    const corrected = report(days[1], "complete", 3);
    const correction = report(days[1], "partial", 5, { supersedesId: corrected.id });
    const result = currentReports([original, retry, corrected, correction]);
    expect(result.map((r) => r.id)).toEqual([retry.id, correction.id]);
  });
});

describe("reasons", () => {
  it("labels known codes and ignores legacy free text", () => {
    expect(isReasonCode("pain")).toBe(true);
    expect(isReasonCode("Patient reported partial completion")).toBe(false);
    expect(reasonLabel("no_time", "fa")).toBe("وقت نداشتم");
    expect(reasonLabel("unclear", "ar")).toBe("Unsure how to do it");
  });
});

describe("progression suggestion", () => {
  const sched = days;

  it("asks for review on high pain or a suspended program, whatever else happened", () => {
    const high = summarizeItem("item-1", sched, [
      report(days[0], "complete", 1), report(days[1], "complete", 7),
    ]);
    expect(suggestProgression(high, false)).toEqual({ kind: "review", reason: "highPain" });
    const calm = summarizeItem("item-1", sched, [report(days[0], "complete", 1)]);
    expect(suggestProgression(calm, true)).toEqual({ kind: "review", reason: "suspended" });
  });

  it("needs at least three reports before suggesting anything else", () => {
    const summary = summarizeItem("item-1", sched, [
      report(days[0], "complete", 1), report(days[1], "complete", 1),
    ]);
    expect(suggestProgression(summary, false).kind).toBe("insufficient");
  });

  it("suggests progression only after sustained complete, low-pain reports", () => {
    const good = summarizeItem("item-1", sched, [
      report(days[0], "complete", 3), report(days[1], "complete", 2),
      report(days[2], "complete", 2), report(days[3], "complete", 1),
    ]);
    expect(good.completeDays).toBe(4);
    expect(suggestProgression(good, false)).toEqual({ kind: "progress", reason: "consistentLowPain" });

    const lastPartial = summarizeItem("item-1", sched, [
      report(days[0], "complete", 2), report(days[1], "complete", 2),
      report(days[2], "complete", 2), report(days[3], "partial", 2),
    ]);
    expect(suggestProgression(lastPartial, false).kind).toBe("hold");
  });

  it("suggests regression when pain rises or stays high", () => {
    const rising = summarizeItem("item-1", sched, [
      report(days[0], "complete", 1), report(days[1], "complete", 2),
      report(days[2], "complete", 3), report(days[3], "complete", 4),
      report(days[4], "complete", 5),
    ]);
    expect(rising.painTrend).toBe(2);
    expect(suggestProgression(rising, false)).toEqual({ kind: "regress", reason: "painRising" });

    const high = summarizeItem("item-1", sched, [
      report(days[0], "complete", 5), report(days[1], "complete", 6),
      report(days[2], "complete", 5),
    ]);
    expect(suggestProgression(high, false)).toEqual({ kind: "regress", reason: "painHigh" });
  });

  it("matches low completion to its reported reason", () => {
    const make = (reason: string) =>
      summarizeItem("item-1", sched, [
        report(days[0], "not_done", 2, { nonCompletionReason: reason }),
        report(days[1], "not_done", 2, { nonCompletionReason: reason }),
        report(days[2], "complete", 2),
      ]);
    expect(suggestProgression(make("unclear"), false).kind).toBe("reteach");
    expect(suggestProgression(make("no_time"), false).kind).toBe("simplify");
    expect(suggestProgression(make("forgot"), false).kind).toBe("simplify");
    expect(suggestProgression(make("pain"), false).kind).toBe("regress");
    expect(suggestProgression(make("Patient reported not attempted"), false).kind).toBe("hold");
  });

  it("only counts the exercise it summarizes", () => {
    const summary = summarizeItem("item-1", sched, [
      report(days[0], "complete", 1),
      report(days[1], "complete", 9, { prescriptionItemId: "item-2" }),
    ]);
    expect(summary.reportedDays).toBe(1);
    expect(summary.maxPain).toBe(1);
  });
});
