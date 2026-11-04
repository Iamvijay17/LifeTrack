import { Stack, useSegments } from 'expo-router'
import { useTheme } from '../../src/providers/ThemeProvider'
import { RealtimeSync } from '../../src/providers/RealtimeSync'
import { ThemeSync } from '../../src/providers/ThemeSync'
import { NotificationsBootstrap } from '../../src/features/notifications/Bootstrap'
import { RecurringRunner } from '../../src/features/finance/RecurringRunner'
import { QuickActionsProvider } from '../../src/features/quick/QuickActions'
import { Accent, moduleForSegment } from '../../src/ui/accent'

// A deep link straight to a module still has the tabs underneath it, so Back always has somewhere to go.
export const unstable_settings = { initialRouteName: '(tabs)' }

export default function AppLayout() {
  const { colors } = useTheme()
  // Each screen wears its module's colour, the same as on the web.
  const segments = useSegments() as string[]
  const leaf = segments.at(-1)
  return (
    <Accent module={moduleForSegment(!leaf || leaf === '(tabs)' ? 'index' : leaf)}>
    <QuickActionsProvider>
      <RealtimeSync />
      <ThemeSync />
      <NotificationsBootstrap />
      <RecurringRunner />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="(tabs)" />
        {/* module/* and sync-check are plain stack screens: native push animation, iOS swipe-back, Android hardware back. */}
      </Stack>
    </QuickActionsProvider>
    </Accent>
  )
}
