import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import {
  normalizeMessengerPayload,
  verifyMessengerSignature,
} from "@/lib/channels/messenger";

describe("Messenger adapter", () => {
  it("normalizes a text message", () => {
    const payload = {
      entry: [
        {
          messaging: [
            {
              sender: { id: "user-1" },
              message: { mid: "mid-1", text: "hello" },
            },
          ],
        },
      ],
    };
    const result = normalizeMessengerPayload("channel-1", payload);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      channelId: "channel-1",
      channelKind: "messenger",
      externalMessageId: "mid-1",
      externalThreadId: "user-1",
      text: "hello",
    });
  });

  it("flags unsupported attachments", () => {
    const payload = {
      entry: [
        {
          messaging: [
            {
              sender: { id: "user-2" },
              message: { mid: "mid-2", attachments: [{ type: "image" }] },
            },
          ],
        },
      ],
    };
    const [message] = normalizeMessengerPayload("channel-1", payload);
    expect(message.unsupportedMediaType).toBe("image");
    expect(message.text).toContain("Unsupported");
  });

  it("verifies sha256 signatures", () => {
    const secret = "test-secret";
    const body = JSON.stringify({ entry: [] });
    const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    expect(verifyMessengerSignature(body, signature, secret)).toBe(true);
    expect(verifyMessengerSignature(body, "sha256=deadbeef", secret)).toBe(false);
  });
});
