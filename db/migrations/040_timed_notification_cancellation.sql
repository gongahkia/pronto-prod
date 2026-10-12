alter table staff_notification_jobs drop constraint staff_notification_jobs_status_check;
alter table staff_notification_jobs add constraint staff_notification_jobs_status_check
  check (status in ('pending','sending','sent','failed','uncertain','dead','cancelled'));
