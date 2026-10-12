-- Managed operations: independent staff authority, resumable onboarding and staff delivery.
create table if not exists staff_permission_grants (
  client_id uuid not null references clients(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  permission text not null check (permission in (
    'knowledge.approve', 'channel.activate', 'conversation.respond',
    'conversation.release', 'staff.permissions.manage')),
  granted_by uuid references users(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (client_id, user_id, permission)
);

create table if not exists configuration_approvals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  kind text not null check (kind in ('assistant', 'channel')),
  target_id uuid not null,
  revision text not null,
  approved_by uuid not null references users(id),
  evidence text not null,
  approved_at timestamptz not null default now(),
  unique (client_id, kind, target_id, revision)
);

create table if not exists channel_activation_evidence (
  client_id uuid not null references clients(id) on delete cascade,
  channel_id uuid not null references channels(id) on delete cascade,
  revision text not null,
  check_kind text not null check (check_kind in (
    'ownership', 'permissions', 'local_test', 'provider_accepted', 'delivery_observed')),
  details text not null,
  recorded_by uuid not null references users(id),
  recorded_at timestamptz not null default now(),
  primary key (client_id, channel_id, revision, check_kind)
);

create table if not exists onboarding_stages (
  client_id uuid not null references clients(id) on delete cascade,
  stage text not null check (stage in ('profile', 'communications', 'knowledge', 'testing', 'activation')),
  state text not null default 'draft' check (state in ('draft', 'pending_review', 'approved', 'active')),
  revision integer not null default 1 check (revision > 0),
  details jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  blockers jsonb not null default '[]'::jsonb,
  not_applicable_reason text,
  responsible_user_id uuid references users(id) on delete set null,
  updated_by uuid references users(id) on delete set null,
  approved_by uuid references users(id) on delete set null,
  approved_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (client_id, stage)
);

insert into onboarding_stages (client_id, stage)
select c.id, s.stage from clients c
cross join (values ('profile'), ('communications'), ('knowledge'), ('testing'), ('activation')) s(stage)
on conflict (client_id, stage) do nothing;

create table if not exists staff_notification_destinations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  kind text not null check (kind in ('email', 'whatsapp', 'telegram')),
  destination text not null,
  recipient_user_id uuid references users(id) on delete set null,
  audience text not null default 'business' check (audience in ('business', 'operator')),
  verified_at timestamptz,
  verification_evidence text,
  enabled boolean not null default false,
  created_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (client_id, kind, destination)
);

create table if not exists staff_notification_jobs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  escalation_id uuid not null unique references escalations(id) on delete cascade,
  destination_id uuid references staff_notification_destinations(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'uncertain', 'dead')),
  attempt_count integer not null default 0,
  available_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists staff_notification_jobs_claim_idx
  on staff_notification_jobs (status, available_at, created_at);

create table if not exists escalation_policy_versions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  version integer not null,
  policy jsonb not null,
  changed_by uuid references users(id) on delete set null,
  changed_at timestamptz not null default now(),
  unique (client_id, version)
);
