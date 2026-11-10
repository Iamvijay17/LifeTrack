# API

LifeTrack has **no hand-written REST server**. The "API" is what Supabase exposes for the schema in [DATABASE.md](DATABASE.md), plus one Edge Function:

| Surface | Count | Defined in |
| --- | --- | --- |
| PostgREST table resources (`/rest/v1/<table>`) | 32 | `supabase/migrations/*` |
| PostgREST RPC functions (`/rest/v1/rpc/<fn>`) | 8 | `0002`, `0004`, `0006`, `0007`, `0009` |
| Supabase Auth operations used by the apps | 8 | `packages/data/src/auth.js` |
| Realtime channel | 1 (`lifetrack-changes`, 30 tables) | `packages/data/src/supabaseAdapter.js` |
| Edge Function | 1 (`POST /functions/v1/send-reminders`) | `supabase/functions/send-reminders/index.ts` |
| Static HTTP assets | 2 kinds (exercise catalog, exercise photos) | `apps/web/public/exercises/` |
| Client-side domain operations (not HTTP) | 31 | `packages/data/src/api.js` (`createApi`) |

Planned APIs: none are specified in the repository (see [ROADMAP.md](ROADMAP.md)).

## 1. Common rules

| Topic | Rule |
| --- | --- |
| Base URL | `https://<project-ref>.supabase.co` (from `VITE_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_URL`) |
| Headers | `apikey: <anon key>` and `Authorization: Bearer <user access token>` — added by `supabase-js`. The anon key is public by design |
| Authentication | Every table and RPC requires the `authenticated` role. `anon` has **no** grants (`revoke all … from anon`) and receives `401/403`/empty results |
| Authorisation | RLS `owner_all`: `user_id = auth.uid()` for both `USING` and `WITH CHECK`. Other users' rows are invisible; writes to them affect 0 rows |
| `user_id` | Never send it. The column defaults to `auth.uid()`; the adapter strips it from payloads |
| Row cap | PostgREST returns ≤ 1000 rows per request (`max_rows = 1000` in `supabase/config.toml`; hosted default is the same). The adapter pages with `Range` |
| Ordering | `order=created_at.asc&order=id.asc` (`application_history` uses `changed_at`) |
| Representation | Writes use `Prefer: return=representation` (`.select()`), so responses contain the stored row(s) including defaults and `updated_at` |
| Dates / money | `yyyy-MM-dd` strings; integer `*_paise`; timestamps ISO 8601 |

### 1.1 Mapping from adapter calls to HTTP

| Adapter method (`createSupabaseAdapter`) | HTTP | Notes |
| --- | --- | --- |
| `list(table)` | `GET /rest/v1/<table>?select=*&order=…` repeated with `Range: from-to` until a page is short | |
| `insert(table, rows[])` | `POST /rest/v1/<table>` (array body) | Returns inserted rows |
| `update(table, id, patch)` | `PATCH /rest/v1/<table>?id=eq.<id>` | `.single()`: `PGRST116` if the row is not visible/does not exist |
| `upsert(table, rows[], {onConflict, ignoreDuplicates})` | `POST /rest/v1/<table>?on_conflict=<cols>` with `Prefer: resolution=merge-duplicates` (or `ignore-duplicates`) | Conflict keys: `packages/constants/src/schema.js` `CONFLICT_KEYS` |
| `remove(table, id)` | `DELETE /rest/v1/<table>?id=eq.<id>` | |
| `removeMany(table, ids)` | `DELETE /rest/v1/<table>?id=in.(…)` | |
| `rpc(name, args)` | `POST /rest/v1/rpc/<name>` with a JSON object | |
| `subscribe(onChange, onStatus)` | WebSocket `postgres_changes` | INSERT/UPDATE filtered `user_id=eq.<uid>`; DELETE unfiltered |

## 2. Table resources

All 32 follow the same pattern. Authentication: **required**. Authorisation: **owner only**.

| Resource | GET | POST | PATCH | DELETE | Notes |
| --- | --- | --- | --- | --- | --- |
| `profiles` | ✅ | ✅ | ✅ | ✅ | Keyed by `id`; the app only reads and updates `display_name` |
| `user_settings`, `nutrition_settings` | ✅ | ✅ (upsert on `user_id`) | ✅ | ✅ | One row per user |
| `device_push_tokens` | ✅ | ❌ | ❌ | ✅ | Insert/update revoked; use RPCs (§3) |
| `application_history` | ✅ | ✅ | ✅ | ✅ | Normally written by trigger only; the app inserts only when restoring a backup |
| all other 27 tables | ✅ | ✅ | ✅ | ✅ | See [DATABASE.md §3](DATABASE.md) for columns |

### 2.1 Example: create a task

Request

```http
POST /rest/v1/tasks
apikey: <anon>
Authorization: Bearer <access token>
Content-Type: application/json
Prefer: return=representation

[{"title":"Pay rent","category":"Finance","priority":"high","due_date":"2026-11-12","recurrence":"monthly","series_id":"6f0c6a4e-0a4c-4b57-9d57-3a0c6c7b9a11"}]
```

Response `201`

```json
[{
  "id": "0c4e6b6e-3b57-4a2d-8d7a-1b0f4f5c2e10",
  "user_id": "<owner uuid>",
  "title": "Pay rent", "notes": "", "category": "Finance", "priority": "high",
  "status": "pending", "due_date": "2026-11-12", "started_at": null, "completed_at": null,
  "recurrence": "monthly", "recurrence_until": null,
  "series_id": "6f0c6a4e-0a4c-4b57-9d57-3a0c6c7b9a11",
  "created_at": "2026-11-10T09:14:03.211Z", "updated_at": "2026-11-10T09:14:03.211Z"
}]
```

### 2.2 Example: log a food (`food_logs`)

```http
POST /rest/v1/food_logs
Content-Type: application/json
Prefer: return=representation

[{"log_date":"2026-11-10","log_time":"13:05","meal_type":"lunch","name":"Idli","category":"South Indian",
  "base_key":"idli","variant":"","quantity":3,"serving_label":"1 idli (40 g)",
  "kcal":174,"protein_g":6,"carbs_g":36,"fat_g":1.2,"fiber_g":1.8,"notes":""}]
```

Totals are for the whole entry (quantity already applied). `kcal` is bounded 0–20000, `quantity` 0–1000.

### 2.3 Validation and error responses

| Failure | PostgREST / Postgres code | HTTP | App message (`packages/data/src/errors.js`) |
| --- | --- | --- | --- |
| Duplicate unique key (e.g. second running study timer, repeated `dedupe_key`) | `23505` | 409 | "That record already exists." |
| Parent missing / other user's parent | `23503` | 409 | "This item is linked to something that no longer exists." |
| `CHECK` violated (range, enum, length) | `23514` | 400 | "One of the values is not allowed." |
| Required value missing | `23502` | 400 | "A required value is missing." |
| RLS / privilege | `42501` | 401/403 | "You do not have permission to do that. Try signing in again." |
| Expired JWT | `PGRST301` | 401 | "Your session has expired. Please sign in again." |
| Table missing (migration not run) | `PGRST205` / `42P01` | 404 | "Your database is missing the latest LifeTrack tables…" (names migration 0003 only) |
| `.single()` found nothing | `PGRST116` | 406 | "That record could not be found." |
| Network down / fetch failed | — | — | "Can't reach the server. Check your internet connection. Nothing was saved yet." |

Raw error body shape: `{"code":"23514","details":"…","hint":null,"message":"new row for relation \"tasks\" violates check constraint …"}`.

## 3. RPC functions

All require the `authenticated` role (`revoke … from public, anon`). `invoker` functions run under the caller's RLS.

| Function | Request body | Response | Errors |
| --- | --- | --- | --- |
| `add_water` | `{"p_date":"2026-11-10","p_ml":250}` | `health_logs` row | — (amount clamped; total clamped 0–20000) |
| `log_water` | `{"p_date":"2026-11-10","p_ml":250,"p_time":"13:05"}` (`p_time` optional) | `{"entry":{…water_logs…},"health":{…health_logs…}}` | `22023` "amount must be between 1 and 5000 ml" |
| `delete_water_log` | `{"p_id":"<uuid>"}` | `health_logs` row | `P0002` "water entry not found" |
| `add_savings` | `{"p_goal":"<uuid>","p_paise":50000}` | `savings_goals` row | "Enter an amount greater than 0." / "Savings goal not found." |
| `replace_exercise_logs` | `{"p_workout":"<uuid>","p_sets":[{"exercise_name":"Bench Press","exercise_id":null,"order_index":0,"set_number":1,"reps":8,"weight_kg":60}]}` | array of inserted `exercise_logs` | `P0002` "workout not found" |
| `register_push_token` | `{"p_token":"ExpoPushToken[…]","p_platform":"android","p_device_name":"Pixel 7"}` | `null` | "not authenticated"; `23514` if the token pattern or platform is invalid |
| `unregister_push_token` | `{"p_token":"ExpoPushToken[…]"}` | `null` | "not authenticated" |
| `delete_my_account` | `{}` | `null` | "not authenticated" |

Example

```http
POST /rest/v1/rpc/log_water
{"p_date":"2026-11-10","p_ml":500,"p_time":"09:30"}
```

```json
{
  "entry":  {"id":"…","log_date":"2026-11-10","log_time":"09:30:00","amount_ml":500,"created_at":"…","updated_at":"…"},
  "health": {"id":"…","log_date":"2026-11-10","water_ml":1250,"steps":0,"sleep_minutes":null,"…":"…"}
}
```

## 4. Auth operations

Through `supabase-js` (`/auth/v1/*`), wrapped by `createSupabaseAuth`:

| Operation | Method | Notes |
| --- | --- | --- |
| Sign up | `auth.signUp({email, password, options:{data:{display_name}, emailRedirectTo}})` | Returns `needsConfirmation = !session` |
| Sign in | `auth.signInWithPassword` | "invalid login" is shown as "Incorrect email or password." |
| Sign out | `auth.signOut` | |
| Request reset | `auth.resetPasswordForEmail(email, {redirectTo})` | Web `/reset-password`; mobile `lifetrack://reset-password` |
| Complete reset / change password | `auth.updateUser({password})` | After `PASSWORD_RECOVERY` |
| Change display name | `auth.updateUser({data:{display_name}})` + `profiles` update | |
| Session handling | `getSession`, `onAuthStateChange`, `exchangeCodeForSession` (mobile) | PKCE flow |
| Delete account | RPC `delete_my_account` then `signOut` | |

Client validation (`packages/schemas/src/auth.ts`): email trimmed, lower-cased, valid; password 8–72 chars; name 1–80; confirm must match.
Password policy and email confirmation on the hosted project are dashboard settings and are **not** in the repository.

## 5. Edge Function: `send-reminders`

| | |
| --- | --- |
| Endpoint | `POST https://<project-ref>.supabase.co/functions/v1/send-reminders` (any method is accepted; there is no method check) |
| Authentication | `Authorization: Bearer <CRON_SECRET>`, compared in constant time. Deployed with `--no-verify-jwt`, so Supabase does not check a JWT |
| Body | Ignored (`{}` is sent by the scheduler) |
| Secrets | `CRON_SECRET` (required), `EXPO_ACCESS_TOKEN` (optional); `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by Supabase |
| Schedule | Every minute via `pg_cron` + `pg_net` (manual SQL in [NATIVE.md](NATIVE.md)); not part of any migration |

| Status | Body | When |
| --- | --- | --- |
| `200` | `{"checked":1,"fired":1,"skippedByPrefs":0,"duplicates":0,"pushed":1,"pushErrors":0,"tokensRemoved":0}` | Run completed |
| `401` | `unauthorized` (text) | Missing/incorrect secret, **or** `CRON_SECRET` not configured (fails closed) |
| `500` | `{"error":"<message>"}` | A database call failed; Expo errors do not cause 500 (counted in `pushErrors`) |

Behaviour: loads active reminders with `remind_date ≤ UTC today + 1`, evaluates each in its owner's timezone, inserts a `notifications` row with
`dedupe_key = reminder:<id>:<yyyy-MM-dd>` (a duplicate is skipped), advances the reminder, and sends Expo push messages (batches of 100,
`channelId: "reminders"`, `data: {notificationId, kind, link}`); tokens that return `DeviceNotRegistered` are deleted. Verified by `index.test.ts` (Deno) with the
network stubbed; **not verified against a live project or real devices**.

## 6. Realtime

Channel `lifetrack-changes`, `postgres_changes` on schema `public` for every table in `ALL_TABLES`. RLS filters what each user receives. Payloads follow Supabase's
format (`eventType`, `new`, `old`). DELETE payloads contain only the primary key.

## 7. Static assets

| Path | Content | Caching (`apps/web/vercel.json`, `public/_headers`) |
| --- | --- | --- |
| `/exercises/catalog.json` | `{meta, exercises[876]}` (id, name, category, muscles, equipment, level, type, instructions, images) | 1 day + stale-while-revalidate 7 days; service worker `StaleWhileRevalidate` |
| `/exercises/<id>/0.jpg`, `/exercises/<id>/1.jpg` | Start and end photos, byte-identical to upstream | 30 days; service worker `CacheFirst`, 600 entries / 30 days |

The mobile app fetches both from `EXPO_PUBLIC_WEB_URL`. Production mobile builds fail if that variable is missing (`apps/mobile/app.config.ts`).

## 8. Client-side domain operations (`createApi`)

Not HTTP, but the only code that should combine rows. Defined in `packages/data/src/api.js`, wired on web by `apps/web/src/services/api.js` and on mobile via
`src/data/client.ts`:

`saveRow`, `deleteRow`, `createTask`, `setTaskStatus` (spawns the next recurrence, ignores `23505`), `setHabitStatus`, `startStudy` (one running timer; maps `23505`),
`stopStudy`, `discardStudy`, `saveWorkout`, `saveHealth`, `addWater`, `logWater`, `removeWaterLog`, `saveNutritionGoals`, `saveFavoriteFoods`, `saveFoodCopy`,
`deleteFood`, `setApplicationStatus`, `setMonthBudget`, `addSavingsFunds`, `seedDefaults`, `setGoalStatus`, `toggleMilestone`, `recordFocus`,
`postDueRecurring`, `toggleRecurringRule`, `fireDueReminders`, `toggleReminder`, `clearReadNotifications`, `markNotificationRead`, `markAllRead`.

## 9. Verification

The tables, policies and RPCs documented here are exercised by `supabase/tests/pglite/rls.test.ts` (every user table and every cross-table foreign key),
`supabase/tests/postgres/increments.test.ts` (concurrency on real PostgreSQL) and `supabase/tests/api/rls.api.test.ts` (the same through the HTTP API; needs
`supabase start`). The HTTP API suite has not run in a live environment.
