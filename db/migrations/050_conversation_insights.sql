create table if not exists client_insight_snapshots (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  window_days integer not null check (window_days in (7,30,90)),
  fingerprint text not null,
  status text not null check (status in ('generating','ready','failed')),
  provider text not null,
  model text not null,
  payload jsonb,
  sample_count integer not null default 0,
  error_message text,
  created_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id,window_days,fingerprint)
);
create index if not exists client_insights_latest_idx on client_insight_snapshots (client_id,window_days,created_at desc);
create unique index if not exists client_insights_in_flight_idx on client_insight_snapshots (client_id) where status='generating';
