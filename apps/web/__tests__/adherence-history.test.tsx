import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ExerciseAdherenceHistory } from "@/components/clinical/ExerciseAdherenceHistory";
import type { Patient } from "@/lib/types";
const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/lib/clinical/adherenceHistory", () => ({ ADHERENCE_PAGE_SIZE: 20, fetchAdherenceHistory: mocks.load }));
const patient = { id: "patient-a", episodeId: "episode-a", program: [{
  prescriptionItemId: "item-a", contentSnapshot: { name: "تمرین بیمار اول" },
}] } as Patient;
const row = { id: "event-a", prescription_item_id: "item-a", status: "complete",
  pain_level: 3, local_date: "2026-10-01", timezone_snapshot: "Asia/Tehran" };
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
describe("exercise report history", () => {
  it("shows stored reports and does not show next page without an extra row", async () => {
    mocks.load.mockResolvedValue([row]);
    render(<ExerciseAdherenceHistory patient={patient} />);
    expect(await screen.findByText("تمرین بیمار اول")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "صفحهٔ بعد" })).toBeDisabled();
    expect(mocks.load).toHaveBeenCalledWith("patient-a", "episode-a", 0, expect.any(AbortSignal));
  });
  it("clears previous patient data immediately when switching scope", async () => {
    mocks.load.mockResolvedValueOnce([row]).mockImplementationOnce(() => new Promise(() => {}));
    const view = render(<ExerciseAdherenceHistory patient={patient} />);
    await screen.findByText("تمرین بیمار اول");
    view.rerender(<ExerciseAdherenceHistory patient={{ ...patient, id: "patient-b", episodeId: "episode-b" }} />);
    expect(screen.queryByText("تمرین بیمار اول")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("در حال دریافت");
    expect(mocks.load.mock.calls[0][3].aborted).toBe(true);
  });
  it("distinguishes failed reads from empty history and supports retry", async () => {
    mocks.load.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([]);
    render(<ExerciseAdherenceHistory patient={patient} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("دریافت نشدند");
    expect(screen.queryByText("در این صفحه گزارشی ثبت نشده است.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "به‌روزرسانی" }));
    expect(await screen.findByText("در این صفحه گزارشی ثبت نشده است.")).toBeInTheDocument();
  });
});
