import { recordAuditLog } from "@/lib/audit";
import { query, transaction } from "@/lib/db";
import {
  buildDefaultTriageFlow,
  compileTriageFlowToEscalationRules,
  validateAndNormalizeTriageFlow,
  type TriageFlowEdge,
  type TriageFlowNode,
} from "@/lib/triage-flow";
import type { AgentConfig } from "@/lib/types";

export type TriageFlowRecord = {
  id: string;
  client_id: string;
  nodes: TriageFlowNode[];
  edges: TriageFlowEdge[];
  compiled_escalation_rules: Record<string, unknown>;
  version: number;
  created_at: Date;
  updated_at: Date;
  published_at: Date | null;
};

export type TriageFlowDetail = {
  id: string | null;
  clientId: string;
  nodes: TriageFlowNode[];
  edges: TriageFlowEdge[];
  compiledEscalationRules: Record<string, unknown>;
  version: number;
  publishedAt: Date | null;
  isDefault: boolean;
};

export type SaveTriageFlowInput = {
  clientId: string;
  actorUserId: string;
  nodes: unknown;
  edges: unknown;
  source: "client" | "operator";
};

export async function getTriageFlowForClient(
  clientId: string,
): Promise<TriageFlowDetail> {
  const result = await query<TriageFlowRecord>(
    "select * from triage_flows where client_id = $1",
    [clientId],
  );
  const record = result.rows[0];
  if (record) {
    return {
      id: record.id,
      clientId: record.client_id,
      nodes: record.nodes,
      edges: record.edges,
      compiledEscalationRules: record.compiled_escalation_rules,
      version: record.version,
      publishedAt: record.published_at,
      isDefault: false,
    };
  }

  const draft = buildDefaultTriageFlow();
  return {
    id: null,
    clientId,
    nodes: draft.nodes,
    edges: draft.edges,
    compiledEscalationRules: compileTriageFlowToEscalationRules(draft.nodes),
    version: 0,
    publishedAt: null,
    isDefault: true,
  };
}

export async function saveTriageFlowForClient(
  input: SaveTriageFlowInput,
): Promise<TriageFlowDetail | null> {
  const draft = validateAndNormalizeTriageFlow({
    nodes: input.nodes,
    edges: input.edges,
  });
  const compiledEscalationRules = compileTriageFlowToEscalationRules(draft.nodes);

  return transaction(async (client) => {
    const existingConfigResult = await client.query<AgentConfig>(
      "select * from agent_configs where client_id = $1",
      [input.clientId],
    );
    const existingConfig = existingConfigResult.rows[0];
    if (!existingConfig) {
      return null;
    }

    const flowResult = await client.query<TriageFlowRecord>(
      `
        insert into triage_flows (
          client_id,
          nodes,
          edges,
          compiled_escalation_rules,
          version,
          published_at
        )
        values ($1, $2::jsonb, $3::jsonb, $4::jsonb, 1, now())
        on conflict (client_id) do update set
          nodes = excluded.nodes,
          edges = excluded.edges,
          compiled_escalation_rules = excluded.compiled_escalation_rules,
          version = triage_flows.version + 1,
          updated_at = now(),
          published_at = now()
        returning *
      `,
      [
        input.clientId,
        JSON.stringify(draft.nodes),
        JSON.stringify(draft.edges),
        JSON.stringify(compiledEscalationRules),
      ],
    );
    const flow = flowResult.rows[0];

    const updatedConfigResult = await client.query<AgentConfig>(
      `
        update agent_configs
        set escalation_rules = $2::jsonb,
            updated_at = now()
        where client_id = $1
        returning *
      `,
      [input.clientId, JSON.stringify(compiledEscalationRules)],
    );
    const updatedConfig = updatedConfigResult.rows[0];

    await client.query(
      `
        insert into agent_config_changes (
          client_id,
          actor_user_id,
          previous_config,
          new_config,
          change_reason
        )
        values ($1, $2, $3::jsonb, $4::jsonb, $5)
      `,
      [
        input.clientId,
        input.actorUserId,
        JSON.stringify(agentConfigSnapshot(existingConfig)),
        JSON.stringify(agentConfigSnapshot(updatedConfig)),
        `Published triage flow v${flow.version}`,
      ],
    );

    await recordAuditLog(
      {
        clientId: input.clientId,
        actorUserId: input.actorUserId,
        action: "triage_flow.updated",
        targetType: "triage_flow",
        targetId: flow.id,
        metadata: {
          version: flow.version,
          source: input.source,
          changedFields: ["nodes", "edges", "compiled_escalation_rules"],
        },
      },
      client,
    );

    return serializeFlow(flow);
  });
}

export function serializeFlow(record: TriageFlowRecord): TriageFlowDetail {
  return {
    id: record.id,
    clientId: record.client_id,
    nodes: record.nodes,
    edges: record.edges,
    compiledEscalationRules: record.compiled_escalation_rules,
    version: record.version,
    publishedAt: record.published_at,
    isDefault: false,
  };
}

export function flowResponse(detail: TriageFlowDetail): Record<string, unknown> {
  return {
    id: detail.id,
    clientId: detail.clientId,
    nodes: detail.nodes,
    edges: detail.edges,
    compiledEscalationRules: detail.compiledEscalationRules,
    version: detail.version,
    publishedAt: detail.publishedAt?.toISOString() ?? null,
    isDefault: detail.isDefault,
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
