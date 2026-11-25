# Performance

Numbers here come from existing audits and from measuring the committed `apps/web/dist` build found in the working tree (built 2026-11-04, **before** the Food & Nutrition and exercise-database work). Re-measure with
`node apps/web/scripts/measure-perf.mjs` (lab: 4× CPU throttle, slow-4G; "compare runs against each other, not against a real device") and `pnpm verify:bundles` before relying on them.

## 1. Web loading

| Technique | Where |
| --- | --- |
| Every page is a lazy chunk (`React.lazy`); the shell does not import chart code | `src/App.jsx`, `components/shared/chartParts.jsx` vs `charts.jsx` |
| Motion engine in its own chunk (`LazyMotion`, `m.*`) | `components/motion/primitives.jsx` |
| Quick-add forms load on first use (≈ 45 KB off the shell) | `features/quick/QuickDialogs.jsx` |
| Fonts self-hosted; only Latin subsets are precached | `index.css`, `vite.config.js` `globIgnores` |
| Backend chosen at build time, so the in-browser dev backend is tree-shaken out of production | `__BACKEND__`, `verify-bundles.mjs` |
| `assets/*` immutable for a year; `sw.js` and manifest never cached | `vercel.json`, `public/_headers` |
| Service worker precaches the shell only (≤ 3 MB per file); exercise photos cached on first view (600 entries / 30 days) | `vite.config.js` |

Measured in the Nov 4 build (gzip): main `index` chunk ≈ 64 KB · shared chunk containing the Supabase client/`useAction` ≈ 65 KB · Recharts chunk ≈ 98 KB (loaded only by chart pages) · forms chunk ≈ 20 KB · 80 JS files, ≈ 1.2 MB
uncompressed JS in total, 1.9 MB `dist`. The Phase 8A audit reports main 63 KB, charts 98 KB, Supabase 68 KB, largest page 11 KB.

## 2. Data access cost (the main scaling limit)

- **Whole-table loads.** Each module fetches all rows of its tables (paged 1000 at a time) and derives views on the device. This keeps the UI instant but cost grows with history: a daily-logging user adds on the order of a few hundred
  to a few thousand rows per year per table (`food_logs` more if every food is logged). The docs consider this fine "for years of normal logging"; there is no server-side range query or incremental sync yet
  (indexes `(user_id, updated_at)` exist on `habit_logs`, `transactions`, `health_logs`, `food_logs` for a future "changed since" fetch).
- **Refresh traffic.** The web store refetches loaded tables on focus/visibility/online (rate-limited by `MIN_SYNC_GAP`), after Realtime reconnects and every 90 s as a safety net when Realtime is not connected. Realtime INSERT/UPDATE
  events are applied directly to the cache (no refetch); DELETE events remove by id.
- **Write path.** One request per write; multi-row operations are single RPCs. Burst refetches are debounced (250 ms).
- **Lists.** Long web lists render a page at a time with "Show more" (`useShowMore`, default step 50; Notes and Job applications use 40). The mobile Planner uses a `SectionList`/`FlatList`; I found no windowing code in the web Planner, and the later UX audit (finding P3 in [UX_AUDIT.md](UX_AUDIT.md)) confirms that the Phase 8A statement that the planner is virtualised is wrong. Finance, Fitness history and Health history are paged/capped per the audit.
- **Search.** Food search runs over ≈ 300 foods in memory with per-food cached indexes (`WeakMap`) and a bounded edit distance; global search scans the loaded tables on the device.

## 3. Rendering and animation

- Only `transform`/`opacity` animate (SVG stroke for rings); hover lift and press are CSS; `AnimatedValue` writes straight to the DOM so counting does not re-render; the dashboard clock re-renders only itself ([DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)).
- `.lt-glass` blur is limited to the header and mobile tab bar and replaced by a near-solid surface on phones.
- Reduced motion switches count-ups, confetti and large transitions off.
- The Header uses a passive scroll listener and a boolean state, so crossing the 4 px threshold is the only re-render.

## 4. Mobile

Android + iOS export is ≈ 15 MB total for both platforms (JS + assets) per the Phase 8A audit. Notes and jobs page 40 at a time; the Planner tab uses a native list component. The exercise database does **not** ship in the binary: the catalog and each photo are downloaded
from the web deployment. RealtimeSync tears the socket down in the background and rebuilds on foreground. Not profiled on low-end phones.

## 5. Exercise assets

`apps/web/public/exercises` is ≈ 99 MB (1,746 JPEGs + a catalog). They are committed to git (repository clone size) but are **not** precached by the service worker; hosts serve them with a 30-day cache. The catalog JSON is fetched once
per page load and shared by the browser, detail page and "My exercises".

## 6. Database

Indexes follow the access pattern `(user_id, date)` for every dated table, partial indexes for nullable foreign keys, GIN on `notes.tags` and `foods.aliases`; unique partial indexes double as idempotency guards. RLS policies use
`(select auth.uid())` so the function is evaluated once per statement rather than per row. Not measured: query plans on large datasets, PostgREST latency, Realtime fan-out.

## 7. Known performance risks

| Risk | Evidence | Mitigation idea |
| --- | --- | --- |
| Full-table fetch growth (`food_logs`, `workouts`/`exercise_logs`, `transactions`) | Design in `packages/data/src/supabaseAdapter.js` | Range queries by month; incremental fetch using `updated_at` |
| Realtime subscribes to 30 tables × 3 events on one channel | `supabaseAdapter.subscribe` | Subscribe only to tables currently loaded |
| Large Recharts chunk | 98 KB gzip | Replace with a lighter library or hand-rolled SVG for simple charts |
| Repository weight from exercise photos | 99 MB in git | Git LFS or serve photos from object storage/CDN |
| Web store is hand-written | `hooks/store.js` | Consolidate with the TanStack Query approach used on mobile |
| No field performance data | none collected | Add Web Vitals reporting if privacy policy permits |
