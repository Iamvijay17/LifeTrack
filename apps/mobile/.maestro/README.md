# Maestro device flows

End-to-end smoke flows for the native app. They need a **device or emulator with a development build** and a **real Supabase project**;
they cannot run in this repository's unit-test CI. `tests/maestroFlows.test.ts` keeps them honest without a device
(every on-screen text a flow taps or asserts must still exist in the app source).

## Run
1. Install Maestro: https://maestro.mobile.dev (`curl -Ls "https://get.maestro.mobile.dev" | bash`).
2. Install a build with Supabase configured (`pnpm --filter @lifetrack/mobile android` / `ios`, or an EAS development build).
3. Create a confirmed test user in your Supabase project (or disable email confirmation) — use a throwaway account, never a real one.
4. From `apps/mobile`:
   ```bash
   E2E_EMAIL=test@example.com E2E_PASSWORD='your-test-password' maestro test .maestro --env E2E_EMAIL=$E2E_EMAIL --env E2E_PASSWORD=$E2E_PASSWORD
   ```
Flows `02` and `03` use the shared sign-in helper, so they run signed in or out. Each flow cleans up what it creates.

Credentials are passed only as environment variables; none are stored in the flows.
