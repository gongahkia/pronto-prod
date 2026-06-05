import { describe, expect, it } from "vitest";
import { buildAgentPromptPreview } from "@/lib/agent/config";
import { getProviderReadiness } from "@/lib/agent/readiness";
import type { AgentConfig, Client } from "@/lib/types";

describe("agent config helpers", () => {
  it("builds a prompt preview with threshold, rules, and grounded prompt contract", () => {
    const preview = buildAgentPromptPreview(client(), config());

    expect(preview).toContain("Retrieval threshold: 0.6300");
    expect(preview).toContain('"sentimentTriggers"');
    expect(preview).toContain("Product contract:");
    expect(preview).toContain("North Bridge Nasi");
  });

  it("reports live provider readiness from runtime mode and credentials", () => {
    const readiness = getProviderReadiness({
      config: config(),
      retrievalThreshold: 0.63,
      escalationRulesJson: "{}",
      promptPreview: "preview",
      recentChanges: [],
      providerCredentialStatuses: [
        { provider: "openai", hasCredential: true, updatedAt: new Date() },
      ],
    });

    expect(readiness.provider).toBe("openai");
    expect(readiness.hasCredential).toBe(true);
    expect(readiness.credentialSource).toBe("database");
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
