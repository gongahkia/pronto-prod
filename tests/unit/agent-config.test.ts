import { describe, expect, it } from "vitest";
import { buildAgentPromptPreview } from "@/lib/agent/config";
import type { AgentConfig, Client } from "@/lib/types";

describe("agent config helpers", () => {
  it("builds a prompt preview with threshold, rules, and grounded prompt contract", () => {
    const preview = buildAgentPromptPreview(client(), config());

    expect(preview).toContain("Retrieval threshold: 0.6300");
    expect(preview).toContain('"sentimentTriggers"');
    expect(preview).toContain("Product contract:");
    expect(preview).toContain("North Bridge Nasi");
  });
});

function client(): Client {
  return {
    id: "client-1",
    name: "North Bridge Nasi",
    slug: "north-bridge-nasi",
    vertical: "fnb",
    plan_tier: "pilot",
    status: "pilot",
    business_profile: {},
    brand_voice: "Warm and concise.",
    created_at: new Date(),
    updated_at: new Date(),
  };
}

function config(): AgentConfig {
  return {
    id: "config-1",
    client_id: "client-1",
    response_provider: "openai",
    response_model: "gpt-5.5",
    embedding_provider: "openai",
    embedding_model: "text-embedding-3-small",
    retrieval_threshold: "0.6300",
    prompt_preamble: "Answer from verified source material.",
    escalation_rules: { sentimentTriggers: ["annoyed"] },
  };
}
