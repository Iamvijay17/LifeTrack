# LifeTrack — personal life OS

Private, cloud-first productivity app: daily planner, learning tracker with server-side study timer, job-search
board with immutable status history, gym & fitness, sleep/health, finance (INR, integer paise), habits with
heatmap, analytics, JSON/CSV export + restore. React + Vite + Tailwind, Supabase (Postgres, Auth, RLS, Realtime), installable PWA.

**Start here → [docs/QUICKSTART.md](docs/QUICKSTART.md)** (details: [docs/SETUP.md](docs/SETUP.md))

## Status / honest limitations
- **Verified here:** unit tests (43), SQL/RLS tests on real Postgres (18 checks), Playwright E2E on desktop + mobile profile (29).
- **Not verified here (no Supabase project was available in the build environment):** the live Supabase client path
  (auth emails, Realtime delivery, PostgREST paging) and true two-device sync. A `cloud-sync` Playwright test is provided;
  run it once your project is configured. Until then, treat cloud sync as implemented-but-unproven.
- The Supabase Realtime path is a single `postgres_changes` channel + refetch; DELETE events carry only the primary key, so the app refetches instead of patching.
- Online-only by design: no IndexedDB queue. Offline shows a banner and writes fail visibly (nothing is silently dropped). The PWA caches only the app shell.
- Water/“add” style increments are read-modify-write; two devices adding at the same instant could lose one increment.
- Study-timer duration uses the device clock at stop; large device clock skew would affect it (you can only correct the time downward).
- Jobs "interview rate" and habit streaks are computed from current data/schedule; changing a habit schedule re-judges missed days against the new schedule.
- Backup restore merges by id (never deletes). Account deletion calls the `delete_my_account()` RPC.
- DEV-mode local auth is for development only and is not secure.
