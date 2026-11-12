import { useEffect } from 'react'
import { Stack, useRouter } from 'expo-router'
import * as Linking from 'expo-linking'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ThemeProvider, useTheme } from '../src/providers/ThemeProvider'
import { AuthProvider, useAuth } from '../src/providers/AuthProvider'
import { queryClient } from '../src/data/client'
import { isConfigured } from '../src/lib/supabase'
import { pathFromUrl, rememberPending, takePending } from '../src/lib/deepLinks'
import { LockScreen, SecurityUnavailable } from '../src/features/security/LockScreen'
import { ActivityCapture, SecurityProvider, useSecurity } from '../src/features/security/SecurityProvider'
import { Screen, Txt } from '../src/ui'

SplashScreen.preventAutoHideAsync().catch(() => {})

function Gate() {
  const { session, loading } = useAuth()
  const sec = useSecurity()
  const { colors, scheme } = useTheme()
  const router = useRouter()
  const url = Linking.useLinkingURL()
  // Signed in, but the server has not yet said whether this session is locked: show nothing (the native splash stays up). A flash of the app would be a leak.
  const waiting = !!session && (sec.status === 'idle' || sec.status === 'loading')
  const locked = !!session && sec.locked
  useEffect(() => { if (!loading && !waiting) SplashScreen.hideAsync().catch(() => {}) }, [loading, waiting])
  // A link opened while signed out (e.g. tapping a notification) is remembered, then followed once sign-in completes (and the app is unlocked).
  useEffect(() => { if (!loading && !session) rememberPending(pathFromUrl(url)) }, [loading, session, url])
  useEffect(() => {
    if (!loading && session && !waiting && !locked) {
      const target = takePending()
      if (target) setTimeout(() => router.push(target as never), 0) // after the protected stack has mounted
    }
  }, [loading, session, waiting, locked, router])
  if (!isConfigured) {
    return (
      <Screen>
        <Txt variant="title">Not configured</Txt>
        <Txt muted>Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (see apps/mobile/.env.example), then restart the app.</Txt>
      </Screen>
    )
  }
  if (loading || waiting) return null // native splash stays visible while the stored session is read and the lock state is fetched
  // The app lock. While the server says this session is locked, or cannot be asked, the app (every screen, the realtime channel, the reminder runner) is NOT
  // mounted at all: the lock screen replaces the whole navigator. Unlocking mounts it afresh, back at the home tab.
  if (session && sec.status === 'error') return <SecurityUnavailable message={sec.error} onRetry={sec.retry} />
  if (locked) return <LockScreen />
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <ActivityCapture>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Protected guard={!!session}><Stack.Screen name="(app)" /></Stack.Protected>
          <Stack.Protected guard={!session}><Stack.Screen name="(auth)" /></Stack.Protected>
          {/* Deep-link targets must be reachable both signed in and out. */}
          <Stack.Screen name="auth-callback" />
          <Stack.Screen name="reset-password" />
        </Stack>
      </ActivityCapture>
    </>
  )
}

export default function Root() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider><SecurityProvider><Gate /></SecurityProvider></AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
