create table if not exists client_assistant_change_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  created_by_user_id uuid references users(id) on delete set null,
  kind text not null default 'assistant_change'
    check (kind in ('assistant_change', 'handoff_rule', 'tone', 'scope', 'other')),
  body text not null,
  status text not null default 'open'
    check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_assistant_change_requests_client_status_idx
  on client_assistant_change_requests (client_id, status, created_at desc);

create index if not exists client_assistant_change_requests_status_idx
  on client_assistant_change_requests (status, created_at desc);
