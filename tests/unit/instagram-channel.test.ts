import { describe, expect, it } from "vitest";
import { normalizeInstagramPayload } from "@/lib/channels/instagram";

describe("Instagram adapter", () => {
  it("normalizes text DMs", () => {
    const result = normalizeInstagramPayload("ig-channel", {
      entry: [
        {
          messaging: [
            {
              sender: { id: "ig-user" },
              message: { mid: "mid-ig", text: "hi" },
            },
          ],
        },
      ],
    });
    expect(result).toEqual([
      {
        channelId: "ig-channel",
        channelKind: "instagram",
        externalMessageId: "mid-ig",
        externalThreadId: "ig-user",
        customerHandle: "ig-user",
        text: "hi",
        unsupportedMediaType: undefined,
        raw: expect.any(Object),
      },
    ]);
  });

  it("skips echo messages", () => {
    const result = normalizeInstagramPayload("ig-channel", {
      entry: [
        {
          messaging: [
            {
              sender: { id: "ig-user" },
              message: { mid: "mid-ig", text: "echo", is_echo: true },
            },
          ],
        },
      ],
    });
    expect(result).toHaveLength(0);
  });

  it("flags story_mention as unsupported", () => {
    const [message] = normalizeInstagramPayload("ig-channel", {
      entry: [
        {
          messaging: [
            {
              sender: { id: "ig-user" },
              message: { mid: "mid-ig", story_mention: { id: "story-1" } },
            },
          ],
        },
      ],
    });
    expect(message.unsupportedMediaType).toBe("story_mention");
  });
});
