alter table channels
  add column if not exists last_health_check_at timestamptz,
  add column if not exists last_health_status text,
  add column if not exists last_health_error text,
  add column if not exists last_outbound_at timestamptz,
  add column if not exists last_outbound_error text;

create index if not exists channels_health_idx
  on channels (client_id, last_health_status, last_health_check_at desc);
