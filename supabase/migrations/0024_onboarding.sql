-- 0024: Onboarding, guided tours and first-use hints — progress follows the account across devices.
-- ADDITIVE: one jsonb column with an empty default, so every existing row keeps working (an empty object means "not decided yet").
-- user_settings already has row-level security (a person reads and edits only their own row), so no policy changes are needed.
-- Shape (validated in the app, apps/web/src/lib/onboarding.js): {status, step, answers{}, tours{key: 'done'|'skipped'}, offered{key: true}}

alter table public.user_settings
  add column if not exists onboarding_state jsonb not null default '{}'::jsonb
    check (jsonb_typeof(onboarding_state) = 'object');
