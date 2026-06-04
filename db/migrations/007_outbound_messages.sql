create table if not exists outbound_messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete cascade,
  escalation_id uuid references escalations(id) on delete set null,
  channel_id uuid not null references channels(id) on delete cascade,
  external_thread_id text not null,
  body text not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  last_error text,
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists outbound_messages_status_idx
  on outbound_messages (status, updated_at asc);

create index if not exists outbound_messages_client_idx
  on outbound_messages (client_id, created_at desc);
