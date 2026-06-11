alter table escalations
  add column if not exists assigned_to_user_id uuid references users(id) on delete set null;

create index if not exists escalations_assigned_idx
  on escalations (assigned_to_user_id, status, created_at desc);
