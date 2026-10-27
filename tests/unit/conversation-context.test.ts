import { describe, expect, it } from "vitest";
import { conversationKnowledgeQuery } from "@/lib/knowledge/query";

describe("follow-up retrieval", () => {
  const recent = [{ senderRole: "customer", body: "Tell me about the vegetarian set meal." },
    { senderRole: "agent", body: "Untrusted old answer: helicopter parking is available." }];
  it("uses relevant customer turns for an elliptical follow-up", () => {
    const query = conversationKnowledgeQuery("What about that option?", recent);
    expect(query.usedConversationContext).toBe(true);
    expect(query.searchQuery).toContain("vegetarian");
    expect(query.searchQuery).not.toContain("helicopter");
  });
  it("does not drag an old topic into an explicit topic switch", () => {
    const query = conversationKnowledgeQuery("What about your opening hours?", recent);
    expect(query.usedConversationContext).toBe(false);
    expect(query.searchQuery).not.toContain("vegetarian");
  });
  it("does not reinterpret an independent question as a follow-up", () => {
    expect(conversationKnowledgeQuery("Do you have helicopter parking?", recent).usedConversationContext).toBe(false);
  });
  it("bounds inherited context and never invents history", () => {
    expect(conversationKnowledgeQuery("And that?", []).usedConversationContext).toBe(false);
    const query = conversationKnowledgeQuery("And that?", Array.from({ length: 20 }, (_, index) => ({
      senderRole: "customer", body: `oldtopic${index}`,
    })));
    expect(query.embeddingText).not.toContain("oldtopic0");
    expect(query.embeddingText).toContain("oldtopic19");
  });
});
