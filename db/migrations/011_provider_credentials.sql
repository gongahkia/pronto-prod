create table if not exists llm_provider_credentials (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique,
  encrypted_api_key text not null,
  encryption_nonce text not null,
  encryption_tag text not null,
  created_by_user_id uuid references users(id) on delete set null,
  updated_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists llm_provider_credentials_provider_idx
  on llm_provider_credentials (provider);
