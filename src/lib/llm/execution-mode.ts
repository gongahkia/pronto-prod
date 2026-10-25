import { AsyncLocalStorage } from "node:async_hooks";

export type AiExecutionMode = "real" | "mock";
const execution = new AsyncLocalStorage<AiExecutionMode>();

// Per-job scope: never mutate process-wide AI settings in a shared worker.
export function withAiExecutionMode<T>(mode: AiExecutionMode, run: () => T): T {
  return execution.run(mode, run);
}
export function aiExecutionMode(): AiExecutionMode | undefined {
  return execution.getStore();
}
