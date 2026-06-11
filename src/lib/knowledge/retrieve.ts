import { query, vectorLiteral } from "@/lib/db";
import { logInfo } from "@/lib/logger";
import type { KnowledgeChunk } from "@/lib/types";

export async function retrieveKnowledge(
  clientId: string,
  embedding: number[],
  limit = 5,
  options: {
    requestId?: string;
    conversationId?: string;
    queryText?: string | null;
    embeddingModel?: string | null;
  } = {},
): Promise<KnowledgeChunk[]> {
  const searchQuery = options.queryText?.trim();
  const candidateLimit = Math.max(limit * 4, 20);
  const embeddingDimensions = embedding.length;
  const vectorDistance = vectorDistanceExpression(embeddingDimensions);
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
              embedding_model,
              embedding_dimensions,
              metadata,
              ${vectorDistance} as distance
            from knowledge_chunks
            where client_id = $1
              and embedding_dimensions = $6
              and ($7::text is null or embedding_model = $7)
            order by ${vectorDistance}
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
              kc.embedding_model,
              kc.embedding_dimensions,
              kc.metadata,
              ${vectorDistance.split("embedding").join("kc.embedding")} as distance
            from knowledge_chunks kc, fts_query
            where kc.client_id = $1
              and kc.embedding_dimensions = $6
              and ($7::text is null or kc.embedding_model = $7)
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
        [
          clientId,
          vectorLiteral(embedding),
          searchQuery,
          candidateLimit,
          candidateLimit,
          embeddingDimensions,
          options.embeddingModel ?? null,
        ],
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
              embedding_model,
              embedding_dimensions,
              metadata,
              ${vectorDistance} as distance
            from knowledge_chunks
            where client_id = $1
              and embedding_dimensions = $4
              and ($5::text is null or embedding_model = $5)
          )
          select * from scored
          order by distance
          limit $3
        `,
        [
          clientId,
          vectorLiteral(embedding),
          candidateLimit,
          embeddingDimensions,
          options.embeddingModel ?? null,
        ],
      );

  const chunks = dedupeChunks(
    result.rows.map((row) => ({
    ...row,
    score:
      "combined_score" in row
        ? Math.min(Number(row.combined_score), 1)
        : 1 - Number(row.distance),
    })),
    limit,
  );

  logInfo("knowledge.retrieval_completed", {
    requestId: options.requestId,
    clientId,
    conversationId: options.conversationId,
    limit,
    mode: searchQuery ? "hybrid" : "vector",
    resultCount: chunks.length,
    candidateCount: result.rows.length,
    embeddingDimensions,
    embeddingModel: options.embeddingModel ?? null,
    topScore: chunks[0]?.score ?? null,
    topKeywordRank:
      searchQuery && result.rows[0] && "keyword_rank" in result.rows[0]
        ? Number(result.rows[0].keyword_rank)
        : null,
  });

  return chunks;
}

function vectorDistanceExpression(dimensions: number): string {
  if (dimensions === 1536 || dimensions === 3072) {
    return `(embedding::vector(${dimensions}) <=> $2::vector(${dimensions}))`;
  }
  return "(embedding <=> $2::vector)";
}

function dedupeChunks<T extends KnowledgeChunk>(chunks: T[], limit: number): T[] {
  const selected: T[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    const fingerprint = normalizedContent(chunk.content);
    if (seen.has(fingerprint)) continue;
    if (
      selected.some(
        (existing) => jaccardSimilarity(contentTokens(existing.content), contentTokens(chunk.content)) > 0.82,
      )
    ) {
      continue;
    }
    selected.push(chunk);
    seen.add(fingerprint);
    if (selected.length >= limit) break;
  }
  return selected;
}

function normalizedContent(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function contentTokens(value: string): Set<string> {
  return new Set(value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
}

function jaccardSimilarity(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  return intersection / (left.size + right.size - intersection);
}
