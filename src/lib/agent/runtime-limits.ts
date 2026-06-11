export const DEFAULT_AGENT_MAX_OUTPUT_TOKENS = 800;
export const DEFAULT_AGENT_TIMEOUT_MS = 25_000;
export const DEFAULT_AGENT_MAX_PROMPT_TOKENS = 6_000;
export const DEFAULT_AGENT_MAX_CONVERSATION_TOKENS = 8_000;

export function agentMaxOutputTokens(): number {
  return positiveIntEnv("PRONTO_AGENT_MAX_OUTPUT_TOKENS", DEFAULT_AGENT_MAX_OUTPUT_TOKENS, 64, 4_000);
}

export function agentTimeoutMs(): number {
  return positiveIntEnv("PRONTO_AGENT_TIMEOUT_MS", DEFAULT_AGENT_TIMEOUT_MS, 1_000, 120_000);
}

export function agentMaxPromptTokens(): number {
  return positiveIntEnv("PRONTO_AGENT_MAX_PROMPT_TOKENS", DEFAULT_AGENT_MAX_PROMPT_TOKENS, 1_000, 64_000);
}

export function agentMaxConversationTokens(): number {
  return positiveIntEnv(
    "PRONTO_AGENT_MAX_CONVERSATION_TOKENS",
    DEFAULT_AGENT_MAX_CONVERSATION_TOKENS,
    1_000,
    128_000,
  );
}

function positiveIntEnv(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(value)));
}

