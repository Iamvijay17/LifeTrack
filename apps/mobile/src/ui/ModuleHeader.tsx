import { Pressable, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { MODULES } from '../lib/modules'
import { useTheme } from '../providers/ThemeProvider'
import { useAccent } from './accent'
import { FadeIn, IconTile } from './motion'
import { Txt } from './index'

const SETTINGS_ICON = 'settings-outline' as const

/** Title row for screens opened from "More": back button, the module's icon and title, and an optional action. */
export function ModuleHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  const router = useRouter()
  const { colors } = useTheme()
  const { name } = useAccent()
  const icon = MODULES.find((m) => m.slug === name)?.icon ?? SETTINGS_ICON
  return (
    <FadeIn y={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/more'))} hitSlop={8}
        style={{ width: 36, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -8 }}>
        <Ionicons name="chevron-back" size={24} color={colors.foreground} />
      </Pressable>
      <IconTile name={icon} size={36} />
      <View style={{ flex: 1 }}><Txt variant="title" style={{ fontSize: 22 }}>{title}</Txt></View>
      {action}
    </FadeIn>
  )
}
