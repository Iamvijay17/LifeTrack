import type { ExpoConfig } from 'expo/config'

// Only PUBLIC values are read here (EXPO_PUBLIC_*). Never put a service-role key in a client app.
const IOS_BUNDLE_ID = process.env.APP_IOS_BUNDLE_ID ?? 'com.aatralex.lifetrack'
const ANDROID_PACKAGE = process.env.APP_ANDROID_PACKAGE ?? 'com.aatralex.lifetrack'
const BRAND = '#8B5CF6'
const DARK = '#09090B'

const config: ExpoConfig = {
  name: 'LifeTrack',
  slug: 'lifetrack',
  scheme: 'lifetrack',
  version: '1.0.0',
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
    'expo-dev-client',
    ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 180, resizeMode: 'contain', backgroundColor: '#FAFAFA', dark: { image: './assets/splash-icon.png', backgroundColor: DARK } }],
    ['expo-notifications', { icon: './assets/notification-icon.png', color: BRAND, defaultChannel: 'reminders' }],
  ],
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    // Created by `eas init`; push tokens need it. Not a secret.
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
}
export default config
