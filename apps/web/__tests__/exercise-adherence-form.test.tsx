import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ExerciseAdherenceForm } from "@/components/clinical/ExerciseAdherenceForm";
import type { Patient, PrescribedExercise } from "@/lib/types";

const id = "10000000-0000-4000-8000-000000000001";
const patient = { id, episodeId: id, prescription: { scheduleTimezone: "Asia/Tehran" } } as Patient;
// Scheduled every day, so the form is shown whatever today is.
const item: PrescribedExercise = { exerciseId: "ex_quad_sets", prescriptionItemId: id,
  scheduledWeekdays: [0, 1, 2, 3, 4, 5, 6], dosageFa: "dosage", daysPerWeek: 7 };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const submitButton = () => screen.getByRole("button", { name: /ثبت گزارش|تلاش مجدد|ثبت شد|در حال ثبت/ });
function fill(status = "کامل انجام دادم", pain = "درد ۲ از ۱۰") {
  fireEvent.click(screen.getByRole("button", { name: status }));
  fireEvent.click(screen.getByRole("button", { name: pain }));
}

describe("per-exercise reporting", () => {
  it("prefills the target on a complete report and sends the measurements", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 422 });
    vi.stubGlobal("fetch", fetchMock);
    render(<ExerciseAdherenceForm patient={patient} item={{ ...item, targetSets: 3, targetReps: 10 }} onPaused={() => {}} />);
    expect(submitButton()).toBeDisabled();
    fill();
    expect(screen.getByLabelText(/^ست/)).toHaveValue(3);
    fireEvent.change(screen.getByLabelText(/^تکرار/), { target: { value: "12" } });
    fireEvent.click(submitButton());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      status: "complete", painLevel: 2, completedSets: 3, completedReps: 12,
      completedDurationSeconds: null, nonCompletionReason: null,
    });
  });

  it("requires explicit status and pain before submitting", () => {
    render(<ExerciseAdherenceForm patient={patient} item={item} onPaused={() => {}} />);
    expect(submitButton()).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "کامل انجام دادم" }));
    expect(submitButton()).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "درد ۰ از ۱۰" }));
    expect(submitButton()).toBeEnabled();
  });

  it("requires a reason when not done and sends it as a code with zero measurements", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 422 });
    vi.stubGlobal("fetch", fetchMock);
    render(<ExerciseAdherenceForm patient={patient} item={{ ...item, targetSets: 3, targetReps: 10 }} onPaused={() => {}} />);
    fill("امروز انجام ندادم", "درد ۳ از ۱۰");
    expect(submitButton()).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "وقت نداشتم" }));
    fireEvent.click(submitButton());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      status: "not_done", nonCompletionReason: "no_time", completedSets: 0, completedReps: 0,
    });
  });

  it("asks for the amount done on a partial report", () => {
    render(<ExerciseAdherenceForm patient={patient} item={{ ...item, targetSets: 3, targetReps: 10 }} onPaused={() => {}} />);
    fill("بخشی از آن را انجام دادم");
    fireEvent.click(screen.getByRole("button", { name: "درد یا ناراحتی" }));
    expect(submitButton()).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/^ست/), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/^تکرار/), { target: { value: "10" } });
    expect(submitButton()).toBeEnabled();
  });

  it("warns to stop on pain of 7 or more", () => {
    render(<ExerciseAdherenceForm patient={patient} item={item} onPaused={() => {}} />);
    fill("کامل انجام دادم", "درد ۷ از ۱۰");
    expect(screen.getByRole("alert")).toHaveTextContent("تمرین را متوقف کنید");
  });

  it("retries the same payload after an uncertain response, then pauses", async () => {
    const paused = vi.fn();
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ event: {
        id, localDate: "2026-09-26", prescriptionStatus: "suspended", alertCreated: true,
      } }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<ExerciseAdherenceForm patient={patient} item={item} onPaused={paused} />);
    fill();
    fireEvent.click(submitButton());
    await screen.findByRole("button", { name: "تلاش مجدد همان درخواست" });
    expect(screen.getByRole("button", { name: "کامل انجام دادم" })).toBeDisabled();
    expect(paused).not.toHaveBeenCalled();
    fireEvent.click(submitButton());
    await waitFor(() => expect(paused).toHaveBeenCalledOnce());
    expect(fetchMock.mock.calls[0][1].body).toBe(fetchMock.mock.calls[1][1].body);
    expect(screen.getByRole("status")).toHaveTextContent("ثبت شد");
    expect(submitButton()).toBeDisabled();
  });

  it("does not claim success on rejection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 422 }));
    const paused = vi.fn();
    render(<ExerciseAdherenceForm patient={patient} item={item} onPaused={paused} />);
    fill();
    fireEvent.click(submitButton());
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("ثبت پذیرفته نشد"));
    expect(paused).not.toHaveBeenCalled();
    expect(submitButton()).toBeEnabled();
  });

  it("does not offer a report on a day the exercise is not scheduled", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // Friday 9 October 2026, 12:00 in Tehran.
    vi.setSystemTime(new Date("2026-10-09T08:30:00Z"));
    render(<ExerciseAdherenceForm patient={patient} item={{ ...item, scheduledWeekdays: [1, 3] }} onPaused={() => {}} />);
    expect(screen.getByText(/امروز روز این تمرین نیست/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "کامل انجام دادم" })).toBeNull();
  });
});
