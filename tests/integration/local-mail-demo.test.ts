import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import http from "node:http";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPool } from "@/lib/db";
import { normalizeParsedEmail, parseLocalRfc822 } from "@/lib/channels/email";
import { ingestInboundMessages } from "@/lib/channels/inbox";
import { processInboundJob } from "@/lib/channels/inbox-worker";
import { flushRetryableOutboundMessages } from "@/lib/channels/outbox";
import { PS_CAFE_DEMO_CLIENT_ID, PS_CAFE_DEMO_EMAIL_ID, PS_CAFE_DEMO_SUPPORT_ADDRESS,
  PS_CAFE_CHOPE_URL, removePsCafeDemo, setupPsCafeDemo } from "../../scripts/demo/ps-cafe-raffles-city";

// Mailpit is local infrastructure; ordinary CI does not start it or open SMTP sockets.
const localMailDescribe = process.env.PRONTO_RUN_DB_TESTS === "1" &&
  process.env.PRONTO_TEST_LOCAL_MAIL === "1" && process.env.PRONTO_LOCAL_EMAIL_ENABLED === "1"
  ? describe : describe.skip;

localMailDescribe("PS.Cafe customer support email through Mailpit", () => {
  beforeEach(async () => { await removePsCafeDemo(); await setupPsCafeDemo(); });
  afterEach(async () => { vi.unstubAllEnvs(); await removePsCafeDemo(); });
  afterAll(async () => { await getPool().end(); });

  async function sendRaw(raw: Buffer) {
    const parsed = await parseLocalRfc822(raw);
    const normalized = await normalizeParsedEmail(PS_CAFE_DEMO_EMAIL_ID, parsed, PS_CAFE_DEMO_SUPPORT_ADDRESS);
    expect(normalized).toHaveLength(1);
    return ingestInboundMessages(normalized);
  }

  async function mailpitMessages(): Promise<Array<{ Subject: string; MessageID: string; To: Array<{ Address: string }> }>> {
    const body = await new Promise<string>((resolve, reject) => {
      http.get("http://127.0.0.1:8025/api/v1/messages", (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      }).on("error", reject);
    });
    return (JSON.parse(body) as { messages: Array<{ Subject: string; MessageID: string; To: Array<{ Address: string }> }> }).messages;
  }

  it("ingests RFC822, answers from tenant RAG, queues and delivers via real loopback SMTP", async () => {
    const fixture = await readFile("tests/fixtures/ps-cafe-hours.eml");
    const raw = Buffer.from(fixture.toString("utf8").replace("ps-cafe-hours-1", `ps-cafe-hours-${randomUUID()}`));
    const first = await sendRaw(raw);
    const second = await sendRaw(raw);
    expect(first.accepted).toBe(1);
    expect(second.duplicates).toBe(1);
    const job = await getPool().query<{ id: string }>(
      "select id from inbound_jobs where client_id = $1 and channel_id = $2", [PS_CAFE_DEMO_CLIENT_ID, PS_CAFE_DEMO_EMAIL_ID]);
    expect(job.rows).toHaveLength(1);
    expect(await processInboundJob({ jobId: job.rows[0].id })).toMatchObject({ outcome: "answered" });
    const queued = await getPool().query<{ body: string; status: string }>(
      "select body, status from outbound_messages where client_id = $1 and channel_id = $2",
      [PS_CAFE_DEMO_CLIENT_ID, PS_CAFE_DEMO_EMAIL_ID]);
    expect(queued.rows[0].body).toContain("10:00pm");
    await flushRetryableOutboundMessages();
    const sent = (await mailpitMessages()).find((message) => message.To.some((to) =>
      to.Address === "customer@example.test"));
    expect(sent).toBeTruthy();
    const reply = Buffer.from(`From: customer@example.test\r\nTo: ${PS_CAFE_DEMO_SUPPORT_ADDRESS}\r\n` +
      `Message-ID: <reply-${randomUUID()}@example.test>\r\nIn-Reply-To: <${sent?.MessageID}>\r\n` +
      `Subject: Re: Opening hours\r\n\r\nThanks, and what about tomorrow?`);
    await sendRaw(reply);
    const conversations = await getPool().query<{ count: string }>(
      "select count(*) from conversations where client_id = $1 and channel_id = $2",
      [PS_CAFE_DEMO_CLIENT_ID, PS_CAFE_DEMO_EMAIL_ID]);
    expect(conversations.rows[0].count).toBe("1");
  });

  it("threads a same-customer reply and isolates a different sender", async () => {
    const id = randomUUID();
    const raw = (sender: string, mid: string, replyTo?: string) => Buffer.from(
      `From: ${sender}\r\nTo: ${PS_CAFE_DEMO_SUPPORT_ADDRESS}\r\nMessage-ID: <${mid}@example.test>\r\n` +
      (replyTo ? `In-Reply-To: <${replyTo}@example.test>\r\n` : "") +
      `Subject: Hours\r\n\r\nWhen do you close?`);
    await sendRaw(raw("alice@example.test", id));
    await sendRaw(raw("alice@example.test", `${id}-reply`, id));
    await sendRaw(raw("bob@example.test", `${id}-wrong`, id));
    const rows = await getPool().query<{ customer_handle: string; external_thread_id: string }>(
      "select customer_handle, external_thread_id from conversations where client_id = $1 and channel_id = $2 order by customer_handle",
      [PS_CAFE_DEMO_CLIENT_ID, PS_CAFE_DEMO_EMAIL_ID]);
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows[0].external_thread_id).toBe(`alice@example.test:${id}@example.test`);
    expect(rows.rows[1].external_thread_id).toBe(`bob@example.test:${id}-wrong@example.test`);
  });

  it("retries a definite pre-send local SMTP outage after the sandbox returns", async () => {
    const raw = Buffer.from(`From: customer@example.test\r\nTo: ${PS_CAFE_DEMO_SUPPORT_ADDRESS}\r\n` +
      `Message-ID: <retry-${randomUUID()}@example.test>\r\nSubject: Hours\r\n\r\nWhat time do you close?`);
    await sendRaw(raw);
    const job = await getPool().query<{ id: string }>(
      "select id from inbound_jobs where client_id = $1", [PS_CAFE_DEMO_CLIENT_ID]);
    expect(await processInboundJob({ jobId: job.rows[0].id })).toMatchObject({ outcome: "answered" });
    vi.stubEnv("PRONTO_LOCAL_SMTP_PORT", "11025");
    await flushRetryableOutboundMessages();
    const failed = await getPool().query<{ status: string; attempt_count: number }>(
      "select status, attempt_count from outbound_messages where client_id = $1", [PS_CAFE_DEMO_CLIENT_ID]);
    expect(failed.rows[0]).toMatchObject({ status: "failed", attempt_count: 1 });
    vi.stubEnv("PRONTO_LOCAL_SMTP_PORT", "1025");
    await flushRetryableOutboundMessages();
    const sent = await getPool().query<{ status: string; attempt_count: number }>(
      "select status, attempt_count from outbound_messages where client_id = $1", [PS_CAFE_DEMO_CLIENT_ID]);
    expect(sent.rows[0]).toMatchObject({ status: "sent", attempt_count: 2 });
  });

  it("answers an email booking request with the configured Chope link, without a booking claim", async () => {
    const raw = Buffer.from(`From: customer@example.test\r\nTo: ${PS_CAFE_DEMO_SUPPORT_ADDRESS}\r\n` +
      `Message-ID: <booking-${randomUUID()}@example.test>\r\nSubject: Booking\r\n\r\n` +
      `Can I book a table for 2 on 2099-10-12 at 7pm?`);
    await sendRaw(raw);
    const job = await getPool().query<{ id: string }>(
      "select id from inbound_jobs where client_id = $1", [PS_CAFE_DEMO_CLIENT_ID]);
    expect(await processInboundJob({ jobId: job.rows[0].id })).toMatchObject({ outcome: "answered" });
    const outbound = await getPool().query<{ body: string }>(
      "select body from outbound_messages where client_id = $1", [PS_CAFE_DEMO_CLIENT_ID]);
    expect(outbound.rows[0].body).toContain(PS_CAFE_CHOPE_URL);
    expect(outbound.rows[0].body).toContain("I cannot confirm a reservation here");
    expect(outbound.rows[0].body).not.toContain("A table appears available");
  });

  it("escalates unsupported content, notifies the local operator, and pauses AI", async () => {
    const id = randomUUID();
    const raw = Buffer.from(`From: customer@example.test\r\nTo: ${PS_CAFE_DEMO_SUPPORT_ADDRESS}\r\n` +
      `Message-ID: <${id}@example.test>\r\nSubject: Private request\r\n` +
      `MIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="x"\r\n\r\n` +
      `--x\r\nContent-Type: application/octet-stream\r\nContent-Disposition: attachment; filename="private.bin"\r\n\r\nabc\r\n--x--\r\n`);
    await sendRaw(raw);
    const first = await getPool().query<{ id: string }>("select id from inbound_jobs where client_id = $1", [PS_CAFE_DEMO_CLIENT_ID]);
    expect(await processInboundJob({ jobId: first.rows[0].id })).toMatchObject({ outcome: "escalated" });
    await flushRetryableOutboundMessages();
    const messages = await mailpitMessages();
    expect(messages.some((message) => message.To.some((to) => to.Address === "operator@ps-cafe-demo.test"))).toBe(true);
    const followup = Buffer.from(`From: customer@example.test\r\nTo: ${PS_CAFE_DEMO_SUPPORT_ADDRESS}\r\n` +
      `Message-ID: <${id}-followup@example.test>\r\nIn-Reply-To: <${id}@example.test>\r\n` +
      `Subject: Re: Private request\r\n\r\nAny update?`);
    await sendRaw(followup);
    const jobs = await getPool().query<{ id: string }>("select id from inbound_jobs where client_id = $1 order by created_at", [PS_CAFE_DEMO_CLIENT_ID]);
    expect(await processInboundJob({ jobId: jobs.rows[1].id })).toMatchObject({ outcome: "skipped" });
    const count = await getPool().query<{ count: string }>(
      "select count(*) from outbound_messages where client_id = $1 and channel_id = $2", [PS_CAFE_DEMO_CLIENT_ID, PS_CAFE_DEMO_EMAIL_ID]);
    expect(count.rows[0].count).toBe("1");
  });
});
