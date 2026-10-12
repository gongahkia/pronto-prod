export class ProviderSendError extends Error {
  readonly retryable: boolean;
  readonly ambiguous: boolean;
  readonly statusCode: number;

  readonly providerCode?: number;

  constructor(provider: string, statusCode: number, providerCode?: number) {
    super(provider === "WhatsApp" && providerCode === 131031
      ? "WhatsApp business account restricted (Meta code 131031); review WhatsApp Manager."
      : `${provider} send returned HTTP ${statusCode}${providerCode ? ` (provider code ${providerCode})` : ""}.`);
    this.name = "ProviderSendError";
    this.statusCode = statusCode;
    this.providerCode = providerCode;
    this.retryable = statusCode === 429;
    this.ambiguous = statusCode === 408 || statusCode >= 500;
  }
}

export class AmbiguousProviderAcceptanceError extends Error {
  constructor(provider: string) {
    super(`${provider} acceptance could not be confirmed; manual reconciliation required.`);
    this.name = "AmbiguousProviderAcceptanceError";
  }
}

export class ChannelPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChannelPolicyError";
  }
}
