import type { ColorValue } from 'react-native'
import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { LifeTabBar } from '../../../src/ui/TabBar'
import { useTheme } from '../../../src/providers/ThemeProvider'

type IconName = React.ComponentProps<typeof Ionicons>['name']
const tab = (title: string, icon: IconName, activeIcon: IconName) => ({
  title,
  tabBarIcon: ({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) => <Ionicons name={focused ? activeIcon : icon} size={size} color={color as string} />,
})

/** The five primary destinations. Everything else is a stack screen pushed above these, so each platform gets its native back behaviour. */
export default function TabsLayout() {
  const { colors } = useTheme()
  return (
    <Tabs tabBar={(props) => <LifeTabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}>
      <Tabs.Screen name="index" options={tab('Dashboard', 'home-outline', 'home')} />
      <Tabs.Screen name="planner" options={tab('Planner', 'calendar-outline', 'calendar')} />
      <Tabs.Screen name="habits" options={tab('Habits', 'repeat-outline', 'repeat')} />
      <Tabs.Screen name="finance" options={tab('Finance', 'wallet-outline', 'wallet')} />
      <Tabs.Screen name="more" options={tab('More', 'ellipsis-horizontal-outline', 'ellipsis-horizontal')} />
    </Tabs>
  )
}
