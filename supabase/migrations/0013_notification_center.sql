-- 0013: Smart Notification & Reminder Center. ADDITIVE: new defaulted / nullable columns, two CHECK constraints widened (never narrowed) and two
-- partial indexes, so no existing row changes and running app versions (the mobile app included) keep working.
--
--  * reminders gain a priority and an optional note, and may repeat on weekdays or yearly.
--  * notifications gain a priority, the time the thing was meant to happen (`due_at`, so a late one can be shown as "missed"), and the two states
--    the inbox needs: snoozed (hidden until `snoozed_until`, then back as new) and dismissed (out of the inbox, kept in the history).
--    A notification is "unread" only while it is visible: not dismissed and not snoozed into the future.
--  * notifications.kind gains 'job' and 'goal' (the existing kinds are the categories: task, study, workout, habit, bill, custom, event, system).
--  * user_settings.notification_settings holds quiet hours, desktop notifications and the times of the daily nudges (see packages/core/src/notifications.js).
-- Nothing here is a new table, so row-level security, the owner trigger and the realtime publication from 0003 already cover every new column.

-- --------------------------------------------------------------- reminders
alter table public.reminders
  add column if not exists priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  add column if not exists body text not null default '' check (char_length(body) <= 500);

alter table public.reminders drop constraint if exists reminders_repeat_check;
alter table public.reminders add constraint reminders_repeat_check
  check (repeat in ('none','daily','weekdays','weekly','monthly','yearly'));

-- ----------------------------------------------------------- notifications
alter table public.notifications
  add column if not exists priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  add column if not exists due_at timestamptz,          -- when the reminder / event was meant to happen; created_at well after it = missed
  add column if not exists snoozed_until timestamptz,   -- hidden from the inbox until then
  add column if not exists dismissed_at timestamptz;    -- out of the inbox; stays in the history until deleted

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('task','study','workout','habit','bill','custom','system','event','job','goal'));

-- The inbox reads "not dismissed, newest first"; the snooze timer reads "snoozed, soonest first". Both stay small however long the history grows.
create index if not exists notifications_inbox_idx on public.notifications (user_id, created_at desc) where dismissed_at is null;
create index if not exists notifications_snoozed_idx on public.notifications (user_id, snoozed_until) where snoozed_until is not null;

-- ------------------------------------------------------------ preferences
alter table public.user_settings
  add column if not exists notification_settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(notification_settings) = 'object');  -- {quiet:{enabled,from,to,allow_urgent}, desktop, smart, morning, evening, lead_minutes}
