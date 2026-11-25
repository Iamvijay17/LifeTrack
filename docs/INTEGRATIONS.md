# Integration Center (Google Calendar and Google Drive)

**Status: built and tested against a simulated Google, NOT yet tested against a real Google account.** There are no Google credentials in this repository,
so nothing here has talked to Google. Until you complete the setup below, the Integrations page says "not set up on this server yet" and the Connect
buttons are disabled; it never shows a connection it does not have.

## What it does

| | Google Calendar | Google Drive |
| --- | --- | --- |
| Permission asked | `calendar.events`, `calendar.calendarlist.readonly` (+ `openid email` to show the account) | `drive.file` only: files LifeTrack itself creates (+ `openid email`) |
| Actions | Pick a calendar; **Sync now** imports new Google events, sends new LifeTrack events, copies one-sided edits | **Back up now** (always asks first), list backups, download one |
| Safety | Never deletes. A change made on both sides is a **conflict**: neither is overwritten until you pick one. Events are linked by id and tagged, so none is created twice. A repeating Google event arrives as one LifeTrack event per occurrence in the window; a repeating LifeTrack event is sent to Google once as a real repeating event | Uploads only when you press the button, into a "LifeTrack Backups" folder. Download works only for files in that folder |
| Revoked access | Detected on the next call: token deleted, status "Access revoked", activity entry, **Connect again** offered | same |
| Disconnect | Asks Google to revoke, deletes the stored token and the connection. Your data on either side stays | same |

Not covered: edits to a single occurrence of a LifeTrack series (and its cancelled dates) are not sent, changes to a series on Google are not pulled back, automatic/scheduled sync or backups (everything is on demand), restoring a Drive backup in one click (you download it,
then use Data Export → Restore), more than one Google account per provider.

## One-time setup

1. **Google Cloud** → create a project → *APIs & Services* → enable **Google Calendar API** and **Google Drive API**.
2. *OAuth consent screen*: add the scopes above. While in "Testing", add yourself as a test user (a refresh token then lasts 7 days; publish the app for longer).
3. *Credentials* → **OAuth client ID** → type *Web application*. Authorized redirect URI:
   `https://<project-ref>.supabase.co/functions/v1/google-oauth-callback`
4. Set the secrets (never in the web app, never in git):

   ```bash
   supabase secrets set GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… \
     OAUTH_STATE_SECRET="$(openssl rand -base64 48)" APP_ORIGIN=https://your-app-origin
   ```
5. Run migration `0026_integrations.sql` (and `0024`, `0025` if not yet run).
6. Deploy:

   ```bash
   supabase functions deploy google-integration
   supabase functions deploy google-oauth-callback --no-verify-jwt
   ```
7. Open **Integrations**, connect, and try a sync / backup. **Report anything that fails**: this path has only been exercised against a fake Google.

## Security notes

- OAuth 2.0 authorization-code flow with a server-side client secret. `state` is an HMAC-signed, 10-minute token naming the person and provider; a forged or expired one is refused.
- Tokens live in `integration_tokens`: row-level security on, **no policy, all client roles revoked**. Only the Edge Functions (service role) can read them; the browser and the app never see one. They are stored as plain text in that locked table; if you need encryption at rest, put them in Supabase Vault.
- `integrations` and `integration_events` are readable by their owner and writable by no client, so a page cannot mark itself connected.
- The function answers only to `APP_ORIGIN`, requires a valid session, and returns short messages: no tokens, Google response bodies or stack traces. The activity log never contains tokens or file contents.
- `include_granted_scopes=false`: only the scopes above, never what other apps were once granted.
- Demo mode blocks every integration call.
- `npm run check:secrets` must keep passing: no credential belongs in the repository.

## Files

`supabase/migrations/0026_integrations.sql` · `supabase/functions/google-integration/` · `google-oauth-callback/` · `_shared/google.js`, `calendarSync.js`, `googleStore.js` ·
`apps/web/src/services/integrations.js` · `apps/web/src/features/integrations/` · tests: `packages/core/tests/google-integration.test.js`, `apps/web/tests/integrations.test.jsx`, `supabase/tests/pglite/integrations.test.ts`.
