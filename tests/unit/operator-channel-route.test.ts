import { describe, expect, it } from "vitest";
import { parseJsonObject } from "@/app/api/operator/channels/route";

describe("operator channel form parsing", () => {
  it("accepts JSON objects", () => {
    expect(parseJsonObject('{"verifyToken":"abc"}', "settings")).toEqual({
      ok: true,
      value: { verifyToken: "abc" },
    });
  });

  it("rejects invalid JSON", () => {
    expect(parseJsonObject("{bad", "settings")).toEqual({
      ok: false,
      error: "Channel settings must be valid JSON.",
    });
  });

  it("rejects non-object JSON", () => {
    expect(parseJsonObject("[]", "credentials")).toEqual({
      ok: false,
      error: "Channel credentials must be a JSON object.",
    });
  });
});
