import { useState, type ReactNode } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme } from '../providers/ThemeProvider'

/** Safe-area aware screen. `scroll` + keyboard avoidance keep inputs visible on both platforms. */
export function Screen({ children, scroll = true, edges = ['top', 'left', 'right'] as const, style }: { children: ReactNode; scroll?: boolean; edges?: readonly ('top' | 'bottom' | 'left' | 'right')[]; style?: ViewStyle }) {
  const { colors, spacing } = useTheme()
  const inner = scroll
    ? <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, flexGrow: 1 }}>{children}</ScrollView>
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
  const bg = variant === 'primary' ? colors.primarySolid : variant === 'danger' ? colors.dangerSolid : 'transparent'
  const fg = variant === 'ghost' ? colors.foreground : colors.primaryForeground
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }} disabled={disabled || loading} onPress={onPress}
      style={({ pressed }) => [{ minHeight: 48, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: bg, opacity: disabled || loading ? 0.6 : pressed ? 0.85 : 1, borderWidth: variant === 'ghost' ? 1 : 0, borderColor: colors.border, paddingHorizontal: 16 }]}>
      {loading ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontWeight: '600', fontSize: 16 }}>{title}</Text>}
    </Pressable>
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
        style={{ minHeight: 48, borderRadius: radius.lg, borderWidth: 1, borderColor: error ? colors.danger : focus ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.foreground, paddingHorizontal: 12, fontSize: 16 }} {...input} />
      {error ? <Text accessibilityLiveRegion="polite" style={{ color: colors.danger, fontSize: 13 }}>{error}</Text> : null}
    </View>
  )
}

export function Card({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  const { colors, radius } = useTheme()
  const style = { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 4 }
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [style, { opacity: pressed ? 0.85 : 1 }]}>{children}</Pressable> : <View style={style}>{children}</View>
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '700' },
  heading: { fontSize: 18, fontWeight: '600' },
  body: { fontSize: 16 },
  small: { fontSize: 13 },
})
