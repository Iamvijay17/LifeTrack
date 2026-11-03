# Security policy

## Reporting a vulnerability
Email **[security contact email]** with a description, steps to reproduce and the affected platform (web, iOS, Android, database).
Please do not open a public issue for security problems and do not access data that is not yours while testing.
We aim to acknowledge reports within 3 working days and to fix confirmed high-severity issues as quickly as we can.

## Scope
The web app, the iOS/Android apps, the Supabase database policies and functions in `supabase/`, and the `send-reminders` Edge Function.

## Design notes for researchers
- Authorization is enforced in the database with Row Level Security on every user-owned table; the clients only ever hold the public anon key.
- The service-role key is never shipped in a client and no workflow in this repository uses it.
- `supabase/tests` contains the isolation tests (including cross-table foreign-key ownership and API-level checks).
