# API keys, REST API and webhooks

Page: **Developers** (`/developers`): API keys, Activity, Webhooks, Documentation. Migration `0027_platform.sql`. Functions: `api`, `webhook-dispatch`.

## Deploy (manual steps)

1. Apply `supabase/migrations/0027_platform.sql` (or the regenerated `setup-all.sql`).
2. Deploy the functions **without** Supabase's JWT check (they authenticate callers themselves; `supabase/config.toml` records this):

```bash
supabase functions deploy api --no-verify-jwt
supabase functions deploy webhook-dispatch --no-verify-jwt
```

3. Secrets: `supabase secrets set CRON_SECRET=<long random string>`. Optional: `API_SLOW_MS`, `API_BASE_URL`, `WEBHOOK_ALLOW_HTTP=true` (development only), `RETAIN_*` (see SYSTEM_HEALTH.md).
4. **Schedule the dispatcher** every minute (Supabase Cron, or `pg_cron` + `pg_net`) — without it queued webhooks only go out when someone presses "Deliver queued now", and retries do not happen:

```sql
select cron.schedule('lifetrack-webhooks', '* * * * *', $$
  select net.http_post(url := 'https://<project-ref>.supabase.co/functions/v1/webhook-dispatch',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'))
$$);
```

## API

Base URL `https://<project-ref>.supabase.co/functions/v1/api`. The endpoints, scopes, parameters, error codes and examples are in the app (Developers → Documentation) and as OpenAPI 3 at `GET /v1/openapi.json`; **both are generated from one table** (`supabase/functions/_shared/platformApi.js`), so they list exactly what the gateway serves. There is no DELETE anywhere.

* **Keys** are created by `create_api_key()` in the database: 32 random bytes (`lt_live_` + 43 URL-safe characters). Only the SHA-256 hash is stored; the plaintext is returned once. Creating, revoking or editing needs an **unlocked** session (a locked app cannot mint access). Up to 20 active keys; expiry 1–3650 days or never.
* **Scopes** are checked on every request. Keys read and write through the service role **filtered to the key's owner** — the owner id comes from the key, never the request. Note: module locks are a browser-session protection; a key with `finance:read` reads Finance even while Finance is locked in the app. Grant scopes accordingly.
* **Rate limit** per key (1–600/min, default 60), one atomic counter per minute window (`rate_windows`); `429` with `Retry-After`; `X-RateLimit-*` on every response.
* **Validation**: bodies ≤ 64 KB, JSON only, every field typed and bounded, unknown fields rejected, database refusals become a generic `422`. Errors never contain internals.
* **Logging**: one `api_request_log` row per authenticated request (method, path, status, ms, error code, request id; never body, query or key), kept 30 days. Unauthenticated requests only count in the hourly aggregate.
* Writes made through the API appear in Audit History with source **API**.

## Webhooks

Events: see Documentation (`task.created`, `task.updated`, `task.completed`, `goal.created`, `goal.completed`, `habit.completed`, `expense.created`, `workout.logged`, `study.session.completed`, `calendar.event.created`, `data.restored`). They are produced by database triggers on the existing tables, so every client (web, phone, API, import) emits them.

* **Never blocks a write:** the trigger only inserts a row into `webhook_deliveries` and swallows its own errors; delivery happens later in `webhook-dispatch`.
* **Idempotent:** one delivery per (endpoint, event key); the same event is never queued twice. Receivers also get a stable `X-LifeTrack-Delivery` id, the same on every retry.
* **Signed:** `X-LifeTrack-Signature: v1=HMAC_SHA256(secret, "<timestamp>.<body>")`, `X-LifeTrack-Timestamp` renewed every attempt; receivers reject timestamps older than 5 minutes (sample code in the Documentation tab; `verifyWebhook()` in `_shared/platformApi.js`). The signing secret is stored server-side (a hash cannot sign) in `webhook_secrets`, which no client role can read; it is shown once and can be rotated.
* **SSRF protection:** https only; no credentials in the URL; no IP literals, `localhost`, `.local/.internal` names (checked on save in SQL and the form); at delivery the host name is **resolved and every address must be public** (private, loopback, link-local/cloud-metadata, CGNAT, multicast, reserved and documentation ranges are refused — DNS rebinding included); redirects are never followed; responses are never read or stored.
* **Retries:** 30 s, 1 min, 2 min … capped at 6 h, ±20% jitter, up to the endpoint's attempt limit (1–10). Then the delivery is **dead-lettered** (visible, retryable by hand). `410 Gone` stops at once. After 25 failed deliveries in a row the endpoint is switched off with a reason.
* **Leasing:** a claimed delivery is leased for 90 s (`FOR UPDATE SKIP LOCKED`), so overlapping runs cannot double-send, and a crashed run's work is retried after the lease expires. Completion only applies to a leased delivery, so a duplicate report changes nothing.
* **Attempt log:** every attempt (status, error, duration) is kept 30 days.

## Not claimed

No third-party integration is connected by this feature. "Deliver queued now" and "Send test" need the `webhook-dispatch` function deployed; if it is not reachable the page says so.
