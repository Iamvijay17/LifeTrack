# Database benchmark: before and after migration 0028

Engine: PGlite (WASM Postgres), one person with N rows in each of 9 tables plus N audit events, queries run with `EXPLAIN (ANALYZE)` as the `authenticated` role (row-level security on), median of 5 runs. Same data before and after (migration 0028 applied between the two measurements). Script: `supabase/tests/bench/perf.ts` (`node --experimental-strip-types bench/perf.ts <rows> <out.json>`). Absolute times are WASM, single-user and **not production latency**; the rows examined and the plan type are what carry over. Index build time at 100,000 rows/table: 2303 ms.

## 10,000 rows per table

| Query | Before ms | After ms | Rows examined before → after | Plan before → after |
|---|---:|---:|---|---|
| tasks: full list (adapter.list page) | 16.32 | 1.5 | 10,000 → 1,000 | Seq → Index |
| tasks: open by due date (keyset) | 0.48 | 0.22 | 133 → 133 | Index → Index |
| tasks: status filter + created sort | 3.98 | 0.11 | 8,000 → 50 | Bitmap Heap+Bitmap Index → Index Only |
| transactions: month range | 0.64 | 0.36 | 54 → 54 | Index → Index |
| transactions: expense type + date sort | 0.48 | 0.49 | 107 → 107 | Index → Index |
| transactions: full list (adapter.list page) | 16.97 | 1.47 | 10,000 → 1,000 | Seq → Index |
| habit_logs: date range | 0.22 | 0.2 | 90 → 90 | Index → Index |
| habit_logs: full list (adapter.list page) | 10.91 | 1.08 | 10,000 → 1,000 | Seq → Index |
| study_sessions: recent | 0.3 | 0.2 | 54 → 54 | Index → Index |
| job_applications: by status | 2 | 0.26 | 4,000 → 50 | Bitmap Heap+Bitmap Index → Index |
| workouts: recent | 0.4 | 0.36 | 54 → 54 | Index → Index |
| calendar_events: week window | 1.1 | 1.34 | 1,680 → 1,680 | Bitmap Heap+Bitmap Index → Bitmap Heap+Bitmap Index |
| notifications: inbox page | 0.21 | 0.13 | 26 → 26 | Index → Index |
| notifications: unread count | 4.15 | 1.47 | 10,000 → 4,000 | Seq → Bitmap Heap+Bitmap Index |
| audit_events: page + filter | 0.68 | 0.44 | 26 → 26 | Index → Index |
| audit_events: date range | 1.09 | 1.05 | 26 → 26 | Index → Index |

## 50,000 rows per table

| Query | Before ms | After ms | Rows examined before → after | Plan before → after |
|---|---:|---:|---|---|
| tasks: full list (adapter.list page) | 90.4 | 1.79 | 50,000 → 1,000 | Seq → Index |
| tasks: open by due date (keyset) | 0.39 | 0.59 | 166 → 166 | Index → Index |
| tasks: status filter + created sort | 21.1 | 0.21 | 40,000 → 50 | Bitmap Heap+Bitmap Index → Index Only |
| transactions: month range | 0.67 | 0.45 | 68 → 68 | Index → Index |
| transactions: expense type + date sort | 0.66 | 0.57 | 135 → 135 | Index → Index |
| transactions: full list (adapter.list page) | 79.94 | 1.95 | 50,000 → 1,000 | Seq → Index |
| habit_logs: date range | 0.24 | 0.38 | 90 → 90 | Index → Index |
| habit_logs: full list (adapter.list page) | 52.3 | 1.28 | 50,000 → 1,000 | Seq → Index |
| study_sessions: recent | 0.25 | 0.25 | 68 → 68 | Index → Index |
| job_applications: by status | 8.82 | 0.26 | 20,000 → 50 | Bitmap Heap+Bitmap Index → Index |
| workouts: recent | 0.47 | 0.4 | 68 → 68 | Index → Index |
| calendar_events: week window | 6.14 | 6.32 | 8,400 → 8,400 | Bitmap Heap+Bitmap Index → Bitmap Heap+Bitmap Index |
| notifications: inbox page | 0.16 | 0.14 | 26 → 26 | Index → Index |
| notifications: unread count | 9.31 | 7.55 | 30,000 → 20,000 | Bitmap Heap+Bitmap Index → Bitmap Heap+Bitmap Index |
| audit_events: page + filter | 0.73 | 0.52 | 26 → 26 | Index → Index |
| audit_events: date range | 1.6 | 1.43 | 26 → 26 | Index → Index |

## 100,000 rows per table

| Query | Before ms | After ms | Rows examined before → after | Plan before → after |
|---|---:|---:|---|---|
| tasks: full list (adapter.list page) | 171.64 | 1.18 | 100,000 → 1,000 | Seq → Index |
| tasks: open by due date (keyset) | 0.45 | 0.68 | 267 → 267 | Index → Index |
| tasks: status filter + created sort | 37.69 | 0.14 | 80,000 → 50 | Bitmap Heap+Bitmap Index → Index Only |
| transactions: month range | 0.64 | 0.65 | 67 → 67 | Index → Index |
| transactions: expense type + date sort | 0.59 | 0.59 | 201 → 201 | Index → Index |
| transactions: full list (adapter.list page) | 143.14 | 1.29 | 100,000 → 1,000 | Seq → Index |
| habit_logs: date range | 0.23 | 0.36 | 90 → 90 | Index → Index |
| habit_logs: full list (adapter.list page) | 123.5 | 1.07 | 100,000 → 1,000 | Seq → Index |
| study_sessions: recent | 0.23 | 0.25 | 67 → 67 | Index → Index |
| job_applications: by status | 19.04 | 0.43 | 40,000 → 50 | Bitmap Heap+Bitmap Index → Index |
| workouts: recent | 0.53 | 0.38 | 67 → 67 | Index → Index |
| calendar_events: week window | 12.09 | 14.2 | 16,800 → 16,800 | Bitmap Heap+Bitmap Index → Bitmap Heap+Bitmap Index |
| notifications: inbox page | 0.2 | 0.14 | 26 → 26 | Index → Index |
| notifications: unread count | 17.62 | 15.04 | 60,000 → 40,000 | Bitmap Heap+Bitmap Index → Bitmap Heap+Bitmap Index |
| audit_events: page + filter | 0.66 | 0.52 | 26 → 26 | Index → Index |
| audit_events: date range | 0.99 | 1.18 | 26 → 26 | Index → Index |

Notes: `calendar_events: week window` and `notifications: unread count` read the rows they return or count (the seeded data puts a large share of rows in those sets), so an index can not reduce the work much: the week window is unchanged by design and the unread count improves only modestly. The `audit_events` and date-range queries were already index-served. The old cost of the *full list* paging order grew linearly with the table (sequential scan + sort of every row for each 1,000-row page); it is now an index scan of exactly the rows returned.