import { canAccessClient } from "@/lib/rbac";
import { query } from "@/lib/db";
import { getClient, getChannels, getKnowledgeSources } from "@/lib/dashboard";
import { getEmbeddingProvider } from "@/lib/llm";
import { retrieveKnowledge } from "@/lib/knowledge/retrieve";
import { getClientAssistantChangeRequests } from "@/lib/client-assistant-requests";
import { getKnowledgeRefreshRequests } from "@/lib/knowledge/refresh";
import {
  getClientDashboardAnalytics,
  getFilteredConversations,
  getKnowledgeGapReport,
  getOperationalAlerts,
  getOperatorCommandCenter,
  getSlaSummary,
} from "@/lib/reporting";
import { redactSecrets } from "@/lib/offboarding";
import type { SessionUser } from "@/lib/auth";
import type {
  AgentConfig,
  BrandVoiceDocument,
  BrandVoiceExample,
  Client,
  KnowledgeChunk,
  Message,
} from "@/lib/types";
import type { AssistantContext, AssistantContextRecord } from "@/lib/assistant/types";

const MAX_RECORDS = 90;

export async function buildAssistantContext(input: {
  user: SessionUser;
  message: string;
  pagePath?: string | null;
  clientId?: string | null;
}): Promise<AssistantContext> {
  const pagePath = normalizePagePath(input.pagePath);
  const focusedClientId = await resolveFocusedClientId(input.user, {
    pagePath,
    submittedClientId: input.clientId ?? null,
  });

  const records: AssistantContextRecord[] = [];
  const summary: string[] = [];
  let focusedClientName: string | null = null;

  if (input.user.role === "operator") {
    const [commandCenter, alerts, gaps, clients] = await Promise.all([
      getOperatorCommandCenter(),
      getOperationalAlerts({ limit: 12 }),
      getKnowledgeGapReport({ limit: 12 }),
      query<Client>(
        `
          select id, name, slug, vertical, plan_tier, status, business_profile, brand_voice, created_at, updated_at
          from clients
          order by updated_at desc
          limit 30
        `,
      ),
    ]);

    summary.push(
      `Operator portfolio: ${commandCenter.clientHealth.length} clients, ${commandCenter.needsActionNow} need action, ${commandCenter.slaBreaches} SLA breaches, ${commandCenter.failedSends} failed sends.`,
    );
    for (const client of clients.rows) {
      records.push(record("client", client.id, client.name, `/operator/clients/${client.id}`, {
        id: client.id,
        name: client.name,
        slug: client.slug,
        vertical: client.vertical,
        planTier: client.plan_tier,
        status: client.status,
        businessProfile: redactAssistantContextValue(client.business_profile),
      }));
    }
    for (const health of commandCenter.clientHealth.slice(0, 20)) {
      records.push(record("client_health", health.clientId, health.name, `/operator/clients/${health.clientId}`, health));
    }
    for (const alert of alerts) {
      records.push(record("operational_alert", alert.id, alert.title, alert.href, alert));
    }
    for (const gap of gaps) {
      records.push(record("knowledge_gap", gap.conversation_id, gap.client_name, operatorConversationHref(gap.client_id, gap.conversation_id), gap));
    }
  }

  if (focusedClientId) {
    const client = await getClient(focusedClientId);
    if (client) {
      focusedClientName = client.name;
      await addClientScopedContext({
        user: input.user,
        client,
        message: input.message,
        records,
        summary,
      });
    }
  } else if (input.user.role === "client" && input.user.clientId) {
    const client = await getClient(input.user.clientId);
    if (client) {
      focusedClientName = client.name;
      await addClientScopedContext({
        user: input.user,
        client,
        message: input.message,
        records,
        summary,
      });
    }
  } else if (input.user.role === "operator") {
    await addCrossClientOperationalRecords(records);
  }

  return {
    user: {
      userId: input.user.userId,
      email: input.user.email,
      name: input.user.name,
      role: input.user.role,
      clientId: input.user.clientId,
    },
    pagePath,
    focusedClientId,
    focusedClientName,
    summary,
    records: records.slice(0, MAX_RECORDS),
  };
}

export function redactAssistantContextValue(value: unknown): unknown {
  return redactSecrets(value);
}

async function addClientScopedContext(input: {
  user: SessionUser;
  client: Client;
  message: string;
  records: AssistantContextRecord[];
  summary: string[];
}) {
  const clientId = input.client.id;
  const [
    analytics,
    sla,
    conversations,
    escalatedConversations,
    gaps,
    sources,
    refreshRequests,
    assistantRequests,
    channels,
    configResult,
    brandVoiceResult,
    brandExamplesResult,
    usageResult,
    auditResult,
    retrievedChunks,
  ] = await Promise.all([
    getClientDashboardAnalytics(clientId),
    getSlaSummary(clientId),
    getFilteredConversations({ clientId, limit: 12 }),
    getFilteredConversations({ clientId, status: "escalated", limit: 10 }),
    getKnowledgeGapReport({ clientId, limit: 12 }),
    getKnowledgeSources(clientId),
    getKnowledgeRefreshRequests(clientId, 12),
    getClientAssistantChangeRequests(clientId, 12),
    getChannels(clientId),
    query<AgentConfig>("select * from agent_configs where client_id = $1", [clientId]),
    query<BrandVoiceDocument>("select * from brand_voice_documents where client_id = $1", [clientId]),
    query<BrandVoiceExample>(
      "select * from brand_voice_examples where client_id = $1 order by is_active desc, created_at desc limit 12",
      [clientId],
    ),
    query<{ operation: string; calls: string; estimated_cost_usd: string | null }>(
      `
        select operation, count(*)::text as calls, sum(estimated_cost_usd)::text as estimated_cost_usd
        from agent_usage_events
        where client_id = $1
          and created_at >= now() - interval '30 days'
        group by operation
        order by operation
      `,
      [clientId],
    ),
    query(
      `
        select action, target_type, target_id, metadata, created_at
        from audit_logs
        where client_id = $1
        order by created_at desc
        limit 12
      `,
      [clientId],
    ),
    retrieveRelevantKnowledge(clientId, input.message),
  ]);

  input.summary.push(
    `${input.client.name}: ${analytics.conversationCount} conversations, ${analytics.actionableEscalations} actionable escalations, ${Math.round(analytics.escalationRate * 100)}% escalation rate, ${analytics.knowledgeGapCount} knowledge gaps.`,
  );
  input.records.push(record("client", input.client.id, input.client.name, clientHref(input.user, input.client.id), {
    id: input.client.id,
    name: input.client.name,
    slug: input.client.slug,
    vertical: input.client.vertical,
    planTier: input.client.plan_tier,
    status: input.client.status,
    businessProfile: redactAssistantContextValue(input.client.business_profile),
  }));
  input.records.push(record("client_metrics", input.client.id, `${input.client.name} metrics`, clientHref(input.user, input.client.id), {
    analytics,
    sla,
    usageLast30Days: usageResult.rows,
  }));

  for (const channel of channels) {
    input.records.push(record("channel", channel.id, `${channel.kind} ${channel.name}`, `${clientHref(input.user, input.client.id)}/channels`, {
      id: channel.id,
      clientId: channel.client_id,
      kind: channel.kind,
      name: channel.name,
      status: channel.status,
      externalId: channel.external_id,
      settings: redactAssistantContextValue(channel.settings),
      lastHealthCheckAt: channel.last_health_check_at,
      lastHealthStatus: channel.last_health_status,
      lastHealthError: channel.last_health_error,
      lastOutboundAt: channel.last_outbound_at,
      lastOutboundError: channel.last_outbound_error,
    }));
  }
  for (const conversation of [...escalatedConversations, ...conversations].slice(0, 18)) {
    input.records.push(record("conversation", conversation.id, conversation.customer_name ?? conversation.customer_handle ?? conversation.id, conversationHref(input.user, conversation.client_id, conversation.id), conversation));
  }
  await addRecentMessages(input.records, clientId, conversations.map((conversation) => conversation.id).slice(0, 8));
  for (const gap of gaps) {
    input.records.push(record("knowledge_gap", gap.conversation_id, gap.reason_code ?? gap.gap_source, conversationHref(input.user, gap.client_id, gap.conversation_id), gap));
  }
  for (const source of sources) {
    input.records.push(record("knowledge_source", source.id, source.title, `${clientHref(input.user, clientId)}/knowledge/${source.id}`, source));
  }
  for (const chunk of retrievedChunks) {
    input.records.push(record("knowledge_chunk", chunk.id, `Source chunk ${chunk.chunk_index}`, `${clientHref(input.user, clientId)}/knowledge/${chunk.source_id}`, {
      id: chunk.id,
      sourceId: chunk.source_id,
      clientId: chunk.client_id,
      chunkIndex: chunk.chunk_index,
      content: chunk.content,
      score: chunk.score,
      metadata: redactAssistantContextValue(chunk.metadata),
    }));
  }
  for (const request of refreshRequests) {
    input.records.push(record("knowledge_refresh_request", request.id, request.status, `${clientHref(input.user, clientId)}/knowledge`, request));
  }
  for (const request of assistantRequests) {
    input.records.push(record("assistant_change_request", request.id, request.kind, `${clientHref(input.user, clientId)}/assistant`, request));
  }
  const config = configResult.rows[0];
  if (config) {
    input.records.push(record("agent_config", config.id, `${input.client.name} agent config`, `${clientHref(input.user, clientId)}/assistant`, {
      id: config.id,
      clientId: config.client_id,
      responseProvider: config.response_provider,
      responseModel: config.response_model,
      embeddingProvider: config.embedding_provider,
      embeddingModel: config.embedding_model,
      retrievalThreshold: config.retrieval_threshold,
      promptPreamble: config.prompt_preamble,
      escalationRules: redactAssistantContextValue(config.escalation_rules),
    }));
  }
  if (brandVoiceResult.rows[0]) {
    input.records.push(record("brand_voice_document", brandVoiceResult.rows[0].id, brandVoiceResult.rows[0].title, `${clientHref(input.user, clientId)}/assistant`, brandVoiceResult.rows[0]));
  }
  for (const example of brandExamplesResult.rows) {
    input.records.push(record("brand_voice_example", example.id, example.customer_message.slice(0, 80), `${clientHref(input.user, clientId)}/assistant`, example));
  }
  for (const audit of auditResult.rows) {
    input.records.push(record("audit_log", String(audit.target_id ?? audit.action), String(audit.action), clientHref(input.user, clientId), {
      ...audit,
      metadata: redactAssistantContextValue(audit.metadata),
    }));
  }
}

async function addCrossClientOperationalRecords(records: AssistantContextRecord[]) {
  const [refreshes, assistantRequests, recentReviews] = await Promise.all([
    query(
      `
        select krr.*, cl.name as client_name
        from knowledge_refresh_requests krr
        join clients cl on cl.id = krr.client_id
        where krr.status = 'open'
        order by krr.due_at asc
        limit 20
      `,
    ),
    query(
      `
        select car.*, cl.name as client_name
        from client_assistant_change_requests car
        join clients cl on cl.id = car.client_id
        where car.status in ('open', 'reviewing')
        order by car.created_at desc
        limit 20
      `,
    ),
    query(
      `
        select r.*, cl.name as client_name
        from reviews r
        join clients cl on cl.id = r.client_id
        order by r.created_at desc
        limit 20
      `,
    ),
  ]);
  for (const row of refreshes.rows) {
    records.push(record("knowledge_refresh_request", row.id, row.client_name, `/operator/clients/${row.client_id}/knowledge`, row));
  }
  for (const row of assistantRequests.rows) {
    records.push(record("assistant_change_request", row.id, row.client_name, `/operator/clients/${row.client_id}`, row));
  }
  for (const row of recentReviews.rows) {
    records.push(record("review", row.id, row.client_name, operatorConversationHref(row.client_id, row.conversation_id), row));
  }
}

async function addRecentMessages(
  records: AssistantContextRecord[],
  clientId: string,
  conversationIds: string[],
) {
  if (!conversationIds.length) {
    return;
  }
  const result = await query<Message>(
    `
      select *
      from messages
      where client_id = $1
        and conversation_id = any($2::uuid[])
      order by created_at desc
      limit 30
    `,
    [clientId, conversationIds],
  );
  for (const message of result.rows.reverse()) {
    records.push(record("message", message.id, `${message.sender_role}: ${message.body.slice(0, 80)}`, undefined, {
      id: message.id,
      conversationId: message.conversation_id,
      clientId: message.client_id,
      channelId: message.channel_id,
      senderRole: message.sender_role,
      body: message.body,
      metadata: redactAssistantContextValue(message.metadata),
      createdAt: message.created_at,
    }));
  }
}

async function retrieveRelevantKnowledge(
  clientId: string,
  message: string,
): Promise<KnowledgeChunk[]> {
  const config = await query<{ embedding_model: string; embedding_provider: string }>(
    "select embedding_model, embedding_provider from agent_configs where client_id = $1",
    [clientId],
  );
  const model = config.rows[0]?.embedding_model ?? process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
  try {
    const [embedding] = await getEmbeddingProvider(config.rows[0]?.embedding_provider).embed(
      [message],
      model,
      {
        clientId,
        operation: "embedding",
      },
    );
    return retrieveKnowledge(clientId, embedding, 6);
  } catch {
    return [];
  }
}

async function resolveFocusedClientId(
  user: SessionUser,
  input: { pagePath: string | null; submittedClientId: string | null },
): Promise<string | null> {
  if (user.role === "client") {
    return user.clientId;
  }
  const candidate = input.submittedClientId ?? extractClientIdFromPath(input.pagePath);
  if (!candidate) {
    return null;
  }
  const client = await getClient(candidate);
  if (!client || !canAccessClient(user, client.id)) {
    return null;
  }
  return client.id;
}

function extractClientIdFromPath(pagePath: string | null): string | null {
  if (!pagePath) {
    return null;
  }
  const match = pagePath.match(/\/operator\/clients\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function normalizePagePath(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text || text.startsWith("//") || !text.startsWith("/")) {
    return null;
  }
  return text.slice(0, 300);
}

function record(
  type: string,
  id: string,
  label: string,
  href: string | undefined,
  data: Record<string, unknown>,
): AssistantContextRecord {
  return {
    type,
    id,
    label,
    href,
    data: redactAssistantContextValue(data) as Record<string, unknown>,
  };
}

function clientHref(user: SessionUser, clientId: string): string {
  return user.role === "operator" ? `/operator/clients/${clientId}` : "/client";
}

function conversationHref(user: SessionUser, clientId: string, conversationId: string): string {
  return user.role === "operator"
    ? operatorConversationHref(clientId, conversationId)
    : `/client/conversations/${conversationId}`;
}

function operatorConversationHref(clientId: string, conversationId: string): string {
  return `/operator/clients/${clientId}/conversations/${conversationId}`;
}
