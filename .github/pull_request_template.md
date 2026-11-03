## What and why
<!-- One or two sentences. Link the issue if there is one. -->

## How it was tested
<!-- Commands you ran and what they showed. "pnpm verify" runs the whole local gate. -->

## Checklist
- [ ] Web behaviour is preserved, or the change is called out above
- [ ] Shared logic lives in `packages/*` (not copied between web and mobile)
- [ ] Database change? It is a **new migration** (never an edit of an old one), `pnpm sql:build` was re-run, and a new table has RLS + a fixture in `supabase/tests/pglite/fixtures.ts`
- [ ] Migration is additive. If it is not, it has a `-- lifetrack:allow-destructive <reason>` marker, a backup plan and is flagged here
- [ ] No service-role or other secret key in client code, env examples or logs (`pnpm check:secrets`)
- [ ] No AI-assistant features or APIs
- [ ] Money stays in integer paise; dates stay `yyyy-MM-dd` strings in the user's timezone
- [ ] Docs updated if setup, commands or behaviour changed

## Risks / follow-ups
<!-- Anything reviewers should look at twice, or work deliberately left for later. -->
