# Native features: push, deep links, icons

## How reminders reach your phone
```
reminders table ──(every minute)──▶ send-reminders Edge Function ──▶ notifications table (inbox, dedupe key)
                                                                  └─▶ Expo push service ──▶ APNs / FCM ──▶ your phone
```
* The function applies the **same rules as the apps** (`@lifetrack/core/reminders`, copied into `supabase/functions/_shared` by
  `node scripts/sync-function-core.mjs`; a test fails if the copy is stale), in **each user's own timezone**.
* It writes the notification with the dedupe key `reminder:<id>:<date>` and pushes **only when that row is new**.
* The apps are a **fallback**: their background runners wait 2 minutes after the due time, so the server always goes first.
  If the server job is not running, reminders still appear in the inbox (without a push) while an app is open.
* Local notifications are used only for the focus-timer end (device-local, works offline).

## One-time setup (needs your accounts — none of this is in the repo)
1. **EAS project** — `cd apps/mobile && eas init`, then `eas env:create --name EAS_PROJECT_ID --value <id> --visibility plaintext` (push tokens need it).
2. **Android push (FCM v1)** — create a Firebase project, add the Android app (`com.aatralex.lifetrack`), upload the FCM service-account key to EAS
   (`eas credentials`), and provide `google-services.json` as an EAS **file** secret named `GOOGLE_SERVICES_JSON`. Never commit it.
3. **iOS push (APNs)** — needs an Apple Developer account; EAS creates and stores the key (`eas credentials`). iOS push cannot be tested in the simulator.
4. **Database** — apply migrations `0004_hardening.sql`, `0005_history_owner_guard_and_user_indexes.sql` (ownership guards, indexes, atomic functions), `0006_push_tokens.sql` (push tokens) and `0007_savings_atomic.sql` (`add_savings`), or re-run the regenerated `supabase/setup-all.sql` on a fresh project. All are additive.
5. **Edge Function**
   ```bash
   supabase secrets set CRON_SECRET=<a long random string>
   supabase functions deploy send-reminders --no-verify-jwt      # it authenticates with CRON_SECRET itself and fails closed
   # optional, only if "enhanced push security" is enabled in Expo:  supabase secrets set EXPO_ACCESS_TOKEN=<token>
   ```
6. **Schedule it** (Supabase SQL editor — *not* a migration, because it contains your URL and secret):
   ```sql
   create extension if not exists pg_cron;
   create extension if not exists pg_net;
   select vault.create_secret('<the same CRON_SECRET>', 'send_reminders_secret');
   select cron.schedule('send-reminders', '* * * * *', $$
     select net.http_post(
       url := 'https://<project-ref>.supabase.co/functions/v1/send-reminders',
       headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'send_reminders_secret')),
       body := '{}'::jsonb);
   $$);
   ```
   Check it with `select * from cron.job_run_details order by start_time desc limit 5;`.
7. **Auth redirects** — Supabase → Authentication → URL Configuration → add `lifetrack://**` and `exp+lifetrack://**`.
8. Rebuild the dev client (`eas build --profile development`) — new native modules were added.

## Deep links
Custom scheme `lifetrack://` (https universal links are not set up; they would need your domain, Apple Team ID and Android signing fingerprint).

| Link | Opens |
|---|---|
| `lifetrack://planner`, `/habits`, `/finance` | the tab |
| `lifetrack://module/<learning\|jobs\|fitness\|health\|focus\|notes\|goals\|analytics\|settings\|notifications>` | that screen (with the tabs underneath, so Back works) |
| `lifetrack://auth-callback?code=…`, `lifetrack://reset-password?code=…` | email confirmation / password reset |
| anything else | not-found screen |

A link opened while signed out is remembered and followed after sign-in. Notification taps use the same mapping
(`webLinkToRoute`), because the server stores the web-style path (`/planner`, `/learning`, …) for both platforms.

## Permissions
| Permission | Why | When it is asked |
|---|---|---|
| Notifications (iOS prompt / Android 13+ `POST_NOTIFICATIONS`) | Reminder pushes; focus-timer end | Reminders: when you tap **Enable push notifications** (Notifications → Preferences). Timer: once, the first time you start a timer. Never on first launch. |
| Vibration (Android, normal permission) | Timer alert | — |
| Internet | Supabase | — |
No location, camera, contacts, microphone or tracking. Denied/blocked permission shows an explanation and an **Open phone settings** button.

## Assets
Regenerate icons/splash from the brand mark: `cd apps/web && node scripts/generate-mobile-assets.mjs` (writes `apps/mobile/assets/`).

## Device test checklist (nothing below has been run on a device)
- [ ] Icon looks right on the home screen (iOS), in a circle and squircle launcher, and themed (Android 13+); splash dark/light.
- [ ] Notifications → Preferences → **Enable push** shows the OS prompt; granting registers the device (row in `device_push_tokens`).
- [ ] Create a reminder 2 minutes ahead; close the app; a push arrives at the right local time; tapping it opens the screen and marks it read.
- [ ] Same with the web app open on the due minute — the phone still gets the push.
- [ ] Reminder for an account in another timezone fires at that timezone's wall-clock time.
- [ ] Turn a reminder type off → no push; turn push off on the device → no push, inbox still fills.
- [ ] Sign out → no more pushes on this phone; sign in as another user → only their reminders.
- [ ] Start a focus timer, lock the phone → notification at the end; pause cancels it; in the foreground you get the in-app alert only (no duplicate banner).
- [ ] `npx uri-scheme open lifetrack://module/jobs --ios` (and `--android`) opens Jobs with working Back; same while signed out lands on Jobs after sign-in.
- [ ] iOS swipe-back on module screens; Android hardware Back from a module returns to the tab; Back on a tab root exits.
- [ ] Sheets/forms with the keyboard open on both platforms; Return moves Email → Password → Sign in.

## Building with CI (EAS)

`.github/workflows/mobile-build.yml` starts EAS builds from GitHub. It needs your Expo account first (without `EXPO_TOKEN` it fails at its first step with a message saying so):

1. Finish `eas init` (step 1 above) and create an Expo access token (expo.dev > Account settings > Access tokens).
2. In GitHub: *Settings > Secrets and variables > Actions* — add the secret `EXPO_TOKEN`. (The old `EAS_ENABLED` variable is no longer used.)
3. *Settings > Environments*: create `production` and add **required reviewers**, so a production build needs a human approval.
4. Put the public values in EAS environment variables for each profile (`development`, `preview`, `production`):
   `EAS_PROJECT_ID`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (never a service-role key), plus the `GOOGLE_SERVICES_JSON` file secret.
5. Run *Actions > Mobile build (EAS) > Run workflow* (profile `preview` for testers, `production` for the stores), or push a tag `mobile-v1.0.0` for a preview build.

Guards: a **production** build fails fast if `EAS_PROJECT_ID`, the Supabase URL or the anon key is missing, or if a secret-looking key was supplied as the public key (`app.config.ts`, covered by `tests/appConfig.test.ts`). The workflow also repeats typecheck, the secrets scan and the mobile tests first.

Not included on purpose: store submission (`eas submit`) and over-the-air updates. `runtimeVersion` uses the `appVersion` policy so OTA can be added later without changing the native fingerprint rules; until `expo-updates` is installed (a native change that needs a new build), every release goes through a store build.
