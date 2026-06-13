alter table channels
  add column if not exists encrypted_credentials text,
  add column if not exists credentials_encryption_nonce text,
  add column if not exists credentials_encryption_tag text;

comment on column channels.credentials is
  'Legacy/plaintext fallback only. New channel credentials must be stored in encrypted_credentials columns.';
