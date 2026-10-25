-- The existing console channel kind is reserved for authenticated local simulation.
create table customer_demo_sessions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  conversation_id uuid not null unique references conversations(id) on delete cascade,
  ai_mode text not null check (ai_mode in ('real', 'mock')),
  created_at timestamptz not null default now()
);
create index customer_demo_sessions_owner on customer_demo_sessions(client_id, user_id, created_at desc);

alter table conversations add column ai_should_respond boolean;
alter table conversations add column owner_action_required boolean not null default false;
alter table conversations add column urgency text check (urgency in ('short_term', 'long_term'));
-- Historical records have no inferred model decision or urgency.
update conversations set owner_action_required = true where status = 'escalated';
