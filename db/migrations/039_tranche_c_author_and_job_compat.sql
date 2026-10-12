-- Source provenance survives as submission metadata; deleted user rows must not block
-- disposable-tenant removal. Reviewer foreign keys still become null and publication fails closed.
alter table knowledge_source_submission_revisions alter column created_by drop not null;
alter table knowledge_source_submission_revisions drop constraint knowledge_source_submission_revisions_created_by_fkey;
alter table knowledge_source_submission_revisions add constraint knowledge_source_submission_revisions_created_by_fkey
  foreign key (created_by) references users(id) on delete set null;
alter table knowledge_source_submissions alter column submitted_by drop not null;
alter table knowledge_source_submissions drop constraint knowledge_source_submissions_submitted_by_fkey;
alter table knowledge_source_submissions add constraint knowledge_source_submissions_submitted_by_fkey
  foreign key (submitted_by) references users(id) on delete set null;
update staff_notification_jobs set schedule_key = 'initial' where kind = 'initial' and schedule_key is null;
