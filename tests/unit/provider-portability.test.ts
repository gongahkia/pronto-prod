import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeProviderName } from "@/lib/llm";
import { azureOpenAiBaseUrl } from "@/lib/llm/azure";
import { failoverModelChoice, selectModel } from "@/lib/llm/catalog";
import { envApiKeyForProvider } from "@/lib/llm/credentials";
import { parseJsonObject } from "@/lib/llm/prompt";

describe("provider portability", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("normalizes unknown providers back to OpenAI", () => {
    expect(normalizeProviderName("anthropic")).toBe("anthropic");
    expect(normalizeProviderName("azure")).toBe("azure");
    expect(normalizeProviderName("mock")).toBe("mock");
    expect(normalizeProviderName("other")).toBe("openai");
    expect(normalizeProviderName(undefined)).toBe("openai");
  });

  it("extracts JSON from provider text responses", () => {
    expect(parseJsonObject('Here is the JSON: {"action":"escalate"}')).toEqual({
      action: "escalate",
    });
  });

  it("selects per-task provider model defaults and cost labels", () => {
    expect(selectModel({ provider: "anthropic", task: "routing" })).toMatchObject({
      provider: "anthropic",
      model: "claude-haiku-4-5",
      costLabel: "low",
    });
    expect(selectModel({ provider: "openai", task: "agent_answer" })).toMatchObject({
      provider: "openai",
      costLabel: "standard",
    });
    expect(selectModel({ provider: "azure", task: "agent_answer" })).toMatchObject({
      provider: "azure",
      costLabel: "standard",
    });
    expect(failoverModelChoice()).toMatchObject({
      provider: "openai",
      costLabel: "premium",
    });
  });

  it("uses Azure-specific env vars and endpoint normalization", () => {
    vi.stubEnv("AZURE_OPENAI_API_KEY", "azure-key");
    vi.stubEnv("AZURE_OPENAI_ENDPOINT", "https://pronto-resource.openai.azure.com");
    vi.stubEnv("AZURE_OPENAI_RESPONSE_MODEL", "pronto-gpt-deployment");

    expect(envApiKeyForProvider("azure")).toBe("azure-key");
    expect(azureOpenAiBaseUrl()).toBe("https://pronto-resource.openai.azure.com/openai/v1/");
    expect(selectModel({ provider: "azure", task: "agent_answer" })).toMatchObject({
      provider: "azure",
      model: "pronto-gpt-deployment",
    });
  });
});
