# Database performance and scalability

Migration `0028_performance_flags.sql` (part 1 and 2), pure logic in `packages/core/src/{pagination,cache,dbPerformance}.js`, benchmark in `supabase/tests/bench/`. The measurements are in `docs/benchmarks/db-performance.md` (raw data: `db-performance.json`).

## 1. Audit: what existed, what was missing

| Area | State before | Now |
|---|---|---|
| Row-level security cost | Implemented: every policy uses `(select auth.uid())`, so Postgres evaluates it once per query, not per row | unchanged |
| Indexes | Implemented for most filters (`user_id` first on every table, audit/webhook/API-log time indexes, trigram indexes for search). **Needs optimisation**: no index for the data adapter's page order `(user_id, created_at, id)`, nor for "status + newest first", nor for the unread count | 12 new indexes (below) |
| Pagination | **Partial**: offset pages with exact counts on the audit log, API log and webhook deliveries only. Every module list is loaded **whole** into the browser through `adapter.list` (1000 rows per request, all pages) | One standard (offset + cursor, caps, sort, filter, search, count, next/prev) for tasks, goals, study sessions, job applications, transactions, workouts, habit history, calendar events, audit events, notifications. The audit export now walks by cursor |
| Caching | **Partial**: the in-memory store (invalidated by Realtime, focus, reconnect, writes) and the encrypted offline cache. No TTL policy, no hit/miss numbers, no stampede protection for expensive reads | `@lifetrack/core/cache` (see §4), used by flags, paged reads and the admin performance view |
| Monitoring | **Partial**: System Health had API/error/job views and a slow-statement list that looked for `pg_stat_statements` with an empty search path, so it never found the copy Supabase keeps in the `extensions` schema | Database Performance section (§5); the new function looks in `extensions` and `public` |
| Query analyzer | Missing | §3 |
| Virtualised lists | Missing | `components/shared/VirtualList.jsx`, used by the query table |
| Admin authorisation | Implemented (`platform_admins`, `_require_admin`, `useIsAdmin`) | reused, nothing duplicated: one new menu entry (Feature Management); the performance view is a section of System Health |

**What was deliberately not changed:** the modules still load their whole tables into the store. Reports, streaks, Life Score and offline use calculate over complete data, and swapping that for pages would change results or break offline mode. The paged API is the supported way to build a long history view (`usePagedList`), and the next step per module is a screen-by-screen migration, not a global switch.

## 2. Queries and indexes

Measured on 10 k / 50 k / 100 k rows per table for one person, as the `authenticated` role with row-level security on (`docs/benchmarks/db-performance.md`).

| Index | Query pattern it serves |
|---|---|
| `tasks_user_created_idx`, `transactions_…`, `habit_logs_…`, `study_sessions_…`, `workouts_…`, `food_logs_…`, `calendar_events_…`, `job_applications_…`, `notifications_user_created_idx` — each `(user_id, created_at, id)` | the data adapter's page order, and keyset paging by creation time |
| `tasks_user_status_created_idx (user_id, status, created_at, id)` | status filter + newest first |
| `job_applications_user_status_updated_idx (user_id, status, updated_at desc, id desc)` | one pipeline column, most recently touched first |
| `notifications_unread_idx` (partial: not dismissed, not read) | the unread badge |

* No index duplicates another (a test compares every index definition); every earlier index is kept. `tasks_user_status_idx` and `jobs_user_status_idx` are now prefixes of the new composite ones and could be dropped to save write cost, but each is cheap and dropping is a separate, reviewed step.
* Created with `create index if not exists` (a migration runs in a transaction, so not `CONCURRENTLY`). On a table with millions of rows, create the same index by hand with `CONCURRENTLY` first.
* Not added on purpose: `transactions (user_id, type, txn_date)` and the habit/workout/study date indexes (the existing `(user_id, date)` indexes already serve those at 100 k rows, see the benchmark), the audit log (already has the right indexes) and the calendar week window (the planner reads the matching rows; no wasted work).
* Each new index slows writes to its table slightly (one more B-tree to maintain). The row-writes of this app are one person's clicks, so this is not measurable at app scale.

## 3. Query analyzer report

System Health → Database performance → **Query analyzer report**: findings sorted by priority (high / medium / low), each with a suggestion and the evidence, from two sources:

* **The database's statistics** (`pg_stat_user_tables`, `pg_stat_user_indexes`, `pg_stat_database`, `pg_stat_activity`, and `pg_stat_statements` if the extension is on): full scans of big tables, dead rows, unused indexes, cache hit rate, connection headroom, slow statements (mean time, worst time, calls, rows per call).
* **The browsers' own timings**: every database request is timed (`lib/queryStats.js`) and summed per `table.operation` (location), then sent in one batch every 5 minutes by a sample (25 %) of sessions through `report_query_stats` (rate-limited, validated). Per location: calls, average and slowest time, rows returned per call, failures, slow calls (≥ 500 ms). Rules in `dbPerformance.js` turn "many rows per call" into a pagination suggestion, slow/failing locations into findings.

"Rows examined" is reported where the database knows it (`seq_tup_read` per table; the benchmark's EXPLAIN ANALYZE); the statistics views do not track it per statement and nothing is estimated. **Never exposed:** query parameters, filter values, ids, headers, row content or user identifiers (`query_stats` has no user column; statement text from `pg_stat_statements` already has its parameters replaced by `$1…`).

## 4. Caching

`@lifetrack/core/cache` (no new infrastructure: in-memory, per tab).

* **Keys** `namespace|user id|parameters`: one person's entry can never be served to another; `clear(userId)` on sign-out/demo/reset.
* **TTL by policy** (`FRESHNESS`): presentation 60 s (flags; may be served stale if the server fails), records 15 s (paged lists; never stale after a failure), sensitive 5 s (transactions, budgets, savings, health, journal; never stale), admin 30 s.
* **Versioning/invalidation:** `bump(namespace)` makes older entries invisible and a load that began before the bump is not stored. The paged-list cache is bumped by the store's change notifications (a local write, a Realtime event from another device, a refetch), so a mutation is visible on the next read. Flags are bumped after any admin change.
* **Stampede protection:** concurrent identical reads share one load (single flight).
* **Safe fallback:** a failed load throws, unless the policy allows the last value (flags, admin); an invalidated entry is never served as stale.
* **Metrics:** hits, misses, coalesced, stale, errors, evictions, invalidations, hit rate (`pagedCacheStats()`, `dbCacheStats()`, `flagCacheStats()`; the performance view shows its own).
* The server-side counters (`pg_stat_database`) cover Postgres's buffer cache separately.

## 5. Database Performance section

Inside System Health (`/system`), administrators only (the page checks `is_platform_admin()`, and each of `admin_db_overview` / `admin_db_query_report` checks it again in the database; other callers get `42501`). Shows: connection count against the limit, probe latency and timed aggregations (count and group-by-day over the audit history), database size, cache hit rate, findings, the browsers' query table (virtualised), trend charts (cache hit rate, latency, connections; one point per 10 minutes recorded when the view is opened, 30 days kept), largest tables, index usage, slow statements. Time ranges: 24 h / 3 d / 7 d / 30 d. A statistic the server does not offer (for example no `pg_stat_statements`) is shown as unavailable, never invented. Results are cached 30 s with single-flight; Refresh forces a reload.

## 6. Pagination standard

`normalizePageRequest(table, params)` → `{ pageSize (max 100), sort, dir, filters, search, from/to, page | cursor + direction, count }`. Sorts, filters and search columns come from a per-table whitelist (`PAGED_TABLES`), never from the caller. Offset mode returns `total` and `pages`; cursor mode (keyset on `(sort column, id)`, NULLs handled as Postgres orders them) returns `nextCursor` / `prevCursor` and costs the same on page 1 and page 500. The database adapter (`listPage`) builds the PostgREST query; the local/demo adapters run the same spec in memory; one shared function builds the answer. Tests: keyset results equal the database's own `ORDER BY` on real Postgres for ties and NULLs in both directions, 10 000-row walks, inserts between pages, prev/next, caps, whitelist, cache invalidation.

## 7. Manual steps

1. Run `0028_performance_flags.sql` in the Supabase SQL editor (after 0027).
2. Optional: enable `pg_stat_statements` (Database → Extensions) to get statement timings.
3. Optional: schedule `select purge_performance_data();` daily.
