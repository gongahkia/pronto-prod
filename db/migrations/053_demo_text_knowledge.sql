-- Text retrieval needs actual text chunks, not placeholder embedding vectors.
-- Existing vectors and their indexes are preserved. Only the synthetic tenant
-- can store a missing vector, with an explicit non-vector retrieval profile.
alter table assistant_draft_chunks
  add column metadata jsonb not null default '{}'::jsonb;

alter table assistant_draft_chunks alter column embedding drop not null;
alter table knowledge_chunks alter column embedding drop not null;

alter table assistant_draft_chunks add constraint assistant_draft_chunks_text_profile check (
  embedding is not null or (
    client_id = '00000000-0000-4000-8000-00000000a101'::uuid
    and embedding_model = 'none' and embedding_dimensions = 0
    and metadata @> '{"retrievalMode":"local_text","retrievalProfile":"postgres-fts-simple-v1"}'::jsonb
  )
);

alter table knowledge_chunks add constraint knowledge_chunks_text_profile check (
  embedding is not null or (
    client_id = '00000000-0000-4000-8000-00000000a101'::uuid
    and embedding_model = 'none' and embedding_dimensions = 0
    and metadata @> '{"retrievalMode":"local_text","retrievalProfile":"postgres-fts-simple-v1"}'::jsonb
  )
);
