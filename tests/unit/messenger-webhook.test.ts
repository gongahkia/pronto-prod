import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getChannel: vi.fn(), process: vi.fn(async (messages: unknown[]) => ({ accepted: messages.length, duplicates: 0 })),
}));
vi.mock("@/lib/channels/messenger", async (original) => ({
  ...(await original<typeof import("@/lib/channels/messenger")>()), getMessengerChannel: mocks.getChannel,
}));
vi.mock("@/lib/channels/process", () => ({ processInboundMessages: mocks.process }));

import { GET, POST } from "@/app/api/webhooks/messenger/[channelId]/route";

const context = { params: Promise.resolve({ channelId: "channel-a" }) };
const activeChannel = () => ({ id: "channel-a", client_id: "tenant-a", kind: "messenger",
  status: "active", external_id: "page-a", credentials: { appSecret: "app-secret", pageAccessToken: "page-token" },
  settings: { verifyToken: "verify-token" } });
const payload = { object: "page", entry: [{ id: "page-a", messaging: [{
  sender: { id: "customer" }, recipient: { id: "page-a" }, timestamp: Date.now(),
  message: { mid: "mid-1", text: "Hello" },
}] }] };

function signed(body: unknown, secret = "app-secret") {
  const raw = JSON.stringify(body);
  return new Request("http://localhost:3000/api/webhooks/messenger/channel-a", { method: "POST", body: raw,
    headers: { "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}` } });
}

describe("Messenger webhook contract", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.getChannel.mockResolvedValue(activeChannel()); });

  it("requires a configured verify token and active channel", async () => {
    const url = "http://localhost:3000/?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=challenge";
    expect((await GET(new Request(url), context)).status).toBe(200);
    mocks.getChannel.mockResolvedValue({ ...activeChannel(), settings: {} });
    expect((await GET(new Request(url), context)).status).toBe(403);
    mocks.getChannel.mockResolvedValue({ ...activeChannel(), status: "disabled" });
    expect((await GET(new Request(url), context)).status).toBe(403);
  });

  it("rejects invalid signatures, missing secrets, wrong Pages and disabled channels", async () => {
    expect((await POST(signed(payload, "wrong"), context)).status).toBe(401);
    mocks.getChannel.mockResolvedValue({ ...activeChannel(), credentials: {} });
    expect((await POST(signed(payload), context)).status).toBe(401);
    mocks.getChannel.mockResolvedValue(activeChannel());
    expect((await POST(signed({ ...payload, entry: [{ ...payload.entry[0], id: "page-b" }] }), context)).status).toBe(403);
    mocks.getChannel.mockResolvedValue({ ...activeChannel(), status: "disabled" });
    expect((await POST(signed(payload), context)).status).toBe(403);
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("acknowledges a customer message while ignoring echo and delivery events", async () => {
    const incoming = { object: "page", entry: [{ id: "page-a", messaging: [
      payload.entry[0].messaging[0],
      { sender: { id: "page-a" }, recipient: { id: "customer" },
        message: { mid: "mid-echo", text: "Hello", is_echo: true } },
      { sender: { id: "page-a" }, recipient: { id: "customer" }, delivery: { mids: ["mid-out"] } },
    ] }] };
    expect((await POST(signed(incoming), context)).status).toBe(200);
    expect(mocks.process).toHaveBeenCalledWith([
      expect.objectContaining({ externalMessageId: "mid-1", customerHandle: "customer" }),
    ], expect.any(Object));
  });
});
