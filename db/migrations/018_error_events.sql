create table if not exists error_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  severity text not null default 'error' check (severity in ('error', 'warning')),
  source text not null check (source in ('webhook', 'llm', 'outbound', 'database', 'channel', 'agent', 'other')),
  request_id text,
  client_id uuid references clients(id) on delete set null,
  channel_id uuid references channels(id) on delete set null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  alerted_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by uuid references users(id) on delete set null
);

create index if not exists error_events_occurred_idx on error_events (occurred_at desc);
create index if not exists error_events_source_idx on error_events (source, occurred_at desc);
create index if not exists error_events_client_idx on error_events (client_id, occurred_at desc);
create index if not exists error_events_unack_idx on error_events (occurred_at desc) where acknowledged_at is null;
