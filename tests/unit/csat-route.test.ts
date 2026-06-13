import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordCsatResponse: vi.fn(),
  checkRateLimit: vi.fn(),
  logWarn: vi.fn(),
}));

vi.mock("@/lib/csat", () => ({
  recordCsatResponse: mocks.recordCsatResponse,
}));

vi.mock("@/lib/logger", () => ({
  logWarn: mocks.logWarn,
}));

vi.mock("@/lib/http-limits", () => ({
  checkRateLimit: mocks.checkRateLimit,
}));

import { POST } from "@/app/api/csat/route";

describe("CSAT route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recordCsatResponse.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 9,
      retryAfterSeconds: 0,
    });
  });

  it("records a score and redirects to the thank-you state", async () => {
    const form = new FormData();
    form.set("conversationId", "conversation-1");
    form.set("messageId", "message-1");
    form.set("score", "5");
    form.set("comment", "Helpful");

    const response = await POST(formRequest(form));

    expect(mocks.recordCsatResponse).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      messageId: "message-1",
      score: 5,
      comment: "Helpful",
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/csat/conversation-1?submitted=1",
    );
  });

  it("rejects missing or out-of-range scores", async () => {
    const form = new FormData();
    form.set("conversationId", "conversation-1");
    form.set("score", "6");

    const response = await POST(formRequest(form));

    expect(response.status).toBe(400);
    expect(mocks.logWarn).toHaveBeenCalledWith("csat.invalid_submission", {
      conversationId: "conversation-1",
      score: 6,
    });
    expect(mocks.recordCsatResponse).not.toHaveBeenCalled();
  });
});

function formRequest(form: FormData): Request {
  return new Request("http://localhost/api/csat", {
    method: "POST",
    headers: {
      host: "localhost",
      origin: "http://localhost",
    },
    body: form,
  });
}
