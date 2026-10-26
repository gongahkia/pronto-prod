export type ProviderCredentialStatus = {
  provider: string;
  hasCredential: boolean;
  updatedAt: Date | null;
};

export async function listProviderCredentialStatuses(): Promise<ProviderCredentialStatus[]> {
  return [
    { provider: "gemini", hasCredential: Boolean(envApiKeyForProvider("gemini")), updatedAt: null },
    { provider: "groq", hasCredential: Boolean(envApiKeyForProvider("groq")), updatedAt: null },
    {
      provider: "openai",
      hasCredential: Boolean(envApiKeyForProvider("openai")),
      updatedAt: null,
    },
    {
      provider: "azure",
      hasCredential: Boolean(envApiKeyForProvider("azure")),
      updatedAt: null,
    },
    {
      provider: "anthropic",
      hasCredential: Boolean(envApiKeyForProvider("anthropic")),
      updatedAt: null,
    },
  ];
}

export function credentialEncryptionConfigured(): boolean {
  return false;
}

export async function resolveProviderApiKey(
  provider: string | null | undefined,
): Promise<string | null> {
  return envApiKeyForProvider(provider);
}

export function envApiKeyForProvider(provider: string | null | undefined): string | null {
  if (provider === "gemini") return process.env.GEMINI_API_KEY?.trim() || null;
  if (provider === "groq") return process.env.GROQ_API_KEY?.trim() || null;
  if (provider === "openai") {
    return process.env.OPENAI_API_KEY?.trim() || null;
  }
  if (provider === "azure") {
    return process.env.AZURE_OPENAI_API_KEY?.trim() || null;
  }
  if (provider === "anthropic") {
    return process.env.ANTHROPIC_API_KEY?.trim() || null;
  }
  return null;
}
