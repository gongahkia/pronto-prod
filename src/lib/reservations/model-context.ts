import { z } from "zod";
import { estimateTokens } from "@/lib/knowledge/chunk";
import { approvedChopeBookingLink, buildChopeListingLink, validateAvailabilityRequest } from "@/lib/reservations/chope";
import { getCachedChopeAvailability, type CachedAvailability } from "@/lib/reservations/availability-cache";
import type { GenerateAnswerInput, GroundedAnswerDecision, LlmProvider } from "@/lib/llm/types";
import type { KnowledgeChunk } from "@/lib/types";
import type { ReservationConnector } from "@/lib/reservations/types";

export const reservationQuerySchema = z.object({
  intent: z.enum(["booking", "availability", "staff_action", "other"]),
  outlet: z.enum(["current", "other", "unspecified"]),
  date: z.string().regex(/^20\d{2}-\d{2}-\d{2}$/).nullable(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  partySize: z.number().int().min(1).max(100).nullable(),
  children: z.number().int().min(0).max(100).nullable(),
}).strict();
export type ReservationQuery = z.infer<typeof reservationQuerySchema>;
export type ReservationModelContext = {
  chunk: KnowledgeChunk; metadata: Record<string, unknown>; allowedUrls: string[];
  status: string; extraction: GroundedAnswerDecision;
};

export function mayNeedReservationContext(message: string, recent: { senderRole: string; body: string }[]): boolean {
  const topic = /\b(book(?:ing)?|reserv(?:e|ation)|table|availability|available slots)\b/i;
  return topic.test(message) || recent.filter(row => row.senderRole === "customer").slice(-2).some(row => topic.test(row.body));
}

export async function prepareReservationContext(input: {
  generation: GenerateAnswerInput; provider: Pick<LlmProvider, "generateGroundedAnswer">;
  profile: Record<string, unknown>; connector: ReservationConnector | null; now?: Date;
  onExtraction: (decision: GroundedAnswerDecision) => Promise<void>;
}): Promise<ReservationModelContext | null> {
  const link = approvedChopeBookingLink(input.profile);
  const clientId = input.generation.clientId;
  if (!link || !clientId) return null;
  const now = input.now ?? new Date();
  const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const start = Date.parse(`${localDate}T00:00:00+08:00`);
  const calendar = Array.from({ length: 15 }, (_, index) => {
    const date = new Date(start + index * 86_400_000);
    return `${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit" }).format(date)} ${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Singapore", weekday: "long" }).format(date)}`;
  });
  const extraction = await input.provider.generateGroundedAnswer({ ...input.generation,
    conversationalTurn: true, retrievedChunks: [], maxOutputTokens: 550,
    reservationExtraction: { now: `${localDate} ${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Singapore", timeStyle: "short" }).format(now)} SGT`, calendar } });
  await input.onExtraction(extraction);
  let parsed: unknown;
  try { parsed = JSON.parse(extraction.answer ?? "null"); } catch { return null; }
  const checked = reservationQuerySchema.safeParse(parsed);
  if (!checked.success || extraction.action !== "answer") return null;
  const request = checked.data;
  if (["other", "staff_action"].includes(request.intent)) return null;
  const policy = input.profile.reservationPolicy as { manualHandoffPartySize?: number } | undefined;
  const groupThreshold = policy?.manualHandoffPartySize;
  const requiresStaff = request.outlet === "other" || request.children !== 0 ||
    (request.partySize !== null && (request.partySize > 20 || (typeof groupThreshold === "number" && request.partySize >= groupThreshold)));
  const base = { clientId, outletId: link.outletId, date: request.date ?? "", partySize: request.partySize ?? 0 };
  const valid = !requiresStaff && !!request.date && !!request.partySize &&
    validateAvailabilityRequest({ ...base, ...(request.time ? { time: request.time } : {}) }, now);
  let observation: CachedAvailability | null = null;
  if (valid && input.connector) observation = await getCachedChopeAvailability(base, input.connector);
  const status = observation?.result.status ?? "unknown";
  const slots = observation?.result.availableSlots ?? [];
  const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const nearest = [...slots].sort((a, b) => request.time
    ? Math.abs(toMinutes(a) - toMinutes(request.time)) - Math.abs(toMinutes(b) - toMinutes(request.time)) || a.localeCompare(b)
    : a.localeCompare(b)).slice(0, 4);
  const times = [...new Set([...(valid && request.time ? [request.time] : []), ...nearest])];
  const choices = times.map(time => {
    const built = buildChopeListingLink({ mapping: { ...link, clientId, provider: "chope" },
      request: { ...base, time }, capability: "experimental_chope_listing_v1", now });
    return { time, observedAvailable: slots.includes(time), url: built.status === "preselected" ? built.url : link.url };
  });
  const metadata = { provider: "chope", outletId: link.outletId, request, requiresStaff,
    invalidOrPastRequest: !!request.date && !!request.partySize && !valid && !requiresStaff,
    status, observedAt: observation?.result.observedAt ?? null, timezone: "Asia/Singapore",
    observedSlots: slots, choices, generalUrl: link.url,
    errorCode: observation?.result.errorCode ?? (!input.connector ? "missing_authorization" : null),
    cacheHit: observation?.cacheHit ?? false, observationId: observation?.observationId ?? null,
    downstreamPreselection: "unverified", extractionProviderResponseId: extraction.providerResponseId ?? null };
  const content = `Chope public availability and booking referral for ${input.generation.clientName}.\n${JSON.stringify(metadata)}\n${requiresStaff
    ? "This request is outside the supported current-outlet adults-only booking referral; ask the team to assist. Do not imply unsupported child/group/outlet selections were checked."
    : "Only published observations above support availability claims. Unknown means a read could not establish availability. Use the requested date/time/party; ask only for missing or ambiguous details. No booking was created. Complete on Chope and verify selections; preselection is experimental."}`;
  return { chunk: { id: `chope:${link.outletId}:${request.date ?? "pending"}:${request.partySize ?? "pending"}`,
    source_id: "integration-source:chope", client_id: clientId, chunk_index: 0, content,
    token_estimate: estimateTokens(content), score: 1, metadata: { sourceTitle: "Chope · PS.Cafe reservation availability",
      sourceUrl: link.url, live_source: true, reservation: metadata } },
    metadata, allowedUrls: [...new Set([link.url, ...choices.map(choice => choice.url)])], status, extraction };
}

export function reservationReplyError(answer: string, context: ReservationModelContext): string | null {
  const urls = answer.match(/https?:\/\/[^\s<>]+/g) ?? [];
  if (urls.some(raw => {
    const url = raw.replace(/[).,;!?]+$/, "");
    try { return new URL(url).hostname.endsWith("chope.co") && !context.allowedUrls.includes(url); }
    catch { return true; }
  })) return "The answer used a Chope URL that was not supplied by the scoped booking tool.";
  if (context.status !== "available" && /\b(?:is|are|appears?|looks?)\s+(?:to be\s+)?available\b|\bavailability (?:is )?confirmed\b/i.test(answer))
    return "The answer claimed availability without a successful current availability observation.";
  return null;
}
