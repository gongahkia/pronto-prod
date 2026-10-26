-- Additive POC metadata. Existing sessions and vectors are preserved.
alter table customer_demo_sessions
  add column ai_selection text not null default 'configured'
    check (ai_selection in ('configured','mock','gemini-flash','groq-oss','gemini-lite')),
  add column ai_configuration jsonb check (ai_configuration is null or jsonb_typeof(ai_configuration)='object');
update customer_demo_sessions set ai_selection='mock' where ai_mode='mock';

-- Gemini vectors must not share the existing OpenAI/mock vector index.
alter table knowledge_chunks add constraint knowledge_chunks_id_client_unique unique (id,client_id);
create table customer_demo_embeddings (
  chunk_id uuid primary key,
  client_id uuid not null references clients(id) on delete cascade
    check (client_id='00000000-0000-4000-8000-00000000a101'::uuid),
  provider text not null default 'gemini' check (provider='gemini'),
  model text not null default 'gemini-embedding-2' check (model='gemini-embedding-2'),
  profile text not null check (profile='gemini-embedding-2:question-answering:1536:v1'),
  content_hash text not null,
  embedding vector(1536) not null,
  prepared_at timestamptz not null default now(),
  foreign key (chunk_id,client_id) references knowledge_chunks(id,client_id) on delete cascade
);
create index customer_demo_embeddings_vector_idx on customer_demo_embeddings
  using hnsw (embedding vector_cosine_ops);
