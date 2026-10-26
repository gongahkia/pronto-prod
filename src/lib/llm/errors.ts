export class LlmConfigurationError extends Error {
  constructor(
    public readonly provider: string,
    detail: string,
  ) {
    super(`${provider} LLM provider is not configured: ${detail}`);
    this.name = "LlmConfigurationError";
  }
}

export type ProviderFailure = "quota_exhausted" | "authentication" | "timeout" | "unavailable" | "invalid_response";
// Never retain provider payloads, headers, keys or prompts in an Error message.
export class ProviderRequestError extends Error {
  constructor(public readonly provider: string, public readonly code: ProviderFailure,
    public readonly status?: number) {
    super(`${provider}: ${code}${status ? ` (HTTP ${status})` : ""}. No provider or mock fallback was used.`);
    this.name = "ProviderRequestError";
  }
}
export function normalizeProviderError(provider: string, error: unknown): ProviderRequestError {
  if (error instanceof ProviderRequestError) return error;
  const status = error && typeof error === "object" && "status" in error ? Number(error.status) : undefined;
  // Some SDK subclasses leave Error.name as "Error"; inspect class/cause names,
  // never provider messages or payloads, to retain timeout attribution.
  const name = error instanceof Error ? [error, (error as Error & { cause?: unknown }).cause].filter(value => value instanceof Error)
    .map(value => `${value.name} ${value.constructor.name}`).join(" ") : "";
  return new ProviderRequestError(provider,
    status === 429 ? "quota_exhausted" : status === 401 || status === 403 ? "authentication" :
      /Abort|Timeout/.test(name) ? "timeout" : "unavailable", status && Number.isFinite(status) ? status : undefined);
}
