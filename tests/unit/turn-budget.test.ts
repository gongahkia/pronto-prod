import { afterEach, describe, expect, it, vi } from "vitest";
import { assertTurnActive, runTurnModelCall, turnBudgetSnapshot, TurnBudgetExceededError, withAgentTurn } from "@/lib/agent/turn-budget";

afterEach(() => vi.useRealTimers());
describe("one budget for a complete agent turn", () => {
  it("shares call counts across nested extraction, answer and handoff scopes", async () => {
    let calls = 0;
    await withAgentTurn(async () => {
      await runTurnModelCall("extract", 100, 50, async () => { calls++; return {}; });
      await withAgentTurn(() => runTurnModelCall("answer", 100, 50, async () => { calls++; return {}; }));
      await expect(runTurnModelCall("intake", 100, 50, async () => { calls++; return {}; }))
        .rejects.toMatchObject({ reason: "calls" });
      expect(turnBudgetSnapshot()?.calls).toBe(2);
    }, { maxCalls: 2 });
    expect(calls).toBe(2);
  });
  it("reserves output, uses provider totals without adding reasoning tokens twice, and blocks over-budget work", async () => {
    await withAgentTurn(async () => {
      await runTurnModelCall("answer", 100, 100, async () => ({ usage: { inputTokens: 100, outputTokens: 100, reasoningTokens: 80 } }));
      await expect(runTurnModelCall("intake", 100, 100, async () => ({}))).rejects.toMatchObject({ reason: "tokens" });
      expect(turnBudgetSnapshot()?.consumedTokens).toBe(200);
    }, { maxTokens: 250 });
  });
  it("rejects a response when reported usage exceeds the remaining token budget", async () => {
    await expect(withAgentTurn(() => runTurnModelCall("answer", 10, 10, async () => ({usage:{inputTokens:200,outputTokens:100}})),
      {maxTokens:250})).rejects.toMatchObject({reason:"tokens"});
  });
  it("cancels overdue work and prevents a late result from reaching persistence", async () => {
    vi.useFakeTimers();
    let finish!: (value: object) => void, writes = 0, signal: AbortSignal | undefined;
    const work = withAgentTurn(async () => {
      await runTurnModelCall("answer", 1, 1, control => { signal = control.signal; return new Promise(resolve => { finish = resolve; }); });
      assertTurnActive(); writes++;
    }, { timeoutMs: 10 });
    const expectation = expect(work).rejects.toBeInstanceOf(TurnBudgetExceededError);
    await vi.advanceTimersByTimeAsync(11); await expectation;
    expect(signal?.aborted).toBe(true);
    finish({}); await vi.advanceTimersByTimeAsync(0);
    expect(writes).toBe(0);
  });
  it("passes only the remaining deadline to a later model call", async () => {
    vi.useFakeTimers();
    await withAgentTurn(async () => {
      await vi.advanceTimersByTimeAsync(60);
      await runTurnModelCall("answer", 1, 1, async control => { expect(control.timeoutMs).toBe(40); return {}; });
    }, { timeoutMs: 100 });
  });
  it("keeps separate turns independent and refuses a nested tenant change", async () => {
    await withAgentTurn(async () => {
      await expect(withAgentTurn(async () => {}, { clientId: "other" })).rejects.toThrow("tenant mismatch");
    }, { clientId: "first" });
    await withAgentTurn(async () => { expect(turnBudgetSnapshot()?.calls).toBe(0); }, { clientId: "other" });
  });
});
