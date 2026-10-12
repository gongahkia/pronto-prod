alter table knowledge_source_submissions add column request_key text;
create unique index knowledge_source_submissions_request_key_idx
  on knowledge_source_submissions(client_id,submitted_by,request_key) where request_key is not null;
