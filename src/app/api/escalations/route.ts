import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { query, transaction } from "@/lib/db";
import { sendChannelText } from "@/lib/channels/dispatch";
import type { ChannelKind, EscalationStatus } from "@/lib/types";

type EscalationActionRecord = {
  id: string;
  client_id: string;
  conversation_id: string;
  status: EscalationStatus;
  channel_id: string;
  channel_kind: ChannelKind;
  external_thread_id: string;
};

export async function POST(request: Request) {
  const user = await requireUser();
  const form = await request.formData();
  const escalationId = String(form.get("escalationId") ?? "");
  const action = String(form.get("action") ?? "");
  const returnTo = safeReturnPath(
    String(form.get("returnTo") ?? ""),
    user.role === "operator" ? "/operator" : "/client",
  );

  const escalation = await loadEscalation(escalationId);
  if (!escalation) {
    return NextResponse.json({ error: "Escalation not found." }, { status: 404 });
  }
  if (user.role === "client" && escalation.client_id !== user.clientId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (action === "claim") {
    await query(
      "update escalations set status = 'claimed' where id = $1 and status = 'open'",
      [escalation.id],
    );
    await query(
      "insert into audit_logs (client_id, actor_user_id, action, target_type, target_id, metadata) values ($1, $2, 'escalation.claimed', 'escalation', $3, $4)",
      [escalation.client_id, user.userId, escalation.id, { previousStatus: escalation.status }],
    );

    return NextResponse.redirect(new URL(returnTo, request.url), 303);
  }

  if (action === "resolve") {
    const reply = String(form.get("reply") ?? "").trim();
    if (reply && escalation.channel_kind !== "console") {
      await sendChannelText({
        channelId: escalation.channel_id,
        externalThreadId: escalation.external_thread_id,
        text: reply,
      });
    }

    await transaction(async (client) => {
      if (reply) {
        await client.query(
          `
            insert into messages (conversation_id, client_id, channel_id, external_message_id, sender_role, body, metadata)
            values ($1, $2, $3, $4, 'operator', $5, $6)
          `,
          [
            escalation.conversation_id,
            escalation.client_id,
            escalation.channel_id,
            `owner-${randomUUID()}`,
            reply,
            {
              escalationId: escalation.id,
              resolvedBy: user.userId,
              sentToCustomer: escalation.channel_kind !== "console",
            },
          ],
        );
      }

      await client.query(
        "update escalations set status = 'resolved', resolved_at = now() where id = $1",
        [escalation.id],
      );
      await client.query(
        "update conversations set status = 'closed', last_message_at = now() where id = $1",
        [escalation.conversation_id],
      );
      await client.query(
        "insert into metric_events (client_id, event_type, value, metadata) values ($1, 'escalation_resolved', 1, $2)",
        [
          escalation.client_id,
          { escalationId: escalation.id, resolvedBy: user.userId, sentReply: Boolean(reply) },
        ],
      );
      await client.query(
        "insert into audit_logs (client_id, actor_user_id, action, target_type, target_id, metadata) values ($1, $2, 'escalation.resolved', 'escalation', $3, $4)",
        [
          escalation.client_id,
          user.userId,
          escalation.id,
          { previousStatus: escalation.status, sentReply: Boolean(reply) },
        ],
      );
    });

    return NextResponse.redirect(new URL(returnTo, request.url), 303);
  }

  return NextResponse.json({ error: "Unsupported escalation action." }, { status: 400 });
}

async function loadEscalation(
  escalationId: string,
): Promise<EscalationActionRecord | null> {
  const result = await query<EscalationActionRecord>(
    `
      select
        e.id,
        e.client_id,
        e.conversation_id,
        e.status,
        c.channel_id,
        c.external_thread_id,
        ch.kind as channel_kind
      from escalations e
      join conversations c on c.id = e.conversation_id
      join channels ch on ch.id = c.channel_id
      where e.id = $1
    `,
    [escalationId],
  );
  return result.rows[0] ?? null;
}

function safeReturnPath(value: string, fallback: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}
