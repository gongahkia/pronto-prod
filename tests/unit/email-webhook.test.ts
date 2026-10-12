import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getChannel: vi.fn(), normalize: vi.fn(async () => [{ channelKind: "email", externalMessageId: "rfc-1" }]),
  process: vi.fn(async (messages: unknown[]) => ({ accepted: messages.length, duplicates: 0 })),
}));
vi.mock("@/lib/channels/email", async (original) => ({
  ...(await original<typeof import("@/lib/channels/email")>()),
  getEmailChannel: mocks.getChannel, normalizeEmailPayload: mocks.normalize,
}));
vi.mock("@/lib/channels/process", () => ({ processInboundMessages: mocks.process }));
import { POST } from "@/app/api/webhooks/email/[channelId]/route";

const context = { params: Promise.resolve({ channelId: "email-a" }) };
const channel = () => ({ id: "email-a", client_id: "tenant-a", kind: "email", status: "active",
  credentials: { provider: "postmark", fromAddress: "support@tenant-a.test" },
  settings: { webhookSecret: "tenant-secret" } });
function request(secret = "tenant-secret") {
  const body = JSON.stringify({ MessageID: "provider-1", From: "customer@example.test",
    To: "support@tenant-a.test", TextBody: "Hello" });
  return new Request("http://localhost:3000/api/webhooks/email/email-a", { method: "POST", body,
    headers: { "x-pronto-signature": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}` } });
}

describe("Customer email webhook safety", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.getChannel.mockResolvedValue(channel()); });
  it("passes the tenant support recipient to normalization after signature validation", async () => {
    expect((await POST(request(), context)).status).toBe(200);
    expect(mocks.normalize).toHaveBeenCalledWith("email-a", "postmark", expect.any(Object),
      "support@tenant-a.test");
  });
  it("rejects missing secrets, wrong signatures, disabled channels and local SMTP webhooks", async () => {
    expect((await POST(request("wrong"), context)).status).toBe(401);
    mocks.getChannel.mockResolvedValue({ ...channel(), settings: {} });
    expect((await POST(request(), context)).status).toBe(401);
    mocks.getChannel.mockResolvedValue({ ...channel(), status: "disabled" });
    expect((await POST(request(), context)).status).toBe(403);
    mocks.getChannel.mockResolvedValue({ ...channel(), credentials: { provider: "local_smtp", fromAddress: "support@tenant-a.test" } });
    expect((await POST(request(), context)).status).toBe(403);
    expect(mocks.process).not.toHaveBeenCalled();
  });
});
