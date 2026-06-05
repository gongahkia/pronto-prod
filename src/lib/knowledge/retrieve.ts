import { query, vectorLiteral } from "@/lib/db";
import { logInfo } from "@/lib/logger";
import type { KnowledgeChunk } from "@/lib/types";

export async function retrieveKnowledge(
  clientId: string,
  embedding: number[],
  limit = 5,
  options: { requestId?: string; conversationId?: string } = {},
): Promise<KnowledgeChunk[]> {
  const result = await query<KnowledgeChunk & { distance: string }>(
    `
      with scored as materialized (
        select
          id,
          source_id,
          client_id,
          chunk_index,
          content,
          token_estimate,
          metadata,
          (embedding <=> $2::vector) as distance
        from knowledge_chunks
        where client_id = $1
      )
      select * from scored
      order by distance
      limit $3
    `,
    [clientId, vectorLiteral(embedding), limit],
  );

  const chunks = result.rows.map((row) => ({
    ...row,
    score: 1 - Number(row.distance),
  }));

  logInfo("knowledge.retrieval_completed", {
    requestId: options.requestId,
    clientId,
    conversationId: options.conversationId,
    limit,
    resultCount: chunks.length,
    topScore: chunks[0]?.score ?? null,
  });

  return chunks;
}
