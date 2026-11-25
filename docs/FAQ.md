# FAQ

Questions about using LifeTrack are answered in-app (Help & Support) and in [USER_GUIDE.md](USER_GUIDE.md). This FAQ covers the project itself.

## About the product

**What is LifeTrack?** A private life-tracking app (web PWA + iOS/Android) with 20 modules; see [FEATURES.md](FEATURES.md).

**Is there an AI assistant?** No. The product is deliberately "no AI, no estimation": reports, scores and analytics are sums, counts and averages of what you entered. None is planned in this repository.

**Does it work offline?** No. It is online-first: offline you get a banner and writes fail visibly. The PWA caches only the app shell (and exercise photos once viewed).

**Who can see my data?** Only your account, enforced by database row-level security. There is no admin console, sharing, or analytics SDK ([SECURITY.md](SECURITY.md)). The project owner who runs the Supabase project can technically read the database.

**Is there an admin guide?** No — there are no admin features to document.

**Which currencies and time zones?** Currency display: INR, USD, EUR (amounts are stored as integer minor units). Time zone: a curated list in Settings (default Asia/Kolkata).

**Why are some features web-only?** Reports, JSON/CSV export-restore and global search are not built on mobile ([PARITY.md](PARITY.md)).

## Food and fitness

**Where do the food values come from?** From the author's estimates informed by IFCT and USDA FoodData Central, rounded for everyday portions; not lab-measured. Each food is labelled *Typical value*, *Approximate* or *Rough estimate*. Edit any food to match yours ([FOOD_NUTRITION.md](FOOD_NUTRITION.md)).

**How many foods are built in? Can I add more?** 293, in 15 categories, with Tamil names. Add your own foods in the app; developers add built-in foods in `packages/constants/src/foods/`.

**Why did my past meals not change when I edited a food?** Each log entry stores a snapshot of its nutrition so history never rewrites itself.

**Where do the exercise photos come from?** The Free Exercise DB (Unlicense), committed in `apps/web/public/exercises` ([GYM_FITNESS.md](GYM_FITNESS.md)). Three exercises have no photos.

**Is there a rest timer between sets?** No. The Focus timer is separate.

## Setup and operations

**Do I need to run a server?** No. Run `pnpm dev` for the web app; the backend is a Supabase project ([INSTALLATION.md](INSTALLATION.md)).

**Which migrations must I apply?** All of `supabase/migrations/0001`–`0010` in order, or paste `supabase/setup-all.sql` into a new project. `SETUP.md`/`QUICKSTART.md` are outdated on this ([KNOWN_ISSUES.md](KNOWN_ISSUES.md)).

**Why does the production build say it is not connected to a database?** The Supabase variables were missing at build time. They are inlined by Vite, so set them before `pnpm build`.

**What is "DEV mode"?** Without Supabase variables `pnpm dev` uses an in-browser backend (data in `localStorage`, insecure fake auth) for development and tests. It is compiled out of production builds.

**Why does `pnpm test:pg` skip?** It needs PostgreSQL server binaries; CI requires them.

**How do reminders reach my phone?** A Supabase Edge Function on a one-minute `pg_cron` job writes notifications and sends Expo pushes. It must be deployed and scheduled by hand ([NATIVE.md](NATIVE.md)). It has not been run against a live project.

**Why do recurring bills only appear after I open the app?** The server does not post transactions; any open app posts what is due, dated the day it fell due.

**Can I roll back a migration?** Only with a new forward migration. Migrations are additive by policy.

**How do I release the mobile app?** [RELEASE.md](RELEASE.md) and [NATIVE.md](NATIVE.md); locally `scripts/release-android.sh`.

**Where are the APK files in the repo root from?** Local release builds (`LifeTrack-1.0.0.apk` … `2.3.0`); `*.apk` is git-ignored. Keep the signing key outside the repo.

## Development

**Where do I put business logic?** In `packages/core` as pure functions with a test; pages only wire data to those functions ([CONTRIBUTING.md](CONTRIBUTING.md)).

**Why are web and mobile numbers identical?** They call the same `@lifetrack/core` functions, guarded by golden-dataset parity tests.

**Why is `supabase/functions/_shared` generated?** Deno cannot import workspace packages; `scripts/sync-function-core.mjs` copies the shared reminder code and CI fails if it is stale.

**Why React 18 on web and 19 on mobile?** Each follows its platform's dependency set; shared packages contain no React.

**How do I add a table?** [CONTRIBUTING.md §5](CONTRIBUTING.md).
