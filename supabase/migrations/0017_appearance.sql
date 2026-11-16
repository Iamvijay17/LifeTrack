-- 0017: Appearance — accent colour, text size, spacing, motion and sidebar layout follow the account across devices.
-- ADDITIVE: one jsonb column with an empty default, so every existing row keeps working and the app falls back to its built-in look.
-- user_settings already has row-level security (a person reads and edits only their own row), so no policy changes are needed.
-- Shape (validated in the app, packages/../apps/web/src/lib/appearance.js): {accent, custom_accent, font_size, density, motion, sidebar:{collapsed, order[], pinned[]}}

alter table public.user_settings
  add column if not exists appearance_prefs jsonb not null default '{}'::jsonb
    check (jsonb_typeof(appearance_prefs) = 'object');
