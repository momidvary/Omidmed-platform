import { describe, expect, it } from "vitest";
import {
  selectCurrentPublishedPrescription,
  selectPortalActiveEpisode,
} from "@/lib/supabase/db";

describe("patient portal episode policy", () => {
  it("selects only the newest explicitly active episode", () => {
    const episodes = [
      {
        id: "completed-newer",
        status: "completed",
        started_at: "2026-08-12",
      },
      { id: "active-older", status: "active", started_at: "2026-06-01" },
      { id: "active-newer", status: "active", started_at: "2026-08-01" },
      { id: "paused", status: "paused", started_at: "2026-08-10" },
    ];

    expect(selectPortalActiveEpisode(episodes)?.id).toBe("active-newer");
    expect(episodes.map((episode) => episode.id)).toEqual([
      "completed-newer",
      "active-older",
      "active-newer",
      "paused",
    ]);
  });

  it("never falls back to a paused or completed episode", () => {
    expect(
      selectPortalActiveEpisode([
        { id: "paused", status: "paused", started_at: "2026-08-01" },
        {
          id: "completed",
          status: "completed",
          started_at: "2026-08-10",
        },
      ])
    ).toBeUndefined();
  });
});

describe("patient portal prescription policy", () => {
  const today = "2026-08-14";

  it("accepts inclusive start/end boundaries and an open end date", () => {
    expect(
      selectCurrentPublishedPrescription(
        [
          {
            id: "bounded",
            status: "published",
            start_date: today,
            end_date: today,
            published_at: "2026-08-14T08:00:00.000Z",
          },
        ],
        today
      )?.id
    ).toBe("bounded");

    expect(
      selectCurrentPublishedPrescription(
        [
          {
            id: "open-ended",
            status: "published",
            start_date: "2026-08-01",
            end_date: null,
            published_at: "2026-08-13T08:00:00.000Z",
          },
        ],
        today
      )?.id
    ).toBe("open-ended");
  });

  it("rejects drafts, revoked, future and expired prescriptions", () => {
    expect(
      selectCurrentPublishedPrescription(
        [
          {
            id: "draft",
            status: "draft",
            start_date: "2026-08-01",
            end_date: null,
          },
          {
            id: "revoked",
            status: "revoked",
            start_date: "2026-08-01",
            end_date: null,
          },
          {
            id: "future",
            status: "published",
            start_date: "2026-08-15",
            end_date: null,
          },
          {
            id: "expired",
            status: "published",
            start_date: "2026-08-01",
            end_date: "2026-08-13",
          },
        ],
        today
      )
    ).toBeUndefined();
  });

  it("chooses the latest current publication and fails closed on bad dates", () => {
    const prescriptions = [
      {
        id: "older",
        status: "published",
        start_date: "2026-08-01",
        end_date: null,
        published_at: "2026-08-12T08:00:00.000Z",
      },
      {
        id: "newer",
        status: "published",
        start_date: "2026-08-01",
        end_date: null,
        published_at: "2026-08-13T08:00:00.000Z",
      },
    ];

    expect(
      selectCurrentPublishedPrescription(prescriptions, today)?.id
    ).toBe("newer");
    expect(
      selectCurrentPublishedPrescription(prescriptions, "not-a-date")
    ).toBeUndefined();
    expect(
      selectCurrentPublishedPrescription(
        [
          {
            id: "malformed",
            status: "published",
            start_date: "14/08/2026",
            end_date: null,
          },
        ],
        today
      )
    ).toBeUndefined();
  });
});
