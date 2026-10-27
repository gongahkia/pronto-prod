import { query } from "@/lib/db";
import { currentTurnClientId, assertTurnActive } from "@/lib/agent/turn-budget";
import { ProviderCooldownError, processingFailure } from "@/lib/agent/processing-error";
import { LlmConfigurationError, normalizeProviderError, ProviderRequestError } from "@/lib/llm/errors";

export async function withProviderRecovery<T>(provider: string, perform: () => Promise<T>): Promise<T> {
  const clientId = currentTurnClientId();
  if (clientId && provider !== "mock") {
    const cooldown = await query<{ failure_code: string; seconds: number }>(`select failure_code,
      greatest(1,ceil(extract(epoch from retry_after-now())))::int as seconds
      from provider_cooldowns where client_id=$1 and provider=$2 and retry_after>now()`, [clientId, provider]);
    const active = cooldown.rows[0];
    if (active) {
      if (["quota_exhausted", "authentication", "invalid_response"].includes(active.failure_code))
        throw new ProviderRequestError(provider, active.failure_code as "quota_exhausted" | "authentication" | "invalid_response");
      throw new ProviderCooldownError(provider, active.seconds);
    }
  }
  assertTurnActive();
  try { return await perform(); }
  catch (error) {
    // Cancellation/budget and configuration errors retain their classification.
    const classified = processingFailure(error);
    const failure = classified.code !== "processing_error" || error instanceof LlmConfigurationError
      ? error : normalizeProviderError(provider, error);
    if (clientId && failure instanceof ProviderRequestError && provider !== "mock") {
      const seconds = Math.max(failure.code === "quota_exhausted" ? 300 : failure.retryable ? 5 : 60,
        failure.retryAfterSeconds ?? 0);
      await query(`insert into provider_cooldowns(client_id,provider,failure_code,retry_after)
        values($1,$2,$3,now()+make_interval(secs=>$4::int)) on conflict(client_id,provider)
        do update set failure_code=excluded.failure_code,retry_after=greatest(provider_cooldowns.retry_after,excluded.retry_after)`,
        [clientId,provider,failure.code,seconds]);
    }
    throw failure;
  }
}
