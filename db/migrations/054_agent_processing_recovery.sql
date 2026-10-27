-- Operational failures do not transfer conversation ownership to staff.
alter table inbound_jobs add column failure_code text;
alter table inbound_jobs add column failure_provider text;

-- Shared across workers; never store provider payloads or credentials here.
create table provider_cooldowns (
  client_id uuid not null references clients(id) on delete cascade,
  provider text not null,
  failure_code text not null,
  retry_after timestamptz not null,
  primary key (client_id, provider)
);
