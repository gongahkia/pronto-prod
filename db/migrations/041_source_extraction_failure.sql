alter table knowledge_source_submissions drop constraint knowledge_source_submissions_status_check;
alter table knowledge_source_submissions add constraint knowledge_source_submissions_status_check
  check (status in ('validation_failed','pending','revision_requested','rejected','approved','staged','published'));
alter table knowledge_source_submissions add column extraction_error text;
