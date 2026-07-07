import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConversationReviewPanel } from "@/components/conversation-review-panel";
import type { ClientConversationTriage } from "@/lib/dashboard";
import type { Message } from "@/lib/types";

vi.mock("next/image", () => ({
  default: () => null,
}));

const conversation: ClientConversationTriage = {
  id: "conversation_1",
  client_id: "client_1",
  channel_id: "channel_1",
  external_thread_id: "thread_1",
  customer_name: "Alicia",
  customer_handle: "@alicia",
  status: "active",
  last_message_at: new Date("2026-07-06T03:44:00Z"),
  created_at: new Date("2026-07-06T03:43:00Z"),
  deleted_at: null,
  last_message: "Are you open this Sunday?",
  last_sender_role: "customer",
  channel_kind: "whatsapp",
  active_escalation_id: null,
  active_escalation_status: null,
  active_escalation_reason_code: null,
};

const messages: Message[] = [
  {
    id: "message_1",
    conversation_id: "conversation_1",
    client_id: "client_1",
    channel_id: "channel_1",
    external_message_id: "external_1",
    sender_role: "customer",
    body: "Are you open this Sunday?",
    metadata: {},
    created_at: new Date("2026-07-06T03:44:00Z"),
  },
];

describe("ConversationReviewPanel", () => {
  it("renders the shared channel-specific conversation view", () => {
    render(<ConversationReviewPanel conversation={conversation} messages={messages} />);

    expect(screen.getByRole("heading", { name: "Conversation review" })).toBeTruthy();
    expect(screen.getByText("Alicia")).toBeTruthy();
    expect(screen.getByText("whatsapp - online")).toBeTruthy();
    expect(screen.getByText("Are you open this Sunday?")).toBeTruthy();
  });

  it("renders the empty state", () => {
    render(<ConversationReviewPanel conversation={null} messages={[]} />);

    expect(screen.getByText("No conversations yet.")).toBeTruthy();
  });
});
