alter table reviews
  add column if not exists answer_label text,
  add column if not exists failure_severity text,
  add column if not exists root_cause text,
  add column if not exists fix_owner text,
  add column if not exists knowledge_update_needed boolean not null default false,
  add column if not exists pilot_blocker boolean not null default false;

create index if not exists reviews_client_answer_label_idx
  on reviews (client_id, answer_label, created_at desc);
