create table if not exists agent_traces (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  customer_message_id uuid references messages(id) on delete set null,
  agent_message_id uuid references messages(id) on delete set null,
  escalation_id uuid references escalations(id) on delete set null,
  request_id text,
  status text not null,
  reason_code text,
  confidence numeric(5,4),
  response_provider text,
  response_model text,
  embedding_provider text,
  embedding_model text,
  retrieval_top_score numeric(7,5),
  retrieval_threshold numeric(5,4),
  retrieval_chunk_count integer not null default 0,
  retrieval_chunk_scores jsonb not null default '[]'::jsonb,
  cited_chunk_ids jsonb not null default '[]'::jsonb,
  prompt_hash text,
  prompt_token_estimate integer,
  response_token_estimate integer,
  used_failover boolean not null default false,
  failover_provider text,
  failover_model text,
  failover_reason text,
  latency_ms integer,
  error_message text,
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_traces_conversation_idx
  on agent_traces (conversation_id, created_at asc);

create index if not exists agent_traces_client_idx
  on agent_traces (client_id, created_at desc);
