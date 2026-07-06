import { query, transaction } from "@/lib/db";
import {
  listProviderCredentialStatuses,
  type ProviderCredentialStatus,
} from "@/lib/llm/credentials";
import { buildGroundedAnswerInstructions } from "@/lib/llm/prompt";
import type { AgentConfig, Client, KnowledgeChunk } from "@/lib/types";

export type AgentConfigChange = {
  id: string;
  client_id: string;
  actor_user_id: string | null;
  previous_config: Record<string, unknown>;
  new_config: Record<string, unknown>;
  change_reason: string | null;
  created_at: Date;
};

export type AgentConfigDetail = {
  config: AgentConfig;
  retrievalThreshold: number;
  escalationRulesJson: string;
  promptPreview: string;
  recentChanges: AgentConfigChange[];
  providerCredentialStatuses: ProviderCredentialStatus[];
};

export type AgentConfigUpdate = {
  clientId: string;
  responseProvider: string;
  responseModel: string;
  embeddingProvider: string;
  embeddingModel: string;
  retrievalThreshold: number;
  promptPreamble: string;
  escalationRules: Record<string, unknown>;
  actorUserId: string;
  changeReason?: string;
};

export async function getAgentConfigDetail(
  clientId: string,
): Promise<AgentConfigDetail | null> {
  const [clientResult, configResult, changesResult, credentialStatuses] = await Promise.all([
    query<Client>("select * from clients where id = $1", [clientId]),
    query<AgentConfig>("select * from agent_configs where client_id = $1", [clientId]),
    query<AgentConfigChange>(
      `
        select *
        from agent_config_changes
        where client_id = $1
        order by created_at desc
        limit 5
      `,
      [clientId],
    ),
    listProviderCredentialStatuses(),
  ]);

  const client = clientResult.rows[0];
  const config = configResult.rows[0];
  if (!client || !config) {
    return null;
  }

  return buildAgentConfigDetail(client, config, changesResult.rows, credentialStatuses);
}

export async function updateAgentConfigForClient(
  input: AgentConfigUpdate,
): Promise<AgentConfigDetail | null> {
  return transaction(async (client) => {
    const existingResult = await client.query<AgentConfig>(
      "select * from agent_configs where client_id = $1",
      [input.clientId],
    );
    const clientResult = await client.query<Client>(
      "select * from clients where id = $1",
      [input.clientId],
    );
    const existing = existingResult.rows[0];
    const clientRecord = clientResult.rows[0];
    if (!existing || !clientRecord) {
      return null;
    }

    const updatedResult = await client.query<AgentConfig>(
      `
        update agent_configs
        set retrieval_threshold = $2,
            prompt_preamble = $3,
            escalation_rules = $4::jsonb,
            response_provider = $5,
            response_model = $6,
            embedding_provider = $7,
            embedding_model = $8,
            updated_at = now()
        where client_id = $1
        returning *
      `,
      [
        input.clientId,
        input.retrievalThreshold,
        input.promptPreamble,
        input.escalationRules,
        input.responseProvider,
        input.responseModel,
        input.embeddingProvider,
        input.embeddingModel,
      ],
    );
    const updated = updatedResult.rows[0];

    await client.query(
      `
        insert into agent_config_changes (
          client_id,
          actor_user_id,
          previous_config,
          new_config,
          change_reason
        )
        values ($1, $2, $3, $4, $5)
      `,
      [
        input.clientId,
        input.actorUserId,
        agentConfigSnapshot(existing),
        agentConfigSnapshot(updated),
        input.changeReason?.trim() || null,
      ],
    );

    await client.query(
      `
        insert into audit_logs (client_id, actor_user_id, action, target_type, target_id, metadata)
        values ($1, $2, 'agent_config.updated', 'agent_config', $3, $4)
      `,
      [
        input.clientId,
        input.actorUserId,
        updated.id,
        {
          retrievalThreshold: input.retrievalThreshold,
          changedFields: [
            "retrieval_threshold",
            "prompt_preamble",
            "escalation_rules",
            "response_provider",
            "response_model",
            "embedding_provider",
            "embedding_model",
          ],
        },
      ],
    );

    const changesResult = await client.query<AgentConfigChange>(
      `
        select *
        from agent_config_changes
        where client_id = $1
        order by created_at desc
        limit 5
      `,
      [input.clientId],
    );

    const credentialStatuses = await listProviderCredentialStatuses();

    return buildAgentConfigDetail(
      clientRecord,
      updated,
      changesResult.rows,
      credentialStatuses,
    );
  });
}

export function buildAgentPromptPreview(client: Client, config: AgentConfig): string {
  const retrievalThreshold = Number(config.retrieval_threshold);
  const previewChunk: KnowledgeChunk = {
    id: "preview-source-chunk",
    source_id: "preview-source",
    client_id: client.id,
    chunk_index: 0,
    content:
      "Preview only: live retrieval inserts the most relevant verified knowledge chunks here before answer generation.",
    token_estimate: 18,
    metadata: { preview: true },
    score: Number.isFinite(retrievalThreshold) ? retrievalThreshold : undefined,
  };

  return [
    "Agent tuning preview",
    `Retrieval threshold: ${formatThreshold(config.retrieval_threshold)}`,
    "Escalation rules:",
    JSON.stringify(config.escalation_rules ?? {}, null, 2),
    "",
    "Generation prompt:",
    buildGroundedAnswerInstructions({
      clientName: client.name,
      brandVoice: client.brand_voice,
      promptPreamble: config.prompt_preamble,
      customerMessage: "Preview customer question",
      recentMessages: [],
      retrievedChunks: [previewChunk],
      responseModel: config.response_model,
    }),
  ].join("\n");
}

function buildAgentConfigDetail(
  client: Client,
  config: AgentConfig,
  recentChanges: AgentConfigChange[],
  providerCredentialStatuses: ProviderCredentialStatus[],
): AgentConfigDetail {
  return {
    config,
    retrievalThreshold: Number(config.retrieval_threshold),
    escalationRulesJson: JSON.stringify(config.escalation_rules ?? {}, null, 2),
    promptPreview: buildAgentPromptPreview(client, config),
    recentChanges,
    providerCredentialStatuses,
  };
}

function agentConfigSnapshot(config: AgentConfig): Record<string, unknown> {
  return {
    responseProvider: config.response_provider,
    responseModel: config.response_model,
    embeddingProvider: config.embedding_provider,
    embeddingModel: config.embedding_model,
    retrievalThreshold: Number(config.retrieval_threshold),
    promptPreamble: config.prompt_preamble,
    escalationRules: config.escalation_rules ?? {},
  };
}

function formatThreshold(value: string): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(4) : value;
}
