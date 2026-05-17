import { query, vectorLiteral } from "@/lib/db";
import type { KnowledgeChunk } from "@/lib/types";

export async function retrieveKnowledge(
  clientId: string,
  embedding: number[],
  limit = 5,
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

  return result.rows.map((row) => ({
    ...row,
    score: 1 - Number(row.distance),
  }));
}
