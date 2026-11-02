import type { ExpoConfig } from 'expo/config'

// Only PUBLIC values are read here (EXPO_PUBLIC_*). Never put a service-role key in a client app.
const IOS_BUNDLE_ID = process.env.APP_IOS_BUNDLE_ID ?? 'com.aatralex.lifetrack'
const ANDROID_PACKAGE = process.env.APP_ANDROID_PACKAGE ?? 'com.aatralex.lifetrack'

const config: ExpoConfig = {
  name: 'LifeTrack',
  slug: 'lifetrack',
  scheme: 'lifetrack',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  backgroundColor: '#09090B',
  ios: { bundleIdentifier: IOS_BUNDLE_ID, supportsTablet: true, infoPlist: { ITSAppUsesNonExemptEncryption: false } },
  android: { package: ANDROID_PACKAGE, softwareKeyboardLayoutMode: 'resize' },
  plugins: ['expo-router', 'expo-secure-store', 'expo-dev-client'],
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  },
}
export default config
