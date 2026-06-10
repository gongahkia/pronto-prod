import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  query: mocks.query,
}));

import { listRecentErrorEvents, recordErrorEvent } from "@/lib/error-tracking";

describe("error tracking", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.PRONTO_ERROR_ALERT_WEBHOOK_URL;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("persists an error event and returns the row", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [
        {
          id: "ev-1",
          event_name: "outbox.flush_failed",
          severity: "error",
          source: "outbound",
          request_id: "req-1",
          client_id: "client-1",
          channel_id: "channel-1",
          message: "Provider 503",
          metadata: { attemptCount: 3 },
          occurred_at: new Date(),
          alerted_at: null,
          acknowledged_at: null,
        },
      ],
    });

    const event = await recordErrorEvent({
      eventName: "outbox.flush_failed",
      source: "outbound",
      message: "Provider 503",
      requestId: "req-1",
      clientId: "client-1",
      channelId: "channel-1",
      metadata: { attemptCount: 3 },
    });

    expect(event?.id).toBe("ev-1");
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.query.mock.calls[0][0]).toContain("insert into error_events");
  });

  it("returns null and does not throw when the DB write fails", async () => {
    mocks.query.mockRejectedValueOnce(new Error("connection closed"));

    const event = await recordErrorEvent({
      eventName: "webhook.failed",
      source: "webhook",
      message: "Webhook 5xx",
    });

    expect(event).toBeNull();
  });

  it("posts an external alert and stamps alerted_at when webhook URL is set", async () => {
    process.env.PRONTO_ERROR_ALERT_WEBHOOK_URL = "https://example.com/hook";
    const inserted = {
      id: "ev-2",
      event_name: "outbox.flush_failed",
      severity: "error",
      source: "outbound",
      request_id: null,
      client_id: null,
      channel_id: null,
      message: "Permanent failure",
      metadata: {},
      occurred_at: new Date(),
      alerted_at: null,
      acknowledged_at: null,
    };
    mocks.query
      .mockResolvedValueOnce({ rows: [inserted] })
      .mockResolvedValueOnce({ rows: [] });

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await recordErrorEvent({
      eventName: "outbox.flush_failed",
      source: "outbound",
      message: "Permanent failure",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/hook",
      expect.objectContaining({ method: "POST" }),
    );
    expect(mocks.query.mock.calls[1][0]).toContain("alerted_at = now()");
  });

  it("lists recent events filtered by source and unacknowledged flag", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });

    await listRecentErrorEvents({
      source: "outbound",
      unacknowledgedOnly: true,
      limit: 10,
    });

    const sql = mocks.query.mock.calls[0][0] as string;
    expect(sql).toContain("source = $1");
    expect(sql).toContain("acknowledged_at is null");
    expect(mocks.query.mock.calls[0][1]).toEqual(["outbound", 10]);
  });
});
