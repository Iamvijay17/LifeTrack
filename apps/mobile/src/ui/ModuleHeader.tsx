import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '../providers/ThemeProvider'
import { Txt } from './index'

/** Title row for screens opened from "More": back button + title + optional action. */
export function ModuleHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  const router = useRouter()
  const { colors } = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/more'))} hitSlop={8}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -8 }}>
        <Text style={{ color: colors.primary, fontSize: 28 }}>‹</Text>
      </Pressable>
      <View style={{ flex: 1 }}><Txt variant="title" style={{ fontSize: 24 }}>{title}</Txt></View>
      {action}
    </View>
  )
}
