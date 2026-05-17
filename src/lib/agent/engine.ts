import { randomUUID } from "node:crypto";
import { query, transaction } from "@/lib/db";
import {
  evaluateAiDisclosure,
  evaluatePreGenerationGuardrails,
  evaluateRetrievalConfidence,
} from "@/lib/agent/guardrails";
import { retrieveKnowledge } from "@/lib/knowledge/retrieve";
import { llmProvider } from "@/lib/llm/openai";
import type { AgentConfig, Client, KnowledgeChunk, Message } from "@/lib/types";

export type AgentRunResult = {
  action: "answered" | "escalated";
  responseText: string | null;
  reasonCode: string;
  reasonDetail: string;
  confidence: number;
  citedChunks: KnowledgeChunk[];
  agentMessageId?: string;
  escalationId?: string;
};

export async function runAgentForMessage(input: {
  clientId: string;
  channelId: string;
  conversationId: string;
  customerMessageId: string;
  customerMessage: string;
}): Promise<AgentRunResult> {
  const [clientResult, configResult, recentMessagesResult] = await Promise.all([
    query<Client>("select * from clients where id = $1", [input.clientId]),
    query<AgentConfig>("select * from agent_configs where client_id = $1", [
      input.clientId,
    ]),
    query<Message>(
      `
        select * from messages
        where conversation_id = $1
        order by created_at desc
        limit 8
      `,
      [input.conversationId],
    ),
  ]);

  const client = clientResult.rows[0];
  const config = configResult.rows[0];
  if (!client || !config) {
    throw new Error("Agent cannot run without client and config records.");
  }

  const aiDisclosure = evaluateAiDisclosure(input.customerMessage, client.name);
  if (aiDisclosure.shouldDisclose && aiDisclosure.answer) {
    const agentMessage = await query<{ id: string }>(
      `
        insert into messages (conversation_id, client_id, channel_id, external_message_id, sender_role, body, metadata)
        values ($1, $2, $3, $4, 'agent', $5, $6)
        returning id
      `,
      [
        input.conversationId,
        input.clientId,
        input.channelId,
        `agent-${randomUUID()}`,
        aiDisclosure.answer,
        {
          confidence: 1,
          reasonCode: "ai_disclosure",
          policy: "direct_customer_disclosure",
        },
      ],
    );

    return {
      action: "answered",
      responseText: aiDisclosure.answer,
      reasonCode: "ai_disclosure",
      reasonDetail: "Customer directly asked whether the agent is AI or human.",
      confidence: 1,
      citedChunks: [],
      agentMessageId: agentMessage.rows[0].id,
    };
  }

  const precheck = evaluatePreGenerationGuardrails(input.customerMessage);
  if (precheck.shouldEscalate) {
    return createEscalation({
      ...input,
      reasonCode: precheck.reasonCode,
      reasonDetail: precheck.reasonDetail,
      confidence: precheck.confidence,
    });
  }

  const [embedding] = await llmProvider.embed(
    [input.customerMessage],
    config.embedding_model,
  );
  const chunks = await retrieveKnowledge(input.clientId, embedding, 5);
  const retrievalThreshold = Number(config.retrieval_threshold);
  const retrievalCheck = evaluateRetrievalConfidence(
    chunks[0]?.score,
    retrievalThreshold,
  );

  if (retrievalCheck.shouldEscalate) {
    return createEscalation({
      ...input,
      reasonCode: retrievalCheck.reasonCode,
      reasonDetail: retrievalCheck.reasonDetail,
      confidence: retrievalCheck.confidence,
    });
  }

  const decision = await llmProvider.generateGroundedAnswer({
    clientName: client.name,
    brandVoice: client.brand_voice,
    promptPreamble: config.prompt_preamble,
    customerMessage: input.customerMessage,
    recentMessages: recentMessagesResult.rows.reverse().map((message) => ({
      senderRole: message.sender_role,
      body: message.body,
    })),
    retrievedChunks: chunks,
    responseModel:
      process.env.OPENAI_RESPONSE_MODEL ?? config.response_model ?? "gpt-5.5",
  });

  const citedChunks = chunks.filter((chunk) =>
    decision.citedChunkIds.includes(chunk.id),
  );

  if (decision.action === "escalate" || !decision.answer || !citedChunks.length) {
    return createEscalation({
      ...input,
      reasonCode: decision.reasonCode,
      reasonDetail:
        decision.action === "answer" && !citedChunks.length
          ? "The answer had no valid source chunk citation."
          : decision.reasonDetail,
      confidence: decision.confidence,
    });
  }

  const agentMessage = await query<{ id: string }>(
    `
      insert into messages (conversation_id, client_id, channel_id, external_message_id, sender_role, body, metadata)
      values ($1, $2, $3, $4, 'agent', $5, $6)
      returning id
    `,
    [
      input.conversationId,
      input.clientId,
      input.channelId,
      `agent-${randomUUID()}`,
      decision.answer,
      {
        confidence: decision.confidence,
        reasonCode: decision.reasonCode,
        citedChunkIds: decision.citedChunkIds,
      },
    ],
  );

  await query(
    "update conversations set status = 'active', last_message_at = now() where id = $1",
    [input.conversationId],
  );
  await query(
    "insert into metric_events (client_id, event_type, value, metadata) values ($1, 'agent_answered', $2, $3)",
    [input.clientId, decision.confidence, { citedChunkIds: decision.citedChunkIds }],
  );

  return {
    action: "answered",
    responseText: decision.answer,
    reasonCode: decision.reasonCode,
    reasonDetail: decision.reasonDetail,
    confidence: decision.confidence,
    citedChunks,
    agentMessageId: agentMessage.rows[0].id,
  };
}

export async function createEscalation(input: {
  clientId: string;
  channelId: string;
  conversationId: string;
  customerMessageId: string;
  customerMessage: string;
  reasonCode: string;
  reasonDetail: string;
  confidence: number;
}): Promise<AgentRunResult> {
  return transaction(async (client) => {
    await client.query(
      "update conversations set status = 'escalated', last_message_at = now() where id = $1",
      [input.conversationId],
    );

    const escalation = await client.query<{ id: string }>(
      `
        insert into escalations (client_id, conversation_id, message_id, reason_code, reason_detail, confidence)
        values ($1, $2, $3, $4, $5, $6)
        returning id
      `,
      [
        input.clientId,
        input.conversationId,
        input.customerMessageId,
        input.reasonCode,
        input.reasonDetail,
        input.confidence,
      ],
    );

    await client.query(
      "insert into metric_events (client_id, event_type, value, metadata) values ($1, 'agent_escalated', $2, $3)",
      [
        input.clientId,
        input.confidence,
        { reasonCode: input.reasonCode, conversationId: input.conversationId },
      ],
    );

    return {
      action: "escalated",
      responseText: null,
      reasonCode: input.reasonCode,
      reasonDetail: input.reasonDetail,
      confidence: input.confidence,
      citedChunks: [],
      escalationId: escalation.rows[0].id,
    };
  });
}
