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
import { Screen, Txt } from '../src/ui'

SplashScreen.preventAutoHideAsync().catch(() => {})

function Gate() {
  const { session, loading } = useAuth()
  const { colors, scheme } = useTheme()
  const router = useRouter()
  const url = Linking.useLinkingURL()
  useEffect(() => { if (!loading) SplashScreen.hideAsync().catch(() => {}) }, [loading])
  // A link opened while signed out (e.g. tapping a notification) is remembered, then followed once sign-in completes.
  useEffect(() => { if (!loading && !session) rememberPending(pathFromUrl(url)) }, [loading, session, url])
  useEffect(() => {
    if (!loading && session) {
      const target = takePending()
      if (target) setTimeout(() => router.push(target as never), 0) // after the protected stack has mounted
    }
  }, [loading, session, router])
  if (!isConfigured) {
    return (
      <Screen>
        <Txt variant="title">Not configured</Txt>
        <Txt muted>Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (see apps/mobile/.env.example), then restart the app.</Txt>
      </Screen>
    )
  }
  if (loading) return null // native splash stays visible while the stored session is read
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Protected guard={!!session}><Stack.Screen name="(app)" /></Stack.Protected>
        <Stack.Protected guard={!session}><Stack.Screen name="(auth)" /></Stack.Protected>
        {/* Deep-link targets must be reachable both signed in and out. */}
        <Stack.Screen name="auth-callback" />
        <Stack.Screen name="reset-password" />
      </Stack>
    </>
  )
}

export default function Root() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider><Gate /></AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
