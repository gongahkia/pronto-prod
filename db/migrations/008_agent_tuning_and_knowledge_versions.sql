create table if not exists knowledge_source_versions (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references knowledge_sources(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  version_number integer not null check (version_number >= 1),
  title text not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  change_type text not null default 'created',
  actor_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (source_id, version_number)
);

create index if not exists knowledge_source_versions_source_idx
  on knowledge_source_versions (source_id, version_number desc);

create index if not exists knowledge_source_versions_client_idx
  on knowledge_source_versions (client_id, created_at desc);

insert into knowledge_source_versions (
  source_id,
  client_id,
  version_number,
  title,
  content,
  metadata,
  change_type,
  actor_user_id,
  created_at
)
select
  ks.id,
  ks.client_id,
  1,
  ks.title,
  ks.content,
  ks.metadata,
  'created',
  null,
  ks.created_at
from knowledge_sources ks
where not exists (
  select 1
  from knowledge_source_versions ksv
  where ksv.source_id = ks.id
);

create table if not exists agent_config_changes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  actor_user_id uuid references users(id) on delete set null,
  previous_config jsonb not null,
  new_config jsonb not null,
  change_reason text,
  created_at timestamptz not null default now()
);

create index if not exists agent_config_changes_client_idx
  on agent_config_changes (client_id, created_at desc);
