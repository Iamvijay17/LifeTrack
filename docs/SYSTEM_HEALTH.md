# System Health & observability

Page: **System Health** (`/system`), for administrators. Migration `0027_platform.sql`.

## Who is an administrator

Only people in `platform_admins` (no client can read or write it). Add one in the SQL editor:

```sql
insert into public.platform_admins (user_id) select id from auth.users where email = 'you@example.com';
```

Every `admin_system_*` function checks `is_platform_admin()` on the server; the menu entry is only hidden for others.

## What it shows

| Area | Source |
| --- | --- |
| Overall status, API availability, request volume, error rate, latency, auth failures | `request_metrics`: hourly aggregates written by the API gateway (count, 4xx/5xx, latency histogram, max, slow count) |
| Database health | A query the overview runs (answers = up, with its latency); slow queries from `pg_stat_statements` when that extension is on (mean > 100 ms, normalised text only) |
| Frontend and sync errors | `app_errors`: one row per distinct error with a counter. **No user id and no URL query string is stored.** Categories: frontend, sync, network, auth, api, other |
| Background jobs | `job_runs`: the `webhook-dispatch` function reports every run and its daily retention run |
| Webhook delivery | counts from `webhook_deliveries` (waiting, dead-lettered, delivered) |
| Last cloud backup | latest `integration_events` row of kind `backup` (Google Drive). Downloads to a device are not tracked |
| Incidents | derived, not stored: an hour with ≥ 5% server errors (≥ 5 requests), or a failed job run |

Status rules are in `packages/core/src/systemHealth.js` (error rate ≥ 2% degraded, ≥ 20% down; average latency > 800 ms degraded; dispatcher silent > 15 min degraded; dead-lettered deliveries degraded; fewer than 5 requests never trips the rate). A part with no data is **"No data yet"**, never "healthy".

## Endpoints

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `GET {functions}/api/health` | none | `{status, version, time}` |
| `GET {functions}/api/health/live` | none | liveness: the function is running |
| `GET {functions}/api/health/ready` | none | readiness: the database answers (503 otherwise; no details) |
| RPC `admin_system_overview()` | administrator | the overview above |
| RPC `admin_system_metrics(hours)` | administrator | hourly series (1–168 h) |
| RPC `admin_system_errors(limit, offset, category)` | administrator | grouped errors, newest first |

(The three admin functions are Postgres RPCs, the convention of this project — LifeTrack has no custom REST server — so they are `POST /rest/v1/rpc/<name>`.)

Nothing returned exposes connection strings, keys, or stack traces to ordinary users; error stacks are only in the administrator-only RPC and come from browsers, trimmed to 8 lines with tokens scrubbed.

## Structured logging, correlation, slow requests

* The gateway logs one structured line per failure (`api: <request id> <code> <message ≤ 200 chars>`; never bodies, headers or keys), and returns the request id in `X-Request-Id` and every error body.
* Slow requests: a request slower than `API_SLOW_MS` (default 1000) is counted as slow.
* Browser errors: `window.onerror`, unhandled rejections, render errors and permanently failed sync operations are reported (`apps/web/src/lib/errorReporting.js`): at most 10 distinct per page load, 20 per person per 10 minutes on the server, secrets scrubbed.

## Retention (no unbounded storage)

`purge_platform_data()` runs once a day from the `webhook-dispatch` scheduler call. Defaults and the variables that change them:

| Data | Default | Variable |
| --- | --- | --- |
| API request log | 30 days | `RETAIN_API_LOG_DAYS` |
| Hourly metrics | 90 days | `RETAIN_METRICS_DAYS` |
| Error log | 60 days | `RETAIN_ERROR_DAYS` |
| Job runs | 30 days | `RETAIN_JOB_DAYS` |
| Finished webhook deliveries | 30 days | `RETAIN_WEBHOOK_DAYS` |
| Audit history | 730 days (`0` = forever) | `RETAIN_AUDIT_DAYS` |

## Limits

* Request volume and latency cover the **LifeTrack API gateway**. Traffic through Supabase's own REST/Auth endpoints is visible in the Supabase dashboard, not here.
* Uptime is derived from the share of non-5xx responses; there is no external probe. Point an uptime monitor at `/api/health/ready`.
* Without the scheduler (below), the Background jobs card shows "No data yet".
