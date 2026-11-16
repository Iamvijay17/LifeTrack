# Personal Automation Studio

Rule-based automation for LifeTrack: **when** something happens (a trigger), **if** it matches (conditions), **do** something (actions).
No AI, no paid APIs, no new infrastructure. Web only (route `/automation`). Migration `0019_automation.sql`.

## 1. What the audit found (and how it shaped the design)

| Finding | Consequence |
| --- | --- |
| There is **no custom backend**. Data is Supabase tables with RLS (`user_id = auth.uid()`); the "backend logic" is pure modules in `packages/core`, multi-row operations in `packages/data/src/api.js`, and one Edge Function (`send-reminders`). | Automations follow the same pattern: pure rules in core, a thin executor in data, tables with RLS. No new service. |
| Background work already runs **in the open app** (`useReminderRunner`, `useSmartNotifications`, `useRecurringRunner`, `useCalendarAlerts`), made safe for several devices by a **unique key in the database** (`notifications.dedupe_key`, `transactions(recurring_rule_id, recurring_date)`). The Edge Function only covers reminders and pushes. | The engine is a runner of the same kind, with the same idempotency idea: a run is **claimed by inserting its row first** under a unique key. |
| Reminders/notifications, tasks, habits (+logs, pauses, rest days), goals (+milestones), calendar events (recurring, exceptions), notification centre, Smart Recovery, theming (`data-module` accents), motion/reduced-motion, `Dialog`/`Select`/pickers/`Confirm`, `DataGate`/`EmptyState`, optimistic store. | Reused as is. Actions write through the **same store and API functions** the screens use (`createTask` path, `setTaskStatus`, `raiseNotification`). Nothing duplicated. |
| Tasks have **no goal link**; there is **no checklist** entity except a goal's **milestones**. | "Update related goal progress" asks which goal; "add a checklist item" adds a **milestone** to a goal. Both are stated in the UI. |
| Goal progress is **calculated** from milestones or study time, and only a "manual" percentage is writable. | `update_goal_progress` only changes manual-progress goals and says so when it skips one. |
| No graph library in the project (`recharts`, `motion`, `radix-dialog`, `lucide`). | The canvas is hand-built (pointer events + SVG, ~300 lines). **No dependency added.** |
| `habit_pauses` / `rest_days` come from `0018_consistency.sql` (another feature, not yet run on the user's Supabase). | `habit_missed` reads them so a paused or rest day is never "missed". A workflow whose tables cannot be loaded is **skipped**, never treated as "nothing happened". |

## 2. Architecture

```
packages/core/src/automation.js        catalogue (triggers, conditions, actions), graph shape + edits, validation, summaries, layout, templates
packages/core/src/automationEngine.js  occurrences (what is due), conditions, the plan of effects (pure: reads rows, returns data), limits
packages/data/src/automation.js        executor: claim → plan → apply step by step → finish; retry; sweep; pause   (wired into createApi)
supabase/migrations/0019_automation.sql   automation_workflows, automation_executions, user_settings.automation_prefs
apps/web/src/features/automation/      dashboard, templates, history, editor (canvas, steps list, config panel, test dialog), runner hook
```

**The same plan is used for "Test workflow" and for real runs**, so a test can never promise something a run would not do. `planRun()` returns a list
of steps with their *effects* (`insert`, `update`, `update_task`, `notify`); a test shows them, the executor applies them.

### Workflow model
A workflow is a small directed graph: `nodes[{id,type: trigger|condition|action, kind, config, x, y}]`, `edges[{id,from,to}]`. Exactly one trigger. A condition
that is not met stops its branch. Chaining conditions gives AND-of-ORs (nesting without a tree editor). Branching (one node to several) is supported.

### Execution lifecycle
`pending → running → completed | failed | skipped`.

1. **Claim**: insert the run row first with `dedupe_key` (e.g. `task_completed:<task>:<completed_at>`, `slot:2026-11-16@21:00`). Unique `(user, workflow, key)` → a second device, tab or restart gets `23505` and does nothing.
2. **Plan**: `planRun()` from the rows as they are now.
3. **Apply**: each step is applied and **saved immediately** (with the id of anything it created). A crash never repeats a finished step.
4. **Finish**. A *temporary* failure (network, busy DB) is retried automatically with a pause (1, 2, 4 min, at most 3 attempts) **from the step that failed**. A permanent failure (record gone, RLS refusal) is not retried by itself; **Retry** in the history resumes it the same way. Notifications carry a fixed key, so a retry cannot raise them twice.
5. A run left `running`/`pending` by a closed tab is failed by the next check (timeout protection, 2 × 30 s) and resumed if it had steps left.

### Triggers: what is real
All 22 advertised triggers are implemented. **Event** triggers only react to things that happen *after the workflow was switched on* (`activated_at`);
**state** triggers fire once per subject that is in that state.

| Trigger | Fires | Key |
| --- | --- | --- |
| Date/time, every day, weekdays, weekly, monthly (short months use the last day), every N days, daily/weekly review | the latest slot that came due, in the **user's timezone**, not older than 12 h (a slot missed while the app was closed is not fired late) and not before activation | `slot:<date>@<time>` |
| Task created / completed / overdue / due soon | event (after activation). Overdue and due-soon only for tasks that crossed that line after activation | `task_created:<id>`, `task_completed:<id>:<completed_at>`, `task_overdue:<id>:<due>`, `task_due:<id>:<due>:<n>` |
| Habit completed / missed / streak / weekly target | completed: logs created after activation. **missed**: the 2 previous days, scheduled, not rest/paused, no log, after activation (daily/custom habits). streak: once per streak (state). weekly target: once per week | `habit_done`, `habit_missed`, `habit_streak:<id>:<n>:<streak start>`, `habit_week:<id>:<week>` |
| Goal created / progress reaches % / completed / deadline | created, completed: events. Progress and deadline: state (once per goal) | `goal_created`, `goal_pct:<id>:<n>`, `goal_done`, `goal_deadline` |
| Reminder time reached | the reminder fired today (after activation) | `reminder:<id>:<day>` |
| Calendar event approaching | inside the lead time, once per occurrence (recurring events and exceptions honoured; all-day events excluded) | `event:<key>:<start>:<min>` |

### Actions: what is real
`notify`, `create_task`, `update_task` (priority, status via the normal `setTaskStatus` so recurring tasks spawn their next one, move due date, add a note line; acts on the triggering task),
`create_reminder`, `update_goal_progress`, `create_review_task` (daily/weekly, with the day's/week's counts), `add_checklist_item` (a goal's milestone, not added twice), `complete` (ends a branch).
Text fields accept `{{task.title}}`, `{{habit.name}}`, `{{goal.progress}}`, `{{date}}`, `{{weekday}}`… There is **no delete action** and none can be added through the editor.

### Safety
* **Isolation**: every row is RLS-owned; the runner reads only the signed-in user's cache; `automation_executions.workflow_id` has the same-owner guard (`check_fk_owner`). Tested in `supabase/tests/pglite/automation.test.ts` and the generic RLS suite.
* **Validation before activation** (`validateWorkflow`): one trigger, no loops, every step connected, required fields, conditions/actions that fit the trigger's subject, size limits. An enabled workflow that is saved invalid is **switched off**, not left half-working.
* **Limits**: 50 runs/day per workflow (editable, max 200), 120 runs/hour across all, 25 runs started per check, 30 nodes/12 actions per workflow. Reaching a limit leaves **one** "limit reached" row per day.
* **Loops**: tasks/goals created by an automation never start a *task created / overdue / due soon / goal created* automation; the same occurrence can never run twice; the daily limit is the backstop.
* **Confirmation**: switching on a workflow that *changes existing* tasks/goals asks first. Nothing can delete user data.
* **Pause all** (`user_settings.automation_prefs.paused`), and a per-workflow switch.

## 3. Database (0019, additive, idempotent)
* `automation_workflows(name, description, enabled, trigger_kind, graph jsonb, template_key, max_runs_per_day, activated_at)`
* `automation_executions(workflow_id → set null on delete, workflow_name, trigger_kind, trigger_info, status, attempt, steps jsonb, reason, error, retryable, dedupe_key, started_at, finished_at)`; unique `(user_id, workflow_id, dedupe_key)`.
* `user_settings.automation_prefs jsonb` (`{ paused }`).
* RLS, `set_updated_at`, realtime, check constraints on status/size/shape. Templates are **code** (`TEMPLATES` in `automation.js`), not rows: opening one creates an editable, switched-off copy only when saved.

## 4. API (in `createApi`, web `services/api.js`)
`saveWorkflow(existing, values)`, `setWorkflowEnabled(workflow, on)`, `setAutomationsPaused(paused)`, `runAutomations({today, tz, nowMs, weekStartsOn})`, `retryExecution(id, {today})`. Rows go through the generic store (`deleteRow('automation_workflows', id)`).

## 5. Background execution strategy
`useAutomationRunner()` (mounted in `AppShell`) checks 4 s after load, every 30 s and on window focus. It is idempotent across tabs/devices (claim-first).
**Automations only run while LifeTrack is open on at least one device.** There is no server job (none exists for the other client-side runners either); see Known limitations.

## 6. UI
`/automation` dashboard (counters, recent runs, pause all, workflows, templates), `/automation/new?template=…` and `/automation/:id` editor, `/automation/history`.
Editor: drag nodes (snap 8 px), drag from a node's round handle to connect, click a connection to remove it, pan (drag/scroll), zoom (Ctrl/Cmd + scroll, buttons, `+`/`-`/`0`), auto layout, undo/redo (typing is one step), palette (click or drag), config panel, validation list that jumps to the step, **Test** (dry run on one of your rows), Save (Ctrl/Cmd+S), enable switch.
Keyboard: Tab between steps, arrows move, Delete removes, "Runs next" checkboxes connect without a pointer. Reduced motion stops the connection flow animation. Phone: the **Steps** view is the viewer and simplified editor (tap a step, edit in a sheet, add from a list).

## 7. Known limitations
* Runs only while the app is open (see 5). A schedule slot missed while no device was open is **not** fired late beyond 12 h.
* Habit missed: daily/custom habits only (a weekly habit has no "day it was missed"; use *weekly target*).
* Web only; no mobile screen. Mobile devices do not run the engine.
* `retryExecution` from two devices at the very same instant could apply a non-notification step twice (the claim is on the run, not on a retry).
* Tasks created by automations are not tagged in the `tasks` table; loop protection relies on the execution log's recorded ids (so it forgets them if the history is deleted).
* No nested condition trees (chain conditions instead), no "else" branch.
* Migration `0019` (and `0018`, for pauses/rest days) must be run on the Supabase project.
