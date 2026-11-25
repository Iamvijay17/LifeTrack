import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { AppState, Keyboard, Platform, View } from 'react-native'
import * as Device from 'expo-device'
import * as LocalAuthentication from 'expo-local-authentication'
import * as SecureStore from 'expo-secure-store'
import { getRandomBytes } from 'expo-crypto'
import { isNotInstalled, isSessionEnded, toAppError } from '@lifetrack/data'
import { queryClient } from '../../data/client'
import { signOutCleanly } from '../../lib/signOut'
import { security, type SecurityApi } from '../../lib/security'
import { useAuth } from '../../providers/AuthProvider'
import { createDeviceKeys, type BiometricSupport, type DeviceKeys, type UnlockResult } from './deviceKey'
import { createLockController, type LockController, type LockSnapshot } from './lockController'
import type { PinResult, SecurityState } from './lockPolicy'

// The app lock on this phone. It DISPLAYS the lock; the database decides it (docs/APP_SECURITY.md §2). While the server says this session is locked the
// app is not mounted at all (see Gate in app/_layout.tsx), cached rows are dropped, and before the first answer arrives nothing renders either.

export interface BiometricInfo { support: BiometricSupport | null; enrolledHere: boolean; broken: boolean; /** The id the server gave this phone's key. */ keyId: string | null }
export interface SecurityValue extends LockSnapshot {
  /** The phone's own fingerprint / face: what the sensor can do, and whether this phone holds a key for the signed-in account. */
  biometrics: BiometricInfo
  refresh: () => Promise<SecurityState | null>
  retry: () => void
  lockNow: () => Promise<void>
  unlockWithPin: (pin: string) => Promise<PinResult>
  unlockWithBiometrics: () => Promise<UnlockResult>
  finishUnlock: () => Promise<SecurityState | null>
  refreshBiometrics: () => Promise<void>
  /** Any touch in the app: keeps the idle clock and the server's unlock window alive. */
  noteActivity: () => void
  /** Null when the app has no Supabase credentials. */
  api: SecurityApi | null
  deviceKeys: DeviceKeys | null
  userId: string | null
}

const Ctx = createContext<SecurityValue | null>(null)
export const SecurityContext = Ctx
export function useSecurity(): SecurityValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSecurity must be used inside SecurityProvider')
  return v
}

const NO_BIOMETRICS: BiometricInfo = { support: null, enrolledHere: false, broken: false, keyId: null }
const UNCONFIGURED: LockSnapshot = { status: 'unsupported', state: null, error: null, locked: false, enabled: false }
const inert = { subscribe: () => () => {}, getSnapshot: () => UNCONFIGURED }

/** Everything the lock needs that touches the device, built once. */
function build() {
  if (!security) return null
  const controller = createLockController({
    api: security,
    signOut: signOutCleanly,
    isNotInstalled,
    isSessionEnded,
    errorMessage: (e) => toAppError(e).message,
    keyboardVisible: () => Keyboard.isVisible(),
  })
  const deviceKeys = createDeviceKeys({
    api: security.deviceKeys,
    store: SecureStore,
    probe: LocalAuthentication,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    random: getRandomBytes,
    hold: controller.hold,
    deviceName: () => Device.deviceName || Device.modelName || null,
  })
  return { controller, deviceKeys }
}

export function SecurityProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const userId = session?.user?.id ?? null
  const built = useRef<ReturnType<typeof build> | undefined>(undefined)
  if (built.current === undefined) built.current = build()
  const controller: LockController | null = built.current?.controller ?? null
  const deviceKeys = built.current?.deviceKeys ?? null
  const snap = useSyncExternalStore(controller?.subscribe ?? inert.subscribe, controller?.getSnapshot ?? inert.getSnapshot)

  // Who is signed in, and which session: a new sign-in (even by the same person) starts a fresh look.
  useEffect(() => { controller?.setUser(userId) }, [controller, userId, session])
  useEffect(() => () => controller?.dispose(), [controller])

  // Leaving the app and coming back. 'inactive' (iOS: the notification shade, the app switcher, a system prompt) is not leaving.
  useEffect(() => {
    if (!controller) return
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') controller.appWentBackground()
      else if (s === 'active') controller.appCameBack()
    })
    return () => sub.remove()
  }, [controller])

  // Locked means gone: nothing sensitive stays in memory behind the lock screen. (The effect runs after the app has been unmounted, so nothing refetches.)
  useEffect(() => { if (snap.locked) queryClient.clear() }, [snap.locked])

  // Biometrics: what the sensor can do, and whether this phone holds a key for this account.
  const [bio, setBio] = useState<BiometricInfo>(NO_BIOMETRICS)
  const refreshBiometrics = useCallback(async () => {
    if (!deviceKeys || !userId) return setBio(NO_BIOMETRICS)
    const [support, local] = await Promise.all([deviceKeys.support(), deviceKeys.localState(userId)])
    setBio({ support, enrolledHere: local.enrolled, broken: local.broken, keyId: local.keyId })
  }, [deviceKeys, userId])
  useEffect(() => { refreshBiometrics().catch(() => setBio(NO_BIOMETRICS)) }, [refreshBiometrics, snap.status])

  const unlockWithBiometrics = useCallback(async (): Promise<UnlockResult> => {
    if (!deviceKeys || !userId) return { ok: false, cancelled: false, message: 'Fingerprint and face unlock is not available.', lockoutSeconds: 0, signedOut: false, gone: false }
    const r = await deviceKeys.unlock(userId)
    if (!r.ok && r.signedOut) await signOutCleanly().catch(() => {})
    if (!r.ok && r.gone) refreshBiometrics().catch(() => {})
    return r
  }, [deviceKeys, userId, refreshBiometrics])

  const value = useMemo<SecurityValue>(() => ({
    ...snap,
    biometrics: bio,
    refresh: () => controller?.refresh() ?? Promise.resolve(null),
    retry: () => { controller?.retry() },
    lockNow: () => controller?.lockNow() ?? Promise.resolve(),
    unlockWithPin: (pin) => controller!.unlockWithPin(pin),
    unlockWithBiometrics,
    finishUnlock: () => controller?.finishUnlock() ?? Promise.resolve(null),
    refreshBiometrics,
    noteActivity: () => controller?.noteActivity(),
    api: security,
    deviceKeys,
    userId,
  }), [snap, bio, controller, unlockWithBiometrics, refreshBiometrics, deviceKeys, userId])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/**
 * Wraps the signed-in app so that any touch counts as activity (it keeps the idle clock and the server's unlock window alive). It only LISTENS: returning
 * false from the capture handler leaves every touch to the screen underneath, exactly as if this were not here.
 */
export function ActivityCapture({ children }: { children: ReactNode }) {
  const { noteActivity } = useSecurity()
  return <View style={{ flex: 1 }} onStartShouldSetResponderCapture={() => { noteActivity(); return false }}>{children}</View>
}
