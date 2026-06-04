import { query, transaction, vectorLiteral } from "@/lib/db";
import { chunkText } from "@/lib/knowledge/chunk";
import { getEmbeddingProvider } from "@/lib/llm";

export type KnowledgeSourceDetail = {
  id: string;
  client_id: string;
  title: string;
  source_type: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  chunk_count: string;
};

export async function getKnowledgeSourceForClient(
  sourceId: string,
  clientId: string,
): Promise<KnowledgeSourceDetail | null> {
  const result = await query<KnowledgeSourceDetail>(
    `
      select
        ks.*,
        count(kc.id) as chunk_count
      from knowledge_sources ks
      left join knowledge_chunks kc on kc.source_id = ks.id
      where ks.id = $1 and ks.client_id = $2
      group by ks.id
    `,
    [sourceId, clientId],
  );
  return result.rows[0] ?? null;
}

export async function updateKnowledgeSourceForClient(input: {
  sourceId: string;
  clientId: string;
  title: string;
  content: string;
  actorUserId?: string;
}): Promise<{ sourceId: string; chunkCount: number } | null> {
  const existing = await getKnowledgeSourceForClient(input.sourceId, input.clientId);
  if (!existing) {
    return null;
  }

  const config = await query<{ embedding_model: string; embedding_provider: string }>(
    "select embedding_model, embedding_provider from agent_configs where client_id = $1",
    [input.clientId],
  );
  const embeddingModel =
    config.rows[0]?.embedding_model ??
    process.env.OPENAI_EMBEDDING_MODEL ??
    "text-embedding-3-small";

  const chunks = chunkText(input.content, {
    maxCharacters: 900,
    overlap: 120,
  });
  const embeddings = await getEmbeddingProvider(
    config.rows[0]?.embedding_provider,
  ).embed(
    chunks.map((chunk) => chunk.content),
    embeddingModel,
  );

  return transaction(async (client) => {
    const updated = await client.query<{ id: string }>(
      `
        update knowledge_sources
        set title = $3,
            content = $4,
            metadata = metadata || $5::jsonb
        where id = $1 and client_id = $2
        returning id
      `,
      [
        input.sourceId,
        input.clientId,
        input.title,
        input.content,
        {
          lastEditedBy: input.actorUserId ?? null,
          lastEditedAt: new Date().toISOString(),
        },
      ],
    );
    if (!updated.rowCount) {
      return null;
    }

    await client.query("delete from knowledge_chunks where source_id = $1", [
      input.sourceId,
    ]);

    for (const [index, chunk] of chunks.entries()) {
      await client.query(
        `
          insert into knowledge_chunks (source_id, client_id, chunk_index, content, token_estimate, embedding)
          values ($1, $2, $3, $4, $5, $6::vector)
        `,
        [
          input.sourceId,
          input.clientId,
          index,
          chunk.content,
          chunk.tokenEstimate,
          vectorLiteral(embeddings[index]),
        ],
      );
    }

    await client.query(
      `
        insert into audit_logs (client_id, actor_user_id, action, target_type, target_id, metadata)
        values ($1, $2, 'knowledge.updated', 'knowledge_source', $3, $4)
      `,
      [
        input.clientId,
        input.actorUserId ?? null,
        input.sourceId,
        { title: input.title, chunks: chunks.length },
      ],
    );

    return { sourceId: input.sourceId, chunkCount: chunks.length };
  });
}

export async function deleteKnowledgeSourceForClient(input: {
  sourceId: string;
  clientId: string;
  actorUserId?: string;
}): Promise<boolean> {
  return transaction(async (client) => {
    const deleted = await client.query<{ title: string }>(
      `
        delete from knowledge_sources
        where id = $1 and client_id = $2
        returning title
      `,
      [input.sourceId, input.clientId],
    );
    const source = deleted.rows[0];
    if (!source) {
      return false;
    }

    await client.query(
      `
        insert into audit_logs (client_id, actor_user_id, action, target_type, target_id, metadata)
        values ($1, $2, 'knowledge.deleted', 'knowledge_source', $3, $4)
      `,
      [
        input.clientId,
        input.actorUserId ?? null,
        input.sourceId,
        { title: source.title },
      ],
    );

    return true;
  });
}
