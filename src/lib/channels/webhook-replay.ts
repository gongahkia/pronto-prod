import { createHash } from "node:crypto";
import { query } from "@/lib/db";

export type WebhookReplayResult =
  | { ok: true; duplicate: false }
  | { ok: true; duplicate: true }
  | { ok: false; reason: string };

const DEFAULT_WINDOW_MS = 5 * 60 * 1000;

export async function claimWebhookEvent(input: {
  provider: string;
  channelId: string;
  rawBody: string;
  eventId?: string | null;
  signature?: string | null;
  timestamp?: string | null;
  now?: Date;
  windowMs?: number;
  metadata?: Record<string, unknown>;
}): Promise<WebhookReplayResult> {
  const now = input.now ?? new Date();
  const windowMs = input.windowMs ?? DEFAULT_WINDOW_MS;
  const timestamp = parseTimestamp(input.timestamp);
  if (timestamp && Math.abs(now.getTime() - timestamp.getTime()) > windowMs) {
    return { ok: false, reason: "Webhook timestamp is outside the allowed replay window." };
  }

  const payloadHash = hash(input.rawBody);
  const eventKey = [
    input.channelId,
    input.eventId?.trim() || input.signature?.trim() || payloadHash,
  ].join(":");
  const expiresAt = new Date(now.getTime() + windowMs);

  const result = await query<{ id: string }>(
    `
      insert into webhook_replay_events (
        channel_id,
        provider,
        event_key,
        payload_hash,
        expires_at,
        metadata
      )
      values ($1, $2, $3, $4, $5, $6)
      on conflict (provider, event_key) do nothing
      returning id
    `,
    [
      input.channelId,
      input.provider,
      eventKey,
      payloadHash,
      expiresAt,
      {
        ...(input.metadata ?? {}),
        timestamp: input.timestamp ?? null,
      },
    ],
  );
  return result.rowCount ? { ok: true, duplicate: false } : { ok: true, duplicate: true };
}

export function replayHeaders(request: Request): {
  eventId: string | null;
  signature: string | null;
  timestamp: string | null;
} {
  return {
    eventId:
      request.headers.get("svix-id") ??
      request.headers.get("x-webhook-id") ??
      request.headers.get("x-request-id"),
    signature:
      request.headers.get("x-hub-signature-256") ??
      request.headers.get("x-pronto-signature") ??
      request.headers.get("svix-signature") ??
      request.headers.get("x-resend-signature") ??
      request.headers.get("x-telegram-bot-api-secret-token"),
    timestamp:
      request.headers.get("svix-timestamp") ??
      request.headers.get("x-webhook-timestamp") ??
      request.headers.get("x-pronto-timestamp"),
  };
}

function parseTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null;
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

