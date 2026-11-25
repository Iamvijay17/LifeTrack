# Deploying LifeTrack

Nothing deploys automatically. Every release step is a manually started GitHub Actions workflow that targets a GitHub **Environment**
(`staging`, `production`). Put required reviewers on `production` (*Settings > Environments*).

## One-time setup per Environment
| Kind | Name | Used by |
|---|---|---|
| variable | `SUPABASE_PROJECT_REF` | db-migrate, deploy-functions |
| secret | `SUPABASE_ACCESS_TOKEN` (supabase.com/dashboard/account/tokens) | db-migrate, deploy-functions |
| secret | `SUPABASE_DB_PASSWORD` | db-migrate |
| variable | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (public values) | deploy-web |

Never store the service-role key in GitHub for these workflows; none of them needs it.

## Database migrations — *Database migrations (manual)*
1. Run with `apply` **off** (dry run). Set `first_pending` to the first migration the target does not have yet (e.g. `0005`).
   The run (a) fails if any pending migration is destructive (drops, truncates, type rewrites, unqualified DELETE/UPDATE, renames),
   (b) shows local vs remote migration history, (c) shows what `supabase db push` would apply.
2. Read the plan. If it is right, run again with `apply` **on** (production also needs `confirm = apply-production` and reviewer approval).
3. A destructive migration needs a human decision twice: tick `allow_destructive` *and* put `-- lifetrack:allow-destructive <reason>` in the file
   (otherwise the PR check `pnpm check:migrations` fails). Take a backup first (*Dashboard > Database > Backups*).

**First use on an existing project.** If the project was created by pasting `supabase/setup-all.sql`, Supabase has no migration history
and `db push` would try to re-run `0001`. Mark what is already applied first, from your machine (`supabase link`, then):
```bash
supabase migration repair --status applied 0001 0002 0003 0004
```
(list exactly the versions already in the database) and run the dry run to confirm only the new ones are pending.

## Edge Functions — *Deploy Edge Functions (manual)*
Runs the Deno tests, then `supabase functions deploy send-reminders --no-verify-jwt`. Secrets (`CRON_SECRET`, optional `EXPO_ACCESS_TOKEN`)
are set once by hand (`supabase secrets set`, see NATIVE.md); the workflow never touches them. The pg_cron schedule is also a one-time manual SQL step.

## Web — *Web release build (manual)*
Builds against the Environment's project, scans the bundle for secrets and uploads it as an artifact. Publishing is a placeholder step:
pick your host (examples in the workflow). The host must serve `/index.html` for unknown paths and must not cache `sw.js` aggressively.

## Mobile
See *Building with CI (EAS)* in NATIVE.md.

## Downloads on the GitHub Releases page — *Publish a release*
Run *Actions > Publish a release > Run workflow* with a version such as `v1.0.0`. It builds the web bundle (zip) and, if you tick **Android**, the
preview APK through EAS, then creates a GitHub Release with the files attached so they can be downloaded at any time.
- Needs the repository **variables** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (public values) for the web bundle.
- The Android option also needs the `EXPO_TOKEN` secret, `eas init`, and a keystore created once (docs/NATIVE.md). Free EAS builds can queue for a while; the job waits up to 90 minutes.
- Leave **pre-release** ticked until the legal documents are finished (`node scripts/check-legal-ready.mjs`); a full release refuses to publish otherwise.
- Installing an APK on a phone needs "install unknown apps" allowed; it is not a store release. iOS builds cannot be distributed this way (they need TestFlight/App Store).

## Suggested release order
migrations (dry run, apply) -> Edge Function -> web -> mobile build. Migrations are additive and the apps tolerate the old schema, so a
partial rollout is safe. Roll back application code by redeploying the previous build; roll back a migration only with a new forward migration.
