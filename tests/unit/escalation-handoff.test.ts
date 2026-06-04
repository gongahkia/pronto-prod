import { describe, expect, it } from "vitest";
import {
  DEFAULT_ESCALATION_HOLDING_REPLY,
  getEscalationHoldingReply,
  mergeEscalationHoldingReply,
  settingsWithoutEscalationHoldingReply,
} from "@/lib/channels/escalation-handoff";

describe("escalation handoff settings", () => {
  it("uses configured holding reply when present", () => {
    expect(
      getEscalationHoldingReply({
        escalationHoldingReply: "  We will get a human to help.  ",
      }),
    ).toBe("We will get a human to help.");
  });

  it("falls back when holding reply is missing or blank", () => {
    expect(getEscalationHoldingReply({})).toBe(DEFAULT_ESCALATION_HOLDING_REPLY);
    expect(getEscalationHoldingReply({ escalationHoldingReply: "   " })).toBe(
      DEFAULT_ESCALATION_HOLDING_REPLY,
    );
  });

  it("keeps other channel settings separate from holding reply", () => {
    expect(
      settingsWithoutEscalationHoldingReply({
        verifyToken: "verify-me",
        escalationHoldingReply: "Team will follow up.",
      }),
    ).toEqual({ verifyToken: "verify-me" });
  });

  it("merges trimmed holding reply into existing settings", () => {
    expect(
      mergeEscalationHoldingReply(
        { verifyToken: "verify-me", escalationHoldingReply: "Old" },
        " New reply ",
      ),
    ).toEqual({
      verifyToken: "verify-me",
      escalationHoldingReply: "New reply",
    });
  });
});
