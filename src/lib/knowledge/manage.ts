import { query, transaction, vectorLiteral } from "@/lib/db";
import { chunkText } from "@/lib/knowledge/chunk";
import { getEmbeddingProvider } from "@/lib/llm";
import { azureOpenAiEmbeddingModel } from "@/lib/llm/azure";

export type KnowledgeSourceDetail = {
  id: string;
  client_id: string;
  title: string;
  source_type: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  chunk_count: string;
  current_version: string | null;
};

export type KnowledgeSourceVersion = {
  id: string;
  source_id: string;
  client_id: string;
  version_number: number;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  change_type: string;
  actor_user_id: string | null;
  created_at: Date;
};

export async function getKnowledgeSourceForClient(
  sourceId: string,
  clientId: string,
): Promise<KnowledgeSourceDetail | null> {
  const result = await query<KnowledgeSourceDetail>(
    `
      select
        ks.*,
        count(distinct kc.id) as chunk_count,
        max(ksv.version_number) as current_version
      from knowledge_sources ks
      left join knowledge_chunks kc on kc.source_id = ks.id
      left join knowledge_source_versions ksv on ksv.source_id = ks.id
      where ks.id = $1 and ks.client_id = $2
      group by ks.id
    `,
    [sourceId, clientId],
  );
  return result.rows[0] ?? null;
}

export async function getKnowledgeSourceVersionsForClient(
  sourceId: string,
  clientId: string,
  limit = 8,
): Promise<KnowledgeSourceVersion[]> {
  const result = await query<KnowledgeSourceVersion>(
    `
      select *
      from knowledge_source_versions
      where source_id = $1 and client_id = $2
      order by version_number desc
      limit $3
    `,
    [sourceId, clientId, limit],
  );
  return result.rows;
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
    (config.rows[0]?.embedding_provider === "azure" ? azureOpenAiEmbeddingModel() : undefined) ??
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
    const editedAt = new Date().toISOString();
    const updatedMetadata = {
      ...existing.metadata,
      lastEditedBy: input.actorUserId ?? null,
      lastEditedAt: editedAt,
    };
    const versionResult = await client.query<{ max_version: string | null }>(
      `
        select max(version_number) as max_version
        from knowledge_source_versions
        where source_id = $1 and client_id = $2
      `,
      [input.sourceId, input.clientId],
    );
    const currentVersion = Number(versionResult.rows[0]?.max_version ?? 0);
    if (!currentVersion) {
      await client.query(
        `
          insert into knowledge_source_versions (
            source_id,
            client_id,
            version_number,
            title,
            content,
            metadata,
            change_type,
            actor_user_id,
            created_at
          )
          values ($1, $2, 1, $3, $4, $5, 'created', null, $6)
          on conflict (source_id, version_number) do nothing
        `,
        [
          existing.id,
          existing.client_id,
          existing.title,
          existing.content,
          existing.metadata,
          existing.created_at,
        ],
      );
    }
    const nextVersion = currentVersion ? currentVersion + 1 : 2;

    const updated = await client.query<{ id: string }>(
      `
        update knowledge_sources
        set title = $3,
            content = $4,
            metadata = $5::jsonb
        where id = $1 and client_id = $2
        returning id
      `,
      [input.sourceId, input.clientId, input.title, input.content, updatedMetadata],
    );
    if (!updated.rowCount) {
      return null;
    }

    await client.query(
      `
        insert into knowledge_source_versions (
          source_id,
          client_id,
          version_number,
          title,
          content,
          metadata,
          change_type,
          actor_user_id
        )
        values ($1, $2, $3, $4, $5, $6, 'updated', $7)
      `,
      [
        input.sourceId,
        input.clientId,
        nextVersion,
        input.title,
        input.content,
        updatedMetadata,
        input.actorUserId ?? null,
      ],
    );

    await client.query("delete from knowledge_chunks where source_id = $1", [
      input.sourceId,
    ]);

    for (const [index, chunk] of chunks.entries()) {
      await client.query(
        `
          insert into knowledge_chunks (
            source_id,
            client_id,
            chunk_index,
            content,
            token_estimate,
            embedding,
            embedding_model,
            embedding_dimensions
          )
          values ($1, $2, $3, $4, $5, $6::vector, $7, $8)
        `,
        [
          input.sourceId,
          input.clientId,
          index,
          chunk.content,
          chunk.tokenEstimate,
          vectorLiteral(embeddings[index]),
          embeddingModel,
          embeddings[index].length,
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
  }, { isolationLevel: "serializable", retries: 2 });
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
  }, { isolationLevel: "serializable", retries: 2 });
}
