import { Stack } from 'expo-router'
import { useTheme } from '../../src/providers/ThemeProvider'
import { RealtimeSync } from '../../src/providers/RealtimeSync'
import { ThemeSync } from '../../src/providers/ThemeSync'
import { NotificationsBootstrap } from '../../src/features/notifications/Bootstrap'
import { QuickActionsProvider } from '../../src/features/quick/QuickActions'

// A deep link straight to a module still has the tabs underneath it, so Back always has somewhere to go.
export const unstable_settings = { initialRouteName: '(tabs)' }

export default function AppLayout() {
  const { colors } = useTheme()
  return (
    <QuickActionsProvider>
      <RealtimeSync />
      <ThemeSync />
      <NotificationsBootstrap />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="(tabs)" />
        {/* module/* and sync-check are plain stack screens: native push animation, iOS swipe-back, Android hardware back. */}
      </Stack>
    </QuickActionsProvider>
  )
}
