# LifeTrack mobile (Expo SDK 58, Expo Router)

Shares business logic, data access, validation and design tokens with the web app through `packages/*`.

## Run locally
```bash
cp .env.example .env.local   # fill in the PUBLIC Supabase URL + anon key (never a service-role key)
pnpm install                 # from the repo root
pnpm --filter @lifetrack/mobile start
```
Native modules (SecureStore, dev client) need a **development build**, not Expo Go. The app lock's fingerprint / face unlock adds two more (`expo-local-authentication`, `expo-crypto`): rebuild the dev client after pulling it. The lock itself needs migration `0012_security.sql`; the fingerprint part also needs `0014_device_keys.sql` and `supabase functions deploy device-key` (see `docs/APP_SECURITY.md`).

See `docs/NATIVE.md` for push notifications, deep links, icons and the one-time backend setup.

## Builds (EAS) — you run these; they need your Expo login
```bash
npm i -g eas-cli && eas login
cd apps/mobile && eas init                       # creates the EAS project id
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value https://<ref>.supabase.co
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon-key>
eas build --profile development --platform android            # APK with dev client
eas build --profile development-simulator --platform ios      # iOS simulator build (no Apple account needed)
eas build --profile development --platform ios                # real iPhone (needs Apple Developer account)
```
Profiles: `development` (dev client, internal), `preview` (internal APK / ad-hoc iOS), `production` (store builds, auto-increment).
Override ids with `APP_IOS_BUNDLE_ID` / `APP_ANDROID_PACKAGE` (default `com.aatralex.lifetrack`).

## Supabase dashboard (one-time)
Authentication → URL Configuration → Redirect URLs: add `lifetrack://**` (and `exp+lifetrack://**` for dev-client builds).

## Verify without a device
```bash
pnpm --filter @lifetrack/mobile typecheck && pnpm --filter @lifetrack/mobile test
EXPO_PUBLIC_SUPABASE_URL=https://x.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=x pnpm --filter @lifetrack/mobile export   # Metro bundles Android + iOS
```
