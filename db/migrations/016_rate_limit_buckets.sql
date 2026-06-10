create table if not exists rate_limit_buckets (
  bucket_key text primary key,
  window_started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  hit_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists rate_limit_buckets_expires_idx
  on rate_limit_buckets (expires_at);
