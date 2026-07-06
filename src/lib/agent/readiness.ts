import type { AgentConfigDetail } from "@/lib/agent/config";
import { shouldUseMockAi } from "@/lib/env";
import {
  credentialEncryptionConfigured,
  envApiKeyForProvider,
} from "@/lib/llm/credentials";

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
  const noCredentialRequired = provider === "mock";
  const hasEnvCredential = Boolean(envApiKeyForProvider(provider));
  const hasDatabaseCredential = detail.providerCredentialStatuses.some(
    (credential) => credential.provider === provider && credential.hasCredential,
  );
  const hasCredential = noCredentialRequired || hasEnvCredential || hasDatabaseCredential;
  const credentialSource = noCredentialRequired
    ? "not-required"
    : hasEnvCredential
      ? "env"
      : hasDatabaseCredential
        ? "database"
        : "missing";
  const readyForLive = !mockMode && provider !== "mock" && hasCredential;

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
