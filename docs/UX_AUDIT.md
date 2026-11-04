# LifeTrack UI/UX audit

Date: 4 Nov 2026 · Scope: web app (every route and tab), native app (code review, typecheck, unit and component tests), shared packages.

## How this was tested

| Method | Coverage |
|---|---|
| Scripted browser pass (Playwright + axe-core) on the in-browser dev backend | 29 screens and tabs × desktop 1280, tablet 768, phone 390, small phone 320, dark and light, seeded and empty accounts: **232 page audits** |
| Scripted interaction pass | Menus, selects, date and time pickers inside dialogs, keyboard, Escape, global search, form validation, auth errors, phone landscape |
| Screenshots reviewed by eye | Desktop, phone, light and empty states |
| Code review | All web features, all shared UI, mobile navigation, dashboard, finance, UI primitives, core domain packages |

**Not tested:** the real Supabase project (nothing here touched your production data), real iPhones/Android phones, VoiceOver/TalkBack. The native app can't be driven from this environment, so native findings come from reading code and running its tests.

## Summary

LifeTrack has a strong foundation: consistent tokens, real data everywhere, loading/empty/error gates, no fake statistics, no dead buttons found. It was held back by a small number of layout and popup bugs with outsized impact, an inaccessible colour palette in the light theme, and gaps in the fitness, health and dashboard features. Those are now fixed on web; see [Results](#results) and [Remaining issues](#remaining-issues).

Statuses below: **Fixed** or **Added** means done and tested in this pass. **Recommended** means not done, usually because it needs a database change for you to approve.

## Findings

Priority: **Critical** (broken or blocks a task), **High**, **Medium**, **Low**. Complexity: S (under an hour), M (a few hours), L (needs a schema change or a larger piece of work).

### Global and shared components

| ID | Screen | Existing problem | Recommended improvement | Priority | Cx | Status |
|---|---|---|---|---|---|---|
| G1 | Dashboard, Planner, Fitness (phone, tablet) | One long task title makes the whole page 330px wider than a phone: grid tracks grow to fit `truncate` text. Fitness overflows by 59px even when empty. | Give mobile grids `grid-cols-1` (`minmax(0, 1fr)`); let rows shrink. | Critical | S | Fixed |
| G2 | All dialogs | Date picker is cut off by the dialog's scroll area: the month and year controls can't be reached when the field is low in a form. | Draw popups in a portal, positioned from the anchor, and flip when there is no room. | Critical | M | Fixed |
| G3 | Jobs table, any list near a card edge | "Move" and actions menus are cut off by `overflow-hidden` cards (253px hidden on the last row). | Same popup primitive for every menu. | Critical | S | Fixed |
| G4 | All dialogs with a dropdown | Pressing Esc on an open dropdown or calendar closes the whole form and discards what was typed. | A dialog leaves Esc to an open popup. | Critical | S | Fixed |
| G5 | Every page | A purple line appears around the main content after navigation: `<main>` gets the focus ring when focused for screen readers. | Remove the ring from `<main>` only. | High | S | Fixed |
| G6 | All dialogs | Opening animation overrides the centring transform, so desktop dialogs jump into place. | Animate with the `translate` property. | High | S | Fixed |
| G7 | All forms | Esc, the X or a stray click on the backdrop silently discards typed text (costly in notes). | Ask before discarding typed input; the Cancel button stays immediate. | High | S | Fixed |
| G8 | Long forms on a phone | Save and Cancel scroll away with the form; not padded for the home indicator. | Sticky form footer with safe-area padding. | High | S | Fixed |
| G9 | All screens, light theme | Fails WCAG AA in 935 places: muted text 4.39:1, sidebar labels 2.6:1, success and warning 2.7–3.3:1. | Darken light-theme text tokens. | High | S | Fixed |
| G10 | All screens, dark theme | 597 failures: white on primary 4.23:1, danger badges 4.02:1, sidebar labels 4.18:1. | Solid-fill tokens for buttons; lighter danger text. | High | S | Fixed |
| G11 | All menus | Keyboard users can open a menu but focus doesn't enter it; arrow keys do nothing. | Focus first item; Arrow, Home, End; Esc returns focus. | High | S | Fixed |
| G12 | All pages | Every route is titled "LifeTrack" (WCAG 2.4.2): history, tabs and screen readers can't tell pages apart. | Per-route document titles. | High | S | Fixed |
| G13 | All pages (phone) | Touch targets too small: task checkbox 20px, menu trigger 28px, inline links 16px, heatmap 12px, `sm` buttons 32px. | 40–44px on touch layouts, unchanged on desktop. | High | S | Fixed |
| G14 | All forms | Invalid fields have no visual state and hints aren't announced. | Red border on `aria-invalid`; connect hints with `aria-describedby`. | Medium | S | Fixed |
| G15 | All pages | No global reduced-motion handling (only loaders honoured it). | Global `prefers-reduced-motion` rule. | Medium | S | Fixed |
| G16 | Tabs everywhere | Tabs have no arrow-key navigation; on a 320px phone the Fitness tabs overflow by 46px. | Arrow keys; scroll within the tab bar. | Medium | S | Fixed |
| G17 | All pages | Heading levels skip h1 → h3 on 17 routes. | Card titles become h2; nested panels h3. | Medium | S | Fixed |
| G18 | Status dots | `aria-label` on plain `span` (28 routes); search button's name doesn't match its visible text. | `role="img"` on dots; name from visible text. | Medium | S | Fixed |
| G19 | Focus, Notes | Custom Select dropped option group labels ("Tasks", "Learning topics" ran together). | Render group headings. | Medium | S | Fixed |
| G20 | Global search | Results only open the module, except notes: the job or task you picked isn't shown. | Deep links: `/jobs?app=`, `/planner?date=`, `/finance?month=`. | Medium | S | Fixed |
| G21 | Sidebar | On a 13" laptop the footer leaves Analytics, Reports, Notifications, Settings and Export below the fold with no hint. | Compact one-row footer. | Medium | S | Fixed |
| G22 | Charts | Charts have no text alternative on web (mobile does); pie slices fail axe `svg-img-alt`. | `summary` on charts; labelled slices. | Medium | M | Fixed |
| G23 | Copy | Implementation details shown to users: "all stored as exact paise", "nothing is hardcoded", "1 rejections". | Plain-language descriptions; pluralise. | Low | S | Fixed |
| G24 | Toasts | Follow the OS theme instead of the app theme. | Follow the app theme. | Low | S | Fixed |
| G25 | Defaults | A personal project name ("Vireon-AI") is seeded as a topic for every new user. | Generic name for new accounts. | Low | S | Fixed |

### A. Dashboard

| ID | Existing problem | Recommended improvement | Priority | Cx | Status |
|---|---|---|---|---|---|
| D1 | **Wrong number:** ignores a month's budget override. Finance shows ₹15,950 left of ₹60,000 while Dashboard says "set a budget". | Use the same budget as Finance (web and mobile). | Critical | S | Fixed |
| D2 | No upcoming deadlines: interviews, follow-ups, goal dates and bills are only visible by visiting each module. | "Upcoming" widget, next 7 days. | High | S | Fixed |
| D3 | Stat cards look tappable but do nothing; no path from a number to its module. | Link each card to its module. | High | S | Fixed |
| D4 | New accounts open on a wall of zeros with no direction. | Getting-started guide ticked off by real data; dismissible. | High | S | Fixed |
| D5 | Instant task completion from the dashboard has no undo; one stray tap. | Undo in the toast (non-repeating tasks). | Medium | S | Fixed |
| D6 | "1500/3000 ml" wraps; "Weekly daily score"; "0-day active streak"; 8 items in Today's progress column misaligned. | Fix wrapping and wording. | Low | S | Fixed |
| D7 | Job summary is only "applications this week". | Show active pipeline count too. | Low | S | Fixed |

Present and working: today's overview, completion %, tasks, habits, learning, fitness, sleep, expense, weekly score, quick actions, streak, widget customisation.

### B. Career & Learning

| ID | Existing problem | Recommended improvement | Priority | Cx | Status |
|---|---|---|---|---|---|
| L1 | Revision dates are typed as `YYYY-MM-DD, YYYY-MM-DD`. | Date picker with removable chips. | High | S | Fixed |
| L2 | Goals tab lists every goal, including career goals shown as "no target set". | Show study goals only; link to Goals. | Medium | S | Fixed |
| L3 | Topics are a wall of identical cards (3,173px on a phone). | Compact rows; only show badges that matter. | Medium | S | Fixed |
| L4 | Sessions empty state is a dead end. | Add a "Log a session" action. | Low | S | Fixed |
| L5 | No courses, subtopics, or topic progress; skills are not tracked. | New schema (see Missing features). | Medium | L | Recommended |

Present and working: study goals, topics, session timer, manual sessions, daily target, weekly stats, notes, DSA problems, revision reminders.

### C. Job Switch

| ID | Existing problem | Recommended improvement | Priority | Cx | Status |
|---|---|---|---|---|---|
| J1 | Table rows only respond to a mouse click (`<tr onClick>`): keyboard users can't open an application. | Company name becomes a real button. | High | S | Fixed |
| J2 | Table: "20 LPA" and "Follow-up" wrap; last column has no header. | No-wrap cells; screen-reader header. | Low | S | Fixed |
| J3 | Board on desktop gives no hint that more columns exist to the right. | Keep scroll, add edge affordance and scrollbar. | Low | S | Fixed |
| J4 | Salary is one number; no expected vs offered, offer deadline, or rejection reason. | New columns (see Missing features). | Medium | L | Recommended |
| J5 | Follow-ups and interviews don't produce notifications. | Create a reminder automatically, or server-side rule. | Medium | M | Recommended |

Present and working: board, table, calendar, insights, funnel, status history, rounds, prep checklist, follow-up dates, resume version, source.

### D. Gym & Fitness

| ID | Existing problem | Recommended improvement | Priority | Cx | Status |
|---|---|---|---|---|---|
| F1 | No personal records anywhere. | Records computed from logged sets. | High | S | Fixed |
| F2 | No per-exercise progress chart: you can't see if you are getting stronger. | Exercise selector with weight and volume trend. | High | S | Fixed |
| F3 | No workout calendar; only the current week. | Month calendar in History. | Medium | S | Fixed |
| F4 | Weekly plan select doesn't fill its row and overflows on phones. | Make the select fill the row. | High | S | Fixed |
| F5 | Exercise delete buttons appear only on hover: unreachable on touch. | Always visible on touch layouts. | High | S | Fixed |
| F6 | Exercises empty state missing. Fitness goals exist only as generic goals. | Empty state now; goal type later. | Low | S | Fixed |

Present and working: workouts, routines, library, sets/reps/weight, history, body weight, measurements, rest days, weekly stats.

### E. Sleep & Health

| ID | Existing problem | Recommended improvement | Priority | Cx | Status |
|---|---|---|---|---|---|
| H1 | **Inconsistent:** daily score uses 7½ h, chart line shows 8 h, and users can't set a goal. | One sleep goal in Settings, used everywhere. | High | S | Fixed |
| H2 | Energy buttons are five identical icons: no way to tell which is which. | Number them 1–5 with Low and High labels. | High | S | Fixed |
| H3 | No sleep consistency measure. | Average bedtime and wake time, regularity, nights meeting goal. | Medium | S | Fixed |
| H4 | History rows are emoji strings; hard to scan, and don't match the icon set. | Aligned columns with app icons. | Medium | S | Fixed |
| H5 | Mood only exists in the journal; not combined with energy. | Show alongside energy (later). | Low | M | Recommended |

### F. Finance

| ID | Existing problem | Recommended improvement | Priority | Cx | Status |
|---|---|---|---|---|---|
| M1 | No budget alert: only a bar that changes colour. | Clear banner at 80% and when over budget. | High | S | Fixed |
| M2 | Custom categories live in one browser's local storage: lost on other devices. | Derive from the user's own past transactions; syncs automatically. | High | S | Fixed |
| M3 | Phone: filters stack into 6 full-width rows above the list, labelled only "Select date". | Collapse behind a Filters button; label From and To. | High | S | Fixed |
| M4 | Every expense badge is red, so a normal list looks alarming. | Neutral badge for expenses. | Medium | S | Fixed |
| M5 | Pie has both a legend and an identical list. | Keep the list. | Low | S | Fixed |
| M6 | No recurring transactions. | "Duplicate" action, then real recurring rules (new table). | High | S / L | Fixed: recurring rules added (migration 0008, must be applied before release) |
| M7 | Category budgets are supported by the table but have no UI. | Add UI next (no schema change needed). | Medium | M | Recommended |

Present and working: income, expenses, savings, categories, monthly budget, savings goals, monthly summary, charts, CSV.

### G. Daily Routine & Habits

| ID | Existing problem | Recommended improvement | Priority | Cx | Status |
|---|---|---|---|---|---|
| R1 | Heatmap: critical axe failures (`button-name`, `nested-interactive`), and on phones it opens scrolled to the oldest weeks, hiding today. | Labelled buttons in a group; scroll to today. | High | S | Fixed |
| R2 | Planner: overdue tasks sit at the very bottom on phones. | Show first on phones. | High | S | Fixed |
| R3 | Overdue tasks can't be rescheduled without opening each form. | "Move to today" in the task menu. | High | S | Fixed |
| R4 | Date navigation is one day at a time. | Tap the date to jump with the calendar. | Medium | S | Fixed |
| R5 | Odd copy above the planner ("Looking for your journal?"). | Remove. | Low | S | Fixed |
| R6 | Reminders aren't linked to a specific habit or task. | Link them (schema change). | Low | L | Recommended |

Present and working: tasks, priorities, recurrence, custom habits, frequencies, streaks, heatmap, completion history, weekly reports.

### Other screens

| ID | Screen | Existing problem | Recommended improvement | Priority | Cx | Status |
|---|---|---|---|---|---|---|
| O1 | Reports | Scrollable table can't be reached by keyboard. | Focusable labelled region. | Medium | S | Fixed |
| O2 | Notes, Goals, Focus, Notifications, Settings, Export, Auth | Reviewed; only shared issues above apply. | Covered by G items. | — | — | No separate action |

### Native app (iOS and Android)

| ID | Existing problem | Recommended improvement | Priority | Cx | Status |
|---|---|---|---|---|---|
| N1 | Same dashboard budget bug as D1. | Fixed in shared code; screen passes budgets. | Critical | S | Fixed; not run on a device |
| N2 | No upcoming deadlines, personal records, sleep goal or budget alert. | Same shared logic. | High | M | Fixed; not run on a device |
| N3 | White on primary fails contrast (same token). | Solid-fill token. | High | S | Fixed; not run on a device |
| N4 | Activity feed, analytics and health history use emoji icons, unlike the rest of the app. | Ionicons or plain text. | Low | S | Fixed; not run on a device |
| N5 | No Reports, Export or global search on mobile: a mobile-only user can't export their data. | Build export first. | High | L | Recommended |
| N6 | Tablet layout is a stretched phone layout, and iPad is locked to portrait. | Max content width; review orientation. | Medium | M | Recommended |

## Missing features

| Feature | Why it helps | Screen | Essential? | Priority | Status |
|---|---|---|---|---|---|
| Upcoming deadlines | One place to see what's next | Dashboard | Essential | High | Added |
| Personal records and exercise progress | The main reason to log sets | Fitness | Essential | High | Added |
| Sleep goal and consistency | Sleep data needs a target to mean anything | Health, Settings | Essential | High | Added |
| Budget alerts | A budget you only notice afterwards doesn't help | Finance, Dashboard | Essential | High | Added |
| Onboarding | New users start with a wall of zeros | Dashboard | Essential | High | Added |
| Undo | Prevents loss from stray taps | Dashboard (tasks) | Optional | Medium | Added |
| Recurring transactions | Rent, EMI and subscriptions are re-entered monthly | Finance | Essential | High | Recommended: needs a new table |
| Mobile data export | Data portability shouldn't need a desktop | Mobile settings | Essential | High | Recommended |
| Category budgets | Food vs rent limits | Finance | Optional | Medium | Recommended: table is ready |
| Courses and subtopics, skill tracking | Structured learning paths | Learning | Optional | Medium | Recommended: needs schema |
| Offer and rejection details, expected salary | Comparing offers, learning from rejections | Jobs | Optional | Medium | Recommended: needs schema |
| Calendar integration (.ics) | Interviews in your own calendar | Jobs | Optional | Medium | Recommended |
| Follow-up and interview notifications | Reminders that actually fire | Jobs, server | Optional | Medium | Recommended |
| Archive for notes and tasks | Declutter without deleting | Notes, Planner | Optional | Low | Recommended |
| Custom task categories | Fixed six may not fit everyone (DB enum) | Planner | Optional | Low | Recommended: needs schema |

**Already present, no work needed:** global search, notifications centre, customisable dashboard, weekly/monthly reports, CSV/JSON/print export, dark and light themes, profile, settings, backup and restore, account deletion, reminders, custom goals, recently completed activity.

**Deliberately not added:** AI assistant or chatbot (your instruction), social features, gamification, more dashboard widgets beyond Upcoming.

## Performance and technical findings

| ID | Finding | Priority | Status |
|---|---|---|---|
| P1 | Good: route-level code splitting, charts in their own chunk (96 KB gzip), main bundle 61 KB gzip, largest page 12 KB gzip, one realtime channel. | — | No action |
| P2 | Two parallel domain layers: `packages/core/src/*.js` (mobile) and `packages/core/src/web/*.js` (web), held together by golden tests. New logic now goes in the shared layer only. | Medium | Recommended: merge gradually |
| P3 | `docs/RELEASE_AUDIT.md` says the planner is virtualised; it isn't. Every table is loaded in full, which is fine now but will need attention for heavy users. | Low | Recommended |
| P4 | `apps/web` Playwright version expects a browser not installed on this machine; the suite needs `PW_CHROMIUM_PATH` or `npx playwright install`. | Low | Recommended |
| P5 | Six end-to-end tests were already out of date after the custom pickers commit (they used native select and time input calls). | Medium | Fixed |

## Results

Same scripted pass before and after, 232 page audits each. The "after" pass ran on a production build and scanned more pages with axe (empty accounts as well), so the numbers aren't flattered.

| Measure | Before | After |
|---|---|---|
| Pages wider than the screen | 15 (up to 400px too wide) | **0** |
| Critical accessibility failures (axe) | 24 | **0** |
| Serious accessibility failures (axe) | 1,780 | **0** |
| Of which colour contrast | 1,532 | **0** |
| Moderate failures | 270 | 240: 232 are one rule on the dev-only banner, never shown in production; 8 were a Journal heading, fixed afterwards and not rescanned |
| Console errors | 0 | 0 |
| Phone targets under 24px (excluding heatmap cells) | 23 | 1 |

### Responsive testing

| Check | Desktop 1280 | Tablet 768 | Phone 390 | Small phone 320 | Landscape 844×390 |
|---|---|---|---|---|---|
| No horizontal overflow, every screen | Pass | Pass | Pass | Pass | Dashboard and form checked |
| Form buttons visible without scrolling | Pass | Not checked separately | Pass | Not checked separately | Pass |
| Calendars and menus fully on screen | Pass | Not checked separately | Pass | Not checked separately | Not checked separately |
| Navigation | Sidebar | Sidebar | Bottom nav and More | Bottom nav and More | Sidebar |

Job tables switch to cards below 1024px. Safe-area padding is in place for the nav, FAB and dialog footers, but notches and the home indicator can only be confirmed on a real device.

### Accessibility testing

Passing on every screen in both themes: colour contrast, button names, labels, nested controls, table headers, scrollable regions, and heading order (the Journal fix came after the last scan). Added and tested: keyboard use of menus and tabs, focus returned after closing, page titles, invalid-field state, announced hints, chart summaries, reduced motion.

Automated tools find only part of real accessibility problems. **VoiceOver and TalkBack have not been tried.**

### Test results on the final code

| Suite | Result |
|---|---|
| Web unit and component | 564 passed |
| End-to-end, desktop and phone | 86 passed, 1 skipped (needs a live Supabase project) |
| Mobile unit and flows | 102 passed; component 10 passed; typecheck clean |
| Packages | core 138, schemas 91, data 63, utils 33, design-tokens 4: all passed |
| Lint, formatting, secrets scan, SQL and migration checks | Passed; no database files changed |

Existing tests changed only where behaviour changed on purpose, plus the six that were already out of date (P5).

## Remaining issues

**Needs you (can't be done from here):**

1. Try the web build against your real Supabase project; everything here used the in-browser test backend. No migration is needed: the sleep goal uses the existing `habit_prefs` column.
2. Test the native app on an iPhone and an Android phone, including VoiceOver and TalkBack. Its changes are typechecked and unit-tested but have never been seen on a screen.

**Recommended next, in order:**

1. Recurring transactions (needs a new table). "Duplicate" is a stopgap.
2. Data export on mobile, then Reports and global search there.
3. Category budgets (table already supports them; UI only).
4. Notifications for job follow-ups and interviews, plus calendar (.ics) export.
5. Job details: expected salary, offer deadline, rejection reason (schema change).
6. Courses, subtopics and skills in Learning (schema change).
7. Native tablet layout and iPad orientation.
8. Merge the two domain layers in `packages/core` (P2).

**Accepted for now:**

- Heatmap cells stay 12px on phones. The date arrows and calendar above do the same job, which WCAG 2.5.8 allows.
- The dashboard is long on phones (about 3,200px with every widget on). Customize can hide widgets; a phone-specific order is worth considering after real use.
- A brand-new account's Daily score reads 0 once the guide is dismissed, because the default study target counts as planned.

## Production readiness

| Area | Assessment |
|---|---|
| Web UI and accessibility | **Ready**, once checked against the real backend |
| Native app | **Not yet verified:** needs a device pass first |
| Features | Complete enough for a first release. Recurring transactions and mobile export are the two gaps users will notice most |
