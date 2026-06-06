import { z } from "zod";
import { recordAuditLog } from "@/lib/audit";
import { canAccessClient } from "@/lib/rbac";
import { query, transaction } from "@/lib/db";
import { enqueueOutboundMessage, flushOutboundMessage } from "@/lib/channels/outbox";
import { checkChannelHealth } from "@/lib/channels/health";
import { createClientAssistantChangeRequest } from "@/lib/client-assistant-requests";
import {
  createKnowledgeRefreshRequest,
  resolveKnowledgeRefreshRequest,
} from "@/lib/knowledge/refresh";
import { ingestKnowledgeSource } from "@/lib/knowledge/ingest";
import {
  deleteKnowledgeSourceForClient,
  updateKnowledgeSourceForClient,
} from "@/lib/knowledge/manage";
import { updateAgentConfigForClient } from "@/lib/agent/config";
import {
  addBrandVoiceExample,
  deleteBrandVoiceExample,
  setBrandVoiceExampleActive,
  updateBrandVoiceDocument,
} from "@/lib/brand-voice";
import { updateClientLaunchAndCommercial } from "@/lib/pilot-metrics";
import {
  buildClientOffboardingExport,
  deleteClientForOffboarding,
  redactSecrets,
} from "@/lib/offboarding";
import {
  buildDefaultTriageFlow,
  compileTriageFlowToEscalationRules,
} from "@/lib/triage-flow";
import type { SessionUser } from "@/lib/auth";
import type {
  AssistantActionResult,
  AssistantActionProposalRecord,
  AssistantActionType,
} from "@/lib/assistant/types";
import type { ChannelStatus } from "@/lib/types";

const clientAllowedActions = new Set<AssistantActionType>([
  "escalation_claim",
  "escalation_resolve",
  "escalation_retry_outbound",
  "knowledge_create",
  "knowledge_update",
  "knowledge_delete",
  "knowledge_refresh_create",
  "knowledge_refresh_resolve",
  "assistant_request_create",
  "review_create",
]);

const recordSchema = z.record(z.string(), z.unknown());
const stringSchema = z.string().trim().min(1);

export function isAssistantActionAllowedForUser(
  user: SessionUser,
  actionType: AssistantActionType,
): boolean {
  return user.role === "operator" || clientAllowedActions.has(actionType);
}

export async function executeAssistantAction(input: {
  user: SessionUser;
  proposal: AssistantActionProposalRecord;
  confirmationText?: string | null;
  editedPayload?: Record<string, unknown> | null;
}): Promise<AssistantActionResult> {
  if (!isAssistantActionAllowedForUser(input.user, input.proposal.action_type)) {
    throw new Error("This action is not available for your role.");
  }
  if (
    input.proposal.requires_typed_confirmation &&
    input.confirmationText !== input.proposal.requires_typed_confirmation
  ) {
    throw new Error(`Type ${input.proposal.requires_typed_confirmation} to confirm this action.`);
  }

  const payload = input.editedPayload ?? input.proposal.payload;

  switch (input.proposal.action_type) {
    case "escalation_claim":
      return claimEscalation(input.user, payload);
    case "escalation_resolve":
      return resolveEscalation(input.user, payload);
    case "escalation_retry_outbound":
      return retryOutbound(input.user, payload);
    case "knowledge_create":
      return createKnowledge(input.user, payload);
    case "knowledge_update":
      return updateKnowledge(input.user, payload);
    case "knowledge_delete":
      return deleteKnowledge(input.user, payload);
    case "knowledge_refresh_create":
      return createRefresh(input.user, payload);
    case "knowledge_refresh_resolve":
      return resolveRefresh(input.user, payload);
    case "assistant_request_create":
      return createAssistantRequest(input.user, payload);
    case "review_create":
      return createReview(input.user, payload);
    case "channel_health_check":
      return channelHealth(input.user, payload);
    case "channel_update":
      return updateChannel(input.user, payload);
    case "client_create":
      return createClient(input.user, payload);
    case "commercial_update":
      return updateCommercial(input.user, payload);
    case "agent_config_update":
      return updateAgentConfig(input.user, payload);
    case "brand_voice_update_document":
      return updateBrandVoice(input.user, payload);
    case "brand_voice_add_example":
      return addBrandExample(input.user, payload);
    case "brand_voice_toggle_example":
      return toggleBrandExample(input.user, payload);
    case "brand_voice_delete_example":
      return deleteBrandExample(input.user, payload);
    case "offboarding_export":
      return exportOffboarding(input.user, payload);
    case "offboarding_delete":
      return deleteOffboarding(input.user, payload);
  }
}

async function claimEscalation(user: SessionUser, payload: Record<string, unknown>) {
  const { escalationId } = z.object({ escalationId: stringSchema }).parse(payload);
  const escalation = await loadEscalation(escalationId);
  if (!escalation) {
    throw new Error("Escalation not found.");
  }
  requireClientAccess(user, escalation.client_id);
  await query("update escalations set status = 'claimed' where id = $1 and status = 'open'", [
    escalation.id,
  ]);
  await recordAuditLog({
    clientId: escalation.client_id,
    actorUserId: user.userId,
    action: "assistant.escalation_claimed",
    targetType: "escalation",
    targetId: escalation.id,
    metadata: { previousStatus: escalation.status },
  });
  return {
    message: "Escalation claimed.",
    href: conversationHref(user, escalation.client_id, escalation.conversation_id),
    nextActions: [
      {
        label: "Open conversation",
        href: conversationHref(user, escalation.client_id, escalation.conversation_id),
      },
      {
        label: "Draft a reply",
        prompt: "Draft a concise customer reply for this escalation.",
      },
    ],
  };
}

async function resolveEscalation(user: SessionUser, payload: Record<string, unknown>) {
  const parsed = z.object({
    escalationId: stringSchema,
    reply: z.string().trim().max(3000).optional().default(""),
  }).parse(payload);
  const escalation = await loadEscalation(parsed.escalationId);
  if (!escalation) {
    throw new Error("Escalation not found.");
  }
  requireClientAccess(user, escalation.client_id);
  let outboundMessageId: string | null = null;
  await transaction(async (client) => {
    const resolved = await client.query(
      `
        update escalations
        set status = 'resolved',
            resolved_at = coalesce(resolved_at, now())
        where id = $1 and status <> 'resolved'
        returning id
      `,
      [escalation.id],
    );
    if (!resolved.rowCount) {
      return;
    }
    if (parsed.reply) {
      await client.query(
        `
          insert into messages (conversation_id, client_id, channel_id, external_message_id, sender_role, body, metadata)
          values ($1, $2, $3, $4, 'operator', $5, $6)
          on conflict (channel_id, external_message_id) do nothing
        `,
        [
          escalation.conversation_id,
          escalation.client_id,
          escalation.channel_id,
          `assistant-resolution-${escalation.id}`,
          parsed.reply,
          {
            escalationId: escalation.id,
            resolvedBy: user.userId,
            assistantAction: true,
            sentToCustomer: escalation.channel_kind !== "console",
          },
        ],
      );
    }
    if (parsed.reply && escalation.channel_kind !== "console") {
      const outbound = await enqueueOutboundMessage(client, {
        clientId: escalation.client_id,
        conversationId: escalation.conversation_id,
        escalationId: escalation.id,
        channelId: escalation.channel_id,
        externalThreadId: escalation.external_thread_id,
        body: parsed.reply,
        idempotencyKey: `assistant-escalation-resolution:${escalation.id}`,
        metadata: {
          purpose: "escalation_resolution_reply",
          resolvedBy: user.userId,
          assistantAction: true,
        },
      });
      outboundMessageId = outbound.id;
    }
    await client.query(
      "update conversations set status = 'closed', last_message_at = now() where id = $1",
      [escalation.conversation_id],
    );
    await client.query(
      "insert into metric_events (client_id, event_type, value, metadata) values ($1, 'escalation_resolved', 1, $2)",
      [
        escalation.client_id,
        { escalationId: escalation.id, resolvedBy: user.userId, assistantAction: true },
      ],
    );
    await recordAuditLog(
      {
        clientId: escalation.client_id,
        actorUserId: user.userId,
        action: "assistant.escalation_resolved",
        targetType: "escalation",
        targetId: escalation.id,
        metadata: {
          previousStatus: escalation.status,
          sentReply: Boolean(parsed.reply),
          outboundQueued: Boolean(outboundMessageId),
        },
      },
      client,
    );
  });
  if (outboundMessageId) {
    await flushOutboundMessage(outboundMessageId);
  }
  return {
    message: "Escalation resolved.",
    href: conversationHref(user, escalation.client_id, escalation.conversation_id),
    nextActions: [
      {
        label: "Open conversation",
        href: conversationHref(user, escalation.client_id, escalation.conversation_id),
      },
      {
        label: "Add review",
        proposal: {
          actionType: "review_create" as const,
          title: "Add conversation review",
          description: "Record a QA review for the resolved conversation.",
          payload: {
            clientId: escalation.client_id,
            conversationId: escalation.conversation_id,
            answerLabel: "answered_correctly",
            notes: "Resolved from assistant action.",
          },
        },
      },
    ],
  };
}

async function retryOutbound(user: SessionUser, payload: Record<string, unknown>) {
  const parsed = z.object({
    escalationId: stringSchema,
    outboundMessageId: stringSchema,
  }).parse(payload);
  const escalation = await loadEscalation(parsed.escalationId);
  if (!escalation) {
    throw new Error("Escalation not found.");
  }
  requireClientAccess(user, escalation.client_id);
  const outbound = await query<{ id: string; status: string }>(
    `
      select id, status
      from outbound_messages
      where id = $1
        and escalation_id = $2
        and client_id = $3
    `,
    [parsed.outboundMessageId, escalation.id, escalation.client_id],
  );
  if (!outbound.rows[0]) {
    throw new Error("Outbound message not found.");
  }
  const result = await flushOutboundMessage(outbound.rows[0].id);
  await recordAuditLog({
    clientId: escalation.client_id,
    actorUserId: user.userId,
    action: "assistant.escalation_outbound_retry",
    targetType: "outbound_message",
    targetId: outbound.rows[0].id,
    metadata: { result },
  });
  return {
    message: `Outbound retry ${result.status}.`,
    data: result,
    nextActions: [
      { label: "Open conversation", href: conversationHref(user, escalation.client_id, escalation.conversation_id) },
    ],
  };
}

async function createKnowledge(user: SessionUser, payload: Record<string, unknown>) {
  const parsed = z.object({
    clientId: z.string().optional(),
    title: stringSchema,
    content: stringSchema,
    sourceType: z.string().trim().min(1).max(80).optional().default("assistant_generated"),
  }).parse(payload);
  const clientId = normalizeClientId(user, parsed.clientId);
  requireClientAccess(user, clientId);
  const result = await ingestKnowledgeSource({
    clientId,
    title: parsed.title,
    sourceType: parsed.sourceType,
    content: parsed.content,
    metadata: { entryMode: "assistant", createdFromAssistant: true },
    actorUserId: user.userId,
  });
  return {
    message: `Knowledge source created with ${result.chunkCount} chunks.`,
    href: knowledgeHref(user, clientId, result.sourceId),
    data: result,
    nextActions: [
      { label: "Open source", href: knowledgeHref(user, clientId, result.sourceId) },
      { label: "Run a test question", prompt: "Test whether the assistant can answer using the new source." },
    ],
  };
}

async function updateKnowledge(user: SessionUser, payload: Record<string, unknown>) {
  const parsed = z.object({
    clientId: z.string().optional(),
    sourceId: stringSchema,
    title: stringSchema,
    content: stringSchema,
  }).parse(payload);
  const clientId = normalizeClientId(user, parsed.clientId);
  requireClientAccess(user, clientId);
  const result = await updateKnowledgeSourceForClient({
    clientId,
    sourceId: parsed.sourceId,
    title: parsed.title,
    content: parsed.content,
    actorUserId: user.userId,
  });
  if (!result) {
    throw new Error("Knowledge source not found.");
  }
  return {
    message: `Knowledge source updated with ${result.chunkCount} chunks.`,
    href: knowledgeHref(user, clientId, parsed.sourceId),
    data: result,
    nextActions: [
      { label: "Open source", href: knowledgeHref(user, clientId, parsed.sourceId) },
      { label: "Summarize the change", prompt: "Summarize what changed in this knowledge source." },
    ],
  };
}

async function deleteKnowledge(user: SessionUser, payload: Record<string, unknown>) {
  const parsed = z.object({
    clientId: z.string().optional(),
    sourceId: stringSchema,
  }).parse(payload);
  const clientId = normalizeClientId(user, parsed.clientId);
  requireClientAccess(user, clientId);
  const deleted = await deleteKnowledgeSourceForClient({
    clientId,
    sourceId: parsed.sourceId,
    actorUserId: user.userId,
  });
  if (!deleted) {
    throw new Error("Knowledge source not found.");
  }
  return {
    message: "Knowledge source deleted.",
    href: `${clientBaseHref(user, clientId)}/knowledge`,
    nextActions: [{ label: "Open knowledge", href: `${clientBaseHref(user, clientId)}/knowledge` }],
  };
}

async function createRefresh(user: SessionUser, payload: Record<string, unknown>) {
  const parsed = z.object({
    clientId: z.string().optional(),
    cadence: z.string().trim().max(80).optional(),
    notes: z.string().trim().max(1000).optional(),
  }).parse(payload);
  const clientId = normalizeClientId(user, parsed.clientId);
  requireClientAccess(user, clientId);
  const request = await createKnowledgeRefreshRequest({
    clientId,
    actorUserId: user.userId,
    cadence: parsed.cadence,
    notes: parsed.notes,
  });
  await recordAuditLog({
    clientId,
    actorUserId: user.userId,
    action: "assistant.knowledge_refresh_created",
    targetType: "knowledge_refresh_request",
    targetId: request.id,
    metadata: { cadence: request.cadence },
  });
  return {
    message: "Knowledge refresh request created.",
    href: `${clientBaseHref(user, clientId)}/knowledge`,
    data: { requestId: request.id },
    nextActions: [
      { label: "Open knowledge", href: `${clientBaseHref(user, clientId)}/knowledge` },
      { label: "Draft missing policy", prompt: "Draft the missing policy text for this refresh request." },
    ],
  };
}

async function resolveRefresh(user: SessionUser, payload: Record<string, unknown>) {
  const parsed = z.object({
    clientId: z.string().optional(),
    requestId: stringSchema,
    status: z.enum(["completed", "skipped"]),
    notes: z.string().trim().max(1000).optional(),
  }).parse(payload);
  const clientId = normalizeClientId(user, parsed.clientId);
  requireClientAccess(user, clientId);
  const request = await resolveKnowledgeRefreshRequest({
    clientId,
    requestId: parsed.requestId,
    actorUserId: user.userId,
    status: parsed.status,
    notes: parsed.notes,
  });
  if (!request) {
    throw new Error("Open knowledge refresh request not found.");
  }
  await recordAuditLog({
    clientId,
    actorUserId: user.userId,
    action: "assistant.knowledge_refresh_resolved",
    targetType: "knowledge_refresh_request",
    targetId: request.id,
    metadata: { status: parsed.status },
  });
  return {
    message: `Knowledge refresh marked ${parsed.status}.`,
    href: `${clientBaseHref(user, clientId)}/knowledge`,
    nextActions: [{ label: "Open knowledge", href: `${clientBaseHref(user, clientId)}/knowledge` }],
  };
}

async function createAssistantRequest(user: SessionUser, payload: Record<string, unknown>) {
  const parsed = z.object({
    clientId: z.string().optional(),
    kind: z.string().optional().default("assistant_change"),
    body: stringSchema.max(2000),
  }).parse(payload);
  const clientId = normalizeClientId(user, parsed.clientId);
  requireClientAccess(user, clientId);
  const request = await createClientAssistantChangeRequest({
    clientId,
    actorUserId: user.userId,
    kind: parsed.kind,
    body: parsed.body,
  });
  return {
    message: "Assistant change request created.",
    href: `${clientBaseHref(user, clientId)}/assistant`,
    data: { requestId: request.id },
    nextActions: [
      { label: "Open assistant settings", href: `${clientBaseHref(user, clientId)}/assistant` },
    ],
  };
}

async function createReview(user: SessionUser, payload: Record<string, unknown>) {
  const parsed = z.object({
    clientId: z.string().optional(),
    conversationId: stringSchema,
    hallucination: z.boolean().optional().default(false),
    escalationWasNeeded: z.boolean().nullable().optional(),
    csat: z.number().int().min(1).max(5).nullable().optional(),
    notes: z.string().trim().max(3000).optional().default(""),
    answerLabel: z.enum([
      "answered_correctly",
      "should_have_escalated",
      "over_escalated",
      "hallucinated",
      "needs_knowledge_update",
    ]).nullable().optional(),
    failureSeverity: z.enum(["p0", "p1", "p2", "p3"]).nullable().optional(),
    rootCause: z.enum([
      "missing_source",
      "bad_retrieval",
      "guardrail_gap",
      "prompt_gap",
      "integration_gap",
      "channel_issue",
      "human_process",
    ]).nullable().optional(),
    fixOwner: z.enum(["gabriel", "keith", "astin", "client"]).nullable().optional(),
    knowledgeUpdateNeeded: z.boolean().optional().default(false),
    pilotBlocker: z.boolean().optional().default(false),
  }).parse(payload);
  const clientId = normalizeClientId(user, parsed.clientId);
  requireClientAccess(user, clientId);
  const inserted = await query<{ id: string }>(
    `
      insert into reviews (
        client_id,
        conversation_id,
        reviewer_id,
        hallucination,
        escalation_was_needed,
        csat,
        notes,
        answer_label,
        failure_severity,
        root_cause,
        fix_owner,
        knowledge_update_needed,
        pilot_blocker
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      returning id
    `,
    [
      clientId,
      parsed.conversationId,
      user.userId,
      parsed.hallucination,
      parsed.escalationWasNeeded ?? null,
      parsed.csat ?? null,
      parsed.notes,
      parsed.answerLabel ?? null,
      parsed.failureSeverity ?? null,
      parsed.rootCause ?? null,
      parsed.fixOwner ?? null,
      parsed.knowledgeUpdateNeeded,
      parsed.pilotBlocker,
    ],
  );
  await recordAuditLog({
    clientId,
    actorUserId: user.userId,
    action: "assistant.review_created",
    targetType: "review",
    targetId: inserted.rows[0].id,
    metadata: { conversationId: parsed.conversationId, answerLabel: parsed.answerLabel ?? null },
  });
  return {
    message: "Review created.",
    href: conversationHref(user, clientId, parsed.conversationId),
    data: { reviewId: inserted.rows[0].id },
    nextActions: [
      { label: "Open conversation", href: conversationHref(user, clientId, parsed.conversationId) },
      {
        label: "Create knowledge refresh",
        proposal: {
          actionType: "knowledge_refresh_create" as const,
          title: "Create knowledge refresh",
          description: "Open a refresh request based on this review.",
          payload: {
            clientId,
            cadence: "monthly",
            notes: parsed.notes || "Review indicates a follow-up may be needed.",
          },
        },
      },
    ],
  };
}

async function channelHealth(user: SessionUser, payload: Record<string, unknown>) {
  requireOperator(user);
  const parsed = z.object({ clientId: stringSchema, channelId: stringSchema }).parse(payload);
  requireClientAccess(user, parsed.clientId);
  await assertChannelBelongsToClient(parsed.channelId, parsed.clientId);
  const health = await checkChannelHealth(parsed.channelId);
  await recordAuditLog({
    clientId: parsed.clientId,
    actorUserId: user.userId,
    action: "assistant.channel_health_checked",
    targetType: "channel",
    targetId: parsed.channelId,
    metadata: health,
  });
  return {
    message: `Channel health: ${health.status}.`,
    href: `/operator/clients/${parsed.clientId}/channels`,
    data: health,
    nextActions: [{ label: "Open channels", href: `/operator/clients/${parsed.clientId}/channels` }],
  };
}

async function updateChannel(user: SessionUser, payload: Record<string, unknown>) {
  requireOperator(user);
  const parsed = z.object({
    clientId: stringSchema,
    channelId: stringSchema,
    status: z.enum(["draft", "active", "disabled"]).optional().default("draft"),
    externalId: z.string().trim().optional().default(""),
    settings: recordSchema.optional().default({}),
    credentials: recordSchema.optional().default({}),
  }).parse(payload);
  requireClientAccess(user, parsed.clientId);
  await assertChannelBelongsToClient(parsed.channelId, parsed.clientId);
  await query(
    `
      update channels
      set status = $2,
          external_id = nullif($3, ''),
          settings = $4,
          credentials = $5,
          updated_at = now()
      where id = $1
    `,
    [
      parsed.channelId,
      parsed.status satisfies ChannelStatus,
      parsed.externalId,
      parsed.settings,
      parsed.credentials,
    ],
  );
  await recordAuditLog({
    clientId: parsed.clientId,
    actorUserId: user.userId,
    action: "assistant.channel_updated",
    targetType: "channel",
    targetId: parsed.channelId,
    metadata: { status: parsed.status, settings: redactSecrets(parsed.settings) },
  });
  return {
    message: "Channel updated.",
    href: `/operator/clients/${parsed.clientId}/channels`,
    nextActions: [
      {
        label: "Run health check",
        proposal: {
          actionType: "channel_health_check" as const,
          title: "Run channel health check",
          description: "Verify the updated channel configuration.",
          payload: { clientId: parsed.clientId, channelId: parsed.channelId },
        },
      },
    ],
  };
}

async function createClient(user: SessionUser, payload: Record<string, unknown>) {
  requireOperator(user);
  const parsed = z.object({
    name: stringSchema.max(120),
    slug: z.string().trim().max(72).optional(),
    vertical: z.string().trim().max(80).optional().default("general"),
    planTier: z.string().trim().max(80).optional().default("pilot"),
    status: z.enum(["draft", "pilot", "live", "paused"]).optional().default("draft"),
    brandVoice: z.string().trim().max(4000).optional(),
  }).parse(payload);
  const baseSlug = normalizeSlug(parsed.slug || parsed.name);
  if (!baseSlug) {
    throw new Error("Client slug is required.");
  }
  const triageFlow = buildDefaultTriageFlow();
  const compiledRules = compileTriageFlowToEscalationRules(triageFlow.nodes);
  const clientId = await transaction(async (client) => {
    let uniqueSlug = baseSlug;
    for (let suffix = 2; suffix < 100; suffix += 1) {
      const existing = await client.query<{ id: string }>(
        "select id from clients where slug = $1 limit 1",
        [uniqueSlug],
      );
      if (!existing.rows[0]) {
        break;
      }
      uniqueSlug = `${baseSlug}-${suffix}`;
    }
    const brandVoice = parsed.brandVoice || defaultBrandVoice(parsed.name);
    const created = await client.query<{ id: string }>(
      `
        insert into clients (name, slug, vertical, plan_tier, status, business_profile, brand_voice)
        values ($1, $2, $3, $4, $5, '{}'::jsonb, $6)
        returning id
      `,
      [parsed.name, uniqueSlug, parsed.vertical, parsed.planTier, parsed.status, brandVoice],
    );
    const createdClientId = created.rows[0].id;
    await client.query(
      `
        insert into agent_configs (client_id, prompt_preamble, escalation_rules, response_provider, embedding_provider)
        values ($1, $2, $3::jsonb, 'openai', 'openai')
      `,
      [
        createdClientId,
        `You are the scoped customer-service agent for ${parsed.name}. Answer only from verified source material. Escalate instead of guessing.`,
        JSON.stringify(compiledRules),
      ],
    );
    await client.query(
      "insert into channels (client_id, kind, name, status, settings, credentials) values ($1, 'console', 'Test console', 'active', '{}'::jsonb, '{}'::jsonb)",
      [createdClientId],
    );
    await client.query(
      `
        insert into triage_flows (client_id, nodes, edges, compiled_escalation_rules, version, published_at)
        values ($1, $2::jsonb, $3::jsonb, $4::jsonb, 1, now())
      `,
      [createdClientId, JSON.stringify(triageFlow.nodes), JSON.stringify(triageFlow.edges), JSON.stringify(compiledRules)],
    );
    await client.query(
      "insert into brand_voice_documents (client_id, title, content, attributes, source_notes) values ($1, 'Brand voice guide', $2, $3::jsonb, 'Created from assistant workflow.')",
      [
        createdClientId,
        brandVoice,
        JSON.stringify({
          formality: "professional",
          energy: "clear and practical",
          vocabulary: ["plain English", "concise", "customer-service"],
          bannedPhrases: ["as an AI language model", "I guarantee"],
        }),
      ],
    );
    await client.query(
      "insert into client_launch_milestones (client_id, signed_contract_at, target_live_at) values ($1, now(), now() + interval '7 days')",
      [createdClientId],
    );
    await client.query("insert into client_commercial_assumptions (client_id) values ($1)", [
      createdClientId,
    ]);
    await recordAuditLog(
      {
        clientId: createdClientId,
        actorUserId: user.userId,
        action: "assistant.client_created",
        targetType: "client",
        targetId: createdClientId,
        metadata: { name: parsed.name, slug: uniqueSlug, vertical: parsed.vertical, planTier: parsed.planTier, status: parsed.status },
      },
      client,
    );
    return createdClientId;
  });
  return {
    message: "Client created.",
    href: `/operator/clients/${clientId}`,
    data: { clientId },
    nextActions: [
      { label: "Open client", href: `/operator/clients/${clientId}` },
      { label: "Add knowledge", href: `/operator/clients/${clientId}/knowledge` },
    ],
  };
}

async function updateCommercial(user: SessionUser, payload: Record<string, unknown>) {
  requireOperator(user);
  const parsed = z.object({
    clientId: stringSchema,
    signedContractAt: z.string().nullable().optional().default(null),
    targetLiveAt: z.string().nullable().optional().default(null),
    productionLiveAt: z.string().nullable().optional().default(null),
    launchNotes: z.string().nullable().optional().default(null),
    monthlyRetainerSgd: z.number().nonnegative().optional().default(1200),
    setupFeeSgd: z.number().nonnegative().optional().default(2500),
    amortizedSetupMonths: z.number().int().positive().optional().default(6),
    hostingCostSgd: z.number().nonnegative().optional().default(80),
    integrationCostSgd: z.number().nonnegative().optional().default(150),
    includedConversations: z.number().int().positive().optional().default(500),
    llmCostBufferMultiplier: z.number().nonnegative().optional().default(2),
  }).parse(payload);
  requireClientAccess(user, parsed.clientId);
  await updateClientLaunchAndCommercial({
    ...parsed,
    actorUserId: user.userId,
  });
  return {
    message: "Commercial and launch assumptions updated.",
    href: `/operator/clients/${parsed.clientId}`,
    nextActions: [{ label: "Open client", href: `/operator/clients/${parsed.clientId}` }],
  };
}

async function updateAgentConfig(user: SessionUser, payload: Record<string, unknown>) {
  requireOperator(user);
  const parsed = z.object({
    clientId: stringSchema,
    responseProvider: stringSchema.max(80),
    responseModel: stringSchema.max(160),
    embeddingProvider: z.enum(["mock", "openai"]),
    embeddingModel: stringSchema.max(160),
    retrievalThreshold: z.number().min(0).max(1),
    promptPreamble: stringSchema.max(4000),
    escalationRules: recordSchema,
    changeReason: z.string().trim().max(500).optional(),
  }).parse(payload);
  requireClientAccess(user, parsed.clientId);
  const updated = await updateAgentConfigForClient({
    clientId: parsed.clientId,
    responseProvider: parsed.responseProvider,
    responseModel: parsed.responseModel,
    embeddingProvider: parsed.embeddingProvider,
    embeddingModel: parsed.embeddingModel,
    retrievalThreshold: parsed.retrievalThreshold,
    promptPreamble: parsed.promptPreamble,
    escalationRules: parsed.escalationRules,
    actorUserId: user.userId,
    changeReason: parsed.changeReason ?? "Updated from assistant action.",
  });
  if (!updated) {
    throw new Error("Agent config not found.");
  }
  return {
    message: "Agent config updated.",
    href: `/operator/clients/${parsed.clientId}`,
    nextActions: [
      { label: "Open assistant config", href: `/operator/clients/${parsed.clientId}` },
      { label: "Test the assistant", href: `/operator/clients/${parsed.clientId}/test` },
    ],
  };
}

async function updateBrandVoice(user: SessionUser, payload: Record<string, unknown>) {
  requireOperator(user);
  const parsed = z.object({
    clientId: stringSchema,
    title: stringSchema.max(200),
    content: stringSchema.max(8000),
    attributes: recordSchema.optional().default({}),
    sourceNotes: z.string().trim().max(1000).optional(),
  }).parse(payload);
  const updated = await updateBrandVoiceDocument({
    clientId: parsed.clientId,
    title: parsed.title,
    content: parsed.content,
    attributes: parsed.attributes,
    sourceNotes: parsed.sourceNotes,
    actorUserId: user.userId,
  });
  if (!updated) {
    throw new Error("Client not found.");
  }
  return {
    message: "Brand voice document updated.",
    href: `/operator/clients/${parsed.clientId}`,
    nextActions: [{ label: "Open client", href: `/operator/clients/${parsed.clientId}` }],
  };
}

async function addBrandExample(user: SessionUser, payload: Record<string, unknown>) {
  requireOperator(user);
  const parsed = z.object({
    clientId: stringSchema,
    customerMessage: stringSchema.max(2000),
    idealResponse: stringSchema.max(3000),
    notes: z.string().trim().max(1000).optional(),
  }).parse(payload);
  const example = await addBrandVoiceExample({
    clientId: parsed.clientId,
    customerMessage: parsed.customerMessage,
    idealResponse: parsed.idealResponse,
    notes: parsed.notes,
    actorUserId: user.userId,
  });
  if (!example) {
    throw new Error("Client not found.");
  }
  return {
    message: "Brand voice example added.",
    href: `/operator/clients/${parsed.clientId}`,
    data: { exampleId: example.id },
    nextActions: [{ label: "Open client", href: `/operator/clients/${parsed.clientId}` }],
  };
}

async function toggleBrandExample(user: SessionUser, payload: Record<string, unknown>) {
  requireOperator(user);
  const parsed = z.object({
    clientId: stringSchema,
    exampleId: stringSchema,
    isActive: z.boolean(),
  }).parse(payload);
  const updated = await setBrandVoiceExampleActive({
    clientId: parsed.clientId,
    exampleId: parsed.exampleId,
    isActive: parsed.isActive,
    actorUserId: user.userId,
  });
  if (!updated) {
    throw new Error("Brand voice example not found.");
  }
  return {
    message: "Brand voice example updated.",
    href: `/operator/clients/${parsed.clientId}`,
    nextActions: [{ label: "Open client", href: `/operator/clients/${parsed.clientId}` }],
  };
}

async function deleteBrandExample(user: SessionUser, payload: Record<string, unknown>) {
  requireOperator(user);
  const parsed = z.object({ clientId: stringSchema, exampleId: stringSchema }).parse(payload);
  const deleted = await deleteBrandVoiceExample({
    clientId: parsed.clientId,
    exampleId: parsed.exampleId,
    actorUserId: user.userId,
  });
  if (!deleted) {
    throw new Error("Brand voice example not found.");
  }
  return {
    message: "Brand voice example deleted.",
    href: `/operator/clients/${parsed.clientId}`,
    nextActions: [{ label: "Open client", href: `/operator/clients/${parsed.clientId}` }],
  };
}

async function exportOffboarding(user: SessionUser, payload: Record<string, unknown>) {
  requireOperator(user);
  const parsed = z.object({ clientId: stringSchema }).parse(payload);
  const exported = await buildClientOffboardingExport(parsed.clientId);
  await recordAuditLog({
    clientId: parsed.clientId,
    actorUserId: user.userId,
    action: "assistant.client_offboarding_exported",
    targetType: "client",
    targetId: parsed.clientId,
    metadata: { exportedAt: exported.exportedAt },
  });
  return {
    message: "Offboarding export prepared in the assistant result.",
    href: `/operator/clients/${parsed.clientId}`,
    data: redactSecrets(exported) as Record<string, unknown>,
    nextActions: [{ label: "Open offboarding", href: `/operator/clients/${parsed.clientId}/offboarding` }],
  };
}

async function deleteOffboarding(user: SessionUser, payload: Record<string, unknown>) {
  requireOperator(user);
  const parsed = z.object({ clientId: stringSchema, confirmSlug: stringSchema }).parse(payload);
  const deleted = await deleteClientForOffboarding({
    clientId: parsed.clientId,
    confirmSlug: parsed.confirmSlug,
    actorUserId: user.userId,
  });
  return {
    message: `Client ${deleted.name} deleted for offboarding.`,
    href: "/operator",
    data: deleted,
    nextActions: [{ label: "Open portfolio", href: "/operator" }],
  };
}

function normalizeClientId(user: SessionUser, submitted?: string): string {
  if (user.role === "client") {
    if (!user.clientId) {
      throw new Error("Client user has no client assignment.");
    }
    return user.clientId;
  }
  if (!submitted) {
    throw new Error("clientId is required.");
  }
  return submitted;
}

function requireClientAccess(user: SessionUser, clientId: string): void {
  if (!canAccessClient(user, clientId)) {
    throw new Error("Forbidden.");
  }
}

function requireOperator(user: SessionUser): void {
  if (user.role !== "operator") {
    throw new Error("Operator role required.");
  }
}

async function assertChannelBelongsToClient(channelId: string, clientId: string): Promise<void> {
  const channel = await query<{ id: string }>(
    "select id from channels where id = $1 and client_id = $2",
    [channelId, clientId],
  );
  if (!channel.rows[0]) {
    throw new Error("Channel not found for submitted client.");
  }
}

type EscalationActionRecord = {
  id: string;
  client_id: string;
  conversation_id: string;
  status: string;
  channel_id: string;
  external_thread_id: string;
  channel_kind: string;
};

async function loadEscalation(escalationId: string): Promise<EscalationActionRecord | null> {
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

function clientBaseHref(user: SessionUser, clientId: string): string {
  return user.role === "operator" ? `/operator/clients/${clientId}` : "/client";
}

function conversationHref(user: SessionUser, clientId: string, conversationId: string): string {
  return user.role === "operator"
    ? `/operator/clients/${clientId}/conversations/${conversationId}`
    : `/client/conversations/${conversationId}`;
}

function knowledgeHref(user: SessionUser, clientId: string, sourceId: string): string {
  return `${clientBaseHref(user, clientId)}/knowledge/${sourceId}`;
}

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function defaultBrandVoice(name: string): string {
  return `Clear, practical, and professional. Keep ${name || "the client"} replies concise, answer only from verified source material, and escalate instead of guessing.`;
}
