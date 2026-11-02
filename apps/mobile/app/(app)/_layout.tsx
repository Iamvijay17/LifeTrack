import type { ColorValue } from 'react-native'
import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../src/providers/ThemeProvider'
import { RealtimeSync } from '../../src/providers/RealtimeSync'

const tab = (title: string, icon: React.ComponentProps<typeof Ionicons>['name']) => ({
  title,
  tabBarIcon: ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={icon} size={size} color={color as string} />,
})

export default function AppLayout() {
  const { colors } = useTheme()
  return (
    <>
      <RealtimeSync />
      <Tabs screenOptions={{
        headerShown: false, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        sceneStyle: { backgroundColor: colors.background },
      }}>
        <Tabs.Screen name="index" options={tab('Dashboard', 'home-outline')} />
        <Tabs.Screen name="planner" options={tab('Planner', 'calendar-outline')} />
        <Tabs.Screen name="habits" options={tab('Habits', 'repeat-outline')} />
        <Tabs.Screen name="finance" options={tab('Finance', 'wallet-outline')} />
        <Tabs.Screen name="more" options={tab('More', 'ellipsis-horizontal')} />
        <Tabs.Screen name="module/[slug]" options={{ href: null }} />
        <Tabs.Screen name="module/focus" options={{ href: null }} />
        <Tabs.Screen name="module/learning" options={{ href: null }} />
        <Tabs.Screen name="module/goals" options={{ href: null }} />
        <Tabs.Screen name="module/health" options={{ href: null }} />
        <Tabs.Screen name="sync-check" options={{ href: null }} />
      </Tabs>
    </>
  )
}
