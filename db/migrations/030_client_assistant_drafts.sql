create table if not exists assistant_drafts (
  client_id uuid primary key references clients(id) on delete cascade,
  base_fingerprint text not null,
  voice jsonb,
  flow jsonb,
  knowledge_changes jsonb not null default '{}'::jsonb,
  updated_by uuid references users(id) on delete set null,
  tested_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists assistant_draft_chunks (
  client_id uuid not null references clients(id) on delete cascade,
  source_id uuid not null,
  chunk_index integer not null,
  content text not null,
  token_estimate integer not null,
  embedding vector not null,
  embedding_model text not null,
  embedding_dimensions integer not null,
  primary key (client_id, source_id, chunk_index)
);

create index if not exists assistant_draft_chunks_client_idx
  on assistant_draft_chunks (client_id, embedding_dimensions, embedding_model);

create table if not exists assistant_publications (
  client_id uuid primary key references clients(id) on delete cascade,
  revision integer not null default 0,
  published_at timestamptz,
  published_by uuid references users(id) on delete set null
);

create table if not exists channel_drafts (
  channel_id uuid primary key references channels(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  base_updated_at timestamptz not null,
  status channel_status not null,
  external_id text,
  settings jsonb not null default '{}'::jsonb,
  encrypted_credentials text,
  credentials_encryption_nonce text,
  credentials_encryption_tag text,
  health_status text,
  health_detail text,
  checked_at timestamptz,
  updated_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists channel_drafts_client_idx on channel_drafts (client_id);
