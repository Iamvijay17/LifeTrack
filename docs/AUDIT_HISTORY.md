# Audit history and data history

Migration `0027_platform.sql`. Page: **Audit History** (`/audit`).

## What is recorded

A database trigger (`audit_capture`) on every user-data table writes one row to `audit_events` for each create, update and delete, **inside the same transaction as the change** (if the event cannot be written, neither can the change). Audited tables: `_audit_tables()` in the migration (tasks, goals, habits and check-ins, study sessions, job applications and interviews, workouts and exercise logs, body measurements, health logs, foods and food logs, transactions, budgets, savings goals, recurring rules, notes and journal, calendar events, challenges, automations, reminders, settings).

The app also reports events the database cannot see (`log_audit_event`): sign-in, sign-out, password change, full backup export/import, CSV and report exports, API key and webhook changes (these three are written by their own functions).

Each event holds: id, user, time, action (`create update delete restore import export login logout permission config security`), entity, record id, a short label, the **changed fields with old and new values** (a create keeps the new row, a delete the removed row), a request / correlation id, the source (`web`, `mobile`, `api`, `job`, `database`), a **coarse** network location (IPv4 /24, IPv6 /48 — not the address) and the user agent.

**Never logged:** passwords, tokens, API keys, secrets, PIN hashes. `_redact()` removes any key matching `password|secret|token|api_key|private_key|credential|pin_hash|…hash`. Text longer than 4,000 characters is cut and the event is flagged `truncated` (such an event cannot be restored). Tables that hold credentials (`passkeys`, `device_keys`, `user_security`, `integration_tokens`, `webhook_secrets`) are not audited at all.

The web app labels every database request with `x-lifetrack-source` and a fresh `x-request-id` (`apps/web/src/lib/supabase.js`, mobile in `apps/mobile/src/lib/supabase.ts`); the API gateway sets source `api`. The trigger reads them from PostgREST's request headers.

## Append-only

* Clients have `SELECT` only; no `INSERT/UPDATE/DELETE` grant exists for `authenticated` or `anon`, and `_audit_insert()` is not callable by them (no forged events).
* A guard trigger rejects `UPDATE`, `DELETE` and `TRUNCATE` **for every role, including the owner and the service role**. Only two things switch it off for their own transaction: the retention job (`purge_platform_data`, service role only) and the person's own **Erase history** action, which leaves a tombstone event ("Audit history erased (N events)"). A cascade from deleting the whole account is also allowed.
* **Integrity chain:** each event stores `prev_hash` and a SHA-256 `hash` of its content and the previous hash, per person. **Verify integrity** (`audit_verify_chain`) recomputes the last 5,000 and reports the first mismatch. An edit changes a hash; removing the middle breaks a link; removing the oldest events (retention) is expected and not an error.
* Events of a locked module (Finance, Notes, Health, Fitness, Nutrition, Jobs) are hidden by a restrictive policy while that module is locked, exactly like the module's own rows.

## Restoring

`audit_restore(event, apply)` runs **as the signed-in person** (row-level security and every table constraint still apply) in one transaction.

* `apply = false` is a dry run: it returns what will change (`changes`), any `conflicts`, or the reason it cannot be done.
* `apply = true` needs an unlocked session. Restores either **revert an update** (put the changed fields back) or **re-create a deleted record**.
* **Conflict detection:** a revert only proceeds if every field it will touch still has the value the event wrote. If anything changed since, nothing is written and the conflicts are listed. A re-create refuses if the record exists again.
* Refused with a plain reason: record deleted since, missing parent record (foreign key), duplicate (unique), values no longer valid (check), module locked, truncated event, settings, creations.
* A restore writes its own events (`action = restore`, `restored_from` = the original event) and queues the `data.restored` webhook.

## Retention

Audit events are kept 730 days by default. The scheduler's daily clean-up reads `RETAIN_AUDIT_DAYS` (set `0` to keep forever).

## Limits

* Restoring one record does not restore its children (deleting a habit cascades to its check-ins, each of which has its own delete event).
* Bulk changes (an import of 10,000 rows) write one event per row.
* The in-browser dev backend has no database triggers, so the page says it needs a Supabase project.
