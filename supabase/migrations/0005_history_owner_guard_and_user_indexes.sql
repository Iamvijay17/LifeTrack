-- 0005: the two gaps left after 0004_hardening (idempotent; safe to re-run).
--  1. application_history.application_id was the one parent link without a same-owner guard. Same mechanism as 0004
--     (public.check_fk_owner): a user can't point history at another user's application.
--  2. Three tables that RLS filters by user_id had no user_id-leading index.

drop trigger if exists fk_owner on public.application_history;
create trigger fk_owner before insert or update on public.application_history
  for each row execute function public.check_fk_owner('application_id', 'job_applications');

create index if not exists app_history_user_idx   on public.application_history (user_id, changed_at);
create index if not exists routines_user_idx      on public.routines (user_id);
create index if not exists savings_goals_user_idx on public.savings_goals (user_id);
