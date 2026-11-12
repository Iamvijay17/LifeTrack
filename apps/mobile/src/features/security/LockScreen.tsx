import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { Ionicons } from '@expo/vector-icons'
import { toAppError } from '@lifetrack/data'
import { formatWait } from '@lifetrack/core/security'
import { authService } from '../../lib/supabase'
import { signOutCleanly } from '../../lib/signOut'
import { useAuth } from '../../providers/AuthProvider'
import { explainPin } from './lockPolicy'
import { LOCK, PinDots, PinKeypad, type PinStatus } from './PinKeypad'
import { useSecurity } from './SecurityProvider'

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function Link({ label, icon, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 12, minHeight: 44 }}>
      <Ionicons name={icon} size={16} color={LOCK.muted} />
      <Text style={{ color: LOCK.muted, fontSize: 14 }}>{label}</Text>
    </Pressable>
  )
}

function Emblem({ bio }: { bio: 'idle' | 'scanning' | 'success' | 'error' }) {
  const color = bio === 'success' ? LOCK.success : bio === 'error' ? LOCK.danger : LOCK.text
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 84, height: 84, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: LOCK.border, backgroundColor: LOCK.surface }}>
      <Ionicons name={bio === 'idle' ? 'lock-closed' : 'finger-print'} size={38} color={color} />
    </View>
  )
}

/** "Forgot PIN?": the account password opens LifeTrack (a fresh sign-in is a fresh session, which the server opens without the PIN), then a new PIN can be chosen in Security. */
function PasswordUnlock({ onBack }: { onBack: () => void }) {
  const { email } = useAuth()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])
  const submit = async () => {
    if (!password || busy || !authService) return
    setBusy(true); setError('')
    try { await authService.signIn(email, password) } // the session changes: the app asks the server again and opens
    catch (e) { if (alive.current) { setError(toAppError(e).message); setBusy(false) } }
  }
  return (
    <View style={{ width: '100%', gap: 14 }}>
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Text accessibilityRole="header" style={{ color: LOCK.text, fontSize: 19, fontWeight: '600' }}>Unlock with your password</Text>
        <Text style={{ color: LOCK.muted, fontSize: 14, textAlign: 'center' }}>Signing in again opens LifeTrack. Then choose a new PIN in Security &amp; Privacy.</Text>
      </View>
      {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: LOCK.danger, fontSize: 14, textAlign: 'center' }}>{error}</Text> : null}
      <TextInput
        accessibilityLabel="Account password" placeholder="Account password" placeholderTextColor={LOCK.muted}
        secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password" textContentType="password"
        value={password} onChangeText={setPassword} onSubmitEditing={submit} returnKeyType="go"
        style={{ minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: LOCK.border, backgroundColor: LOCK.surface, color: LOCK.text, paddingHorizontal: 14, fontSize: 16 }}
      />
      <Pressable accessibilityRole="button" accessibilityLabel="Unlock" accessibilityState={{ disabled: !password || busy, busy }} disabled={!password || busy} onPress={submit}
        style={{ minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: LOCK.primary, opacity: !password || busy ? 0.55 : 1 }}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Unlock</Text>}
      </Pressable>
      <Link label="Back to PIN" icon="arrow-back" onPress={onBack} />
    </View>
  )
}

/**
 * The full-screen lock. Always dark, like a vault. Shown INSTEAD of the app (the app is not mounted while this is up, see Gate in app/_layout.tsx), and only
 * while the server says this session is locked: the PIN is checked by the database, the fingerprint or face by the `device-key` Edge Function.
 */
export function LockScreen() {
  const sec = useSecurity()
  const { displayName } = useAuth()
  const st = sec.state
  const length = st?.pinLength ?? 4
  const bioLabel = sec.biometrics.support?.label ?? 'fingerprint'
  const bioKind = sec.biometrics.support?.kind
  const canBio = !!st?.appLockEnabled && sec.biometrics.enrolledHere && !!sec.biometrics.support?.available

  const [view, setView] = useState<'pin' | 'password'>('pin')
  const [pin, setPin] = useState('')
  const [phase, setPhase] = useState<'idle' | 'checking' | 'error' | 'success'>('idle')
  const [note, setNote] = useState('')
  const [bad, setBad] = useState(false) // the note is about something that went wrong: it stays red until the next digit
  const [lockout, setLockout] = useState(st?.lockoutSeconds ?? 0)
  const [bio, setBio] = useState<'idle' | 'scanning' | 'success' | 'error'>('idle')
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  // Counts the PIN lockout down so the person sees when they can try again.
  useEffect(() => {
    if (lockout <= 0) return
    const t = setInterval(() => setLockout((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [lockout > 0]) // eslint-disable-line react-hooks/exhaustive-deps
  const wasWaiting = useRef(false)
  useEffect(() => {
    if (lockout > 0) wasWaiting.current = true
    else if (wasWaiting.current) { wasWaiting.current = false; setNote('You can try again now.'); setBad(false) }
  }, [lockout])

  const fail = useCallback((message: string, wait = 0) => {
    setPhase('error'); setPin(''); setNote(message); setBad(true)
    if (wait) setLockout(wait)
    setTimeout(() => { if (alive.current) setPhase('idle') }, 450)
  }, [])

  const submit = useCallback(async (value: string) => {
    setPhase('checking')
    try {
      const r = await sec.unlockWithPin(value)
      if (!alive.current) return
      if (r.ok) {
        setPhase('success'); setNote('')
        await sleep(520)
        if (alive.current) await sec.finishUnlock()
        return
      }
      if (r.signedOut) return fail('Too many wrong PINs. For your safety you have been signed out.')
      if (r.reason === 'not_enabled') { await sec.finishUnlock(); return }
      fail(explainPin(r), r.reason === 'locked_out' || r.lockoutSeconds ? r.lockoutSeconds : 0)
    } catch (e) {
      if (alive.current) fail(toAppError(e).message)
    }
  }, [sec, fail])

  const busy = phase === 'checking' || phase === 'success' || lockout > 0 || bio === 'scanning' || bio === 'success'
  const onDigit = (d: string) => {
    if (busy) return
    const next = pin + d
    setPin(next); setNote(''); setBad(false)
    if (next.length === length) void submit(next)
  }

  const scan = useCallback(async () => {
    setBio('scanning'); setNote(''); setBad(false)
    const r = await sec.unlockWithBiometrics()
    if (!alive.current) return
    if (r.ok) {
      setBio('success')
      await sleep(650)
      if (alive.current) await sec.finishUnlock()
      return
    }
    if (r.cancelled) { setBio('idle'); setNote('Cancelled. Use your PIN, or tap the sensor to try again.'); return }
    setBio('error'); setNote(r.message); setBad(true)
    if (r.lockoutSeconds) setLockout(r.lockoutSeconds)
    setTimeout(() => { if (alive.current) setBio('idle') }, 1300)
  }, [sec])

  // Offer the fingerprint straight away, once, like a phone does: after the lock screen is up AND the app is in the foreground (a sensor prompt cannot be
  // shown from the background). A cancelled prompt leaves the PIN pad ready.
  const offered = useRef(false)
  useEffect(() => {
    if (!canBio || (st?.lockoutSeconds ?? 0) > 0) return
    const offer = () => { const s = AppState.currentState; if (offered.current || s === 'background' || s === 'inactive') return; offered.current = true; void scan() }
    const t = setTimeout(offer, 450)
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') setTimeout(offer, 450) })
    return () => { clearTimeout(t); sub.remove() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const waiting = lockout > 0
  const status: PinStatus = phase === 'error' ? 'error' : phase === 'success' ? 'success' : 'idle'
  return (
    <SafeAreaView accessibilityViewIsModal accessibilityLabel="LifeTrack is locked" style={{ flex: 1, backgroundColor: LOCK.bg }}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 24, gap: 6 }}>
          <Emblem bio={bio} />
          {view === 'password' ? <View style={{ marginTop: 18, width: '100%', maxWidth: 360 }}><PasswordUnlock onBack={() => setView('pin')} /></View> : (
            <View style={{ alignItems: 'center', width: '100%', maxWidth: 360 }}>
              <Text accessibilityRole="header" style={{ color: LOCK.text, fontSize: 22, fontWeight: '600', marginTop: 18, textAlign: 'center' }}>{displayName ? `Welcome back, ${displayName}` : 'LifeTrack is locked'}</Text>
              <Text style={{ color: LOCK.muted, fontSize: 14, marginTop: 4, textAlign: 'center' }}>{canBio ? `Use ${bioLabel.toLowerCase()} or your PIN.` : `Enter your ${length}-digit PIN.`}</Text>
              <View style={{ marginTop: 26 }}><PinDots length={length} filled={pin.length} status={status} /></View>
              <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={{ color: bad || waiting ? LOCK.danger : LOCK.muted, fontSize: 14, textAlign: 'center', minHeight: 40, marginTop: 14, maxWidth: 290 }}>
                {waiting ? `Too many wrong PINs. Try again in ${formatWait(lockout)}.` : note}
              </Text>
              <View style={{ marginTop: 8 }}>
                <PinKeypad
                  disabled={busy} onDigit={onDigit} onBackspace={() => setPin((p) => p.slice(0, -1))} onClear={() => setPin('')}
                  leftSlot={canBio ? (
                    <Pressable accessibilityRole="button" accessibilityLabel={`Use ${bioLabel.toLowerCase()}`} disabled={bio === 'scanning' || waiting} onPress={() => { void scan() }} hitSlop={8}
                      style={{ width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', opacity: bio === 'scanning' || waiting ? 0.4 : 1 }}>
                      <Ionicons name={bioKind === 'face' ? 'scan-outline' : 'finger-print'} size={34} color={LOCK.primary} />
                    </Pressable>
                  ) : null}
                />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 22 }}>
                <Link label="Forgot PIN?" icon="key-outline" onPress={() => setView('password')} />
                <Text accessibilityElementsHidden style={{ color: 'rgba(255,255,255,0.25)' }}>·</Text>
                <Link label="Sign out" icon="log-out-outline" onPress={() => { signOutCleanly().catch(() => {}) }} />
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

/** Shown instead of the app when the server cannot be asked whether the app is locked: the safe answer is "don't show it". */
export function SecurityUnavailable({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <SafeAreaView accessibilityViewIsModal style={{ flex: 1, backgroundColor: LOCK.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <StatusBar style="light" />
      <View style={{ maxWidth: 340, alignItems: 'center', gap: 10 }}>
        <Ionicons name="lock-closed" size={40} color={LOCK.muted} />
        <Text accessibilityRole="header" style={{ color: LOCK.text, fontSize: 19, fontWeight: '600', textAlign: 'center' }}>Can't check your security settings</Text>
        <Text style={{ color: LOCK.muted, fontSize: 14, textAlign: 'center' }}>{message || 'Check your connection and try again.'} LifeTrack stays closed until it can.</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Try again" onPress={onRetry} style={{ minHeight: 46, paddingHorizontal: 22, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: LOCK.primary }}>
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>Try again</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Sign out" onPress={() => { signOutCleanly().catch(() => {}) }} style={{ minHeight: 46, paddingHorizontal: 22, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: LOCK.border }}>
            <Text style={{ color: LOCK.text, fontWeight: '500', fontSize: 16 }}>Sign out</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  )
}
