alter table users
  add column if not exists session_version integer not null default 1;

create index if not exists users_session_version_idx
  on users (id, session_version);
