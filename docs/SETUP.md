# LifeTrack setup

## 1. Install
```bash
pnpm install
cp .env.example .env.local
```

## 2. Supabase (free tier)
1. Create a project at supabase.com. Region: closest to you (e.g. Mumbai).
2. **SQL Editor** → run, in order, the whole contents of:
   - `supabase/migrations/0001_schema.sql`
   - `supabase/migrations/0002_rls_realtime.sql`

   (Or with the CLI: `supabase link --project-ref <ref> && supabase db push`.)
3. **Project Settings → API**: copy the *Project URL* and the **anon / publishable** key into `.env.local`:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
   Never use the `service_role` key in this app.
4. **Authentication → Providers → Email**: keep enabled. For personal use you may turn off "Confirm email"
   so sign-up logs you in immediately; otherwise you must click the emailed link first.
5. **Authentication → URL Configuration**: set *Site URL* to your deployed URL and add
   `https://<your-domain>/reset-password` and `http://localhost:5173/reset-password` to *Redirect URLs*
   (needed for password-reset emails).
6. **Database → Replication** (Realtime): migration 0002 already adds all tables to `supabase_realtime`.
   Verify the tables show as enabled.

Without these env vars the app runs in **DEV mode** (orange banner): data stays in that browser only and is
**not** synced. That mode exists purely for development and tests.

## 3. Run
| Command | What |
|---|---|
| `pnpm dev` | dev server on :5173 |
| `pnpm build` / `pnpm preview` | production build / serve it on :4173 |
| `pnpm test` | unit + component-level logic tests (Vitest) |
| `pnpm test:sql` | applies the migrations to an in-memory Postgres and proves RLS isolation, history trigger, constraints |
| `pnpm test:rls` | table-driven RLS suite over every user-owned table and every cross-table foreign key (fails if a new table/FK has no isolation test) |
| `pnpm test:pg` | concurrency tests on a throwaway **real** PostgreSQL server (needs a local PostgreSQL install; skipped if absent) |
| Maestro flows (`apps/mobile/.maestro`) | device smoke tests: auth, habits, planner; see its README. A unit test keeps their texts in sync with the app |
| `pnpm check:secrets` | fails if a service-role/secret key appears in client sources or build output |
| `pnpm test:e2e` | Playwright (desktop + Pixel 7). Uses DEV mode, hermetic |
| `E2E_CLOUD=1 pnpm test:e2e -- cloud-sync` | **real** two-device sync test (build with Supabase env first) |

## 4. Deploy (Vercel or Cloudflare Pages)
- Vercel: Root Directory `apps/web`, install `pnpm install --frozen-lockfile`, build `pnpm build`, output `dist`, framework: Vite.
- Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables **before** building (they are inlined at build time).
- SPA fallback is configured: `vercel.json` (Vercel) / `public/_redirects` (Cloudflare Pages).
- HTTPS is required for PWA install and the service worker (both hosts provide it).

## 5. Use on Windows + Android
Open the deployed URL and sign in with the same account everywhere. Chrome/Edge: *Install app*;
Android Chrome: *Add to Home screen*. No shared Wi-Fi needed; everything goes through Supabase.

## Verifying cross-device sync yourself
1. Sign in on the laptop and on the phone with the same account.
2. Planner → add a task on the laptop. It appears on the phone within ~1s (Realtime), or on next focus/refocus.
3. The header dot shows green "Live sync on" when the Realtime channel is connected.

## Design notes
- Supabase is the only source of truth. The in-memory cache is refilled by Realtime events, window focus, reconnect and a 90 s poll.
- Every write shows Saving… / Saved / Save failed. Forms stay open on failure so nothing typed is lost; a leave-page prompt appears while a save is in flight.
- Dates are `yyyy-MM-dd` strings in your timezone setting (default Asia/Kolkata); money is integer paise.
- Habit/streak logic judges history against the habit's *current* schedule. Editing never rewrites logs.
