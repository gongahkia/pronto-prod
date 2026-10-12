import { readFile } from "node:fs/promises";
import { getPool } from "../../src/lib/db";
import { normalizeParsedEmail, parseLocalRfc822 } from "../../src/lib/channels/email";
import { ingestInboundMessages } from "../../src/lib/channels/inbox";
import { PS_CAFE_DEMO_CLIENT_ID, PS_CAFE_DEMO_EMAIL_ID,
  PS_CAFE_DEMO_SUPPORT_ADDRESS } from "./ps-cafe-raffles-city";
import { verifyTestDatabase } from "../test-db-safety";

async function main() {
  await verifyTestDatabase();
  const filename = process.argv[2];
  if (!filename) throw new Error("Usage: pnpm demo:email:inject -- path/to/message.eml");
  const row = await getPool().query<{ status: string; external_id: string | null }>(
    "select status, external_id from channels where id = $1 and client_id = $2 and kind = 'email'",
    [PS_CAFE_DEMO_EMAIL_ID, PS_CAFE_DEMO_CLIENT_ID],
  );
  if (row.rows[0]?.status !== "active" || row.rows[0]?.external_id !== PS_CAFE_DEMO_SUPPORT_ADDRESS) {
    throw new Error("The isolated PS.Cafe demo support channel is not active.");
  }
  const parsed = await parseLocalRfc822(await readFile(filename));
  const messages = await normalizeParsedEmail(PS_CAFE_DEMO_EMAIL_ID, parsed,
    PS_CAFE_DEMO_SUPPORT_ADDRESS);
  if (messages.length !== 1) throw new Error("Email recipient, sender, or auto-response checks rejected this message.");
  const result = await ingestInboundMessages(messages);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : "Unknown error"}\n`);
  process.exitCode = 1; }).finally(async () => { await getPool().end(); });
