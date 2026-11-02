import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import { supabase } from '../../lib/supabase'
import { createPushService } from './pushService'
import { createTimerNotifier } from './timerNotifier'

const projectId: string | undefined = Constants.expoConfig?.extra?.eas?.projectId ?? (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId

const perm = async (p: Notifications.NotificationPermissionsStatus) => ({ status: p.status as 'granted' | 'denied' | 'undetermined', canAskAgain: p.canAskAgain })

/** The real, device-backed push service (Expo modules injected into the testable core). */
export const pushService = createPushService({
  platform: Platform.OS === 'ios' ? 'ios' : 'android',
  isDevice: Device.isDevice,
  deviceName: Device.deviceName,
  projectId,
  getPermission: async () => perm(await Notifications.getPermissionsAsync()),
  requestPermission: async () => perm(await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } })),
  getExpoPushToken: async (id) => (await Notifications.getExpoPushTokenAsync({ projectId: id })).data,
  storage: AsyncStorage,
  rpc: async (fn, args) => { if (!supabase) return { error: { message: 'not configured' } }; return supabase.rpc(fn, args) },
})

/** Android needs channels before any notification can be shown; iOS ignores this. */
export async function ensureChannels() {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync('reminders', { name: 'Reminders', importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 250, 250, 250], lightColor: '#8B5CF6' })
  await Notifications.setNotificationChannelAsync('timers', { name: 'Timers', importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 300, 150, 300] })
}

/** Schedules a local notification for the end of the focus timer (device-local, works with the app closed). */
export const timerNotifier = createTimerNotifier({
  schedule: (content, seconds) => Notifications.scheduleNotificationAsync({
    content: { ...content, sound: 'default' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, channelId: 'timers' },
  }),
  cancel: (id) => Notifications.cancelScheduledNotificationAsync(id),
  storage: AsyncStorage,
  canNotify: async () => (await Notifications.getPermissionsAsync()).granted,
})

const ASKED_KEY = 'lifetrack:timer-notification-asked'
/** The first time a timer starts, ask for notification permission once (clearly relevant: "tell me when it ends"). */
export async function askForTimerNotificationsOnce() {
  if ((await AsyncStorage.getItem(ASKED_KEY)) === '1') return
  await AsyncStorage.setItem(ASKED_KEY, '1')
  const p = await Notifications.getPermissionsAsync()
  if (p.status === 'undetermined' || (p.status === 'denied' && p.canAskAgain)) await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } }).catch(() => {})
}
