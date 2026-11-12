import type { ExpoConfig } from 'expo/config'

// Only PUBLIC values are read here (EXPO_PUBLIC_*). Never put a service-role key in a client app.
const IOS_BUNDLE_ID = process.env.APP_IOS_BUNDLE_ID ?? 'com.aatralex.lifetrack'
const ANDROID_PACKAGE = process.env.APP_ANDROID_PACKAGE ?? 'com.aatralex.lifetrack'
const EAS_PROJECT_ID_FALLBACK = '71dc873a-64a1-49a8-bc56-6a0500fe5355'
const BRAND = '#8B5CF6'
const DARK = '#09090B'

// A production build without the EAS project id would ship an app that can never obtain push tokens. Fail the build instead.
if (process.env.EAS_BUILD_PROFILE === 'production') {
  for (const name of ['EAS_PROJECT_ID', 'EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY', 'EXPO_PUBLIC_WEB_URL']) {
    if (!process.env[name]) throw new Error(`${name} is not set for the production build (see docs/NATIVE.md).`)
  }
  if (/service[_-]?role|sb_secret_/i.test(`${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`)) throw new Error('A secret key was supplied as the public Supabase key.')
}

const config: ExpoConfig = {
  name: 'LifeTrack',
  slug: 'lifetrack',
  scheme: 'lifetrack',
  version: '2.6.0',
  // Native-compatibility fingerprint. Over-the-air JS updates are NOT enabled (no expo-updates yet): every change ships through a store build.
  runtimeVersion: { policy: 'appVersion' },
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  backgroundColor: DARK,
  icon: './assets/icon.png',
  ios: {
    bundleIdentifier: IOS_BUNDLE_ID,
    supportsTablet: true,
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    package: ANDROID_PACKAGE,
    softwareKeyboardLayoutMode: 'resize',
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', monochromeImage: './assets/adaptive-icon-monochrome.png', backgroundColor: DARK },
    // FCM credentials for Android push. Supplied as an EAS *file* secret (GOOGLE_SERVICES_JSON); never committed.
    ...(process.env.GOOGLE_SERVICES_JSON ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON } : {}),
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    // Fingerprint / face unlock for the app lock. iOS refuses a biometric-protected Keychain item without NSFaceIDUsageDescription; Android needs USE_BIOMETRIC.
    ['expo-local-authentication', { faceIDPermission: 'LifeTrack uses Face ID to unlock the app, so you do not have to type your PIN.' }],
    'expo-dev-client',
    ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 180, resizeMode: 'contain', backgroundColor: '#FAFAFA', dark: { image: './assets/splash-icon.png', backgroundColor: DARK } }],
    ['expo-notifications', { icon: './assets/notification-icon.png', color: BRAND, defaultChannel: 'reminders' }],
  ],
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    // Created by `eas init`; push tokens need it. Not a secret, so the committed id is the fallback for local/dev builds.
    eas: { projectId: process.env.EAS_PROJECT_ID ?? EAS_PROJECT_ID_FALLBACK },
  },
}
export default config
