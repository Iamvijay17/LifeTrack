import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions, type PressableProps, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg'
import { Ionicons } from '@expo/vector-icons'
import { motion, type ModuleName } from '@lifetrack/design-tokens'
import { drawCountable, hasCountable, parseCountable } from '@lifetrack/utils'
import { haptics } from '../lib/haptics'
import { useTheme } from '../providers/ThemeProvider'
import { useAccent } from './accent'

// LifeTrack's motion kit for native, using React Native's own Animated so it needs no extra native module. Transform and opacity run on the
// native thread (useNativeDriver), so they stay smooth on mid-range Android phones even while JavaScript is busy.

const EASE_OUT = Easing.bezier(motion.easeOut[0], motion.easeOut[1], motion.easeOut[2], motion.easeOut[3])
const SPRING = { stiffness: motion.spring.stiffness, damping: motion.spring.damping, mass: 0.8, useNativeDriver: true }

let reduced = false
const listeners = new Set<() => void>()
AccessibilityInfo.isReduceMotionEnabled?.().then((v) => { reduced = v; listeners.forEach((l) => l()) }).catch(() => {})
AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v) => { reduced = v; listeners.forEach((l) => l()) })
/** True when the person has asked their device for less motion. */
export const useReducedMotion = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => reduced)

/** Fades and rises in once, when it first appears. */
export function FadeIn({ children, delay = 0, y = 10, style }: { children: ReactNode; delay?: number; y?: number; style?: StyleProp<ViewStyle> }) {
  const off = useReducedMotion()
  const v = useRef(new Animated.Value(off ? 1 : 0)).current
  useEffect(() => {
    if (off) { v.setValue(1); return }
    Animated.timing(v, { toValue: 1, duration: motion.slow, delay, easing: EASE_OUT, useNativeDriver: true }).start()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [y, 0] }) }] }]}>{children}</Animated.View>
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)
/** A Pressable that gives under the finger. */
export function PressableScale({ scaleTo = 0.97, style, children, onPressIn, onPressOut, ...props }: Omit<PressableProps, 'style' | 'children'> & { scaleTo?: number; style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const v = useRef(new Animated.Value(1)).current
  const to = (toValue: number) => Animated.spring(v, { toValue, ...SPRING }).start()
  return (
    <AnimatedPressable {...props}
      onPressIn={(e) => { to(scaleTo); onPressIn?.(e) }}
      onPressOut={(e) => { to(1); onPressOut?.(e) }}
      style={[style, { transform: [{ scale: v }] }]}>
      {children}
    </AnimatedPressable>
  )
}

const FRAME_MS = 50 // 20 updates a second: counting reads as smooth, and several tiles at once don't load the JavaScript thread.
/** A value that counts up when it appears and when it changes, landing on exactly the given text ("₹12,345", "2h 30m", "3/5"). */
export function AnimatedNumber({ value, style }: { value: string | number; style?: StyleProp<TextStyle> }) {
  const text = String(value ?? '')
  const off = useReducedMotion() || process.env.NODE_ENV === 'test'
  const [shown, setShown] = useState(text)
  const prev = useRef<string | null>(null)
  useEffect(() => {
    const parts = parseCountable(text)
    const from = prev.current == null ? null : parseCountable(prev.current)
    const same = prev.current === text
    prev.current = text
    if (same || off || !hasCountable(parts)) { setShown(text); return }
    const started = Date.now()
    setShown(drawCountable(parts, from, 0))
    const id = setInterval(() => {
      const t = Math.min(1, (Date.now() - started) / motion.count)
      setShown(t >= 1 ? text : drawCountable(parts, from, 1 - (1 - t) ** 3))
      if (t >= 1) clearInterval(id)
    }, FRAME_MS)
    return () => clearInterval(id)
  }, [text, off])
  return <Text style={[{ fontVariant: ['tabular-nums'] }, style]}>{shown}</Text>
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle)
/** Circular progress in the module's colour. `value` is 0-100, or null when there is nothing to measure yet. */
export function ProgressRing({ value, size = 112, stroke = 10, colors: tint, label, children, module }: { value: number | null; size?: number; stroke?: number; colors?: [string, string]; label?: string; children?: ReactNode; module?: ModuleName }) {
  const { colors } = useTheme()
  const accent = useAccent(module)
  const [from, to] = tint ?? [accent.from, accent.to]
  const off = useReducedMotion()
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value))
  const v = useRef(new Animated.Value(off ? pct : 0)).current
  useEffect(() => {
    if (off) { v.setValue(pct); return }
    // Stroke offset is a property of the SVG, which the native driver can't reach.
    Animated.timing(v, { toValue: pct, duration: 900, easing: EASE_OUT, useNativeDriver: false }).start()
  }, [pct, off]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View accessible={!!label} accessibilityRole={label ? 'progressbar' : undefined} accessibilityLabel={label} accessibilityValue={label && value != null ? { min: 0, max: 100, now: Math.round(pct) } : undefined} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Defs><LinearGradient id="ring" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor={from} /><Stop offset="1" stopColor={to} /></LinearGradient></Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.muted} strokeWidth={stroke} fill="none" />
        {value != null && pct > 0 ? <AnimatedCircle cx={size / 2} cy={size / 2} r={r} stroke="url(#ring)" strokeWidth={stroke} strokeLinecap="round" fill="none" strokeDasharray={c} strokeDashoffset={v.interpolate({ inputRange: [0, 100], outputRange: [c, 0] })} /> : null}
      </Svg>
      {children ? <View style={{ position: 'absolute', alignItems: 'center' }}>{children}</View> : null}
    </View>
  )
}

/** A gradient that fills its parent. */
export function Gradient({ from, to, style }: { from: string; to: string; style?: StyleProp<ViewStyle> }) {
  return (
    <Svg pointerEvents="none" style={[StyleSheet.absoluteFill, style]} width="100%" height="100%">
      <Defs><LinearGradient id="fill" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor={from} /><Stop offset="1" stopColor={to} /></LinearGradient></Defs>
      <Rect width="100%" height="100%" fill="url(#fill)" />
    </Svg>
  )
}

type IconName = React.ComponentProps<typeof Ionicons>['name']
/** A module's icon on its gradient tile. */
export function IconTile({ name, size = 40, module, soft }: { name: IconName; size?: number; module?: ModuleName; soft?: boolean }) {
  const a = useAccent(module)
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: soft ? a.from + '24' : undefined }}>
      {soft ? null : <Gradient from={a.from} to={a.to} />}
      <Ionicons name={name} size={size * 0.5} color={soft ? a.text : '#FFFFFF'} />
    </View>
  )
}

/** The feature card at the top of a screen, lit from two corners by the module's colour. */
export function Hero({ children, module, style }: { children: ReactNode; module?: ModuleName; style?: StyleProp<ViewStyle> }) {
  const { colors, radius } = useTheme()
  const a = useAccent(module)
  return (
    <View style={[{ backgroundColor: colors.card, borderRadius: radius.xxl, borderWidth: 1, borderColor: colors.border, padding: 18, overflow: 'hidden' }, style]}>
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <RadialGradient id="a" cx="10%" cy="0%" r="75%"><Stop offset="0" stopColor={a.from} stopOpacity={0.26} /><Stop offset="1" stopColor={a.from} stopOpacity={0} /></RadialGradient>
          <RadialGradient id="b" cx="95%" cy="100%" r="70%"><Stop offset="0" stopColor={a.to} stopOpacity={0.18} /><Stop offset="1" stopColor={a.to} stopOpacity={0} /></RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#a)" />
        <Rect width="100%" height="100%" fill="url(#b)" />
      </Svg>
      {children}
    </View>
  )
}

/** The check-off circle. Springs when ticked, with a little tap on the device. */
export function CheckCircle({ done, onPress, label, color, size = 26, disabled }: { done: boolean; onPress: () => void; label: string; color?: string; size?: number; disabled?: boolean }) {
  const { colors } = useTheme()
  const a = useAccent()
  const tint = color ?? a.from
  const v = useRef(new Animated.Value(done ? 1 : 0)).current
  useEffect(() => { Animated.spring(v, { toValue: done ? 1 : 0, stiffness: 520, damping: 18, mass: 0.8, useNativeDriver: true }).start() }, [done]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <PressableScale accessibilityRole="checkbox" accessibilityState={{ checked: done, disabled: !!disabled }} accessibilityLabel={label} disabled={disabled} hitSlop={8} scaleTo={0.88}
      onPress={() => { if (!done) haptics.success(); else haptics.tap(); onPress() }}
      style={{ minWidth: Math.max(44, size), minHeight: Math.max(44, size), alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.6 : 1 }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: color ?? (done ? tint : colors.mutedForeground), alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: tint, opacity: v, transform: [{ scale: v }] }} />
        <Animated.View style={{ opacity: v, transform: [{ scale: v }] }}><Ionicons name="checkmark" size={size * 0.68} color="#FFFFFF" /></Animated.View>
      </View>
    </PressableScale>
  )
}

/** A soft loading placeholder that breathes. */
export function Skeleton({ height = 16, width = '100%', radius = 8, style }: { height?: number; width?: number | `${number}%`; radius?: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme()
  const off = useReducedMotion()
  const v = useRef(new Animated.Value(0.5)).current
  useEffect(() => {
    if (off) return
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0.5, duration: 700, useNativeDriver: true }),
    ]))
    loop.start()
    return () => loop.stop()
  }, [off]) // eslint-disable-line react-hooks/exhaustive-deps
  return <Animated.View style={[{ height, width, borderRadius: radius, backgroundColor: colors.muted, opacity: v }, style]} />
}

const PIECES = 36
const CONFETTI = ['#8B5CF6', '#6366F1', '#22C55E', '#F59E0B', '#EC4899', '#38BDF8', '#FAFAFA']
/** Confetti for real achievements. `fire()` to burst; render `node` once at the top of the screen. */
export function useConfetti() {
  const off = useReducedMotion()
  const { width, height } = useWindowDimensions()
  const [shot, setShot] = useState(0)
  const node = shot ? <ConfettiBurst key={shot} width={width} height={height} onDone={() => setShot(0)} /> : null
  return { node, fire: () => { haptics.success(); if (!off) setShot((s) => s + 1) } }
}
function ConfettiBurst({ width, height, onDone }: { width: number; height: number; onDone: () => void }) {
  const t = useRef(new Animated.Value(0)).current
  const pieces = useRef(Array.from({ length: PIECES }, (_, i) => ({
    x: width / 2 + (Math.random() - 0.5) * width * 0.9,
    rise: 60 + Math.random() * 160,
    fall: height * (0.4 + Math.random() * 0.45),
    size: 5 + Math.random() * 5,
    spin: `${(Math.random() > 0.5 ? 1 : -1) * (180 + Math.random() * 540)}deg`,
    color: CONFETTI[i % CONFETTI.length],
  }))).current
  useEffect(() => { Animated.timing(t, { toValue: 1, duration: 1500, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(onDone) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => (
        <Animated.View key={i} style={{
          position: 'absolute', left: p.x, top: height * 0.3, width: p.size, height: p.size / 2, backgroundColor: p.color,
          opacity: t.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] }),
          transform: [
            { translateY: t.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, -p.rise, p.fall] }) },
            { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', p.spin] }) },
          ],
        }} />
      ))}
    </View>
  )
}
