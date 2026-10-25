import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPool } from "@/lib/db";
import { createDemoSession, getDemoState, sendDemoMessage } from "@/lib/customer-demo";
import { setupCustomerSimulator } from "@/lib/customer-demo-setup";
import { processInboundJob } from "@/lib/channels/inbox-worker";
import { flushRetryableOutboundMessages } from "@/lib/channels/outbox";
import { createChopeBrowserConnector } from "@/lib/reservations/chope-browser";
import { getFilteredConversations } from "@/lib/reporting";
import type { SessionUser } from "@/lib/auth";
import { removePsCafeDemo, setupPsCafeDemo, PS_CAFE_DEMO_CLIENT_ID, PS_CAFE_DEMO_RESPONDER_ID,
  PS_CAFE_CHOPE_URL, PS_CAFE_CHOPE_OUTLET_ID } from "../../scripts/demo/ps-cafe-raffles-city";

const dbDescribe = process.env.PRONTO_RUN_DB_TESTS === "1" ? describe : describe.skip;
const actor: SessionUser = { userId: PS_CAFE_DEMO_RESPONDER_ID, role: "client", clientId: PS_CAFE_DEMO_CLIENT_ID,
  name: "Synthetic responder", email: "responder@ps-cafe-demo.test" };

dbDescribe("Chope listing links through the connected customer simulator", () => {
  beforeEach(async () => {
    vi.stubEnv("PRONTO_CUSTOMER_DEMO_ENABLED", "1");
    vi.stubEnv("PRONTO_CHOPE_LIVE_READS", "0"); vi.stubEnv("CHOPE_LIVE_READ_APPROVED", "0");
    await removePsCafeDemo(); await setupPsCafeDemo(); await setupCustomerSimulator();
  });
  afterEach(async () => { await removePsCafeDemo(); vi.unstubAllEnvs(); });
  afterAll(async () => { await getPool().end(); });

  function fixture(options: { slots?: string[]; ageMs?: number; clientId?: string } = {}) {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const date = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const read = vi.fn(async () => ({ outletId: PS_CAFE_CHOPE_OUTLET_ID, date, partySize: 2,
      availableSlots: options.slots ?? ["18:30", "19:30"], provider: "chope", timezone: "Asia/Singapore" as const,
      observedAt: new Date(Date.now() - (options.ageMs ?? 0)).toISOString(), status: "available" as const }));
    const connector = createChopeBrowserConnector({ clientId: options.clientId ?? PS_CAFE_DEMO_CLIENT_ID,
      outletId: PS_CAFE_CHOPE_OUTLET_ID, listingUrl: PS_CAFE_CHOPE_URL,
      authorizedAt: "2026-10-11T00:00:00Z", scope: "demo_availability" }, read);
    return { date, read, connector };
  }

  it("persists observed slot provenance, sends encoded links locally, and appears in the owner's inbox", async () => {
    const { connector, read, date } = fixture(); const session = await createDemoSession(actor, "mock");
    const inbound = await sendDemoMessage(actor, { sessionId: session.id, requestId: randomUUID(), text: "What timings are available tomorrow for two people?" });
    expect(await processInboundJob({ jobId: inbound.jobId, reservationConnector: connector })).toMatchObject({ outcome: "answered" });
    expect(read).toHaveBeenCalledWith({ clientId: PS_CAFE_DEMO_CLIENT_ID, outletId: PS_CAFE_CHOPE_OUTLET_ID,
      date, partySize: 2 }, expect.anything());
    expect((await getDemoState(actor, session.id)).messages).toHaveLength(1);
    await flushRetryableOutboundMessages();
    const state = await getDemoState(actor, session.id);
    expect(state.messages).toHaveLength(2);
    const reply = String(state.messages[1].body);
    const links = (reply.match(/https:\/\/[^\s]+/g) ?? []).filter(url => new URL(url).searchParams.has("time"));
    expect(links.map(url => Object.fromEntries(new URL(url).searchParams))).toEqual([
      { children: "0", adults: "2", date, time: "6:30 pm" }, { children: "0", adults: "2", date, time: "7:30 pm" }]);
    const decision = await getPool().query("select metadata from messages where client_id=$1 and conversation_id=$2 and sender_role='agent'",
      [PS_CAFE_DEMO_CLIENT_ID, session.conversationId]);
    expect(decision.rows[0].metadata).toMatchObject({ reservation: { provider: "chope", outletId: PS_CAFE_CHOPE_OUTLET_ID,
      requestedTime: null, observedSlots: ["18:30", "19:30"], linkMode: "experimental_chope_listing_v1", downstreamPreselection: "unverified" } });
    // This existing deterministic reservation-policy branch is not LLM inference.
    expect(decision.rows[0].metadata.generationMode).toBeUndefined();
    expect((await getFilteredConversations({ clientId: PS_CAFE_DEMO_CLIENT_ID, status: "ai_handled" })).some(row => row.id === session.conversationId)).toBe(true);
    expect(reply).toContain("This is not a booking");
  });

  it("does not advertise the requested time when only other times were observed", async () => {
    const session = await createDemoSession(actor, "mock"); const { connector } = fixture();
    const inbound = await sendDemoMessage(actor, { sessionId: session.id, requestId: randomUUID(), text: "Hi, can I reserve a table for two tomorrow around 7pm?" });
    await processInboundJob({ jobId: inbound.jobId, reservationConnector: connector }); await flushRetryableOutboundMessages();
    const reply = String((await getDemoState(actor, session.id)).messages[1].body);
    expect(reply).toContain("19:00 was not returned as available");
    expect(reply).not.toContain("time=7%3A00+pm"); expect(reply).toContain("time=7%3A30+pm");
  });

  it.each(["stale", "foreign-tenant"])("degrades to the verified general URL for %s provider evidence", async mode => {
    const session = await createDemoSession(actor, "mock");
    const { connector, read } = fixture(mode === "stale" ? { ageMs: 301_000 } : { clientId: "foreign-tenant" });
    const inbound = await sendDemoMessage(actor, { sessionId: session.id, requestId: randomUUID(), text: "What timings are available tomorrow for two?" });
    await processInboundJob({ jobId: inbound.jobId, reservationConnector: connector }); await flushRetryableOutboundMessages();
    const reply = String((await getDemoState(actor, session.id)).messages[1].body);
    expect(reply).toContain(PS_CAFE_CHOPE_URL); expect(reply).not.toContain("?children=");
    expect(reply).not.toContain("observed available");
    if (mode === "foreign-tenant") expect(read).not.toHaveBeenCalled();
    else expect(reply).toContain("too old to use");
  });
});
