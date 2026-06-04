alter table escalations
  add column if not exists customer_handoff_status text not null default 'pending',
  add column if not exists customer_handoff_error text,
  add column if not exists owner_notification_status text not null default 'pending',
  add column if not exists owner_notification_error text;

create index if not exists escalations_delivery_status_idx
  on escalations (client_id, customer_handoff_status, owner_notification_status, created_at desc);
