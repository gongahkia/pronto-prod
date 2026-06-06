import { query, vectorLiteral } from "@/lib/db";
import { logInfo } from "@/lib/logger";
import type { KnowledgeChunk } from "@/lib/types";

export async function retrieveKnowledge(
  clientId: string,
  embedding: number[],
  limit = 5,
  options: { requestId?: string; conversationId?: string; queryText?: string | null } = {},
): Promise<KnowledgeChunk[]> {
  const searchQuery = options.queryText?.trim();
  const candidateLimit = Math.max(limit * 4, 20);
  const result = searchQuery
    ? await query<KnowledgeChunk & {
        distance: string;
        vector_score: string;
        keyword_rank: string;
        combined_score: string;
      }>(
        `
          with fts_query as (
            select websearch_to_tsquery('simple', $3) as query
          ),
          vector_scored as materialized (
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
            order by embedding <=> $2::vector
            limit $4
          ),
          keyword_scored as materialized (
            select
              kc.id,
              kc.source_id,
              kc.client_id,
              kc.chunk_index,
              kc.content,
              kc.token_estimate,
              kc.metadata,
              (kc.embedding <=> $2::vector) as distance
            from knowledge_chunks kc, fts_query
            where kc.client_id = $1
              and to_tsvector('simple', kc.content) @@ fts_query.query
            order by ts_rank_cd(to_tsvector('simple', kc.content), fts_query.query) desc
            limit $4
          ),
          combined as (
            select * from vector_scored
            union
            select * from keyword_scored
          )
          select
            combined.*,
            (1 - combined.distance)::text as vector_score,
            ts_rank_cd(to_tsvector('simple', combined.content), fts_query.query)::text as keyword_rank,
            (
              least(
                (1 - combined.distance) +
                least(ts_rank_cd(to_tsvector('simple', combined.content), fts_query.query) * 8, 0.75),
                1
              )
            )::text as combined_score
          from combined, fts_query
          order by
            (
              least(
                (1 - combined.distance) +
                least(ts_rank_cd(to_tsvector('simple', combined.content), fts_query.query) * 8, 0.75),
                1
              )
            ) desc,
            combined.distance asc
          limit $5
        `,
        [clientId, vectorLiteral(embedding), searchQuery, candidateLimit, limit],
      )
    : await query<KnowledgeChunk & { distance: string }>(
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
    score:
      "combined_score" in row
        ? Math.min(Number(row.combined_score), 1)
        : 1 - Number(row.distance),
  }));

  logInfo("knowledge.retrieval_completed", {
    requestId: options.requestId,
    clientId,
    conversationId: options.conversationId,
    limit,
    mode: searchQuery ? "hybrid" : "vector",
    resultCount: chunks.length,
    topScore: chunks[0]?.score ?? null,
    topKeywordRank:
      searchQuery && result.rows[0] && "keyword_rank" in result.rows[0]
        ? Number(result.rows[0].keyword_rank)
        : null,
  });

  return chunks;
}
