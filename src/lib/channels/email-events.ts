import { query } from "@/lib/db";
import {
  suppressEmailAddress,
  type EmailProviderKind,
} from "@/lib/channels/email";
import { logInfo, logWarn } from "@/lib/logger";

export type ProcessedEmailEvent = {
  kind: "bounce" | "complaint" | "delivered" | "ignored";
  emailAddress: string | null;
  reason: string | null;
};

export async function processEmailEvent(input: {
  channelId: string;
  clientId: string;
  provider: EmailProviderKind;
  payload: Record<string, unknown>;
  requestId?: string;
}): Promise<ProcessedEmailEvent> {
  const event = classifyEmailEvent(input.provider, input.payload);
  if (event.kind === "ignored") {
    return event;
  }

  if (event.kind === "bounce" || event.kind === "complaint") {
    if (event.emailAddress) {
      await suppressEmailAddress({
        clientId: input.clientId,
        emailAddress: event.emailAddress,
        reason: event.kind === "bounce" ? "bounce" : "spam_complaint",
        provider: input.provider,
        raw: input.payload,
      });
    }
    await markOutboundFailed({
      provider: input.provider,
      payload: input.payload,
      kind: event.kind,
      reason: event.reason ?? event.kind,
      requestId: input.requestId,
    });
    logWarn("email_event.delivery_failure", {
      requestId: input.requestId,
      provider: input.provider,
      channelId: input.channelId,
      kind: event.kind,
      emailAddress: event.emailAddress,
      reason: event.reason,
    });
    return event;
  }

  if (event.kind === "delivered") {
    logInfo("email_event.delivered", {
      requestId: input.requestId,
      provider: input.provider,
      channelId: input.channelId,
      emailAddress: event.emailAddress,
    });
  }
  return event;
}

export function classifyEmailEvent(
  provider: EmailProviderKind,
  payload: Record<string, unknown>,
): ProcessedEmailEvent {
  if (provider === "postmark") {
    const recordType = stringValue(payload.RecordType)?.toLowerCase();
    if (recordType === "bounce" || recordType === "hardbounce") {
      return {
        kind: "bounce",
        emailAddress: stringValue(payload.Email)?.toLowerCase() ?? null,
        reason: stringValue(payload.Description) ?? stringValue(payload.Details) ?? null,
      };
    }
    if (recordType === "spamcomplaint") {
      return {
        kind: "complaint",
        emailAddress: stringValue(payload.Email)?.toLowerCase() ?? null,
        reason: stringValue(payload.Description) ?? null,
      };
    }
    if (recordType === "delivery") {
      return {
        kind: "delivered",
        emailAddress: stringValue(payload.Recipient)?.toLowerCase() ?? null,
        reason: null,
      };
    }
    return { kind: "ignored", emailAddress: null, reason: null };
  }

  const type = stringValue(payload.type)?.toLowerCase();
  const data = isRecord(payload.data) ? payload.data : {};
  const to = Array.isArray(data.to) ? (data.to[0] as string | undefined) : undefined;
  if (type === "email.bounced") {
    return {
      kind: "bounce",
      emailAddress: to?.toLowerCase() ?? null,
      reason:
        (isRecord(data.bounce) && stringValue((data.bounce as Record<string, unknown>).reason)) ||
        null,
    };
  }
  if (type === "email.complained") {
    return {
      kind: "complaint",
      emailAddress: to?.toLowerCase() ?? null,
      reason: stringValue((data as Record<string, unknown>).description) ?? null,
    };
  }
  if (type === "email.delivered") {
    return {
      kind: "delivered",
      emailAddress: to?.toLowerCase() ?? null,
      reason: null,
    };
  }
  return { kind: "ignored", emailAddress: null, reason: null };
}

async function markOutboundFailed(input: {
  provider: EmailProviderKind;
  payload: Record<string, unknown>;
  kind: "bounce" | "complaint";
  reason: string;
  requestId?: string;
}): Promise<void> {
  const outboundMessageId = locateOutboundMessageId(input.provider, input.payload);
  if (!outboundMessageId) return;
  await query(
    `
      update outbound_messages
      set status = 'failed',
          last_error = $2,
          metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{deliveryFailure}', $3::jsonb, true),
          updated_at = now()
      where metadata->>'rfcMessageId' = $1
         or metadata->>'outgoingMessageId' = $1
    `,
    [
      outboundMessageId,
      `${input.kind}:${input.reason}`,
      JSON.stringify({
        kind: input.kind,
        reason: input.reason,
        provider: input.provider,
        requestId: input.requestId ?? null,
      }),
    ],
  );
}

function locateOutboundMessageId(
  provider: EmailProviderKind,
  payload: Record<string, unknown>,
): string | null {
  if (provider === "postmark") {
    const headers = Array.isArray(payload.Headers) ? payload.Headers : [];
    for (const entry of headers) {
      if (isRecord(entry) && stringValue(entry.Name)?.toLowerCase() === "message-id") {
        return stringValue(entry.Value) ?? null;
      }
    }
    return stringValue(payload.MessageID) ?? null;
  }
  const data = isRecord(payload.data) ? payload.data : {};
  const headers = isRecord(data.headers) ? data.headers : {};
  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === "string" && name.toLowerCase() === "message-id") return value;
  }
  return stringValue(data.email_id) ?? stringValue(data.id) ?? null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
