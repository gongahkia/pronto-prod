create table if not exists eval_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  name text not null,
  status text not null default 'running',
  total integer not null default 0,
  passed integer not null default 0,
  failed integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists eval_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references eval_runs(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  name text not null,
  question text not null,
  expected_action text not null,
  expected_reason_code text,
  actual_action text,
  actual_reason_code text,
  response_text text,
  cited_chunk_ids text[] not null default '{}'::text[],
  escalation_id uuid references escalations(id) on delete set null,
  passed boolean not null default false,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists eval_results_run_idx on eval_results (run_id, passed);
