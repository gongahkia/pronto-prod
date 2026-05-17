import { query, transaction } from "@/lib/db";
import type { Channel, Client, Conversation, Escalation, Message } from "@/lib/types";

const SECRET_KEY_PATTERN = /(secret|token|password|key|credential)/i;

export type OffboardingExport = {
  exportedAt: string;
  client: Client;
  channels: Array<Omit<Channel, "credentials"> & { credentials: Record<string, unknown> }>;
  knowledgeSources: unknown[];
  conversations: Array<Conversation & { messages: Message[] }>;
  escalations: Escalation[];
  reviews: unknown[];
  agentConfig: unknown | null;
};

export async function buildClientOffboardingExport(
  clientId: string,
): Promise<OffboardingExport> {
  const [
    clientResult,
    channelResult,
    sourceResult,
    conversationResult,
    escalationResult,
    reviewResult,
    configResult,
  ] = await Promise.all([
    query<Client>("select * from clients where id = $1", [clientId]),
    query<Channel>("select * from channels where client_id = $1 order by kind", [
      clientId,
    ]),
    query("select * from knowledge_sources where client_id = $1 order by created_at", [
      clientId,
    ]),
    query<Conversation>(
      "select * from conversations where client_id = $1 order by created_at",
      [clientId],
    ),
    query<Escalation>("select * from escalations where client_id = $1 order by created_at", [
      clientId,
    ]),
    query("select * from reviews where client_id = $1 order by created_at", [clientId]),
    query("select * from agent_configs where client_id = $1", [clientId]),
  ]);

  const client = clientResult.rows[0];
  if (!client) {
    throw new Error(`Client not found: ${clientId}`);
  }

  const conversations = await Promise.all(
    conversationResult.rows.map(async (conversation) => {
      const messages = await query<Message>(
        "select * from messages where conversation_id = $1 order by created_at",
        [conversation.id],
      );
      return { ...conversation, messages: messages.rows };
    }),
  );

  return {
    exportedAt: new Date().toISOString(),
    client,
    channels: channelResult.rows.map(redactChannel),
    knowledgeSources: sourceResult.rows,
    conversations,
    escalations: escalationResult.rows,
    reviews: reviewResult.rows,
    agentConfig: configResult.rows[0] ?? null,
  };
}

export async function deleteClientForOffboarding(input: {
  clientId: string;
  confirmSlug: string;
  actorUserId: string;
}): Promise<{ slug: string; name: string }> {
  const clientResult = await query<Client>("select * from clients where id = $1", [
    input.clientId,
  ]);
  const client = clientResult.rows[0];
  if (!client) {
    throw new Error(`Client not found: ${input.clientId}`);
  }
  if (input.confirmSlug !== client.slug) {
    throw new Error(`Confirmation slug must be exactly ${client.slug}.`);
  }

  await transaction(async (db) => {
    await db.query(
      "update channels set status = 'disabled', updated_at = now() where client_id = $1",
      [client.id],
    );
    await db.query(
      "insert into audit_logs (client_id, actor_user_id, action, target_type, target_id, metadata) values (null, $1, 'client.offboarded_deleted', 'client', $2, $3)",
      [
        input.actorUserId,
        client.id,
        {
          slug: client.slug,
          name: client.name,
          deletedAt: new Date().toISOString(),
        },
      ],
    );
    await db.query("delete from clients where id = $1", [client.id]);
  });

  return { slug: client.slug, name: client.name };
}

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSecrets);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SECRET_KEY_PATTERN.test(key) ? "[redacted]" : redactSecrets(entry),
    ]),
  );
}

function redactChannel(
  channel: Channel,
): Omit<Channel, "credentials"> & { credentials: Record<string, unknown> } {
  return {
    ...channel,
    credentials: redactSecrets(channel.credentials) as Record<string, unknown>,
  };
}
