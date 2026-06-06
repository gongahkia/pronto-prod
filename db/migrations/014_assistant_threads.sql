create table if not exists assistant_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  role user_role not null,
  title text not null default 'Assistant chat',
  page_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assistant_threads_user_updated_idx
  on assistant_threads (user_id, updated_at desc);

create index if not exists assistant_threads_client_updated_idx
  on assistant_threads (client_id, updated_at desc);

create table if not exists assistant_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references assistant_threads(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  role text not null check (role in ('user', 'assistant', 'system')),
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists assistant_messages_thread_created_idx
  on assistant_messages (thread_id, created_at asc);

create table if not exists assistant_action_proposals (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references assistant_threads(id) on delete cascade,
  message_id uuid references assistant_messages(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  client_id uuid references clients(id) on delete cascade,
  action_type text not null,
  title text not null,
  description text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'executed', 'failed', 'cancelled')),
  requires_typed_confirmation text,
  result jsonb,
  error text,
  confirmed_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assistant_action_proposals_thread_status_idx
  on assistant_action_proposals (thread_id, status, created_at desc);

create index if not exists assistant_action_proposals_user_status_idx
  on assistant_action_proposals (user_id, status, created_at desc);
