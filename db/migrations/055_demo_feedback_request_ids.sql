-- Client-generated request IDs make feedback saves idempotent: a retry after a lost
-- response returns the original thread instead of inserting a duplicate comment.
alter table demo_feedback_comments add column if not exists request_id uuid;
create unique index if not exists demo_feedback_comments_request_idx
 on demo_feedback_comments(client_id,request_id) where request_id is not null;
