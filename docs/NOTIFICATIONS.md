# Notification & Reminder Center

The web app's notification centre: one inbox for reminders, calendar alerts and the nudges that come from your other modules, with priorities, snooze,
dismiss, reschedule, search, quiet hours, browser notifications and a history. It extends the reminders and notifications that already existed (the same
two tables, the same Edge Function, the same unique `dedupe_key`) and does not replace them. The mobile app keeps working unchanged. No paid service and
no AI is involved.

Everything below is for web (`/notifications` and the bell in the header) unless it says otherwise.

## 1. What was there before, and what this adds

| Before | Now |
|---|---|
| Inbox with unread, mark read, delete | Inbox of what needs attention; **dismiss** (kept in History), **snooze**, **reschedule**, mark read **and unread**, undo |
| Reminders: kind, date, time, repeat none / daily / weekly / monthly | Adds **priority**, a **note**, **weekdays** and **yearly** repeats, **reschedule**, an **Overdue** flag |
| Per-kind on/off switches | The same switches, now **categories**; plus **quiet hours**, **desktop notifications** and the times of the daily nudges |
| Calendar alerts raised notifications (and had their own toast and browser pop-up) | Unchanged in what they create; **announcing** them is now done in one place, so quiet hours and priority apply |
| Only reminders and calendar alerts produced notifications | **Smart notifications** from tasks, habits, fitness, finance, jobs, learning and goals |
| Bell dropdown | **Animated drawer** with the same cards, filters and actions as the page |
| No search, no filters | Search; category, priority and status filters; sort by newest or most important |
| Nothing for a reminder that fired late | Notifications record when they were **due**; a late one is shown as **Missed · was due …** |
| Deleting was the only way to clear | **History** keeps everything; deleting is a separate, confirmed step |

## 2. The model

A notification is in one of four states, derived from three columns (`read_at`, `snoozed_until`, `dismissed_at`):

| State | Meaning | Where it shows |
|---|---|---|
| **Inbox** | not dismissed, not snoozed into the future | Inbox tab, drawer, bell count (if unread) |
| **Snoozed** | hidden until `snoozed_until`; then it is in the inbox again and **unread**, and announces itself again | "Snoozed (n)" under the inbox; History |
| **Dismissed** | out of the inbox; marked read | History |
| **Deleted** | gone for good (only from History, after a confirmation) | nowhere |

* **Unread** only counts what you can see: a snoozed or dismissed notification is never in the badge.
* **Snooze and reschedule are one thing.** "1 hour", "This evening", "Tomorrow morning", "Next week" and "Pick date & time…" all set `snoozed_until`. For a
  notification that came from a repeating reminder this moves *that occurrence*; to change the series, edit the reminder. Moving a reminder's own date and
  time is **Reschedule…** in the Reminders tab, which also arms it again.
* Snoozing makes the notification unread again, on purpose, so it is noticed when it comes back.
* A **category** is the notification's `kind`: Reminders (`custom`), Tasks, Calendar (`event`), Habits, Fitness (`workout`), Finance (`bill`), Learning
  (`study`), Jobs (`job`), Goals (`goal`), System. A reminder's *type* is its category, so one switch governs the reminders and the nudges of that module.
* **Priority**: `low`, `normal`, `high`, `urgent`. High and urgent get a coloured bar and badge, a firmer toast and stay longer; urgent also breaks through
  quiet hours (unless you turn that off). Tasks and events say `medium` where notifications say `normal`; the two are mapped.

All of the rules live in `packages/core/src/notifications.js` (pure, shared with the Edge Function) and `notificationSources.js` (pure, web). The web hooks and
components only wire them up.

## 3. Where notifications come from

| Source | Created by | Key (`dedupe_key`) | When |
|---|---|---|---|
| Your reminders | `fireDueReminders` (open app) and the `send-reminders` Edge Function | `reminder:<id>:<day>` | at the reminder's time; late ones when something next runs |
| Calendar alerts | `useCalendarAlerts` | `cal:<kind>:<id>:<occurrence>:<minutes>` | the chosen time before an event or timed task |
| Tasks | smart | `src:tasks-today:<day>`, `src:tasks-overdue:<day>` | the morning time: "3 tasks due today", "2 overdue tasks" |
| Habits | smart | `src:habits:<day>` | the evening time, only if some are left |
| Fitness | smart | `src:workout:<day>` | the morning time, if today has a workout planned and not done |
| Finance | smart | `src:bills-today:<day>`, `src:bills-tomorrow:<day>`, `src:budget:<month>:<level>` | bills: morning / evening; budget: as soon as 80 % or 100 % is passed |
| Jobs | smart | `src:interview:<id>:<lead>`, `src:followups:<day>` | an interview heads-up (15 min to 1 day before); follow-ups in the morning |
| Learning | smart | `src:revision:<day>` | the morning time: topics to revise today |
| Goals | smart | `src:goals:<day>` | the morning time: goals and milestones due today or tomorrow |

Smart notifications are **summaries** (one per category per day), never one per item. They are computed from the same rows the screens use, by asking
`todayAgenda` rather than re-deciding what is "today" (`packages/core/src/agenda.js`), so the inbox and the Today list cannot disagree. They are made while
LifeTrack is open on some device; see §8.

## 4. Reliability

* **No duplicates.** Every notification carries a key naming what it is about and which day. The key is unique per user **in the database**
  (`notifications_dedupe_uq`), so with the app open on a phone, a laptop and two tabs, all of them try, one insert wins and the others are told so
  (`23505`) and carry on. A device also remembers the keys it has raised (`localStorage`), so deleting a notification does not bring it back on the next
  refresh, and checks the loaded rows first to avoid pointless inserts.
* **Announcing is per device and once.** `useNotificationDelivery` looks at the *rows*, not at who made them, so reminders, calendar alerts, smart
  notifications and rows made by another device or by the server are all announced the same way. A device announces an arrival once, remembers it across
  a refresh, and does not replay old ones: opening the app long after something arrived just shows it in the inbox. A snoozed notification that wakes is a
  new arrival.
* **Survives refreshes.** Everything that matters is in the database (read, snooze, dismiss, settings). Only "what this device has already announced" is in
  `localStorage`, and losing it costs at most one repeated pop-up.
* **A table that has not loaded is never treated as empty.** Smart notifications skip any category whose data is not all there, so "3 habits left today" cannot
  appear while the habit log is still loading.
* **Missed and overdue reminders.** A reminder whose time passed while every device was off fires when the next one starts, once, even for a repeating
  reminder that was missed for days (it then moves to its next date after today). Its notification records `due_at`, the time it was meant for, and is shown
  as **Missed · was due Mon, 9:00 AM** when it arrives more than 15 minutes late. In the Reminders tab an active reminder whose time has passed is flagged
  **Overdue**.
* **Timezone.** A reminder is a wall-clock time, read in the timezone in Settings (so it moves with the zone, as it always did); `due_at` is the real instant.
  Quiet hours, the morning and evening times, "This evening" and "Tomorrow morning", the day groups and "today" all use that zone, including across
  daylight-saving changes (`zonedToMs` in `@lifetrack/utils`). The server job reads each user's own zone.

## 5. Quiet hours and desktop notifications

* **Quiet hours** (default off, 22:00 to 07:00 when turned on, overnight windows supported) hold the *interruption*, not the notification: it is in the inbox
  at once. When the window ends, what was held is **summed up in one message** ("3 notifications while you were away"). Urgent notifications still come
  through unless you switch that off. The server job applies the same rule to **phone pushes**: during quiet hours only an urgent reminder is pushed, the
  rest wait in the inbox.
* **Desktop notifications** are the browser's own pop-ups and need its permission, which is asked **only when you turn the switch on**. They are shown when
  your attention is elsewhere (the page is in the background, or the window is not focused); a page you can see gets a toast instead. Each is tagged with
  the notification's id so two tabs never stack duplicates. "Send a test notification" shows what one looks like. If the browser blocks them the page says
  so and how to allow them. Calendar's older "browser notifications" switch keeps working for calendar alerts.
* They work while LifeTrack is open in some tab. A closed browser would need **Web Push** (a service worker, VAPID keys and a sender), which is not part of
  this build; see [ROADMAP.md](ROADMAP.md).

## 6. Preferences

*Desktop notifications* · *Quiet hours* (from, until, allow urgent) · *Smart notifications* (on/off, morning summary time, evening check-in time, interview
heads-up) · *Categories* (one switch each). Times are validated as you type: quiet hours cannot start and end together and the evening nudge has to be later
than the morning one; an invalid value is explained and not saved. Settings are saved to `user_settings.notification_settings` and the existing
`notification_prefs`, so they follow you to every device.

## 7. Technical map

| Piece | File |
|---|---|
| Rules: priorities, categories, settings, quiet hours, snooze, filters, search, grouping, delivery plan | `packages/core/src/notifications.js` (copied to `supabase/functions/_shared/` by `scripts/sync-function-core.mjs`) |
| Sources for the other modules | `packages/core/src/notificationSources.js` |
| Reminder rules (repeats, due time, the notification a reminder becomes) | `packages/core/src/reminders.js` |
| Actions: `snoozeNotification`, `dismissNotification(s)`, `restoreNotification`, `markNotificationUnread`, `deleteNotifications`, `raiseNotification`, `rescheduleReminder` | `packages/data/src/api.js` |
| Migration | `supabase/migrations/0013_notification_center.sql` |
| Announce | `apps/web/src/features/notifications/useNotificationDelivery.js` |
| Create from modules | `apps/web/src/features/notifications/useSmartNotifications.js` |
| Reminders (open-app fallback) | `apps/web/src/features/notifications/useReminderRunner.js` |
| UI | `NotificationsPage`, `InboxTab`, `HistoryTab`, `RemindersTab`, `PreferencesTab`, `NotificationCard`, `NotificationList`, `FilterBar`, `NotificationDrawer`, `SnoozeMenu`, `SnoozeDialog` and `components/layout/NotificationBell.jsx` |

**Schema (0013, additive).** `reminders.priority`, `reminders.body`, `repeat` widened to `weekdays`/`yearly`; `notifications.priority`, `due_at`,
`snoozed_until`, `dismissed_at`, `kind` widened to `job`/`goal`; `user_settings.notification_settings` (object); two partial indexes. No new table, so RLS,
the owner trigger and the realtime publication already cover everything. Old app versions keep working: every new column has a default.

**Edge Function (`send-reminders`).** Copies the reminder's priority, note and `due_at` into the notification it creates, and skips the push (not the inbox
row) during quiet hours unless the reminder is urgent. It reads `notification_settings` with the user's other settings. It still creates rows only for
**reminders**; smart notifications and calendar alerts are made by an open app.

**Motion.** `motion/react` with the app's tokens: the drawer slides in with a spring (from the right on a computer, up from the bottom on a phone, drag the
handle to close), cards rise in, leave to the right and the list closes the gap, the unread dot pulses, the bell rings when a new one arrives. A card can be
swiped right to dismiss on a phone. All of it respects the reduced-motion setting.

**Why the drawer is not modal.** A modal dialog makes the rest of the page inert, which would also make a toast's **Undo** and **View** buttons impossible to
press while the drawer is open. It still closes on Escape or a click outside, returns focus to the bell and ignores presses on a toast.

## 8. Limits (deliberate or known)

* Smart notifications and calendar alerts are made **only while LifeTrack is open** on a device. Closed everywhere, nothing is made until the next open, and
  then only today's summaries (and the one for any interview still ahead) are. Reminders are the exception: the Edge Function makes those (still unproven live,
  see [KNOWN_ISSUES.md](KNOWN_ISSUES.md) U3).
* Deleting a notification from History does not stop another device that has never seen it from making today's summary again. Dismiss is the normal way.
* Desktop notifications need an open tab. No Web Push.
* The mobile app shows the new columns' data (a `high` reminder arrives as a push as before) but has no priority picker, snooze or quiet-hours screen yet.
  Quiet hours *are* honoured by the server for pushes. See [PARITY.md](PARITY.md).
* A reminder's time is a wall-clock time: changing the timezone in Settings moves it with the zone.
* Search is substring search over the title, text, category and priority; it is not ranked.

## 9. Tests

* `packages/core/tests/notifications.test.js`, `notificationSources.test.js`: every rule above, including quiet-hour windows across midnight and daylight saving,
  snooze choices from any weekday, delivery planning, and each source.
* `packages/core/tests/send-reminders.test.js`: the server pipeline with priority, `due_at` and quiet hours.
* `packages/data/tests/notificationCenter.test.js`: the actions against the table schemas, including racing devices.
* `supabase/tests/pglite/notifications.test.ts`: the migration (constraints, defaults, indexes, isolation).
* `apps/web/tests/notifications.test.jsx`, `notificationHooks.test.jsx`, `notificationCenter.test.jsx`: components, the delivery and smart hooks, and the whole
  centre through the real app.
* `apps/web/e2e/notifications.spec.js`, `notifications-responsive.spec.js`: a real browser, including browser notifications (with a stand-in
  `Notification`), quiet hours, reload persistence, keyboard use, axe scans and phone layout with swipe.
