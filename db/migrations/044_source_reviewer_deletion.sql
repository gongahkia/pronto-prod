-- Mirror the existing suggestion policy: a deleted reviewer's missing identity
-- invalidates pending publication, while source history remains available.
alter table knowledge_source_submissions drop constraint knowledge_source_submissions_reviewed_by_fkey;
alter table knowledge_source_submissions add constraint knowledge_source_submissions_reviewed_by_fkey
  foreign key (reviewed_by) references users(id) on delete set null;
