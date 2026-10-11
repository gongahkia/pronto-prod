create table if not exists inbound_jobs (
  id uuid primary key default gen_random_uuid(),
  sequence bigint generated always as identity unique,
  client_id uuid not null references clients(id) on delete cascade,
  channel_id uuid not null references channels(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  message_id uuid not null unique references messages(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'failed', 'completed', 'skipped', 'dead')),
  attempt_count integer not null default 0,
  available_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists inbound_jobs_ready_idx
  on inbound_jobs (status, available_at, sequence);

create index if not exists inbound_jobs_conversation_order_idx
  on inbound_jobs (conversation_id, sequence);

-- Legacy customer messages may already have produced replies. Do not replay them
-- merely because their provider resends a webhook after this migration.
insert into inbound_jobs (client_id, channel_id, conversation_id, message_id, status, completed_at)
select m.client_id, m.channel_id, m.conversation_id, m.id, 'completed', now()
from messages m
where m.sender_role = 'customer'
on conflict (message_id) do nothing;

-- Earlier releases allowed more than one escalation for a message. Preserve
-- historical rows; the agent locks the customer message before reusing an
-- escalation for new processing attempts.
