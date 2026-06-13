alter table outbound_messages
  drop constraint if exists outbound_messages_idempotency_key_key;

create unique index if not exists outbound_messages_client_idempotency_key_idx
  on outbound_messages (client_id, idempotency_key);
