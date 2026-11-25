# Security policy

## Reporting a vulnerability
Email **[security contact email]** with a description, steps to reproduce and the affected platform (web, iOS, Android, database).
Please do not open a public issue for security problems and do not access data that is not yours while testing.
We aim to acknowledge reports within 3 working days and to fix confirmed high-severity issues as quickly as we can.

## Scope
The web app, the iOS/Android apps, the Supabase database policies and functions in `supabase/`, and the `send-reminders` and `webauthn` Edge Functions.

## Design notes for researchers
- Authorization is enforced in the database with Row Level Security on every user-owned table; the clients only ever hold the public anon key.
- The service-role key is never shipped in a client and no workflow in this repository uses it.
- `supabase/tests` contains the isolation tests (including cross-table foreign-key ownership and API-level checks).
- The optional app lock is enforced by the database per session (a restrictive policy on the most private tables), not by the interface; PINs are stored only as bcrypt hashes; fingerprint and face unlock use WebAuthn, so no biometric data ever reaches LifeTrack. What it does and does not protect is written down in `docs/APP_SECURITY.md`.
