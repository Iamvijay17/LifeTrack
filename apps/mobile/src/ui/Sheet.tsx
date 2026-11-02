import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../providers/ThemeProvider'
import { Button } from './index'

/** Bottom sheet for forms. Keyboard-aware, scrollable, safe-area padded; Android back closes it. */
export function Sheet({ visible, title, onClose, children, footer }: { visible: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const { colors, radius } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable accessibilityLabel="Close" style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={onClose} />
        <View style={{ maxHeight: '90%', backgroundColor: colors.background, borderTopLeftRadius: radius.lg * 2, borderTopRightRadius: radius.lg * 2, paddingBottom: insets.bottom + 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: 18, fontWeight: '600' }}>{title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={12} style={{ minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 16 }}>Cancel</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14 }}>{children}</ScrollView>
          {footer ? <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

export interface MenuAction { label: string; onPress: () => void; destructive?: boolean; hidden?: boolean }
/** Context menu rendered as a sheet of actions (works identically on iOS and Android). */
export function ActionSheet({ visible, title, actions, onClose }: { visible: boolean; title: string; actions: MenuAction[]; onClose: () => void }) {
  const { colors } = useTheme()
  return (
    <Sheet visible={visible} title={title} onClose={onClose}>
      {actions.filter((a) => !a.hidden).map((a) => (
        <Button key={a.label} title={a.label} variant={a.destructive ? 'danger' : 'ghost'} onPress={() => { onClose(); a.onPress() }} />
      ))}
    </Sheet>
  )
}
