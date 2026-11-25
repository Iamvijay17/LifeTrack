# Onboarding, guided tours and setup

First-run setup for new accounts, one-time guided tours per module, and a place in Settings to finish or replay either.

## How it works

- **State** lives in `user_settings.onboarding_state` (migration `0024_onboarding.sql`, additive) with a copy in this browser keyed by account
  (`lifetrack:onboarding:<user id>`). The screen reacts at once; the account copy is written ~400 ms later. If the migration has not been run,
  progress stays on the device and nothing breaks.
- **Who sees it:** the first time an account loads, `isNewAccount()` (no defaults seeded yet) starts onboarding (`status: in_progress`); an account that
  has been used before is marked `existing` and is never walked through a welcome. Status values: `in_progress`, `later`, `done`, `existing`.
- **Steps** (`lib/onboarding.js`): welcome → profile → modules → career & learning → fitness & wellness → finance → daily routine → dashboard look → confirm.
  Every step except welcome and confirm can be skipped. Answers are saved automatically as the person goes; Back/Next never lose them;
  "Do this later" (or Esc / ✕) closes without discarding; Settings → Setup & tours resumes at the same step.
- **Nothing is written until Finish**, and only answered fields are written (`planApply`), so skipping a step never overwrites an existing setting.
  Theme and accent preview live while choosing. "Modules" picks up to four favourites (pinned in the sidebar / phone bottom bar); it hides nothing.
- **Tours** (`lib/tours.js`): dashboard, learning, fitness, finance, calendar, settings. Each step points at page elements by CSS selector with
  fall-backs; when none is visible (e.g. the sidebar on a phone) the step is shown centred. Esc skips, ← → navigate. Completion/skip is stored
  per tour; each module's tour is *offered once* (a toast) the first time it is opened after setup, and can be started any time from the profile
  menu ("Tour: …") or Settings → Setup & tours, which also resets a tour.

## Files

| Concern | File |
| --- | --- |
| Steps, validation, answers → settings | `apps/web/src/lib/onboarding.js` |
| Store + account sync | `apps/web/src/hooks/useOnboarding.js` |
| The setup dialog | `apps/web/src/features/onboarding/OnboardingFlow.jsx` |
| Tour definitions, target lookup, placement | `apps/web/src/lib/tours.js` |
| Tour runner and one-time offers | `apps/web/src/features/tour/TourProvider.jsx` |
| Settings card | `apps/web/src/features/settings/SetupCard.jsx` |
| Tests | `tests/onboardingLogic.test.js`, `tests/onboardingFlow.test.jsx`, `supabase/tests/pglite/onboarding.test.ts` |

## Not covered yet

Selector-based tour steps are checked in jsdom for logic only; they have not been run through an end-to-end browser test.

## Tests and automation

New accounts see a modal, so automated runs set `localStorage['lifetrack:onboarding:skip'] = '1'` (Playwright's `storageState` in `playwright.config.js`, and `freshBackend()` in the component tests). It only changes what a brand-new, undecided account starts as. `e2e/onboarding.spec.js` opts out of it.
