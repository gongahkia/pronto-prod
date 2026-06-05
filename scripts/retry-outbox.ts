import { flushRetryableOutboundMessages } from "../src/lib/channels/outbox";
import { logError, logInfo } from "../src/lib/logger";

async function main() {
  const result = await flushRetryableOutboundMessages({
    requestId: `outbox-retry-${Date.now()}`,
    limit: Number(process.env.PRONTO_OUTBOX_RETRY_LIMIT ?? 25),
    staleSendingMinutes: Number(
      process.env.PRONTO_OUTBOX_STALE_SENDING_MINUTES ?? 10,
    ),
    maxAttempts: Number(process.env.PRONTO_OUTBOX_MAX_ATTEMPTS ?? 5),
  });

  logInfo("outbox.retry_worker_finished", result);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  logError("outbox.retry_worker_failed", { error });
  process.exitCode = 1;
});
