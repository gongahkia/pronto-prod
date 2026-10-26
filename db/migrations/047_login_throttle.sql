-- Shared across serverless instances; keys are HMACs, not email/IP addresses.
create table auth_login_attempts (
  key text not null,
  window_start timestamptz not null,
  attempts integer not null check (attempts>0),
  primary key (key,window_start)
);
create index auth_login_attempts_expiry_idx on auth_login_attempts(window_start);
