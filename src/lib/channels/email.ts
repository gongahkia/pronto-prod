import { createHmac, timingSafeEqual } from "node:crypto";
import { query } from "@/lib/db";
import type { NormalizedInboundMessage } from "@/lib/channels/types";
import type { Channel } from "@/lib/types";

export type EmailProviderKind = "postmark" | "resend";

export function verifyEmailWebhookSignature(input: {
  provider: EmailProviderKind;
  rawBody: string;
  signatureHeader: string | null;
  secret: string | undefined;
}): boolean {
  if (!input.secret) {
    return process.env.NODE_ENV !== "production";
  }
  if (!input.signatureHeader) {
    return false;
  }
  const expected = createHmac("sha256", input.secret).update(input.rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const provided = input.signatureHeader.replace(/^sha256=/, "");
  const providedBuf = Buffer.from(provided, "hex");
  return (
    expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf)
  );
}

export function normalizeEmailPayload(
  channelId: string,
  provider: EmailProviderKind,
  payload: Record<string, unknown>,
): NormalizedInboundMessage[] {
  if (provider === "postmark") return normalizePostmark(channelId, payload);
  if (provider === "resend") return normalizeResend(channelId, payload);
  return [];
}

function normalizePostmark(
  channelId: string,
  payload: Record<string, unknown>,
): NormalizedInboundMessage[] {
  const messageId =
    typeof payload.MessageID === "string" ? payload.MessageID : null;
  const from = typeof payload.From === "string" ? payload.From : null;
  const text =
    typeof payload.TextBody === "string" && payload.TextBody.trim()
      ? payload.TextBody.trim()
      : typeof payload.StrippedTextReply === "string"
        ? payload.StrippedTextReply.trim()
        : null;
  if (!messageId || !from || !text) return [];

  const fromName = typeof payload.FromName === "string" ? payload.FromName : undefined;
  const subject = typeof payload.Subject === "string" ? payload.Subject : "";
  const threadId = threadKeyFromSubject(subject) ?? from;

  return [
    {
      channelId,
      channelKind: "email",
      externalMessageId: messageId,
      externalThreadId: threadId,
      customerHandle: from,
      customerName: fromName,
      text,
      raw: payload,
    },
  ];
}

function normalizeResend(
  channelId: string,
  payload: Record<string, unknown>,
): NormalizedInboundMessage[] {
  const data = isRecord(payload.data) ? payload.data : payload;
  const messageId =
    typeof data.email_id === "string"
      ? data.email_id
      : typeof data.id === "string"
        ? data.id
        : null;
  const from = typeof data.from === "string" ? data.from : null;
  const text =
    typeof data.text === "string"
      ? data.text
      : typeof data.subject === "string"
        ? data.subject
        : null;
  if (!messageId || !from || !text) return [];

  return [
    {
      channelId,
      channelKind: "email",
      externalMessageId: messageId,
      externalThreadId: from,
      customerHandle: from,
      text,
      raw: payload,
    },
  ];
}

function threadKeyFromSubject(subject: string): string | null {
  const stripped = subject.replace(/^(re:|fwd?:)\s*/gi, "").trim();
  return stripped ? stripped.toLowerCase() : null;
}

export async function sendEmail(input: {
  channel: Channel;
  to: string;
  subject: string;
  text: string;
  fetchFn?: typeof fetch;
}): Promise<void> {
  const provider = (input.channel.credentials.provider as EmailProviderKind | undefined) ?? "postmark";
  const apiKey =
    (input.channel.credentials.apiKey as string | undefined) ??
    (provider === "postmark" ? process.env.POSTMARK_API_TOKEN : process.env.RESEND_API_KEY);
  const from =
    (input.channel.credentials.fromAddress as string | undefined) ??
    (provider === "postmark" ? process.env.POSTMARK_FROM_ADDRESS : process.env.RESEND_FROM_ADDRESS);

  if (!apiKey || !from) {
    throw new Error(`Email credentials missing for provider ${provider}; outbound send skipped.`);
  }

  const fetchImpl = input.fetchFn ?? fetch;

  if (provider === "postmark") {
    const response = await fetchImpl("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": apiKey,
      },
      body: JSON.stringify({
        From: from,
        To: input.to,
        Subject: input.subject,
        TextBody: input.text,
        MessageStream: "outbound",
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Postmark send failed: ${response.status} ${body}`);
    }
    return;
  }

  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend send failed: ${response.status} ${body}`);
  }
}

export async function getEmailChannel(channelId: string): Promise<Channel | null> {
  const result = await query<Channel>(
    "select * from channels where id = $1 and kind = 'email'",
    [channelId],
  );
  return result.rows[0] ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
