export class ProviderSendError extends Error {
  readonly retryable: boolean;
  readonly ambiguous: boolean;
  readonly statusCode: number;

  constructor(provider: string, statusCode: number) {
    super(`${provider} send returned HTTP ${statusCode}.`);
    this.name = "ProviderSendError";
    this.statusCode = statusCode;
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
