import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ExerciseAdherenceForm } from "@/components/clinical/ExerciseAdherenceForm";
import type { Patient, PrescribedExercise } from "@/lib/types";

const id = "10000000-0000-4000-8000-000000000001";
const patient = { id, episodeId: id, prescription: { scheduleTimezone: "Asia/Tehran" } } as Patient;
const item: PrescribedExercise = { exerciseId: "ex_quad_sets", prescriptionItemId: id,
  scheduledWeekdays: [1, 3], dosageFa: "dosage", daysPerWeek: 2 };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function fill() {
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "complete" } });
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "8" } });
}
describe("per-exercise reporting", () => {
  it("requires explicit status and pain before submitting", () => {
    render(<ExerciseAdherenceForm patient={patient} item={item} onPaused={() => {}} />);
    expect(screen.getByRole("button")).toBeDisabled();
    fill();
    expect(screen.getByRole("button")).toBeEnabled();
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
    fireEvent.click(screen.getByRole("button"));
    await screen.findByRole("button", { name: "تلاش مجدد همان درخواست" });
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(paused).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(paused).toHaveBeenCalledOnce());
    expect(fetchMock.mock.calls[0][1].body).toBe(fetchMock.mock.calls[1][1].body);
    expect(screen.getByRole("status")).toHaveTextContent("2026-09-26");
    expect(screen.getByRole("button")).toBeDisabled();
  });
  it("does not claim success on rejection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 422 }));
    const paused = vi.fn();
    render(<ExerciseAdherenceForm patient={patient} item={item} onPaused={paused} />);
    fill();
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("ثبت پذیرفته نشد"));
    expect(paused).not.toHaveBeenCalled();
    expect(screen.getByRole("button")).toBeEnabled();
  });
});
