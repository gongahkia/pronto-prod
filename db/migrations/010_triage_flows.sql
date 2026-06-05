create table if not exists triage_flows (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references clients(id) on delete cascade,
  nodes jsonb not null,
  edges jsonb not null,
  compiled_escalation_rules jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create index if not exists triage_flows_client_updated_idx
  on triage_flows (client_id, updated_at desc);
