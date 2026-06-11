create table if not exists webhook_replay_events (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid references channels(id) on delete cascade,
  provider text not null,
  event_key text not null,
  payload_hash text not null,
  received_at timestamptz not null default now(),
  expires_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  unique (provider, event_key)
);

create index if not exists webhook_replay_events_expires_idx
  on webhook_replay_events (expires_at);

delete from webhook_replay_events
where expires_at < now();

alter table outbound_messages
  drop constraint if exists outbound_messages_idempotency_key_key;

create unique index if not exists outbound_messages_client_idempotency_key_idx
  on outbound_messages (client_id, idempotency_key);

alter table conversations
  add column if not exists deleted_at timestamptz;

alter table conversations
  drop constraint if exists conversations_channel_id_external_thread_id_key;

create unique index if not exists conversations_active_thread_idx
  on conversations (channel_id, external_thread_id)
  where deleted_at is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_body_not_blank'
      and conrelid = 'messages'::regclass
  ) then
    alter table messages
      add constraint messages_body_not_blank
      check (length(btrim(body)) > 0)
      not valid;
  end if;
end $$;

create index if not exists escalations_client_assigned_status_idx
  on escalations (client_id, assigned_to_user_id, status, created_at desc);

alter table knowledge_chunks
  add column if not exists embedding_model text,
  add column if not exists embedding_dimensions integer;

update knowledge_chunks kc
set
  embedding_model = coalesce(kc.embedding_model, ac.embedding_model, 'text-embedding-3-small'),
  embedding_dimensions = coalesce(kc.embedding_dimensions, vector_dims(kc.embedding))
from agent_configs ac
where ac.client_id = kc.client_id
  and (kc.embedding_model is null or kc.embedding_dimensions is null);

update knowledge_chunks
set
  embedding_model = coalesce(embedding_model, 'text-embedding-3-small'),
  embedding_dimensions = coalesce(embedding_dimensions, vector_dims(embedding))
where embedding_model is null
   or embedding_dimensions is null;

alter table knowledge_chunks
  alter column embedding type vector,
  alter column embedding_model set not null,
  alter column embedding_dimensions set not null;

drop index if exists knowledge_chunks_embedding_idx;

create index if not exists knowledge_chunks_embedding_1536_hnsw_idx
  on knowledge_chunks using hnsw ((embedding::vector(1536)) vector_cosine_ops)
  where embedding_dimensions = 1536;

create index if not exists knowledge_chunks_embedding_3072_hnsw_idx
  on knowledge_chunks using hnsw ((embedding::vector(3072)) vector_cosine_ops)
  where embedding_dimensions = 3072;

