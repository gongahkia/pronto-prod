import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  query: vi.fn(),
}));

import { query } from "@/lib/db";
import { claimWebhookEvent } from "@/lib/channels/webhook-replay";

const mockedQuery = vi.mocked(query);

describe("webhook replay guard", () => {
  beforeEach(() => {
    mockedQuery.mockReset();
  });

  it("claims first-seen webhook events", async () => {
    mockedQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "event-1" }] } as never);

    const result = await claimWebhookEvent({
      provider: "whatsapp",
      channelId: "channel-1",
      rawBody: "{\"ok\":true}",
      signature: "sha256=abc",
      now: new Date("2026-01-01T00:00:00Z"),
    });

    expect(result).toEqual({ ok: true, duplicate: false });
    expect(mockedQuery.mock.calls[0][1]).toEqual([
      "channel-1",
      "whatsapp",
      "channel-1:sha256=abc",
      expect.any(String),
      new Date("2026-01-01T00:05:00Z"),
      { timestamp: null },
    ]);
  });

  it("marks duplicate event keys without reprocessing", async () => {
    mockedQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] } as never);

    await expect(
      claimWebhookEvent({
        provider: "telegram",
        channelId: "channel-1",
        rawBody: "{}",
        eventId: "update-1",
      }),
    ).resolves.toEqual({ ok: true, duplicate: true });
  });

  it("rejects stale timestamped webhooks", async () => {
    await expect(
      claimWebhookEvent({
        provider: "resend",
        channelId: "channel-1",
        rawBody: "{}",
        timestamp: "2026-01-01T00:00:00Z",
        now: new Date("2026-01-01T00:06:00Z"),
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "Webhook timestamp is outside the allowed replay window.",
    });
    expect(mockedQuery).not.toHaveBeenCalled();
  });
});

