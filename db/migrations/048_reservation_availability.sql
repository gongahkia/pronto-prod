-- Only public date/party availability is cached; no diner or booking records.
create table reservation_availability_cache (
  client_id uuid not null references clients(id) on delete cascade,
  outlet_id text not null,
  reservation_date date not null,
  party_size integer not null check (party_size between 1 and 20),
  result jsonb,
  checked_at timestamptz,
  last_requested_at timestamptz not null default now(),
  next_refresh_at timestamptz not null default now(),
  lease_until timestamptz,
  primary key (client_id, outlet_id, reservation_date, party_size)
);
create index reservation_availability_due on reservation_availability_cache(next_refresh_at);

create table reservation_availability_observations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  outlet_id text not null,
  reservation_date date not null,
  party_size integer not null check (party_size between 1 and 20),
  result jsonb not null,
  checked_at timestamptz not null default now()
);
create index reservation_availability_history on reservation_availability_observations
  (client_id, outlet_id, reservation_date, party_size, checked_at desc);

-- Shared across web and worker processes, including failed provider reads.
create table reservation_provider_limits (
  provider text primary key,
  next_read_at timestamptz not null
);
