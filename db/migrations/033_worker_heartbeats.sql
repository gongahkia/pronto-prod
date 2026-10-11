create table if not exists worker_heartbeats (
  name text primary key,
  updated_at timestamptz not null default now()
);
