import { z } from "zod";
import type { GroundedAnswerDecision } from "@/lib/llm/types";

const schema = z.object({ intent: z.enum(["booking", "availability", "staff_action", "other"]),
  outlet: z.enum(["current", "other", "unspecified"]), date: z.string().nullable(), time: z.string().nullable(),
  partySize: z.number().int().nullable(), children: z.number().int().nullable(),
  confidence: z.number().min(0).max(1), reasonDetail: z.string() }).strict();

export const reservationExtractionJsonSchema = { type: "object", additionalProperties: false,
  properties: {
    intent: { type: "string", enum: ["booking", "availability", "staff_action", "other"] },
    outlet: { type: "string", enum: ["current", "other", "unspecified"] },
    date: { type: ["string", "null"] }, time: { type: ["string", "null"] },
    partySize: { type: ["integer", "null"] }, children: { type: ["integer", "null"] },
    confidence: { type: "number" }, reasonDetail: { type: "string" },
  }, required: ["intent", "outlet", "date", "time", "partySize", "children", "confidence", "reasonDetail"] };

export function parseReservationExtraction(text: string): GroundedAnswerDecision {
  const { confidence, reasonDetail, ...request } = schema.parse(JSON.parse(text));
  return { action: "answer", answer: JSON.stringify(request), confidence,
    reasonCode: "reservation_query", reasonDetail, citedChunkIds: [] };
}
