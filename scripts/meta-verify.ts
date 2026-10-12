import { getPool } from "../src/lib/db";
import { decryptChannelCredentials, usesLegacyPlaintextCredentials } from "../src/lib/channels/credentials";
import { runChannelHealthCheck } from "../src/lib/channels/health";
import { metaReadAuthorized, metaSandboxChannelIssue } from "../src/lib/channels/meta-verification";
import { verifyTestDatabase } from "./test-db-safety";
import type { Channel } from "../src/lib/types";

const [mode, channelId] = process.argv.slice(2);
if (!['inspect', 'read', 'report'].includes(mode) || !/^[0-9a-f-]{36}$/i.test(channelId ?? "")) {
  throw new Error("Usage: pnpm meta:verify <inspect|read|report> <isolated-test-channel-uuid>");
}
if (mode === "read" && !metaReadAuthorized(process.env)) {
  throw new Error("Live Graph reads require PRONTO_META_READ_APPROVED=1 and PRONTO_META_TEST_ACCOUNT=1.");
}

await verifyTestDatabase();
const db = getPool();
try {
  const result = await db.query<Channel>(
    "select * from channels where id = $1 and kind in ('whatsapp', 'instagram')", [channelId]);
  const stored = result.rows[0];
  if (!stored) throw new Error("Meta channel not found in the isolated test database.");
  const channel = decryptChannelCredentials(stored);
  const issue = metaSandboxChannelIssue(channel, usesLegacyPlaintextCredentials(stored));
  if (mode === "inspect") {
    console.log(JSON.stringify({ kind: channel.kind, status: channel.status,
      encryptedCredentials: Boolean(channel.encrypted_credentials),
      readyForReadOnlyGraphCheck: issue === null, issue }, null, 2));
  } else if (mode === "read") {
    if (issue) throw new Error(`Channel is not ready: ${issue}`);
    const health = await runChannelHealthCheck(channel);
    if (!health.checkedLive) throw new Error("Graph read was skipped; no provider verification occurred.");
    console.log(JSON.stringify({ kind: channel.kind, status: health.status,
      checkedLive: health.checkedLive, detail: health.detail }, null, 2));
    if (health.status !== "healthy") process.exitCode = 1;
  } else {
    const inbound = await db.query<{ status: string; count: string }>(
      `select status, count(*)::text as count from inbound_jobs
       where channel_id = $1 and client_id = $2 group by status order by status`,
      [channel.id, channel.client_id]);
    const outbound = await db.query<{ status: string; provider_status: string | null; count: string }>(
      `select status, metadata->>'providerStatus' as provider_status, count(*)::text as count
       from outbound_messages where channel_id = $1 and client_id = $2
       group by status, metadata->>'providerStatus' order by status, provider_status`,
      [channel.id, channel.client_id]);
    console.log(JSON.stringify({ kind: channel.kind, inboundJobs: inbound.rows,
      outboundMessages: outbound.rows,
      note: "Outbound sent means API acceptance; WhatsApp delivered/read webhook status is separate." }, null, 2));
  }
} finally {
  await db.end();
}
