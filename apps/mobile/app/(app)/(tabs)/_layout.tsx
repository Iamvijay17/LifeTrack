import type { ColorValue } from 'react-native'
import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../../src/providers/ThemeProvider'

const tab = (title: string, icon: React.ComponentProps<typeof Ionicons>['name']) => ({
  title,
  tabBarIcon: ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={icon} size={size} color={color as string} />,
})

/** The five primary destinations. Everything else is a stack screen pushed above these, so each platform gets its native back behaviour. */
export default function TabsLayout() {
  const { colors } = useTheme()
  return (
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
    </Tabs>
  )
}
