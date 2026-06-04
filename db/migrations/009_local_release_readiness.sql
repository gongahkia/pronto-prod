create table if not exists brand_voice_documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references clients(id) on delete cascade,
  title text not null default 'Brand voice guide',
  content text not null,
  attributes jsonb not null default '{}'::jsonb,
  source_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists brand_voice_examples (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  customer_message text not null,
  ideal_response text not null,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists brand_voice_examples_client_idx
  on brand_voice_examples (client_id, is_active, created_at desc);

insert into brand_voice_documents (client_id, title, content, attributes, source_notes)
select
  id,
  'Brand voice guide',
  brand_voice,
  jsonb_build_object(
    'formality', 'casual-professional',
    'energy', 'warm and practical',
    'vocabulary', jsonb_build_array('plain English', 'Singapore-aware', 'concise'),
    'bannedPhrases', jsonb_build_array('as an AI language model', 'I guarantee', 'I have processed')
  ),
  'Backfilled from clients.brand_voice.'
from clients
where not exists (
  select 1
  from brand_voice_documents bvd
  where bvd.client_id = clients.id
);

insert into brand_voice_examples (client_id, customer_message, ideal_response, notes, is_active)
select
  id,
  'Are you open this Sunday?',
  'Yes. We open Saturday and Sunday from 10:00 AM to 10:00 PM, with last orders 30 minutes before closing.',
  'Seed F&B opening-hours style example.',
  true
from clients
where not exists (
  select 1
  from brand_voice_examples bve
  where bve.client_id = clients.id
);

create table if not exists client_launch_milestones (
  client_id uuid primary key references clients(id) on delete cascade,
  signed_contract_at timestamptz,
  target_live_at timestamptz,
  production_live_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into client_launch_milestones (client_id, signed_contract_at, target_live_at)
select
  id,
  created_at,
  created_at + interval '7 days'
from clients
where not exists (
  select 1
  from client_launch_milestones clm
  where clm.client_id = clients.id
);

create table if not exists client_commercial_assumptions (
  client_id uuid primary key references clients(id) on delete cascade,
  monthly_retainer_sgd numeric(12,2) not null default 1200.00,
  setup_fee_sgd numeric(12,2) not null default 2500.00,
  amortized_setup_months integer not null default 6,
  hosting_cost_sgd numeric(12,2) not null default 80.00,
  integration_cost_sgd numeric(12,2) not null default 150.00,
  included_conversations integer not null default 500,
  llm_cost_buffer_multiplier numeric(8,4) not null default 2.0000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into client_commercial_assumptions (client_id)
select id
from clients
where not exists (
  select 1
  from client_commercial_assumptions cca
  where cca.client_id = clients.id
);

create table if not exists csat_responses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  message_id uuid references messages(id) on delete set null,
  score integer not null check (score >= 1 and score <= 5),
  comment text,
  source text not null default 'customer_hook',
  created_at timestamptz not null default now()
);

create index if not exists csat_responses_client_idx
  on csat_responses (client_id, created_at desc);

create table if not exists agent_usage_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete cascade,
  message_id uuid references messages(id) on delete set null,
  channel_id uuid references channels(id) on delete set null,
  provider text not null,
  model text not null,
  operation text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost_usd numeric(12,6) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_usage_events_client_idx
  on agent_usage_events (client_id, created_at desc);
