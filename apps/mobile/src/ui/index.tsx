import { useState, type ReactNode } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme } from '../providers/ThemeProvider'
import { FadeIn, Gradient, PressableScale } from './motion'

/** Safe-area aware screen. `scroll` + keyboard avoidance keep inputs visible on both platforms. */
export function Screen({ children, scroll = true, edges = ['top', 'left', 'right'] as const, style }: { children: ReactNode; scroll?: boolean; edges?: readonly ('top' | 'bottom' | 'left' | 'right')[]; style?: ViewStyle }) {
  const { colors, spacing } = useTheme()
  const inner = scroll
    ? <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, flexGrow: 1 }}><FadeIn style={{ gap: spacing.md, flexGrow: 1 }}>{children}</FadeIn></ScrollView>
    : <View style={{ flex: 1, padding: spacing.lg, gap: spacing.md }}>{children}</View>
  return (
    <SafeAreaView edges={[...edges]} style={[{ flex: 1, backgroundColor: colors.background }, style]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>{inner}</KeyboardAvoidingView>
    </SafeAreaView>
  )
}

export function Txt({ children, variant = 'body', muted, style }: { children: ReactNode; variant?: 'title' | 'heading' | 'body' | 'small'; muted?: boolean; style?: object }) {
  const { colors } = useTheme()
  return <Text style={[styles[variant], { color: muted ? colors.mutedForeground : colors.foreground }, style]}>{children}</Text>
}

export function Button({ title, onPress, loading, variant = 'primary', disabled }: { title: string; onPress: () => void; loading?: boolean; variant?: 'primary' | 'ghost' | 'danger'; disabled?: boolean }) {
  const { colors, radius } = useTheme()
  const fg = variant === 'ghost' ? colors.foreground : colors.primaryForeground
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }} disabled={disabled || loading} onPress={onPress}
      style={{ minHeight: 48, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: variant === 'danger' ? colors.dangerSolid : variant === 'ghost' ? colors.card : colors.primarySolid, opacity: disabled || loading ? 0.6 : 1, borderWidth: variant === 'ghost' ? 1 : 0, borderColor: colors.border, paddingHorizontal: 16 }}>
      {variant === 'primary' ? <Gradient from="#7C3AED" to="#6246EA" /> : null}
      {loading ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontWeight: '600', fontSize: 16 }}>{title}</Text>}
    </PressableScale>
  )
}

/** Ref type for a Field's input (use with `inputRef` to move focus with the return key). */
export type InputRef = React.ComponentRef<typeof TextInput>
export function Field({ label, error, inputRef, ...input }: { label: string; error?: string; inputRef?: React.Ref<InputRef> } & TextInputProps) {
  const { colors, radius } = useTheme()
  const [focus, setFocus] = useState(false)
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.foreground, fontWeight: '500' }}>{label}</Text>
      <TextInput ref={inputRef} accessibilityLabel={label} placeholderTextColor={colors.mutedForeground} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{ minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: error ? colors.danger : focus ? colors.primary : colors.border, backgroundColor: colors.surface2, color: colors.foreground, paddingHorizontal: 12, fontSize: 16 }} {...input} />
      {error ? <FadeIn y={-4}><Text accessibilityLiveRegion="polite" style={{ color: colors.danger, fontSize: 13 }}>{error}</Text></FadeIn> : null}
    </View>
  )
}

export function Card({ children, onPress, style }: { children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  const { colors, radius } = useTheme()
  const base = { backgroundColor: colors.card, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 4 }
  return onPress ? <PressableScale scaleTo={0.985} accessibilityRole="button" onPress={onPress} style={[base, style]}>{children}</PressableScale> : <View style={[base, style]}>{children}</View>
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
  heading: { fontSize: 17, fontWeight: '600', letterSpacing: -0.2 },
  body: { fontSize: 16 },
  small: { fontSize: 13 },
})
