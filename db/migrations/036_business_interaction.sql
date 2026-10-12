-- Tranche B: proposals and local staff confirmation. No grants or live activation are backfilled.
alter table staff_permission_grants drop constraint if exists staff_permission_grants_permission_check;
alter table staff_permission_grants add constraint staff_permission_grants_permission_check
  check (permission in ('knowledge.approve', 'channel.activate', 'conversation.respond',
    'conversation.release', 'staff.permissions.manage', 'escalation.policy.manage'));

create table if not exists knowledge_suggestions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  source_id uuid references knowledge_sources(id) on delete set null,
  target_source_id uuid not null,
  status text not null default 'pending' check (status in
    ('pending', 'revision_requested', 'rejected', 'approved', 'staged', 'published')),
  current_revision integer not null default 1 check (current_revision > 0),
  created_by uuid not null references users(id),
  request_key text,
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  reviewed_revision integer,
  review_note text,
  staged_edit_version integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, id),
  check (reviewed_revision is null or reviewed_revision > 0)
);
create index if not exists knowledge_suggestions_client_status_idx
  on knowledge_suggestions (client_id, status, updated_at desc);
create unique index if not exists knowledge_suggestions_request_idx
  on knowledge_suggestions (client_id, created_by, request_key) where request_key is not null;

create table if not exists knowledge_suggestion_revisions (
  suggestion_id uuid not null,
  client_id uuid not null,
  revision integer not null check (revision > 0),
  title text not null,
  content text not null,
  reason text not null,
  source_reference text,
  outlet_name text,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  primary key (suggestion_id, revision),
  foreign key (client_id, suggestion_id) references knowledge_suggestions(client_id, id) on delete cascade
);

create table if not exists staff_command_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  actor_user_id uuid not null references users(id),
  request_key text not null,
  kind text not null check (kind in ('policy_target', 'knowledge_suggestion')),
  payload jsonb not null,
  base_version integer,
  token_hash text not null,
  state text not null default 'pending' check (state in ('pending', 'applied', 'expired')),
  expires_at timestamptz not null,
  applied_at timestamptz,
  result_reference uuid,
  created_at timestamptz not null default now(),
  unique (client_id, actor_user_id, request_key)
);
create index if not exists staff_command_requests_pending_idx
  on staff_command_requests (client_id, state, expires_at);
