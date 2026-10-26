import { beforeEach, describe, expect, it, vi } from "vitest";
import { mayNeedReservationContext, prepareReservationContext, reservationReplyError } from "@/lib/reservations/model-context";
import { buildGroundedAnswerInstructions } from "@/lib/llm/prompt";
import type { GenerateAnswerInput, GroundedAnswerDecision } from "@/lib/llm/types";
const mocks = vi.hoisted(() => ({ cached: vi.fn() }));
vi.mock("@/lib/reservations/availability-cache", () => ({ getCachedChopeAvailability: mocks.cached }));
const now = new Date("2026-10-26T07:00:00Z");
const generation: GenerateAnswerInput = { clientId: "tenant-a", clientName: "PS.Cafe", brandVoice: "friendly", promptPreamble: "",
  responseModel: "test", customerMessage: "Can you make a table reservation for four at Raffles City this Saturday at 7pm?",
  recentMessages: [], retrievedChunks: [] };
const profile = { chopeBooking: { outletId: "raffles-city", url: "https://www.chope.co/singapore-restaurants/restaurant/ps-cafe-raffles-city", verifiedAt: "2026-10-25T00:00:00Z" },
  reservationPolicy: { manualHandoffPartySize: 9 } };
const query = { intent: "booking", outlet: "current", date: "2026-10-31", time: "19:00", partySize: 4, children: 0 };
const result = { outletId: "raffles-city", date: query.date, partySize: 4, provider: "chope", timezone: "Asia/Singapore",
  status: "available", availableSlots: ["18:00", "19:00", "19:30"], observedAt: now.toISOString() };
function setup(overrides = {}) {
  const decision: GroundedAnswerDecision = { action: "answer", answer: JSON.stringify({ ...query, ...overrides }), confidence: 1,
    citedChunkIds: [], reasonCode: "reservation_query", reasonDetail: "The customer supplied four guests, Saturday and 7pm.", providerResponseId: "planning-id" };
  const provider = { generateGroundedAnswer: vi.fn().mockResolvedValue(decision) };
  const onExtraction = vi.fn(async () => undefined);
  const connector = { provider: "chope", capabilities: { availability: true, create: false, read: false, update: false, cancel: false },
    getAvailability: vi.fn(), createReservation: vi.fn(), getReservation: vi.fn(), updateReservation: vi.fn(), cancelReservation: vi.fn() };
  return { provider, onExtraction, connector, generation, profile, now };
}
beforeEach(() => { mocks.cached.mockReset().mockResolvedValue({ result, cacheHit: false, observationId: "observation-a" }); });
describe("model-planned reservation assistance", () => {
  it("uses model-extracted weekday/time/party in a scoped read and exact prefilled link", async () => {
    const input = setup(); const context = await prepareReservationContext(input);
    expect(mocks.cached).toHaveBeenCalledWith({ clientId: "tenant-a", outletId: "raffles-city", date: "2026-10-31", partySize: 4 }, input.connector);
    const url = new URL(context!.allowedUrls.find(url => new URL(url).searchParams.get("time") === "7:00 pm")!);
    expect(Object.fromEntries(url.searchParams)).toEqual({ children: "0", adults: "4", date: "2026-10-31", time: "7:00 pm" });
    expect(context?.metadata).toMatchObject({ observedAt: now.toISOString(), observationId: "observation-a", request: query });
    const planning = input.provider.generateGroundedAnswer.mock.calls[0][0] as GenerateAnswerInput;
    expect(planning.reservationExtraction?.calendar).toContain("2026-10-31 Saturday");
    expect(buildGroundedAnswerInstructions(planning)).toContain("Never guess missing or ambiguous details");
    expect(input.onExtraction).toHaveBeenCalledOnce();
    expect(input.connector.createReservation).not.toHaveBeenCalled();
  });
  it("retains known context while asking only for missing details, without an unscoped read", async () => {
    const context = await prepareReservationContext(setup({ date: null, time: null }));
    expect(context?.metadata.request).toMatchObject({ partySize: 4, date: null });
    expect(mocks.cached).not.toHaveBeenCalled();
  });
  it.each([{ children: 1 }, { partySize: 9 }, { outlet: "other" }, { date: "2026-10-24" }, { date: "2026-02-30" }])(
    "does not read or fabricate availability for unsupported/invalid request %j", async overrides => {
      const context = await prepareReservationContext(setup(overrides));
      expect(context?.status).toBe("unknown"); expect(mocks.cached).not.toHaveBeenCalled();
    });
  it("keeps a correctly prefilled link on timeout but prevents invented availability or URLs", async () => {
    mocks.cached.mockResolvedValue({ result: { ...result, status: "unknown", observedAt: null, availableSlots: [], errorCode: "provider_timeout" }, cacheHit: false });
    const context = (await prepareReservationContext(setup()))!;
    expect(context.allowedUrls.some(url => url.includes("adults=4") && url.includes("date=2026-10-31"))).toBe(true);
    expect(reservationReplyError("A table is available at 7pm.", context)).toContain("without");
    expect(reservationReplyError("Check https://www.chope.co/wrong?adults=4", context)).toContain("URL");
    expect(reservationReplyError(`I couldn't verify current availability. Please check ${context.allowedUrls[1]}`, context)).toBeNull();
  });
  it("leaves cancellations, unrelated questions and malformed extraction out of availability tools", async () => {
    expect(await prepareReservationContext(setup({ intent: "staff_action" }))).toBeNull();
    expect(await prepareReservationContext(setup({ intent: "other" }))).toBeNull();
    expect(await prepareReservationContext(setup({ partySize: -1 }))).toBeNull();
    expect(mocks.cached).not.toHaveBeenCalled();
  });
  it("routes booking follow-ups through the model without running the tool for ordinary new topics", () => {
    expect(mayNeedReservationContext("Tomorrow at 7pm", [{ senderRole: "customer", body: "A table for four please" }])).toBe(true);
    expect(mayNeedReservationContext("Where are you?", [])).toBe(false);
  });
});

it("repairs a model's weekday/date mismatch before any provider read and records both calls", async () => {
  const input=setup();
  const correct=input.provider.generateGroundedAnswer.getMockImplementation()!;
  const good=await correct();
  input.provider.generateGroundedAnswer.mockReset()
    .mockResolvedValueOnce({...good,answer:JSON.stringify({...query,date:"2026-10-29"})})
    .mockResolvedValueOnce(good);
  const context=await prepareReservationContext(input);
  expect(input.provider.generateGroundedAnswer).toHaveBeenCalledTimes(2);
  expect(input.onExtraction).toHaveBeenCalledTimes(2);
  expect(context?.metadata.request).toMatchObject({date:"2026-10-31",time:"19:00",partySize:4});
  expect(mocks.cached).toHaveBeenCalledOnce();
  expect(input.provider.generateGroundedAnswer.mock.calls[1][0].reservationExtraction.validationError).toContain("not Saturday");
});
it("does not scrape a guessed weekday when the model cannot repair its extraction", async () => {
  const context=await prepareReservationContext(setup({date:"2026-10-29"}));
  expect(context?.metadata.request).toMatchObject({date:null,partySize:4});
  expect(mocks.cached).not.toHaveBeenCalled();
});
