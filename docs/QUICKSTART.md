# 10-minute setup (₹0)

1. supabase.com → New project (free). Wait for it to finish.
2. **SQL Editor → New query** → paste all of `supabase/setup-all.sql` → **Run**. Expect "Success". (Already set up before? Run only `supabase/migrations/0003_focus_notes_goals_reminders.sql`.)
3. **Project Settings → API** → copy _Project URL_ and _anon public key_.
4. Deploy: vercel.com → Import this GitHub repo → add env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` → Deploy.
5. Supabase → **Authentication → URL Configuration**: Site URL = your Vercel URL; add `<your-url>/reset-password` to Redirect URLs.
6. Open your URL → Create account (turn off "Confirm email" in Authentication → Providers → Email if you don't want the email step).
7. Supabase → Authentication → Sign In / Providers → turn **off** "Allow new users to sign up" (so only you can use it).
8. Phone: open the URL in Chrome → menu → Add to Home screen. Laptop: Chrome/Edge → Install app.
9. Test sync: add a task on laptop → it appears on phone.
10. Monthly: Settings → Export JSON backup.
