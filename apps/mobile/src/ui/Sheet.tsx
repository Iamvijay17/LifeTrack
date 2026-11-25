import { useEffect, useRef, type ReactNode } from 'react'
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../providers/ThemeProvider'
import { Button } from './index'

/** Bottom sheet for forms. The backdrop fades while the sheet springs up. Keyboard-aware, scrollable, safe-area padded; Android back closes it. */
export function Sheet({ visible, title, onClose, children, footer }: { visible: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const { colors, radius } = useTheme()
  const insets = useSafeAreaInsets()
  const rise = useRef(new Animated.Value(80)).current
  useEffect(() => {
    if (visible) { rise.setValue(80); Animated.spring(rise, { toValue: 0, stiffness: 300, damping: 30, mass: 0.9, useNativeDriver: true }).start() }
  }, [visible]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable accessibilityLabel="Close" style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} onPress={onClose} />
        <Animated.View style={{ maxHeight: '90%', backgroundColor: colors.card, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, paddingBottom: insets.bottom + 8, transform: [{ translateY: rise }] }}>
          <View accessibilityElementsHidden style={{ alignItems: 'center', paddingTop: 8 }}><View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} /></View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: 18, fontWeight: '600' }}>{title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={12} style={{ minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 16 }}>Cancel</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} contentContainerStyle={{ padding: 16, gap: 14 }}>{children}</ScrollView>
          {footer ? <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

/**
 * iOS cannot present a modal/alert while another modal is still dismissing (the new one is silently dropped), so anything
 * that opens a sheet or Alert right after closing a sheet should go through this. Android needs no delay.
 */
export const afterSheetClose = (fn: () => void) => { setTimeout(fn, Platform.OS === 'ios' ? 400 : 0) }

export interface MenuAction { label: string; onPress: () => void; destructive?: boolean; hidden?: boolean }
/** Context menu rendered as a sheet of actions (works identically on iOS and Android). */
export function ActionSheet({ visible, title, actions, onClose }: { visible: boolean; title: string; actions: MenuAction[]; onClose: () => void }) {
  const { colors } = useTheme()
  return (
    <Sheet visible={visible} title={title} onClose={onClose}>
      {actions.filter((a) => !a.hidden).map((a) => (
        <Button key={a.label} title={a.label} variant={a.destructive ? 'danger' : 'ghost'} onPress={() => { onClose(); afterSheetClose(a.onPress) }} />
      ))}
    </Sheet>
  )
}
