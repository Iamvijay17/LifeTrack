# Dependencies

Source of truth: each `package.json` and `pnpm-lock.yaml` (pnpm 10.28.0 workspace). Ranges below are the declared ranges; "installed" versions are those found in `node_modules` when this document was written.
Direct counts: web 36 (22 runtime, 14 dev), mobile 40, `core` 3, `data` 7, `schemas` 7, `utils` 3, root dev tooling 9. Transitive dependencies are resolved by the lockfile (≈ 528 KB) and are not listed; use
`pnpm why <pkg>` or `pnpm list --depth 1 --filter <workspace>` for the tree.

## 1. Web app (`apps/web`)

| Package | Range (installed) | Purpose |
| --- | --- | --- |
| `react`, `react-dom` | ^18.3.1 (18.3.1) | UI (note: mobile uses React 19) |
| `react-router-dom` | ^7.18.0 (7.18.5) | Routing (upgraded from 6 for advisories) |
| `vite` | ^8.3.5 (8.3.5), `@vitejs/plugin-react` ^6.1.2 | Dev server and build |
| `vite-plugin-pwa` ^2.0.0, `workbox-window` ^7.4.1 | PWA manifest, service worker (autoUpdate) |
| `tailwindcss` ^3.4.19, `postcss`, `autoprefixer` | Styling |
| `@supabase/supabase-js` ^2.118.0 | Supabase client (declared here but imported only by `@lifetrack/data`) |
| `react-hook-form` ^7.91.0, `@hookform/resolvers` ^7.0.1, `zod` ^4.6.6 (4.6.7) | Forms and validation |
| `recharts` ^2.15.4 | Charts (lazy chunk) |
| `motion` ^14.9.1 | Animation (`LazyMotion`) |
| `@radix-ui/react-dialog` ^1.3.1 | Accessible dialogs / focus trap |
| `sonner` ^2.0.8 | Toasts |
| `lucide-react` ^1.66.0 | Icons |
| `class-variance-authority`, `clsx`, `tailwind-merge` | Class composition for `ui/*` |
| `date-fns` ^4.4.0 | Declared here, imported only by `@lifetrack/utils` |
| `@fontsource-variable/inter` ^5.3.0 | Self-hosted Inter (no Google Fonts request; CSP-friendly) |
| Dev: `vitest` ^5.0.5, `jsdom` ^30.1.3, `@testing-library/react|jest-dom|user-event`, `@playwright/test` ^1.64.1, `@axe-core/playwright` ^4.14.0 | Tests |
| Workspace: `@lifetrack/constants|core|data|schemas|utils` | Shared code |

## 2. Mobile app (`apps/mobile`)

| Package | Range | Purpose |
| --- | --- | --- |
| `expo` ~58.0.22, `expo-router` ^58.0.29, `expo-constants`, `expo-linking`, `expo-splash-screen`, `expo-status-bar`, `expo-system-ui`, `expo-dev-client` | Expo SDK 58 runtime, file-based routing, deep links |
| `react` ^19.3.0, `react-native` ^0.88.1 | UI runtime |
| `react-native-screens`, `react-native-safe-area-context`, `react-native-svg` 15.16.0 | Navigation primitives, safe areas, charts/rings |
| `@tanstack/react-query` ^5.105.2 | Cache/mutation layer (`queryStore.ts`) |
| `@supabase/supabase-js` ^2.118.0 | Backend client |
| `expo-secure-store` | Session storage in keychain/keystore |
| `expo-notifications`, `expo-device`, `expo-haptics` | Push + local notifications, device name, haptics |
| `@react-native-async-storage/async-storage` 2.2.0 | Notification bookkeeping (e.g. "already asked for permission"); the auth session uses SecureStore instead |
| `@expo/vector-icons` ^15.1.1 | Icons |
| `zod` ^4.6.6 | Forms |
| Dev: `jest` ^29.7.0, `jest-expo` ~58.0.13, `@testing-library/react-native` ^14.1.0, `react-test-renderer` 19.3.0, `vitest`, `js-yaml` (reads Maestro flows in a test), `typescript` | Tests and types |

## 3. Shared packages

| Package | Direct dependencies |
| --- | --- |
| `@lifetrack/utils` | `date-fns` ^4.4.0 |
| `@lifetrack/core` | `@lifetrack/utils` |
| `@lifetrack/data` | `@lifetrack/constants`, `core`, `utils`, `@supabase/supabase-js` ^2.118.0 |
| `@lifetrack/schemas` | `@lifetrack/utils`, `zod` ^4.6.6 |
| `@lifetrack/types` | `@lifetrack/schemas`, `zod` |
| `@lifetrack/constants`, `@lifetrack/design-tokens` | none |
| `@lifetrack/db-tests` (`supabase/tests`) | dev: `@electric-sql/pglite`, `pg`, `@supabase/supabase-js`, `vitest`, `typescript` |

## 4. Root tooling

`typescript` ^5.9, `eslint` ^9.39 with `@eslint/js`, `eslint-plugin-react`, `eslint-plugin-react-hooks` ^7.1, `globals`, `prettier` ^3.9, `@vitest/coverage-v8` 5.0.5, `@electric-sql/pglite` ^0.5.14.
Edge Function (`supabase/functions/send-reminders/deno.json`): `@supabase/supabase-js` 2.118.0 and `date-fns` 4.4.0 via `npm:` specifiers, `jsr:@std/assert@1` in tests (versions pinned, separate lockfile `deno.lock`).
CI actions (`.github/workflows`): `actions/checkout@v7`, `pnpm/action-setup@v5`, `actions/setup-node@v7`, `actions/upload-artifact@v7`, `denoland/setup-deno@v2`, `supabase/setup-cli@v1` (major tags, not SHAs).

## 5. External data and assets

| Asset | Licence | Notes |
| --- | --- | --- |
| Free Exercise DB (876 exercises, 1,746 photos) | Unlicense | Pinned commit, hashes verified ([GYM_FITNESS.md](GYM_FITNESS.md)) |
| Built-in food estimates | Author's estimates informed by IFCT / USDA FDC | No licence file; see [FOOD_NUTRITION.md](FOOD_NUTRITION.md) |
| Inter font | SIL OFL 1.1 (via `@fontsource-variable/inter`) | |
| Repository code | Proprietary, "All rights reserved" (`LICENSE`, legal entity placeholder unfilled) | |

## 6. Unused or questionable dependencies (found by searching for imports)

| Package | Finding | Recommendation |
| --- | --- | --- |
| `@react-native-community/datetimepicker` (mobile) | Declared, but nothing in `apps/mobile/src` or `app` imports it (custom pickers replaced it in commit `b61be67`) | Remove, or keep only if native pickers are planned; it adds a native module |
| `@supabase/supabase-js` and `date-fns` (web) | Not imported by `apps/web/src`; used through `@lifetrack/data` / `@lifetrack/utils` | Harmless under pnpm (strict hoisting is why they exist); remove for tidiness or keep for explicitness |
| `@types/jest` ^30 with `jest` ^29.7 (mobile) | Type/runtime major mismatch | Align on one major |
| `react-native-screens` | No direct import, but a required peer of Expo Router | Keep |
| `workbox-window` (web) | No import in `apps/web/src` or `vite.config.js`; `registerSW` comes from the plugin's virtual module | Probably removable; verify the PWA build first |

No automated unused-dependency tool (depcheck/knip) is configured.

## 7. Version skew to be aware of

- **React 18 (web) vs React 19 (mobile).** Both share `@lifetrack/core`, which has no React code, so this works; hooks in `apps/web/src` and `apps/mobile/src` are separate.
- **Dependabot** ignores all semver-major bumps and the Expo/React family; majors waiting: Tailwind 4, Recharts 3, Jest 30, TypeScript 7, plus whatever the lockfile lags (`.github/dependabot.yml`).
- **Expo SDK alignment** (`npx expo install --check`) has never been run in this project's CI sandbox ([RELEASE_AUDIT.md](RELEASE_AUDIT.md)).

## 8. Alternatives and maintenance concerns

| Area | Current | Alternative if it becomes a problem | Concern |
| --- | --- | --- | --- |
| Charts | Recharts 2 | visx, Chart.js, uPlot | Largest lazy chunk (≈ 98 KB gzip at last measurement); v3 migration pending |
| Animation | Motion 14 (web), RN Animated | Reanimated (native) | Fine; `LazyMotion` keeps the engine off the critical path |
| Server state (web) | Hand-written store (`hooks/store.js`, ~330 lines) | TanStack Query (already used on mobile) | Custom code to maintain; unifying would remove a divergent implementation |
| Forms | React Hook Form + Zod 4 | — | Zod 4 had a memory advisory < 4.6.6 (fixed) |
| PWA | `vite-plugin-pwa` 2 | hand-written Workbox | Plugin major recently released |
| Icons | `lucide-react` 1.x | — | Tree-shaken per icon |
| Backend | Supabase | self-hosted Postgres + PostgREST + GoTrue | Vendor coupling for Auth, Realtime and Edge Functions |
| Push | Expo push service | FCM/APNs directly | Extra hop and an Expo account dependency |
| Toolchain | pnpm 10, Node ≥ 20, Vite 8, TypeScript 5.9 | — | Expo SDK upgrades must move React / React Native together |

Known advisories accepted: two build-time `@expo/cli` transitive advisories (`minimatch`, `glob`) in `.audit-allowlist.json`, review by 2027-02-01.
