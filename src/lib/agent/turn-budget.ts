import { AsyncLocalStorage } from "node:async_hooks";
import type { LlmTokenUsage } from "@/lib/llm/types";

export class TurnBudgetExceededError extends Error {
  constructor(public readonly reason: "deadline" | "calls" | "tokens") {
    super(`Agent turn ${reason} budget exceeded.`); this.name = "TurnBudgetExceededError";
  }
}
type Step = { stage: string; reservedTokens: number; actualTokens?: number; durationMs?: number };
type Budget = { clientId?: string; deadline: number; started: number; calls: number; maxCalls: number;
  tokens: number; maxTokens: number; controller: AbortController; closed: boolean; steps: Step[] };
const storage = new AsyncLocalStorage<Budget>();
const bounded = (name: string, fallback: number, min: number, max: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= min ? Math.min(max, Math.floor(value)) : fallback;
};

export function assertTurnActive(): void {
  const state = storage.getStore();
  if (state && (state.closed || state.controller.signal.aborted || Date.now() >= state.deadline))
    throw new TurnBudgetExceededError("deadline");
}
export function currentTurnSignal(): AbortSignal | undefined { return storage.getStore()?.controller.signal; }
export function currentTurnClientId(): string | undefined { return storage.getStore()?.clientId; }
export function turnBudgetSnapshot() {
  const state = storage.getStore();
  return state ? { calls: state.calls, maxCalls: state.maxCalls, consumedTokens: state.tokens,
    maxTokens: state.maxTokens, elapsedMs: Date.now() - state.started, steps: state.steps.map(step => ({ ...step })) } : undefined;
}

export async function withAgentTurn<T>(run: () => Promise<T>, options: {
  clientId?: string; timeoutMs?: number; maxCalls?: number; maxTokens?: number;
} = {}): Promise<T> {
  const existing = storage.getStore();
  if (existing) {
    if (existing.clientId && options.clientId && existing.clientId !== options.clientId) throw new Error("Agent turn tenant mismatch.");
    assertTurnActive(); return run();
  }
  const started = Date.now();
  // Always leave recovery time inside the inbox's 120-second lease.
  const timeout = Math.min(90000, Math.max(1, options.timeoutMs ?? bounded("PRONTO_AGENT_TURN_TIMEOUT_MS", 45000, 1000, 90000)));
  const state: Budget = { clientId: options.clientId, started, deadline: started + timeout, calls: 0,
    maxCalls: options.maxCalls ?? bounded("PRONTO_AGENT_TURN_MAX_CALLS", 3, 1, 6), tokens: 0,
    maxTokens: options.maxTokens ?? bounded("PRONTO_AGENT_TURN_MAX_TOKENS", 12000, 1000, 64000),
    controller: new AbortController(), closed: false, steps: [] };
  return storage.run(state, async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([run(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => { state.controller.abort(); reject(new TurnBudgetExceededError("deadline")); }, timeout);
      })]);
    } finally { clearTimeout(timer); state.closed = true; state.controller.abort(); }
  });
}

export async function runTurnModelCall<T>(stage: string, inputTokens: number, outputTokens: number,
  perform: (control: { signal?: AbortSignal; timeoutMs?: number }) => Promise<T>,
): Promise<T> {
  const state = storage.getStore();
  if (!state) return perform({});
  assertTurnActive();
  if (state.calls >= state.maxCalls) throw new TurnBudgetExceededError("calls");
  const reserve = Math.max(0, inputTokens) + Math.max(0, outputTokens);
  if (state.tokens + reserve > state.maxTokens) throw new TurnBudgetExceededError("tokens");
  state.calls++; state.tokens += reserve;
  const started = Date.now(), step: Step = { stage, reservedTokens: reserve }; state.steps.push(step);
  try {
    const result = await perform({ signal: state.controller.signal, timeoutMs: Math.max(1, state.deadline - Date.now()) });
    assertTurnActive();
    const usage = result && typeof result === "object" && "usage" in result ? result.usage as LlmTokenUsage | undefined : undefined;
    if (usage && Number.isFinite(usage.inputTokens) && Number.isFinite(usage.outputTokens) && usage.inputTokens >= 0 && usage.outputTokens >= 0) {
      step.actualTokens = usage.inputTokens + usage.outputTokens;
      state.tokens += step.actualTokens - reserve;
      if (state.tokens > state.maxTokens) throw new TurnBudgetExceededError("tokens");
    }
    return result;
  } finally { step.durationMs = Date.now() - started; }
}
