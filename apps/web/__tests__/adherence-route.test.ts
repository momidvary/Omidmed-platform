// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({})) }));
vi.mock("@/utils/supabase/server", () => ({ createClient: () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc: mocks.rpc }) }));
import { POST } from "@/app/api/patient/adherence/route";

const id = "10000000-0000-4000-8000-000000000001";
const body = { patientId: id, episodeId: id, prescriptionItemId: id,
  clientSubmissionId: id, status: "complete", painLevel: 3 };
function request(value: unknown, headers = {}) {
  return new Request("https://clinic.example/api/patient/adherence", {
    method: "POST", headers: { origin: "https://clinic.example", ...headers },
    body: JSON.stringify(value),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-only");
  mocks.getUser.mockResolvedValue({ data: { user: { id } } });
  mocks.rpc.mockResolvedValue({ data: [{ event_id: id, local_date: "2026-09-26",
    prescription_status: "published", alert_created: false }], error: null });
});
afterEach(() => vi.unstubAllEnvs());
describe("adherence request boundary", () => {
  it.each([{}, { "content-length": "1" }])("bounds actual bytes with absent or false length %j", async (headers) => {
    const response = await POST(request({ ...body, padding: "x".repeat(9000) }, headers));
    expect(response.status).toBe(413);
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects caller supplied identity and date", async () => {
    expect((await POST(request({ ...body, actorId: id, localDate: "2020-01-01" }))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("returns a conflict for reused submission keys", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "23505" } });
    expect((await POST(request(body))).status).toBe(409);
  });
  it("does not claim success for incomplete database output", async () => {
    mocks.rpc.mockResolvedValue({ data: [{}], error: null });
    expect((await POST(request(body))).status).toBe(500);
  });
  it("returns authoritative event and binds the verified actor", async () => {
    const response = await POST(request(body));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.rpc).toHaveBeenCalledWith("record_exercise_completion_event", expect.objectContaining({ p_actor_id: id }));
    expect((await response.json()).event.localDate).toBe("2026-09-26");
  });
});
