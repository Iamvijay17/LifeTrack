import { useEffect, useRef, type ReactNode } from 'react'
import { Animated, Pressable, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { haptics } from '../../lib/haptics'

/** The lock screens are always dark, like a vault, whatever the app theme (the web lock does the same). */
export const LOCK = {
  bg: '#07070a',
  panel: '#0b0b10',
  surface: 'rgba(255,255,255,0.07)',
  border: 'rgba(255,255,255,0.14)',
  text: '#FFFFFF',
  muted: 'rgba(255,255,255,0.62)',
  primary: '#8B5CF6',
  danger: '#F87171',
  success: '#34D399',
} as const

export type PinStatus = 'idle' | 'error' | 'success'

/** The PIN so far, as dots. 'error' shakes and turns red, 'success' turns green. Never shows the digits. */
export function PinDots({ length, filled, status = 'idle' }: { length: number; filled: number; status?: PinStatus }) {
  const shake = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (status !== 'error') return
    Animated.sequence([-12, 12, -9, 9, -5, 5, 0].map((x) => Animated.timing(shake, { toValue: x, duration: 55, useNativeDriver: true }))).start()
  }, [status, shake])
  const tint = status === 'error' ? LOCK.danger : status === 'success' ? LOCK.success : LOCK.primary
  return (
    <Animated.View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${filled} of ${length} digits entered`}
      accessibilityValue={{ min: 0, max: length, now: filled }}
      accessibilityLiveRegion="polite"
      style={{ flexDirection: 'row', gap: 16, alignItems: 'center', justifyContent: 'center', minHeight: 22, transform: [{ translateX: shake }] }}
    >
      {Array.from({ length }, (_, i) => {
        const on = i < filled || status === 'success'
        return <View key={i} style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: on || status !== 'idle' ? tint : LOCK.border, backgroundColor: on ? tint : 'transparent' }} />
      })}
    </Animated.View>
  )
}

const SIZE = { lg: 76, sm: 60 } as const

function Key({ label, children, onPress, onLongPress, disabled, size, ghost }: { label: string; children: ReactNode; onPress: () => void; onLongPress?: () => void; disabled?: boolean; size: keyof typeof SIZE; ghost?: boolean }) {
  const d = SIZE[size]
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => { haptics.tap(); onPress() }}
      onLongPress={onLongPress}
      style={({ pressed }) => ({ width: d, height: d, borderRadius: d / 2, alignItems: 'center', justifyContent: 'center', borderWidth: ghost ? 0 : 1, borderColor: LOCK.border, backgroundColor: ghost ? 'transparent' : pressed ? 'rgba(139,92,246,0.45)' : LOCK.surface, opacity: disabled ? 0.4 : 1 })}
    >
      {children}
    </Pressable>
  )
}

/** The 0-9 pad. `leftSlot` takes the bottom-left cell (the fingerprint button on the lock screen). */
export function PinKeypad({ onDigit, onBackspace, onClear, disabled, leftSlot, size = 'lg' }: { onDigit: (d: string) => void; onBackspace: () => void; onClear?: () => void; disabled?: boolean; leftSlot?: ReactNode; size?: keyof typeof SIZE }) {
  const digit = (d: string) => (
    <Key key={d} label={d} size={size} disabled={disabled} onPress={() => onDigit(d)}>
      <Text style={{ color: LOCK.text, fontSize: size === 'lg' ? 30 : 24, fontWeight: '500' }}>{d}</Text>
    </Key>
  )
  const row = (...ds: string[]) => <View style={{ flexDirection: 'row', gap: 22, justifyContent: 'center' }}>{ds.map(digit)}</View>
  const cell = SIZE[size]
  return (
    <View accessibilityLabel="PIN keypad" style={{ gap: 16, alignItems: 'center' }}>
      {row('1', '2', '3')}
      {row('4', '5', '6')}
      {row('7', '8', '9')}
      <View style={{ flexDirection: 'row', gap: 22, justifyContent: 'center' }}>
        <View style={{ width: cell, height: cell, alignItems: 'center', justifyContent: 'center' }}>{leftSlot}</View>
        {digit('0')}
        <Key label="Delete" size={size} ghost disabled={disabled} onPress={onBackspace} onLongPress={onClear}>
          <Ionicons name="backspace-outline" size={28} color={LOCK.muted} />
        </Key>
      </View>
    </View>
  )
}
