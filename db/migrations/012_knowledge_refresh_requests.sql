create table if not exists knowledge_refresh_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  status text not null default 'open'
    check (status in ('open', 'completed', 'skipped')),
  cadence text not null default 'monthly',
  due_at timestamptz not null default (now() + interval '30 days'),
  notes text,
  created_by_user_id uuid references users(id) on delete set null,
  completed_by_user_id uuid references users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists knowledge_refresh_requests_client_status_idx
  on knowledge_refresh_requests (client_id, status, due_at asc);

create index if not exists knowledge_refresh_requests_due_idx
  on knowledge_refresh_requests (status, due_at asc);
