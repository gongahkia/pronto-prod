import { describe, expect, it } from "vitest";
import { redactSecrets } from "@/lib/offboarding";

describe("offboarding export redaction", () => {
  it("redacts nested secret-like keys", () => {
    expect(
      redactSecrets({
        accessToken: "abc",
        nested: {
          appSecret: "def",
          safe: "visible",
        },
      }),
    ).toEqual({
      accessToken: "[redacted]",
      nested: {
        appSecret: "[redacted]",
        safe: "visible",
      },
    });
  });
});
