import { useEffect, useRef, useState } from 'react'
import { Animated, Pressable, Text, View } from 'react-native'
import { motion, moduleAccents } from '@lifetrack/design-tokens'
import { haptics } from '../lib/haptics'
import { useTheme } from '../providers/ThemeProvider'
import { moduleForSegment } from './accent'

const PILL_WIDTH = 52
/** The bottom tabs: a pill slides between destinations, and the active one wears its module's colour. */
export function LifeTabBar({ state, descriptors, emitter, navigateToTab, insets }: any) {
  const { colors, scheme } = useTheme()
  const [width, setWidth] = useState(0)
  const count = state.routes.length
  const slot = width / Math.max(1, count)
  const x = useRef(new Animated.Value(state.index)).current
  useEffect(() => {
    Animated.spring(x, { toValue: state.index, stiffness: motion.spring.stiffness, damping: motion.spring.damping, mass: 0.8, useNativeDriver: true }).start()
  }, [state.index]) // eslint-disable-line react-hooks/exhaustive-deps
  const active = moduleAccents[moduleForSegment(state.routes[state.index].name)]
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border, paddingBottom: insets?.bottom ?? 0, paddingTop: 6 }}>
      {width > 0 ? (
        <Animated.View pointerEvents="none" style={{
          position: 'absolute', top: 6, left: (slot - PILL_WIDTH) / 2, width: PILL_WIDTH, height: 30, borderRadius: 15, backgroundColor: active.from + '2E',
          transform: [{ translateX: x.interpolate({ inputRange: [0, Math.max(1, count - 1)], outputRange: [0, slot * Math.max(1, count - 1)] }) }],
        }} />
      ) : null}
      {state.routes.map((route: any, i: number) => {
        const { options } = descriptors[route.key]
        const focused = state.index === i
        const color = focused ? moduleAccents[moduleForSegment(route.name)].text[scheme] : colors.mutedForeground
        const onPress = () => {
          haptics.tap()
          // expo-router's tab bar hands over the navigator's emitter and navigateToTab, not a `navigation` object.
          const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
          if (!focused && !event.defaultPrevented) navigateToTab(route.key)
        }
        return (
          <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={options.title} onPress={onPress}
            onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })} style={{ flex: 1, alignItems: 'center', gap: 4, paddingBottom: 6, minHeight: 50 }}>
            <View style={{ height: 30, justifyContent: 'center' }}>{options.tabBarIcon?.({ focused, color, size: 22 })}</View>
            <Text numberOfLines={1} style={{ color, fontSize: 11, fontWeight: focused ? '600' : '500' }}>{options.title}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}
