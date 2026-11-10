# UI / UX

LifeTrack is dark-first with a complete light theme. Web and mobile share one set of tokens. This document is the inventory; [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) is the
rationale for colour, depth and motion rules, and [UX_AUDIT.md](UX_AUDIT.md) records the audit (with remaining issues) that preceded the redesign.

## 1. Design system source of truth

| What | Where |
| --- | --- |
| Platform-neutral tokens (colours, chart colours, module accents, motion, radius, spacing, font) | `packages/design-tokens/src/index.ts` |
| Web CSS variables (mirror) | `apps/web/src/index.css` — `packages/design-tokens/tests/css-sync.test.ts` fails if they drift |
| Tailwind mapping | `apps/web/tailwind.config.js` (`rgb(var(--token) / <alpha-value>)`) |
| Web motion tokens | `apps/web/src/components/motion/tokens.js` |
| Native theme | `apps/mobile/src/providers/ThemeProvider.tsx`, `src/ui/*` |

## 2. Colour palette

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `background` | `#F8F8FA` | `#09090B` | Page |
| `sidebar` | `#F2F2F5` | `#0D0D10` | Navigation |
| `card` | `#FFFFFF` | `#111114` | Cards, dialogs |
| `surface2` | `#F4F4F7` | `#18181B` | Tiles inside cards |
| `border` | `#E4E4E9` | `#27272C` | Hairlines |
| `muted` | `#F1F1F4` | `#202025` | Muted fills |
| `foreground` | `#09090B` | `#FAFAFA` | Text |
| `muted-foreground` | `#63636B` | `#A1A1AA` | Secondary text |
| `primary` | `#7C3AED` | `#8B5CF6` | Brand, focus rings |
| `primary-solid` | `#7C3AED` | `#7C3AED` | Solid button fill with white text (AA contrast) |
| `secondary` | `#6D28D9` | `#A78BFA` | |
| `indigo` | `#4F46E5` | `#6366F1` | Gradient partner |
| `success` / `warning` / `danger` | `#166534` / `#92400E` / `#B91C1C` | `#22C55E` / `#F59E0B` / `#F87171` | Status |
| `danger-solid` | `#B91C1C` | `#DC2626` | Destructive buttons |

Chart colours (`chartColors`) and a shared 8-colour categorical palette (`chartPalette`: violet, green, amber, blue, pink, teal, red, grey) are identical on every platform.

**Module accents** (`moduleAccents`): each module has a gradient (`from`/`to`) and a readable text shade per theme — dashboard violet→indigo, planner indigo→blue, focus purple→pink, habits rose→orange,
notes yellow→amber, learning violet→blue, jobs amber→orange, goals pink→violet, fitness orange→red, health sky→indigo, **nutrition lime→green**, finance emerald→teal, analytics indigo→violet,
reports slate→indigo, notifications violet→pink, settings grey→violet, export teal→indigo. On the web `AppShell` sets `data-module` on `<html>`, which switches `--mod`, `--mod-2`, `--mod-text`;
a single tile can carry its own (`<StatCard module="fitness">`). On native `useAccent()` does the same.

## 3. Typography

- Family: **Inter** (variable, `@fontsource-variable/inter`, optical-size axis) with `system-ui` fallback; native uses `Inter`.
- Utilities: `.lt-eyebrow` (11 px, semibold, uppercase, 0.08 em tracking, muted), `.lt-stat-value` (semibold, tabular numerals, −0.025 em), `letterSpacing.display`.
- Headings follow document order (one `h1` via `PageHeader`; cards use `h2`/`h3`) — fixed in the accessibility pass.
- Only Latin font subsets are precached by the PWA; other scripts download on demand.
- Tamil text in food names renders with the system fallback font (Inter has no Tamil glyphs) — **not visually audited** in this documentation pass.

## 4. Spacing, shape and depth

| Token | Value |
| --- | --- |
| `spacing` | xs 4 · sm 8 · md 12 · lg 16 · xl 24 · xxl 32 |
| `radius` | sm 6 · md 10 (controls) · lg 14 · xl 18 (cards) · xxl 22 (hero cards) |
| Elevation | `--shadow-card`, `--shadow-raised`, `--shadow-overlay`; dark theme uses a hairline top highlight instead of drop shadows |
| Surfaces | `.lt-card` standard; `.lt-glass` (blur) only on the sticky header and mobile tab bar — phones get a near-solid surface because blur is costly |

## 5. Components

Web (`apps/web/src/components`):

| Group | Components |
| --- | --- |
| `ui/` | `button` (variants, `loading`), `card`, `dialog` (Radix), `form` (`Field`, `Input`, `Select`, `Textarea`, checkbox, switch), `menu`, `misc` (`Segmented`, badges…), `pickers` (custom `Select`, `DatePicker`, `TimePicker`), `popup`, `tooltip` |
| `layout/` | `AppShell`, `Sidebar` (collapsible 240 px ↔ 68 px), `MobileNav` (4 primary + "More pages" sheet), `GlobalSearch`, `NotificationBell`, `ProfileMenu`, `StatusIndicators` (offline banner, save status, live-sync dot), `Logo` |
| `shared/` | `PageHeader`, `StatCard`, `FormDialog`, `Confirm` / `TypedConfirmDialog`, `DateNav`, `DateRangePicker`, `MonthCalendar`, `WeekStrip`, `Heatmap`, `CheckButton`, `ShowMore`, `charts`/`chartParts` (Recharts), `states` (`DataGate`, empty/error states), `ErrorBoundary`, `ConfigError`, `SettingsSection` |
| `loaders/` | `FullScreenLoader`, `PageLoader`, `SectionLoader`, `SkeletonLoader`, `ButtonLoader`, `OrbitMark` ("LifeTrack Progress Orbit"; CSS/SVG, transform+opacity only, reduced-motion aware) |
| `motion/` | `Stagger`, `StaggerItem`, `Reveal`, `AnimatedValue`, `ProgressRing`, `Magnetic`, `Collapse`, `MotionProvider` (`LazyMotion`) |

Mobile (`apps/mobile/src/ui`): `Sheet` (draggable bottom sheet), `controls` (`Card`, `Button`, `Chip`, `Segmented`, `SelectField`, `DateField`, `StatTile`, `ProgressBar`, `EmptyState`, `DataGate`, `Badge`…), `charts`,
`Heatmap`, `Markdown`, `ModuleHeader`, `TabBar` (`LifeTabBar`), `motion` (`FadeIn`, `PressableScale`, `AnimatedNumber`, `ProgressRing`, `Gradient`, `IconTile`, `Hero`, `CheckCircle`, `Skeleton`, `useConfetti`), `accent`, `confirm`.

## 6. Layout and navigation

**Web** — `AppShell` = sticky header (page icon/title, save status, live dot, search, notifications, quick-add, profile) + sidebar (≥ `md`, grouped: Overview · Productivity · Growth · Wellness · Money · Insights · System)
or bottom `MobileNav` (< `md`: Dashboard, Planner, Habits, Finance, More). A "Skip to content" link is the first focusable element. Pages are `Suspense`-lazy with route-specific loader messages, wrapped in an
`ErrorBoundary`; route changes animate with a short fade. Each page sets a browser title (`pageTitle`). Collapsed-sidebar state persists in `localStorage` (`lifetrack:sidebar`).

**Mobile** — Expo Router stack over five tabs (Dashboard, Planner, Habits, Finance, More); every other module is a pushed screen so each platform keeps its native back behaviour. Pull-to-refresh on lists.

## 7. Themes

`theme` ∈ `dark | light | system`, stored in `user_settings.theme` so it follows the account across devices. `public/theme-init.js` applies the last stored value before first paint to avoid a flash;
`useThemeSync` then reconciles with the account and tracks `prefers-color-scheme` for `system`. Mobile: `ThemeProvider` + `ThemeSync`, `userInterfaceStyle: automatic`. The browser `theme-color` meta follows the theme
(`#09090B` / `#FAFAFA`). The PWA manifest uses `#09090B`.

## 8. Responsive behaviour

- Breakpoint switch at Tailwind `md` (768 px): sidebar ↔ bottom nav; buttons grow to 44 px (`h-11`) on touch layouts and 36 px with a mouse (`md:h-9`).
- Dashboard uses a 12-column grid (widget spans in `WIDGET_SPAN`); filters collapse behind a button on phones; heatmap shows 26 weeks on web and 20 on mobile and scrolls horizontally.
- Verified by Playwright on a 1280×800 desktop and a Pixel 7 profile (`e2e/responsive*.spec.js`, `ux-audit.spec.js`). **Not verified** on physical devices or widths between those profiles.
- Print: a print stylesheet is provided (used by Reports); elements marked `data-reveal` are forced visible when printing.

## 9. Animation

Tokens: feedback 120 ms, standard 200 ms ease-out, arrival 320 ms, count 700 ms, springs `snappy` (420/32) and `bouncy` (520/18). Only `transform`/`opacity` animate (SVG stroke for rings). Motion's engine is its own chunk
(`LazyMotion`, use `m.*`). Hover lift/press are CSS (`.lt-lift`, `.lt-press`). Charts animate over a shared 650 ms. Native uses React Native `Animated` (no extra native module). Confetti only for real achievements.
**Reduced motion** is honoured: `MotionConfig reducedMotion="user"` plus a global CSS rule on web, `useReducedMotion()` on native; count-ups and confetti turn off.

## 10. Accessibility

Implemented (from code and `docs/UX_AUDIT.md`): WCAG AA colour contrast in both themes (`primarySolid`/`dangerSolid`); skip link; labelled icon buttons; form errors with `aria-invalid`, `aria-describedby` and
`role="alert"`; dialogs trap focus (Radix); keyboard support for menus, tabs and job-table rows; `role="switch"` toggles; heatmap labels; chart text summaries; 40–44 px touch targets on phones; mobile controls with
accessibility labels and a loading `Button` that keeps its accessible name; reduced motion. Automated checks: `e2e/a11y.spec.js` (axe-core via `@axe-core/playwright`).
**Not verified**: real screen-reader behaviour (VoiceOver/TalkBack), dynamic type at the largest sizes, and contrast of every state ([RELEASE_AUDIT.md](RELEASE_AUDIT.md)).

## 11. Content and tone

Empty states explain the next step ("Log your first meal", "Build your first habit"); errors are specific and say whether data was saved ([ERROR_HANDLING.md](ERROR_HANDLING.md)); nothing is invented — targets and
percentages are shown as "—" when there is no data or goal.
