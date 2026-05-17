import { query, transaction, vectorLiteral } from "@/lib/db";
import { chunkText } from "@/lib/knowledge/chunk";
import { getEmbeddingProvider } from "@/lib/llm";

export async function ingestKnowledgeSource(input: {
  clientId: string;
  title: string;
  sourceType: string;
  content: string;
  metadata?: Record<string, unknown>;
  actorUserId?: string;
}) {
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
    const source = await client.query<{ id: string }>(
      `
        insert into knowledge_sources (client_id, title, source_type, content, metadata)
        values ($1, $2, $3, $4, $5)
        returning id
      `,
      [
        input.clientId,
        input.title,
        input.sourceType,
        input.content,
        input.metadata ?? {},
      ],
    );

    const sourceId = source.rows[0].id;
    for (const [index, chunk] of chunks.entries()) {
      await client.query(
        `
          insert into knowledge_chunks (source_id, client_id, chunk_index, content, token_estimate, embedding)
          values ($1, $2, $3, $4, $5, $6::vector)
        `,
        [
          sourceId,
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
        values ($1, $2, 'knowledge.ingested', 'knowledge_source', $3, $4)
      `,
      [
        input.clientId,
        input.actorUserId ?? null,
        sourceId,
        { title: input.title, sourceType: input.sourceType, chunks: chunks.length },
      ],
    );

    return { sourceId, chunkCount: chunks.length };
  });
}
