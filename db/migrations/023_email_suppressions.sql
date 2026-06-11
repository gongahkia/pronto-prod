create table if not exists email_suppressions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  email_address text not null,
  reason text not null,
  provider text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (client_id, email_address)
);

create index if not exists email_suppressions_client_idx
  on email_suppressions (client_id, created_at desc);
