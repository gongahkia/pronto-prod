import { describe, expect, it } from "vitest";
import {
  classifyAssistantIntent,
  extractAssistantPageEntities,
  rankAssistantContextRecords,
  redactAssistantContextValue,
} from "@/lib/assistant/context";
import type { AssistantContextRecord } from "@/lib/assistant/types";

describe("assistant context redaction", () => {
  it("redacts secrets before records can be sent to an LLM", () => {
    const redacted = redactAssistantContextValue({
      settings: {
        webhookSecret: "secret-value",
        nested: {
          accessToken: "token-value",
          visibleName: "WhatsApp",
        },
      },
      credentials: {
        apiKey: "key-value",
        phoneNumberId: "123",
      },
    });

    expect(redacted).toEqual({
      settings: {
        webhookSecret: "[redacted]",
        nested: {
          accessToken: "[redacted]",
          visibleName: "WhatsApp",
        },
      },
      credentials: "[redacted]",
    });
  });
});

describe("assistant intent routing", () => {
  it("detects focused conversation pages before broad prompt categories", () => {
    expect(
      classifyAssistantIntent(
        "What needs attention and why did this happen?",
        "/operator/clients/client-1/conversations/conversation-1",
      ),
    ).toBe("conversation_detail");
  });

  it("routes common operator and client prompts to useful context priorities", () => {
    expect(classifyAssistantIntent("What needs action today?", "/operator")).toBe(
      "attention",
    );
    expect(classifyAssistantIntent("Why did this fail?", "/operator")).toBe(
      "causal_debug",
    );
    expect(classifyAssistantIntent("What should we update in knowledge?", "/client")).toBe(
      "knowledge_update",
    );
    expect(classifyAssistantIntent("How is this client doing on cost and CSAT?", "/operator")).toBe(
      "client_health",
    );
  });
});

describe("assistant page entity extraction", () => {
  it("extracts operator client and conversation ids from nested pages", () => {
    expect(
      extractAssistantPageEntities(
        "/operator/clients/client-1/conversations/conversation-1?tab=messages",
      ),
    ).toEqual({
      clientId: "client-1",
      conversationId: "conversation-1",
    });
  });

  it("extracts client conversation ids without trusting a client id from the URL", () => {
    expect(extractAssistantPageEntities("/client/conversations/conversation-2")).toEqual({
      clientId: null,
      conversationId: "conversation-2",
    });
  });
});

describe("assistant context ranking", () => {
  it("puts focused conversation records ahead of broad records", () => {
    const ranked = rankAssistantContextRecords(
      [
        contextRecord("client_metrics", "client-1", "Metrics", { clientId: "client-1" }),
        contextRecord("focused_message", "message-1", "Message", {
          conversationId: "conversation-1",
        }),
        contextRecord("operational_alert", "alert-1", "Alert", { clientId: "client-1" }),
        contextRecord("focused_conversation", "conversation-1", "Conversation", {
          id: "conversation-1",
        }),
      ],
      { intent: "conversation_detail", focusedConversationId: "conversation-1" },
    );

    expect(ranked.map((record) => record.type).slice(0, 2)).toEqual([
      "focused_conversation",
      "focused_message",
    ]);
  });

  it("prioritizes alert and escalation context for attention prompts", () => {
    const ranked = rankAssistantContextRecords(
      [
        contextRecord("knowledge_source", "source-1", "Source", {}),
        contextRecord("client_health", "client-1", "Health", {}),
        contextRecord("active_escalation", "escalation-1", "Escalation", {}),
        contextRecord("operational_alert", "alert-1", "Alert", {}),
      ],
      { intent: "attention" },
    );

    expect(ranked.map((record) => record.type).slice(0, 3)).toEqual([
      "active_escalation",
      "operational_alert",
      "client_health",
    ]);
  });
});

function contextRecord(
  type: string,
  id: string,
  label: string,
  data: Record<string, unknown>,
): AssistantContextRecord {
  return { type, id, label, data };
}
