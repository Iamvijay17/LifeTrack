-- 0025: Profile photo. A small picture (the app shrinks it to ~160 px before saving) kept on the person's own profile row.
-- ADDITIVE: one nullable column. It lives on `profiles`, not in the auth user's metadata, because user metadata is copied into every access
-- token and a picture there would make each request header huge. profiles already has row-level security (a person reads and edits only their own row).
-- Only an inline image data URL of reasonable size is accepted.

alter table public.profiles
  add column if not exists avatar text
    check (avatar is null or (length(avatar) <= 60000 and avatar ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$'));
