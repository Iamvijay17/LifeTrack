# Authentication & Security

This is the technical security review. The vulnerability-disclosure policy is [../SECURITY.md](../SECURITY.md); the pre-release findings table is [RELEASE_AUDIT.md](RELEASE_AUDIT.md).
Statuses: ✅ in place and covered by code/tests · 🟡 in place but depends on hosted configuration or is unproven · ❌ absent.

## 1. Security model in one paragraph

Clients hold only the public Supabase URL and anon key. Every user table has Row Level Security (`user_id = auth.uid()`), enforced by the database even if the client is modified. There is no
application server to attack: the attack surface is Supabase Auth, PostgREST (limited by RLS), the RPC functions (8 originals, plus the app-lock and session functions of migration 0012), and three Edge Functions:
`send-reminders` (protected by a shared secret), `webauthn` (web passkeys) and `device-key` (phone fingerprint / face unlock), the last two for signed-in users only. The optional **app lock** adds a second, per-session gate on the most private tables; see [APP_SECURITY.md](APP_SECURITY.md).

## 2. Authentication

| Aspect | Implementation | Status |
| --- | --- | --- |
| Identity provider | Supabase Auth, email + password (`signUp`, `signInWithPassword`) in `packages/data/src/auth.js` | ✅ |
| Password rules in the app | New passwords (sign-up, reset, change): 8 to 72 bytes (bcrypt's limit), not a common password or a small variation of one, not built from the name or email, no runs or repeats; confirmation must match (`packages/core/src/security.js`, `features/auth/authForm.jsx`). Signing in is never checked, so older accounts keep working | ✅ client-side |
| Password rules on the server | Minimum length, leaked-password protection and email confirmation are **dashboard settings, not in the repo**; `supabase/config.toml` (local only) turns confirmation **off** for tests | 🟡 must be checked in the hosted project ([RELEASE.md](RELEASE.md) §2) |
| Password storage | Handled by Supabase Auth (bcrypt). The app never stores or logs passwords | ✅ |
| Sign-in errors | "invalid login" is shown as a generic "Incorrect email or password." (no user enumeration from the message) | ✅ |
| PKCE | Web `flowType: 'pkce'`, `detectSessionInUrl: true`; mobile `pkce`, `detectSessionInUrl: false` + explicit `exchangeCodeForSession` | ✅ |
| Session storage | Web: supabase-js `localStorage` (default). Mobile: OS keychain/keystore via `expo-secure-store`, chunked because sessions exceed the per-value limit | ✅ |
| Token refresh | `autoRefreshToken: true`; JWT lifetime 3600 s in the local config | ✅ |
| Sign-out / account switch | `resetStore()` clears the in-memory cache when the user id changes; mobile `signOutCleanly` | ✅ |
| Password reset | Email link → `PASSWORD_RECOVERY` (web) / `lifetrack://reset-password?code=` (mobile) → `updateUser`. Invalid/expired links show a generic message | ✅ |
| Change password | `/security`: asks for the current password (checked by GoTrue on a throwaway client), then signs the other devices out. GoTrue itself lets any valid session change the password: turn on *Secure password change* ([APP_SECURITY.md §3](APP_SECURITY.md)) | ✅ app · 🟡 server setting |
| Per-account password lockout | `hook_password_verification_attempt` (0012): 5 wrong passwords block sign-in for 1 min, doubling to 15 min. **Inactive until the hook is enabled in the dashboard** | 🟡 |
| App lock (PIN), auto-lock, lock when returning | `user_security`, `app_unlocks`, restrictive policy `app_lock_gate` on finance, journal and notes; bcrypt PIN; progressive lockout that ends the session. Enforced by the database per session | ✅ |
| Fingerprint / face unlock (web) | WebAuthn passkeys verified by the `webauthn` Edge Function (single-use challenges, origin / RP ID / UV / signature / counter checks). Needs the function deployed and configured | 🟡 |
| Fingerprint / face unlock (phone) | A key the OS releases only after a biometric check (Keystore / Keychain), its ECDSA signature verified by the `device-key` Edge Function (single-use challenges bound to user, session and key; a counter that must rise; the same lockout as a wrong PIN). A flag from the app unlocks nothing. Needs `0014_device_keys.sql` and the function; not run on a device | 🟡 |
| Session list / sign out one, others, everywhere | `/security`, `list_my_sessions`, `revoke_session`, GoTrue `signOut({ scope })` | ✅ |
| MFA at sign-in, social login, magic links | — (passkeys unlock the app for an already signed-in session; they are not a second sign-in factor) | ❌ |
| Account deletion | RPC `delete_my_account` (definer; `auth.uid()` required) cascades all data; typed confirmation in the UI (required by the App Store) | ✅ |
| DEV-only local auth | `services/auth.js` `local`: users in `localStorage`, salted PBKDF2-SHA256 (accounts made with the old unsalted SHA-256 are upgraded when they sign in), per-account lockout. **Still insecure by design** (the data is plain `localStorage`); compiled out of production bundles (`__BACKEND__`), guarded by `verify:bundles` and a build that refuses to run without credentials | ✅ dev-only |

## 3. Authorisation

- Policy `owner_all` (`for all to authenticated using/with check (user_id = (select auth.uid()))`) on 31 of the 32 tables (`profiles` is keyed on `id`); `device_push_tokens` has SELECT and DELETE policies only.
- `enable` + `force row level security` (the table owner is also subject to policies); `revoke all … from anon` on every table.
- **Cross-table ownership**: RLS only looks at a row's own `user_id`, so a child row could point at another user's parent. Triggers `check_fk_owner` / `check_same_owner` reject that (10 tables, 11+ foreign
  keys; `supabase/tests/pglite` fails for any new foreign key without a fixture).
- **App-lock gate (0012):** a RESTRICTIVE policy `app_lock_gate` on `transactions`, `budgets`, `savings_goals`, `recurring_rules`, `journal_entries` and `notes` asks `app_session_unlocked()` on every query. It only ever takes access away, and only from a session that has the lock on and has not unlocked. The five lock tables (`user_security`, `app_unlocks`, `passkeys`, `webauthn_challenges`, `password_attempts`) have RLS and **no policies**: clients reach them only through functions; the `pk_*` functions are callable by the service role alone.
- RPCs: `revoke all … from public, anon`, `grant execute … to authenticated`. Four of the originals are `SECURITY DEFINER` and set `search_path = ''`; all check `auth.uid()` (or are trigger-only). The 0012 functions follow the same rules.
  `register_push_token` re-assigns a token to the caller so a shared phone moves between accounts without opening a write policy.
- The service-role key is used only inside the Edge Function (injected by Supabase). `scripts/check-no-secrets.mjs` scans client sources and the web **and** mobile bundles in CI; production mobile builds throw if the public
  key looks like a secret (`/service[_-]?role|sb_secret_/`).
- There are no roles beyond "authenticated user": no admin, no sharing, no organisation model.

## 4. API and transport security

| Control | Detail | Status |
| --- | --- | --- |
| HTTPS | Enforced by hosts; HSTS `max-age=63072000; includeSubDomains` | ✅ |
| Content-Security-Policy | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; worker-src 'self'; manifest-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'` — from `apps/web/vercel.json` and `public/_headers` | ✅ (`'unsafe-inline'` for styles only) |
| Other headers | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()` | ✅ |
| CORS | Managed by Supabase; the apps call the API directly from the browser | 🟡 hosted config |
| Rate limiting / abuse | Relies on Supabase Auth and API gateway limits; no app-level limiter | 🟡 accepted ([RELEASE_AUDIT.md](RELEASE_AUDIT.md) S11) |
| Edge Function `send-reminders` | `Authorization: Bearer CRON_SECRET`, constant-time compare, **fails closed** if the secret is unset; deployed `--no-verify-jwt` (so the secret is the only gate); tested under Deno | ✅ (live run 🟡) |
| Edge Function `webauthn` | JWT verification **on**, and the user is re-checked with GoTrue (the session must still exist); CORS only for `WEBAUTHN_ORIGINS`; **fails closed** (`not_configured`) without `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGINS`; decisions tested in Node ([APP_SECURITY.md §5](APP_SECURITY.md)) | ✅ (not run under Deno or against a live project 🟡) |
| Edge Function `device-key` | JWT verification **on**, and the user is re-checked with GoTrue (the session must still exist, and the token must carry one); no secrets or configuration; **native apps only**: a request with an `Origin` header is refused and no CORS header is sent; decisions tested in Node ([APP_SECURITY.md §9.2](APP_SECURITY.md)) | ✅ (not run under Deno or against a live project 🟡) |
| Edge Function secret handling | Scheduler stores the secret in Supabase Vault (`vault.create_secret`) per [NATIVE.md](NATIVE.md); not part of any migration | 🟡 manual step |
| Mobile permissions | Notifications and vibration only; no location, camera, contacts or microphone | ✅ |

## 5. Input validation and output encoding

| Layer | What |
| --- | --- |
| Forms | Zod schemas (`packages/schemas/src/forms.ts`, `apps/web/src/lib/validation.js`) with length/range limits mirroring the database |
| Database | `CHECK` constraints on lengths, ranges and enums; unique indexes; same-owner triggers — the final authority |
| Money | Parsed with string math to integer paise (`parseMoney`), rejects more than two decimals |
| Rendering | React escapes by default. A search found **no** `dangerouslySetInnerHTML`/`innerHTML`. Notes use `parseBlocks`/`tokenizeInline` (`packages/core/src/notes.js`) to build React elements; links limited to `http(s)://` and `mailto:` (`isSafeUrl`) |
| CSV export | Cells starting with `= + - @ TAB CR` are prefixed with `'` to prevent spreadsheet formula injection (`services/csv.js`) |
| Backup import | `parseBackup`: ≤ 50 MB, ≤ 200,000 rows per table, `app === 'lifetrack'`, version ≤ current, only known tables, each row needs an `id`; **ownership is re-stamped** (`user_id` stripped), RLS and CHECKs still apply |
| Routing | The app only navigates to paths it builds itself; `react-router` is on 7.18+ (open-redirect advisory fixed) |
| Deep links | `lifetrack://auth-callback?code=` only accepts a PKCE code that Supabase validates; unknown links go to a not-found screen |

## 6. Data protection

- **At rest/in transit:** provided by Supabase (TLS, encrypted storage). The repository adds no application-level encryption; notes, journal and finance data are stored in plaintext columns.
- **Local storage:** web — Supabase session and a few preferences (`lifetrack:theme`, `lifetrack:sidebar`); mobile — session in SecureStore. No health, finance or note data is persisted on-device. The PWA never caches API responses.
- **Privacy:** no analytics, tracking or advertising SDKs in the dependency lists. Store data-safety answers are drafted in `docs/legal/STORE_DATA_SAFETY.md`.
- **Data minimisation for push:** the Edge Function sends the notification title, body and link only.
- **Export/erase:** user-initiated JSON/CSV export and erase are web-only ([BACKUP_RECOVERY.md](BACKUP_RECOVERY.md)).
- **Secrets hygiene:** root `.env`, `.env.local`, `*.apk` and credential files are git-ignored; `.env.example` files contain placeholders only; no secrets are written in these documents.

## 7. Supply chain and CI

Dependabot (grouped weekly) ignores Expo SDK/React so they move together; `pnpm audit:gate` fails on a new production advisory not allow-listed with a reason and review date (`.audit-allowlist.json`: two `@expo/cli`
build-time advisories, review by 2027-02-01); workflows request `contents: read` only; actions are pinned by major tag, **not by SHA** ([CI.md](CI.md)); the lockfile is committed; `CODEOWNERS` exists.

## 8. Verification that exists

`supabase/tests` (RLS isolation for every table and FK, anonymous role denied, concurrency, migration-safety rules), `check:secrets` (sources + bundles), `verify:bundles` (no dev backend in production),
`check:migrations` (no destructive SQL without a marker), Deno tests for the function, `e2e/auth.spec.js`, `a11y.spec.js`, and `apps/web/tests/noSecrets.test.js`, `legalReady.test.js`. See [TESTING.md](TESTING.md).
No external penetration test or threat model has been performed.

## 9. Known limitations and risks

| # | Limitation | Impact |
| --- | --- | --- |
| 1 | Hosted Auth settings (email confirmation, leaked-password protection, min length, redirect allow-list, "allow new users to sign up") are outside the repo | A mis-set project could allow weak passwords or open sign-up; verify per [RELEASE.md](RELEASE.md) |
| 2 | No size limit on free-text columns (`notes.body`, `journal_entries.content`, `tasks.notes`) or JSON columns (`user_settings.*`, `routines.exercises`) | An authenticated user can store large rows (storage abuse against their own project) |
| 3 | `application_history` and `notifications` are directly writable by their owner | A user can forge their own history/inbox; no cross-user impact |
| 4 | Web session in `localStorage` | Readable by any script on the origin; mitigated by strict CSP (`script-src 'self'`) and no HTML injection sinks |
| 5 | CSP `style-src 'unsafe-inline'` | Needed by current styling; allows inline-style injection if another bug exists |
| 6 | Edge Function accepts any HTTP method and has no IP allow-list | Only the shared secret protects it; rotate `CRON_SECRET` if leaked |
| 7 | No MFA at sign-in. Sessions can be listed and ended and the app can be locked, but **the lock does not protect the account itself**: GoTrue lets any valid session change the password or email | Account takeover resistance equals password strength + Supabase limits + *Secure password change* + session lifetimes ([APP_SECURITY.md §12](APP_SECURITY.md)) |
| 13 | A 4 or 6 digit PIN cannot survive an offline attack on a leaked database, whatever the hash; the online lockout is its protection | The PIN guards a stolen device or session, not a database leak |
| 14 | Tables other than the six gated ones are hidden by the lock screen but not closed on the server | A copied token could still read tasks, habits, health… |
| 15 | The mobile app's biometric key is released into the app's memory to sign (JavaScript), not held in secure hardware for its whole life; the OS app-switcher snapshot of an unlocked app is not covered | Still needs a fingerprint or face check to release, and a server-verified signature to unlock ([APP_SECURITY.md §9.2](APP_SECURITY.md)) |
| 8 | Plaintext app-level data, no client-side encryption | Supabase operators/anyone with DB access can read user data |
| 9 | Backup files are unencrypted JSON | Users must protect downloaded files |
| 10 | The GitHub Actions workflows, real-Supabase API/RLS suite, Maestro flows and push delivery have never run in a live environment | Treat as unproven until first green runs (`README.md`) |
| 11 | `SECURITY.md` still contains the placeholder `[security contact email]` | Researchers have no contact until it is filled; `check-legal-ready.mjs` covers the legal pages only |
| 12 | `docs/RELEASE_AUDIT.md` S5 says 5 `SECURITY DEFINER` functions; the migrations define 4 | Documentation drift, not a code issue |

## 10. Recommended improvements

1. Set and verify hosted Auth settings (including *Secure password change* and the password-verification hook); add the security contact email; consider enabling MFA when the provider flow is needed.
2. Add `CHECK (char_length(...))` caps to unbounded text and `pg_column_size`-style limits to JSON columns.
3. Make `application_history` write-protected (select-only policy + trigger-owned insert) and keep restore through a definer function.
4. Pin GitHub Actions to commit SHAs after the first green run.
5. Restrict the Edge Function to `POST` and add a replay window or HMAC timestamp.
6. Remove `'unsafe-inline'` from `style-src` if the styling pipeline can emit hashed/nonced styles.
7. Offer an encrypted backup option; add an account-activity (security events) view and sign-in alert emails (session/device management now exists).
8. Run the unrun suites (real-Supabase API tests, EAS build, Maestro) and record results.
