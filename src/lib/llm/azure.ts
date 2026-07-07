import { OpenAiProvider } from "@/lib/llm/openai";

export class AzureOpenAiProvider extends OpenAiProvider {
  constructor() {
    super({
      provider: "azure",
      baseURL: azureOpenAiBaseUrl,
      responseModel: (model) => azureResponseDeployment() ?? model,
      embeddingModel: (model) => azureEmbeddingDeployment() ?? model,
      reasoningEffort: azureReasoningEffort,
    });
  }
}

function azureOpenAiBaseUrl(): string | undefined {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.trim();
  if (!endpoint) {
    return undefined;
  }
  const normalized = endpoint.replace(/\/+$/, "");
  if (normalized.endsWith("/openai/v1")) {
    return `${normalized}/`;
  }
  return `${normalized}/openai/v1/`;
}

function azureResponseDeployment(): string | undefined {
  return (
    process.env.AZURE_OPENAI_RESPONSE_DEPLOYMENT?.trim() ||
    process.env.AZURE_OPENAI_DEPLOYMENT?.trim() ||
    undefined
  );
}

function azureEmbeddingDeployment(): string | undefined {
  return process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT?.trim() || undefined;
}

function azureReasoningEffort(): "minimal" | "low" | "medium" | "high" | undefined {
  const value = process.env.AZURE_OPENAI_REASONING_EFFORT?.trim() || "minimal";
  if (value === "minimal" || value === "low" || value === "medium" || value === "high") {
    return value;
  }
  return "minimal";
}
