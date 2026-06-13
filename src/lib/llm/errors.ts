export class LlmConfigurationError extends Error {
  constructor(
    public readonly provider: string,
    detail: string,
  ) {
    super(`${provider} LLM provider is not configured: ${detail}`);
    this.name = "LlmConfigurationError";
  }
}
