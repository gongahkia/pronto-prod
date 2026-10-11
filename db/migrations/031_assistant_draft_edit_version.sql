alter table assistant_drafts
  add column if not exists edit_version integer not null default 1;
