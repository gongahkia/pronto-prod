import type { AgentConfigDetail } from "@/lib/agent/config";
import { shouldUseMockAi } from "@/lib/env";
import {
  credentialEncryptionConfigured,
  envApiKeyForProvider,
} from "@/lib/llm/credentials";
import { azureOpenAiBaseUrl } from "@/lib/llm/azure";
import { FREE_LLM_PROVIDERS } from "@/lib/llm/free-providers";

export type ReadinessTone = "ready" | "warning" | "blocked";

export type ProviderReadinessCheck = {
  label: string;
  tone: ReadinessTone;
  detail: string;
};

export type ProviderReadiness = {
  provider: string;
  model: string;
  mockMode: boolean;
  hasCredential: boolean;
  credentialSource: "env" | "database" | "not-required" | "missing";
  encryptionConfigured: boolean;
  readyForLive: boolean;
  checks: ProviderReadinessCheck[];
};

export function getProviderReadiness(
  detail: AgentConfigDetail,
): ProviderReadiness {
  const provider = detail.config.response_provider;
  const model = detail.config.response_model;
  const mockMode = shouldUseMockAi();
  const freeProvider = FREE_LLM_PROVIDERS.find((candidate) => candidate.id === provider);
  const noCredentialRequired = provider === "mock" || freeProvider?.requiresApiKey === false;
  const hasEnvCredential = Boolean(envApiKeyForProvider(provider));
  const hasDatabaseCredential = detail.providerCredentialStatuses.some(
    (credential) => credential.provider === provider,
  );
  const hasCredential = noCredentialRequired || hasEnvCredential || hasDatabaseCredential;
  const providerRuntimeConfigured = provider !== "azure" || Boolean(azureOpenAiBaseUrl());
  const credentialSource = noCredentialRequired
    ? "not-required"
    : hasEnvCredential
      ? "env"
      : hasDatabaseCredential
        ? "database"
        : "missing";
  const readyForLive = !mockMode && provider !== "mock" && hasCredential && providerRuntimeConfigured;

  return {
    provider,
    model,
    mockMode,
    hasCredential,
    credentialSource,
    encryptionConfigured: credentialEncryptionConfigured(),
    readyForLive,
    checks: [
      {
        label: "Runtime mode",
        tone: mockMode ? "blocked" : "ready",
        detail: mockMode
          ? "PRONTO_USE_MOCK_AI=1 is forcing deterministic mock responses."
          : "PRONTO_USE_MOCK_AI is not forcing mock responses.",
      },
      {
        label: "Response provider",
        tone: provider === "mock" ? "blocked" : "ready",
        detail:
          provider === "mock"
            ? "Client tuning is still set to the mock provider."
            : `${provider} / ${model}`,
      },
      {
        label: "Credential",
        tone: hasCredential ? "ready" : "blocked",
        detail: credentialDetail(credentialSource),
      },
      ...(provider === "azure"
        ? [
            {
              label: "Azure endpoint",
              tone: providerRuntimeConfigured ? "ready" as const : "blocked" as const,
              detail: providerRuntimeConfigured
                ? "AZURE_OPENAI_BASE_URL or AZURE_OPENAI_ENDPOINT is configured."
                : "Set AZURE_OPENAI_BASE_URL to the Azure /openai/v1 endpoint, or set AZURE_OPENAI_ENDPOINT.",
            },
          ]
        : []),
      {
        label: "Provider test",
        tone: "warning",
        detail: "Run the synthetic provider test after changing provider, model, or key.",
      },
    ],
  };
}

function credentialDetail(source: ProviderReadiness["credentialSource"]): string {
  if (source === "env") {
    return "Credential is available from environment variables.";
  }
  if (source === "database") {
    return "Saved encrypted credential is available.";
  }
  if (source === "not-required") {
    return "Selected provider does not require a saved key.";
  }
  return "No environment or saved credential is available for this provider.";
}
