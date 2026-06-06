create index if not exists knowledge_chunks_content_fts_idx
  on knowledge_chunks
  using gin (to_tsvector('simple', content));
