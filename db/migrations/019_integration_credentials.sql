create table if not exists integration_credentials (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  provider text not null,
  label text,
  encrypted_api_key text not null,
  encryption_nonce text not null,
  encryption_tag text not null,
  metadata jsonb not null default '{}'::jsonb,
  rotation_due_at timestamptz,
  last_rotated_at timestamptz,
  created_by_user_id uuid references users(id) on delete set null,
  updated_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, provider, coalesce(label, ''))
);

create index if not exists integration_credentials_client_idx
  on integration_credentials (client_id, provider);
