# Release runbook

Do the steps in order. Anything marked **YOU** needs your accounts or devices; everything else is automated or scripted in this repo.
Tick the boxes in the release PR/issue as you go.

## 0. Preconditions
- [ ] `ci.yml` is green on the release branch and its six jobs are required status checks (docs/CI.md)
- [ ] `ci-backend.yml` has run green at least once (real Supabase stack, API-level RLS, two-device sync)
- [ ] `CHANGELOG.md` has the release entry; version bumped in `apps/mobile/app.config.ts` and `apps/web/package.json`
- [ ] **YOU**: `cd apps/mobile && npx expo install --check` is clean (SDK alignment)

## 1. Legal and store content (blocks production builds)
- [ ] **YOU**: fill every `[placeholder]` and remove the DRAFT banners in `docs/legal/*.md` after review; `node scripts/check-legal-ready.mjs` must pass
  (the production web and mobile workflows run it and will fail otherwise)
- [ ] **YOU**: choose the public web URL; set `EXPO_PUBLIC_WEB_URL` (mobile links to `/privacy` and `/terms`)
- [ ] **YOU**: `LICENSE` and `SECURITY.md` placeholders filled; support email exists and is monitored
- [ ] **YOU**: final app icon approved and replaced in `apps/mobile/assets` and `apps/web/public`
- [ ] Store listing text (`docs/store/LISTING.md`) and data-safety answers (`docs/store/STORE_DATA_SAFETY.md`) reviewed; screenshots captured (`docs/store/SCREENSHOTS.md`)
- [ ] **YOU**: Apple/Google developer accounts, app records created, age-rating and data-safety forms submitted

## 2. Supabase project hardening (dashboard; not in git)
- [ ] Auth > Providers > Email: **Confirm email ON**, minimum password length >= 8, leaked-password protection ON
- [ ] Auth > URL configuration: site URL = your web URL; redirect URLs = web `/reset-password` and `lifetrack://auth-callback` only
- [ ] Database > Backups / PITR enabled; a manual backup taken before migrating
- [ ] Settings > API: confirm the service-role key is not in any GitHub variable, client env or build setting
- [ ] Realtime enabled for the tables in `0002_rls_realtime.sql`

## 3. Database
1. Run **Database migrations (manual)** against `staging` as a dry run, then apply (docs/DEPLOY.md; first use needs `supabase migration repair`).
2. Smoke-test staging with the web build and a dev client.
3. Repeat on `production` (dry run, review, `apply` + `confirm = apply-production`).
- [ ] After applying, `select * from supabase_migrations.schema_migrations` lists all migrations through `0008`

## 4. Reminders (server)
- [ ] `supabase secrets set CRON_SECRET=...` (and `EXPO_ACCESS_TOKEN` if enhanced push security is on)
- [ ] Run **Deploy Edge Functions (manual)**
- [ ] Create the pg_cron schedule (NATIVE.md); after 5 minutes `select * from cron.job_run_details order by start_time desc limit 5;` shows success

## 5. Web
- [ ] **Web release build (manual)** for `production` (builds against the production project, scans the bundle, uploads artifact)
- [ ] Publish the artifact with your host; confirm `/privacy`, `/terms`, deep links (SPA fallback) and that `sw.js` is not cached long-term
- [ ] Sign up, create data, sign out/in, delete a test account on the live site

## 6. Mobile
- [ ] **YOU**: `eas init`, EAS env vars (`EAS_PROJECT_ID`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_WEB_URL`), FCM `GOOGLE_SERVICES_JSON`, APNs via `eas credentials`
- [ ] Run **Mobile build (EAS)** with profile `preview` -> install on devices -> run the device matrix below
- [ ] Run profile `production` (needs approval), submit to TestFlight and Play **internal testing** first
- [ ] **YOU**: Maestro flows on a device (`apps/mobile/.maestro/README.md`)

## 7. Device test matrix (2 iOS + 2 Android, one small and one large screen each)
| Area | Check |
|---|---|
| Auth | sign up (email confirmation link opens the app), sign in, wrong password, forgot/reset password, sign out |
| Each module | create, edit, complete, delete one item; pull to refresh; empty and error states |
| Sync | change on phone -> appears on web within seconds, and the reverse |
| Push | enable in Notifications; reminder arrives with app **foreground, background and killed**; tap opens the right screen; disable stops it; sign out stops it |
| Timers | study/focus timer survives backgrounding; finishing notifies once |
| Appearance | dark, light, system; largest font size; landscape rotation; small phone |
| Accessibility | VoiceOver / TalkBack reads buttons, check-ins and progress sensibly |
| Failure | airplane mode shows a clear error, nothing is silently lost; recovers when back online |
| Privacy | privacy/terms links open; Delete account removes the user (verify in dashboard) |

## 8. Rollout
- [ ] Internal testers (3-5 days) -> closed testing -> staged production rollout (Play 10-20%, App Store phased release)
- [ ] Announce only after the first staged step looks healthy

## 9. Monitoring in the first week
There is intentionally no crash-reporting SDK in v1 (nothing extra to disclose). Watch instead:
- Supabase dashboard: API errors, auth errors, database CPU/connections, Realtime
- `cron.job_run_details` (reminder job) and the function logs for `send-reminders`
- Store consoles: crashes/ANRs (Android vitals, App Store Connect crashes), reviews
- Support inbox
If you later want crash reports, add one with an explicit disclosure update (privacy policy + data-safety answers).

## 10. Rollback
| Layer | Rollback |
|---|---|
| Web | redeploy the previous artifact/commit |
| Mobile | halt the staged rollout; ship a fixed build (store builds cannot be pulled back instantly). Server changes must stay backward compatible with the previous app version |
| Database | forward-fix with a new additive migration; restore a backup only for data loss, accepting loss since the backup |
| Edge Function | redeploy the previous commit with **Deploy Edge Functions (manual)**; pause reminders by `select cron.unschedule('send-reminders');` |
