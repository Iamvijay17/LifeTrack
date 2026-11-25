# Premium experience upgrade (loading, personalization, mobile)

Written 16 Nov 2026. This is the audit that came first, what was built because of it, and what is left. It is a record of this piece of work; the living rules are in [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md), [UI_UX.md](UI_UX.md) and [PERFORMANCE.md](PERFORMANCE.md).

## 1. Audit: what LifeTrack already had

Most of the brief was already there, so the work went into the real gaps instead of rebuilding working parts.

| Area | Already in the app | Gap found |
| --- | --- | --- |
| Loading | `SkeletonLoader`, `DataGate` on every data page, a delayed route loader (`.lt-delayed`), `ButtonLoader`, `useAction` (blocks double submits, toasts failures), a save indicator | Skeletons were one generic shape (title, four stat cards, list), so charts, tables, calendars and settings jumped when data landed; a duplicate page-title placeholder; no hint on a slow connection; offline looked like a generic error |
| Writes | Cloud-first store: cache is patched only after the server confirms | Every click waited for a round trip (task complete, habit toggle, note edit, food log, workout) |
| Transitions | Route fade/slide, bottom-sheet dialogs, Motion everywhere, global `prefers-reduced-motion` rule | No in-app reduce-motion choice |
| Theme | Dark / light / system, one violet brand | No accent choice, no text size, no spacing, no appearance page of its own |
| Dashboard | Show/hide, drag and drop, arrows, three-to-four sizes, reset, saved to `user_settings.dashboard_widgets` (Life Command Center) | No ready-made layouts to start from |
| Sidebar | Collapse toggle (device only), mobile tab bar with "More" | No order, no favourites, collapse not saved to the account |
| Mobile | Phone bottom bar, bottom-sheet dialogs, 44 px controls below `md`, safe-area padding, `touch-action: manipulation` globally, an existing responsive e2e suite | No sweep across every page at 320 px |
| PWA | `vite-plugin-pwa` shell precache, online-first, no API caching, update on reload | Maskable icon was the normal icon, no shortcuts, no install button, iOS metas missing |

## 2. Plan and result

| Phase | Done |
| --- | --- |
| 1. Loading and transitions | Optimistic store; page-shaped skeletons; slow-network and offline states |
| 2. Personalization | Accent colours with contrast checks, text size, spacing, motion, sidebar order and favourites, dashboard layout presets, appearance saved to the account |
| 3. Mobile and PWA | Every route checked at 320 / 414 / 768 / 1280 px; maskable icon, shortcuts, install button, iOS metas |
| 4. Design system | Accent tokens, motion/breakpoint variables, documented in DESIGN_SYSTEM.md |
| 5. Quality | Unit and end-to-end tests below |

### Optimistic writes (`hooks/store.js`)

Every `insert`, `update`, `upsert`, `remove` and `removeMany` now changes the cache first, then sends the request:

- **Inserts** appear at once as a stand-in row (defaults, your input, a `tmp-` id). The confirmed row replaces it in a single cache write, so the list never shows both or neither. A Realtime echo that arrives first cannot leave a duplicate.
- **Updates and upserts** change the row at once. An upsert whose conflict columns match a cached row (a habit log for the same habit and day, the settings row) changes that row instead of adding one.
- **Failure** undoes only the fields this write touched, so a second edit to the same row is not lost, removes stand-ins, brings back deleted rows, and rethrows so forms stay open and `useAction` shows the toast.
- **Background refreshes** (focus, reconnect, Realtime, the 90 s safety net) are postponed while a write is in flight, so a snapshot that predates the write can never flicker it away.
- The save indicator and the "unsaved changes" tab warning still follow `tracked()`, so they stay truthful.

Because every domain operation (`setTaskStatus`, `setHabitStatus`, `saveWorkout`, calendar moves, notes, food logs, settings) already goes through this store, they all became optimistic without touching their call sites.

### Loading states

- `SkeletonLoader` variants: `page`, `dashboard`, `cards`, `list`, `chart`, `table`, `calendar`, `profile`, `text`, sized like the real content (stat grid, chart heights, month grid) and faded in after a beat so a fast load never flashes one. `DataGate` takes `skeleton="..."`; the Dashboard, Finance, Analytics, Reports, Jobs, Settings, Notes, Notifications and Planner use shaped ones.
- A quiet "taking longer than usual… Retry" line after 8 s. Offline, the error state says so instead of blaming the server.

### Appearance (`lib/appearance.js`, `hooks/useAppearance.js`, Settings)

- Stored in `user_settings.appearance_prefs` (migration `0017_appearance.sql`) and mirrored on the device, so the first paint is already right (`public/theme-init.js`).
- The screen changes in the same frame; the account write follows 0.5 s later. If the account cannot store it (migration not yet run) the look stays on the device and a single toast says so.
- Accent: violet (the default, untouched), blue, emerald, rose, orange, cyan, or any custom colour. Buttons always keep 4.5:1 with white text and the accent as text keeps 4.5:1 on the page (WCAG), in both themes; a pale colour is deepened and Settings tells you.
- Text size (small / default / large), spacing (comfortable / compact), motion (follow device / reduce).
- Navigation card: pin up to four favourites (they lead the sidebar and become the phone bar), reorder inside each group with arrows, restore defaults. Sidebar collapse is saved with the rest.
- Dashboard layouts: Balanced, Focus, Health, Career, built only from existing widgets (`LAYOUT_PRESETS` in `@lifetrack/core/commandCenter`). Fine-tuning stays in "Customize" on the dashboard.

### PWA

Manifest `id`, a separate maskable icon (`npm run icons -- maskable`), three shortcuts (Planner, Habits, Calendar), categories; iOS and Android capable metas; an "Install LifeTrack" card in Settings (the browser's install prompt, or Add to Home Screen on iPhone); the app shell stays precached. The service worker has no rule that can match Supabase traffic, and the e2e suite asserts that.

## 3. Files

New: `apps/web/src/lib/appearance.js`, `lib/install.js`, `hooks/useAppearance.js`, `features/settings/NavigationCard.jsx`, `features/settings/InstallCard.jsx`, `public/icon-maskable-512.png`, `supabase/migrations/0017_appearance.sql`, tests `apps/web/tests/appearance.test.js`, `apps/web/e2e/premium.spec.js`, `supabase/tests/pglite/appearance.test.ts`, this file.

Changed: `hooks/store.js`, `components/loaders/SkeletonLoader.jsx`, `components/shared/states.jsx`, `components/layout/{AppShell,Sidebar,MobileNav}.jsx`, `components/motion/{primitives.jsx,tokens.js}`, `components/ui/{button,form}.jsx`, `features/quick/QuickActions.jsx`, `features/settings/{AppearanceCard,SettingsPage}.jsx`, nine pages (skeleton variants), `lib/nav.js`, `index.css`, `tailwind.config.js`, `public/theme-init.js`, `index.html`, `main.jsx`, `vite.config.js`, `scripts/generate-icons.mjs`, `packages/core/src/commandCenter.js`, `packages/constants/src/schema.js`, `packages/schemas/src/tables.ts`, `supabase/setup-all.sql`, `docs/DESIGN_SYSTEM.md`, `docs/DATABASE.md`, `apps/web/tests/store.test.js`.

Dependencies: none added, none removed.

## 4. Tests

Run in a scratch copy of HEAD plus only this work (another session had unfinished changes in the same checkout), with the Supabase variables blanked so nothing touched a real project.

- **Unit** (`apps/web`): 1025 pass, 3 fail, none from this work. `csv.test.js` and `help.test.jsx` fail because of the Smart Recovery work in progress (a new table and a new nav item without a help guide). `contextMenu/modules.test.jsx` times out under full parallel load and passes alone (13/13, and 42 s against 58 s at HEAD); at HEAD one of two full runs failed a different test in that same file.
- **New unit tests**: 9 for the optimistic store (stand-in then confirmed row, per-field rollback, failed insert vanishes, Realtime echo leaves no duplicate, notifications never guessed, delete restored on failure, upsert on an existing key, refetch held back during a write); 17 for appearance (validation, WCAG contrast for every accent and for awkward custom colours, applying and clearing tokens, device cache, navigation order and favourites, layout presets).
- **Database** (pglite): 398 pass, including `appearance.test.ts` (default `{}`, holds a look, refuses a list or number).
- **End to end** (Chromium, local backend): the new `premium.spec.js` passes 5/5: every one of 20 routes at 320, 414, 768 and 1280 px with no sideways scroll (80 page loads), appearance applying/persisting/resetting, favourites and reordering on desktop and phone, PWA manifest and "no API in the service worker", and a failing write rolled back with a toast. The wider existing suites (settings, pwa, loaders, command-center, responsive, ux-audit, a11y, modules, finance) passed 72 of 73 in one run; a rerun of the layout and finance specs after the last store change passed 47 before stopping at the same single failure, `responsive.spec` "quick add", also fails 2 of 3 runs at HEAD (a "Due today" toast races its text match).
- Lint: 0 errors. `packages/data`, `design-tokens`: pass. Not run: installing the PWA in a real browser or on a phone, and real-device touch testing.

## 5. Deploying

Run `supabase/migrations/0017_appearance.sql` (or the regenerated `setup-all.sql`). It is additive. Until it is run everything works; the look just stays per device.

## 6. Known limitations

- Offline is read-only by design: the app shell opens, but data needs a connection and nothing is queued for later (no unsafe offline writes). There is no separate offline page, because the precached shell is what opens when the network is gone.
- Appearance is per account, but the device copy is not cleared on sign-out, so signing in to a different account on the same browser starts from that device's look until the account's own copy loads.
- Compact spacing tightens the common paddings and gaps in the page area; individual one-off spacings are unchanged.
- Swipe gestures were not added beyond the existing drag-to-dismiss sheets, because nothing else needed one.
- The mobile app does not read `appearance_prefs` yet.

## 7. Remaining ideas

Drag-and-drop ordering in the Navigation card (arrows work today); an accent picker preview of buttons and a chart; per-module accent override; a real offline write queue with conflict handling (a project of its own); a "Syncing" row-level indicator for stand-in rows.
