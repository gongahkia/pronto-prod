create extension if not exists pgcrypto;
create extension if not exists vector;

do $$ begin
  create type user_role as enum ('operator', 'client');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type channel_kind as enum ('whatsapp', 'telegram', 'console');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type channel_status as enum ('draft', 'active', 'disabled');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type conversation_status as enum ('active', 'escalated', 'closed');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type message_sender_role as enum ('customer', 'agent', 'operator', 'system');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type escalation_status as enum ('open', 'claimed', 'resolved');
exception
  when duplicate_object then null;
end $$;

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  vertical text not null,
  plan_tier text not null default 'pilot',
  status text not null default 'pilot',
  business_profile jsonb not null default '{}'::jsonb,
  brand_voice text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  email text not null unique,
  name text not null,
  role user_role not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists channels (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  kind channel_kind not null,
  name text not null,
  status channel_status not null default 'draft',
  external_id text,
  credentials jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists channels_client_kind_external_idx
  on channels (client_id, kind, coalesce(external_id, ''));

create table if not exists agent_configs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references clients(id) on delete cascade,
  response_model text not null default 'gpt-5.5',
  embedding_model text not null default 'text-embedding-3-small',
  retrieval_threshold numeric(5,4) not null default 0.7200,
  prompt_preamble text not null,
  escalation_rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  title text not null,
  source_type text not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references knowledge_sources(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  token_estimate integer not null,
  embedding vector(1536) not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_id, chunk_index)
);

create index if not exists knowledge_chunks_client_idx on knowledge_chunks (client_id);
create index if not exists knowledge_chunks_embedding_idx
  on knowledge_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 32);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  channel_id uuid not null references channels(id) on delete cascade,
  external_thread_id text not null,
  customer_name text,
  customer_handle text,
  status conversation_status not null default 'active',
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (channel_id, external_thread_id)
);

create index if not exists conversations_client_updated_idx
  on conversations (client_id, last_message_at desc);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  channel_id uuid not null references channels(id) on delete cascade,
  external_message_id text not null,
  sender_role message_sender_role not null,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (channel_id, external_message_id)
);

create index if not exists messages_conversation_created_idx
  on messages (conversation_id, created_at asc);

create table if not exists escalations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  message_id uuid not null references messages(id) on delete cascade,
  status escalation_status not null default 'open',
  reason_code text not null,
  reason_detail text not null,
  confidence numeric(5,4),
  owner_notified_at timestamptz,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists escalations_client_status_idx
  on escalations (client_id, status, created_at desc);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  reviewer_id uuid references users(id) on delete set null,
  hallucination boolean not null default false,
  escalation_was_needed boolean,
  csat integer check (csat is null or (csat >= 1 and csat <= 5)),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  actor_user_id uuid references users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists metric_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  event_type text not null,
  value numeric,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

