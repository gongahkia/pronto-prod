-- Keep tenant offboarding and staff removal possible without retaining orphaned commands.
alter table knowledge_suggestions alter column created_by drop not null;
alter table knowledge_suggestions drop constraint if exists knowledge_suggestions_created_by_fkey;
alter table knowledge_suggestions add constraint knowledge_suggestions_created_by_fkey
  foreign key (created_by) references users(id) on delete set null;
alter table knowledge_suggestions drop constraint if exists knowledge_suggestions_reviewed_by_fkey;
alter table knowledge_suggestions add constraint knowledge_suggestions_reviewed_by_fkey
  foreign key (reviewed_by) references users(id) on delete set null;

alter table knowledge_suggestion_revisions alter column created_by drop not null;
alter table knowledge_suggestion_revisions drop constraint if exists knowledge_suggestion_revisions_created_by_fkey;
alter table knowledge_suggestion_revisions add constraint knowledge_suggestion_revisions_created_by_fkey
  foreign key (created_by) references users(id) on delete set null;

alter table staff_command_requests drop constraint if exists staff_command_requests_actor_user_id_fkey;
alter table staff_command_requests add constraint staff_command_requests_actor_user_id_fkey
  foreign key (actor_user_id) references users(id) on delete cascade;
