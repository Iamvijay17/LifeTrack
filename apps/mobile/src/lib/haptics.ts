import * as Haptics from 'expo-haptics'

// Haptics are a nicety: never let a missing/unsupported motor (simulators, some Android devices) throw into a user action.
const safe = (fn: () => Promise<unknown>) => { fn().catch(() => {}) }
export const haptics = {
  /** A completed action (checked a habit, finished a task or timer). */
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** A light tap for toggles. */
  tap: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  warning: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
}
