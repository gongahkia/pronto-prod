import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { query } from "@/lib/db";
import { decryptChannelCredentials } from "@/lib/channels/credentials";
import type { NormalizedInboundMessage } from "@/lib/channels/types";
import type { Channel } from "@/lib/types";

export type EmailProviderKind = "postmark" | "resend";

export type EmailHeaders = {
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  autoSubmitted: string | null;
  precedence: string | null;
  authenticationResults: string | null;
  listUnsubscribe: string | null;
};

export type ParsedEmail = {
  provider: EmailProviderKind;
  providerMessageId: string;
  rfcMessageId: string | null;
  fromAddress: string;
  fromName: string | undefined;
  to: string[];
  cc: string[];
  subject: string;
  text: string | null;
  html: string | null;
  attachments: { name: string; contentType: string | null; size: number | null }[];
  headers: EmailHeaders;
};

const AUTH_FAIL_REGEX = /(spf|dkim|dmarc)\s*=\s*(fail|softfail|policy)/i;

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

export function parseEmailPayload(
  provider: EmailProviderKind,
  payload: Record<string, unknown>,
): ParsedEmail | null {
  if (provider === "postmark") return parsePostmark(payload);
  if (provider === "resend") return parseResend(payload);
  return null;
}

export async function normalizeEmailPayload(
  channelId: string,
  provider: EmailProviderKind,
  payload: Record<string, unknown>,
): Promise<NormalizedInboundMessage[]> {
  const parsed = parseEmailPayload(provider, payload);
  if (!parsed) return [];

  if (isAutoResponder(parsed.headers, parsed.subject)) {
    return [];
  }

  const externalMessageId = parsed.rfcMessageId ?? parsed.providerMessageId;
  const externalThreadId = await resolveThreadId(channelId, parsed);

  const text = pickInboundText(parsed);
  const hasAttachments = parsed.attachments.length > 0;
  const dmarcFailed = isAuthFail(parsed.headers.authenticationResults);

  let unsupportedMediaType: string | undefined;
  let body: string;
  if (!text && hasAttachments) {
    unsupportedMediaType = "email_attachment";
    body = `[Unsupported email content: ${parsed.attachments
      .map((attachment) => attachment.name)
      .join(", ")}]`;
  } else if (!text) {
    return [];
  } else if (hasAttachments) {
    unsupportedMediaType = "email_attachment";
    body = `${text}\n\n[Attached files ignored: ${parsed.attachments
      .map((attachment) => attachment.name)
      .join(", ")}]`;
  } else if (dmarcFailed) {
    unsupportedMediaType = "email_auth_failed";
    body = `${text}\n\n[Sender authentication failed]`;
  } else {
    body = text;
  }

  return [
    {
      channelId,
      channelKind: "email",
      externalMessageId,
      externalThreadId,
      customerHandle: parsed.fromAddress,
      customerName: parsed.fromName,
      text: body,
      unsupportedMediaType,
      raw: {
        provider,
        parsed,
        original: payload,
      },
    },
  ];
}

function parsePostmark(payload: Record<string, unknown>): ParsedEmail | null {
  const providerMessageId = stringValue(payload.MessageID);
  const from = stringValue(payload.From);
  if (!providerMessageId || !from) return null;

  const headers = extractPostmarkHeaders(
    Array.isArray(payload.Headers) ? (payload.Headers as unknown[]) : [],
  );

  const fromName = stringValue(payload.FromName);
  const fromAddress = extractAddress(from);
  const subject = stringValue(payload.Subject) ?? "";
  const text = stringValue(payload.TextBody) ?? stringValue(payload.StrippedTextReply);
  const html = stringValue(payload.HtmlBody);
  const to = parseAddressList(payload.ToFull, payload.To);
  const cc = parseAddressList(payload.CcFull, payload.Cc);
  const attachments = Array.isArray(payload.Attachments)
    ? (payload.Attachments as Record<string, unknown>[]).map((attachment) => ({
        name: stringValue(attachment.Name) ?? "unnamed",
        contentType: stringValue(attachment.ContentType) ?? null,
        size: typeof attachment.ContentLength === "number" ? attachment.ContentLength : null,
      }))
    : [];

  return {
    provider: "postmark",
    providerMessageId,
    rfcMessageId: headers.messageId,
    fromAddress: fromAddress ?? from,
    fromName: fromName ?? undefined,
    to,
    cc,
    subject,
    text: text ?? null,
    html: html ?? null,
    attachments,
    headers,
  };
}

function parseResend(payload: Record<string, unknown>): ParsedEmail | null {
  const data = isRecord(payload.data) ? payload.data : payload;
  const providerMessageId =
    stringValue(data.email_id) ?? stringValue(data.id);
  const from = stringValue(data.from);
  if (!providerMessageId || !from) return null;

  const headerSource = isRecord(data.headers) ? data.headers : {};
  const headers = extractGenericHeaders(headerSource);
  const subject = stringValue(data.subject) ?? "";
  const text = stringValue(data.text);
  const html = stringValue(data.html);
  const to = listFromUnknown(data.to);
  const cc = listFromUnknown(data.cc);
  const attachments = Array.isArray(data.attachments)
    ? (data.attachments as Record<string, unknown>[]).map((attachment) => ({
        name: stringValue(attachment.filename) ?? "unnamed",
        contentType: stringValue(attachment.content_type) ?? null,
        size: typeof attachment.size === "number" ? attachment.size : null,
      }))
    : [];

  return {
    provider: "resend",
    providerMessageId,
    rfcMessageId: headers.messageId,
    fromAddress: extractAddress(from) ?? from,
    fromName: undefined,
    to,
    cc,
    subject,
    text: text ?? null,
    html: html ?? null,
    attachments,
    headers,
  };
}

function extractPostmarkHeaders(headers: unknown[]): EmailHeaders {
  const map = new Map<string, string>();
  for (const entry of headers) {
    if (!isRecord(entry)) continue;
    const name = stringValue(entry.Name);
    const value = stringValue(entry.Value);
    if (!name || !value) continue;
    map.set(name.toLowerCase(), value);
  }
  return mapToHeaders(map);
}

function extractGenericHeaders(headers: Record<string, unknown>): EmailHeaders {
  const map = new Map<string, string>();
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") map.set(key.toLowerCase(), value);
  }
  return mapToHeaders(map);
}

function mapToHeaders(map: Map<string, string>): EmailHeaders {
  const messageId = bracketTrim(map.get("message-id"));
  const inReplyTo = bracketTrim(map.get("in-reply-to"));
  const referencesRaw = map.get("references");
  const references = referencesRaw
    ? referencesRaw
        .split(/\s+/)
        .map((ref) => bracketTrim(ref))
        .filter((ref): ref is string => Boolean(ref))
    : [];
  return {
    messageId,
    inReplyTo,
    references,
    autoSubmitted: map.get("auto-submitted") ?? null,
    precedence: map.get("precedence") ?? null,
    authenticationResults: map.get("authentication-results") ?? null,
    listUnsubscribe: map.get("list-unsubscribe") ?? null,
  };
}

function isAutoResponder(headers: EmailHeaders, subject: string): boolean {
  if (headers.autoSubmitted && headers.autoSubmitted.toLowerCase() !== "no") return true;
  if (headers.precedence) {
    const value = headers.precedence.toLowerCase();
    if (value === "bulk" || value === "list" || value === "junk" || value === "auto_reply") {
      return true;
    }
  }
  if (headers.listUnsubscribe) {
    return true;
  }
  if (/^(out of office|automatic reply|auto-?reply|away from office)\b/i.test(subject.trim())) {
    return true;
  }
  return false;
}

function isAuthFail(authResults: string | null): boolean {
  if (!authResults) return false;
  return AUTH_FAIL_REGEX.test(authResults);
}

function pickInboundText(parsed: ParsedEmail): string | null {
  const text = parsed.text?.trim();
  if (text) return text;
  const html = parsed.html;
  if (!html) return null;
  return stripHtml(html);
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|br|li|tr|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function resolveThreadId(channelId: string, parsed: ParsedEmail): Promise<string> {
  const candidates: string[] = [];
  if (parsed.headers.inReplyTo) candidates.push(parsed.headers.inReplyTo);
  candidates.push(...parsed.headers.references);
  if (candidates.length) {
    const result = await query<{ external_thread_id: string }>(
      `
        select c.external_thread_id
        from conversations c
        join messages m on m.conversation_id = c.id
        where c.channel_id = $1
          and (
            m.external_message_id = any($2::text[])
            or m.metadata->>'rfcMessageId' = any($2::text[])
            or m.metadata->>'outgoingMessageId' = any($2::text[])
          )
        order by m.created_at desc
        limit 1
      `,
      [channelId, candidates],
    );
    const match = result.rows[0]?.external_thread_id;
    if (match) return match;
    return candidates[0];
  }
  const subject = subjectKey(parsed.subject);
  if (subject) return subject;
  return parsed.fromAddress.toLowerCase();
}

function subjectKey(subject: string): string | null {
  const stripped = subject.replace(/^\s*(re|fwd?|aw|sv):\s*/gi, "").trim();
  return stripped ? stripped.toLowerCase() : null;
}

function bracketTrim(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/^<|>$/g, "");
  return trimmed.length ? trimmed : null;
}

function extractAddress(value: string): string | null {
  const angle = /<([^>]+)>/.exec(value);
  if (angle?.[1]) return angle[1].trim().toLowerCase();
  return value.trim().toLowerCase() || null;
}

function parseAddressList(...sources: unknown[]): string[] {
  const out: string[] = [];
  for (const source of sources) {
    if (Array.isArray(source)) {
      for (const entry of source) {
        if (isRecord(entry) && typeof entry.Email === "string") {
          out.push(entry.Email.toLowerCase());
        } else if (typeof entry === "string") {
          const addr = extractAddress(entry);
          if (addr) out.push(addr);
        }
      }
    } else if (typeof source === "string") {
      for (const part of source.split(/[,;]/)) {
        const addr = extractAddress(part);
        if (addr) out.push(addr);
      }
    }
  }
  return Array.from(new Set(out));
}

function listFromUnknown(value: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .filter((entry): entry is string => typeof entry === "string")
          .map((entry) => extractAddress(entry))
          .filter((entry): entry is string => Boolean(entry)),
      ),
    );
  }
  if (typeof value === "string") return parseAddressList(value);
  return [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length ? value : undefined;
}

export async function isEmailSuppressed(input: {
  clientId: string;
  emailAddress: string;
}): Promise<boolean> {
  try {
    const result = await query<{ id: string }>(
      "select id from email_suppressions where client_id = $1 and lower(email_address) = lower($2) limit 1",
      [input.clientId, input.emailAddress],
    );
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "42P01"
    ) {
      return false;
    }
    throw error;
  }
}

export async function suppressEmailAddress(input: {
  clientId: string;
  emailAddress: string;
  reason: string;
  provider?: string;
  raw?: Record<string, unknown>;
}): Promise<void> {
  await query(
    `
      insert into email_suppressions (client_id, email_address, reason, provider, raw)
      values ($1, $2, $3, $4, $5)
      on conflict (client_id, email_address) do update set
        reason = excluded.reason,
        provider = excluded.provider,
        raw = excluded.raw,
        created_at = now()
    `,
    [
      input.clientId,
      input.emailAddress.toLowerCase(),
      input.reason,
      input.provider ?? null,
      input.raw ?? {},
    ],
  );
}

export async function lookupReplyThreadingHints(input: {
  channelId: string;
  externalThreadId: string;
}): Promise<{
  inReplyTo: string | null;
  references: string[];
  subject: string | null;
  to: string;
}> {
  const result = await query<{
    body: string;
    metadata: Record<string, unknown>;
    external_message_id: string;
    customer_handle: string | null;
  }>(
    `
      select m.body, m.metadata, m.external_message_id, c.customer_handle
      from messages m
      join conversations c on c.id = m.conversation_id
      where c.channel_id = $1
        and c.external_thread_id = $2
        and m.sender_role = 'customer'
      order by m.created_at desc
      limit 1
    `,
    [input.channelId, input.externalThreadId],
  );
  const row = result.rows[0];
  if (!row) {
    return { inReplyTo: null, references: [], subject: null, to: input.externalThreadId };
  }

  const raw = isRecord(row.metadata) ? (row.metadata.raw as Record<string, unknown> | undefined) : undefined;
  const parsed = raw && isRecord(raw.parsed) ? (raw.parsed as ParsedEmail) : null;
  const inReplyTo = parsed?.rfcMessageId ?? null;
  const references = parsed?.headers.references ?? [];
  const subject = parsed?.subject ?? null;
  return {
    inReplyTo,
    references: inReplyTo ? Array.from(new Set([...references, inReplyTo])) : references,
    subject,
    to: row.customer_handle ?? input.externalThreadId,
  };
}

export type EmailSendOptions = {
  channel: Channel;
  to: string;
  subject: string;
  text: string;
  inReplyTo?: string | null;
  references?: string[];
  fetchFn?: typeof fetch;
};

export async function sendEmail(input: EmailSendOptions): Promise<{ messageId: string }> {
  const provider =
    (input.channel.credentials.provider as EmailProviderKind | undefined) ?? "postmark";
  const apiKey =
    (input.channel.credentials.apiKey as string | undefined) ??
    (provider === "postmark" ? process.env.POSTMARK_API_TOKEN : process.env.RESEND_API_KEY);
  const from =
    (input.channel.credentials.fromAddress as string | undefined) ??
    (provider === "postmark" ? process.env.POSTMARK_FROM_ADDRESS : process.env.RESEND_FROM_ADDRESS);

  if (!apiKey || !from) {
    throw new Error(`Email credentials missing for provider ${provider}; outbound send skipped.`);
  }

  if (await isEmailSuppressed({ clientId: input.channel.client_id, emailAddress: input.to })) {
    throw new Error(`Email address ${input.to} is on the suppression list.`);
  }

  const outboundMessageId = buildOutboundMessageId(from);
  const subject = ensureReSubject(input.subject);
  const headerMap = buildOutboundHeaderMap({
    messageId: outboundMessageId,
    inReplyTo: input.inReplyTo,
    references: input.references,
  });
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
        Subject: subject,
        TextBody: input.text,
        MessageStream: "outbound",
        Headers: Object.entries(headerMap).map(([Name, Value]) => ({ Name, Value })),
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Postmark send failed: ${response.status} ${body}`);
    }
    return { messageId: outboundMessageId };
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
      subject,
      text: input.text,
      headers: headerMap,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend send failed: ${response.status} ${body}`);
  }
  return { messageId: outboundMessageId };
}

function buildOutboundMessageId(fromAddress: string): string {
  const domain = fromAddress.split("@")[1] ?? "pronto.sg";
  return `<${randomUUID()}@${domain}>`;
}

function buildOutboundHeaderMap(input: {
  messageId: string;
  inReplyTo?: string | null;
  references?: string[];
}): Record<string, string> {
  const headers: Record<string, string> = {
    "Message-Id": input.messageId,
    "Auto-Submitted": "auto-replied",
    "X-Auto-Response-Suppress": "All",
  };
  if (input.inReplyTo) {
    headers["In-Reply-To"] = ensureAngleBrackets(input.inReplyTo);
  }
  const references = (input.references ?? []).map(ensureAngleBrackets);
  if (references.length) {
    headers.References = references.join(" ");
  }
  return headers;
}

function ensureAngleBrackets(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("<") && trimmed.endsWith(">")) return trimmed;
  return `<${trimmed.replace(/^<|>$/g, "")}>`;
}

function ensureReSubject(subject: string): string {
  const trimmed = subject.trim();
  if (!trimmed) return "Re: your inquiry";
  if (/^re:\s/i.test(trimmed)) return trimmed;
  return `Re: ${trimmed}`;
}

export async function getEmailChannel(channelId: string): Promise<Channel | null> {
  const result = await query<Channel>(
    "select * from channels where id = $1 and kind = 'email'",
    [channelId],
  );
  return result.rows[0] ? decryptChannelCredentials(result.rows[0]) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
