import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, View } from 'react-native'
import { AUTO_LOCK_OPTIONS } from '@lifetrack/core/security'
import { toAppError } from '@lifetrack/data'
import { authService } from '../../lib/supabase'
import { signOutCleanly } from '../../lib/signOut'
import { useAction } from '../../hooks/useAction'
import { useAuth } from '../../providers/AuthProvider'
import { useTheme } from '../../providers/ThemeProvider'
import { Sheet, afterSheetClose } from '../../ui/Sheet'
import { confirm } from '../../ui/confirm'
import { Badge, ChipGroup } from '../../ui/controls'
import { Button, Field, Txt } from '../../ui'
import { Section } from '../settings/parts'
import { describeDevice, explainPin, timeAgo, type PinResult } from './lockPolicy'
import { PinWizard, type PinMode, type PinOutcome } from './PinWizard'
import { useSecurity } from './SecurityProvider'

const done = (r: PinResult): PinOutcome => ({ ok: !!r.ok, message: r.ok ? undefined : explainPin(r), restart: r.reason === 'wrong_pin' })
/** A message the screen reader announces. */
const Alertish = ({ children }: { children: React.ReactNode }) => <View accessibilityRole="alert" accessibilityLiveRegion="polite">{children}</View>
const Row = ({ children }: { children: React.ReactNode }) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>{children}</View>

/** "I forgot my PIN": the account password signs in afresh; the server then lets that fresh session choose a new PIN (within 10 minutes) and locks every other device again. */
function ForgotPinSheet({ visible, onClose, onVerified }: { visible: boolean; onClose: () => void; onVerified: () => void }) {
  const { email } = useAuth()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (visible) { setPassword(''); setError(''); setBusy(false) } }, [visible])
  const submit = async () => {
    if (!password || busy || !authService) return
    setBusy(true); setError('')
    try { await authService.signIn(email, password); onVerified() }
    catch (e) { setError(toAppError(e).message) }
    finally { setBusy(false) }
  }
  return (
    <Sheet visible={visible} title="Reset your PIN" onClose={onClose} footer={<Button title="Continue" onPress={submit} loading={busy} disabled={!password} />}>
      <Txt muted>Enter your account password to prove it's you. Your other devices will be locked again.</Txt>
      <Field label="Account password" value={password} onChangeText={setPassword} error={error} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password" textContentType="password" onSubmitEditing={submit} />
    </Sheet>
  )
}

export function AppLockSection() {
  const sec = useSecurity()
  const st = sec.state
  const api = sec.api
  const [wizard, setWizardNow] = useState<PinMode | null>(null)
  const lastMode = useRef<PinMode>('setup') // the sheet keeps its mode while it animates closed
  const setWizard = (m: PinMode | null) => { if (m) lastMode.current = m; setWizardNow(m) }
  const [forgot, setForgot] = useState(false)
  const [setAuto, saving] = useAction(async (seconds: number) => { await api!.setAutoLock(seconds); await sec.refresh() })

  if (sec.status === 'unsupported' || !api) {
    return (
      <Section title="App lock" desc="Lock LifeTrack behind a PIN.">
        <Alertish><Txt muted>Your database has not had the security update yet. In Supabase → SQL Editor, run supabase/migrations/0012_security.sql once, then reopen the app. Everything else keeps working as before.</Txt></Alertish>
      </Section>
    )
  }
  if (!st) return null
  const since = st.pinSetAt ? new Date(st.pinSetAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null
  const mode = wizard ?? lastMode.current
  return (
    <Section title="App lock" desc="Ask for a PIN (or your fingerprint or face) when LifeTrack has been idle or you come back to it.">
      <View style={{ gap: 2 }}>
        <Txt variant="heading">{st.appLockEnabled ? 'App lock is on' : 'App lock is off'}</Txt>
        <Txt variant="small" muted>{st.appLockEnabled ? `${st.pinLength}-digit PIN${since ? ` · set ${since}` : ''}` : 'Anyone who opens this phone can open LifeTrack.'}</Txt>
      </View>
      {!st.appLockEnabled ? <Button title="Turn on app lock" onPress={() => setWizard('setup')} /> : (
        <>
          <ChipGroup label="Lock automatically" value={String(st.autoLockSeconds)} options={AUTO_LOCK_OPTIONS.map((o: { seconds: number; label: string }) => ({ value: String(o.seconds), label: o.label }))} onChange={(v) => { if (!saving) void setAuto(Number(v)) }} />
          <Txt variant="small" muted>Counts from your last touch. Leaving the app starts the same clock.</Txt>
          <Button title="Lock now" onPress={() => { void sec.lockNow() }} />
          <Button title="Change PIN" variant="ghost" onPress={() => setWizard('change')} />
          <Button title="I forgot my PIN" variant="ghost" onPress={() => setForgot(true)} />
          <Button title="Turn off app lock…" variant="ghost" onPress={() => setWizard('disable')} />
        </>
      )}
      <View style={{ gap: 6 }}>
        <Txt variant="small" muted>While locked, these stay closed on the server too</Txt>
        <Row>
          <Badge tone={st.appLockEnabled ? 'success' : 'neutral'}>Finance</Badge>
          <Badge tone={st.appLockEnabled ? 'success' : 'neutral'}>Journal &amp; notes</Badge>
        </Row>
        <Txt variant="small" muted>Signing out and back in with your password opens LifeTrack without the PIN, because the password is the stronger proof.</Txt>
      </View>

      <PinWizard
        visible={!!wizard} onClose={() => setWizard(null)} mode={mode} currentLength={st.pinLength ?? 4}
        checkCurrent={async (pin) => done(await sec.unlockWithPin(pin))}
        onSubmit={async ({ current, next }) => {
          if (mode === 'setup') return { ok: !!(await api.setPin(next)) }
          if (mode === 'reset') return { ok: !!(await api.resetAppLock(next)) }
          if (mode === 'change') return done(await api.changePin(current, next))
          const r: PinResult = await api.disableAppLock(current)
          if (r.signedOut) await signOutCleanly().catch(() => {})
          return done(r)
        }}
        onDone={() => { void sec.refresh().then(() => sec.refreshBiometrics()) }}
      />
      <ForgotPinSheet visible={forgot} onClose={() => setForgot(false)} onVerified={() => { setForgot(false); afterSheetClose(() => setWizard('reset')) }} />
    </Section>
  )
}

interface PhoneKey { id: string; label: string; platform: string; createdAt: string; lastUsedAt: string | null }
const PLATFORM: Record<string, string> = { android: 'Android', ios: 'iPhone', unknown: 'Phone' }

/** Fingerprint / face unlock for THIS phone (docs/APP_SECURITY.md §9): enrol, turn off, and the phones that have it. */
export function BiometricSection() {
  const sec = useSecurity()
  const { colors } = useTheme()
  const { api, deviceKeys, userId, biometrics: bio } = sec
  const ready = sec.status === 'ready' && !sec.locked && !!sec.state?.appLockEnabled
  const [server, setServer] = useState<boolean | null>(null) // can the server do it (function deployed, migration run)?
  const [keys, setKeys] = useState<PhoneKey[] | null>(null)
  const [error, setError] = useState('')
  const [renaming, setRenaming] = useState<PhoneKey | null>(null)
  const [name, setName] = useState('')

  const load = useCallback(async () => {
    if (!api || !deviceKeys || !userId) return
    const available = await api.deviceKeys.available()
    setServer(available)
    if (!available) { setKeys([]); return }
    try {
      const list: PhoneKey[] = await api.deviceKeys.list()
      setKeys(list); setError('')
      await deviceKeys.reconcile(userId, list) // a key removed elsewhere (or marked unusable here) is tidied away on both sides
      await sec.refreshBiometrics()
    } catch (e) { setKeys([]); setError(toAppError(e).message) }
  }, [api, deviceKeys, userId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (ready) void load() }, [ready, load])

  const [enroll, enrolling] = useAction(async () => {
    const r = await deviceKeys!.enroll(userId!)
    if (!r.ok) return // the fingerprint prompt was dismissed
    await load()
    Alert.alert(`${bio.support?.label ?? 'Biometric'} unlock is on`, 'LifeTrack will offer it on the lock screen. Your PIN always works too.')
  }, { errorTitle: 'Could not turn it on' })
  const [turnOff, turningOff] = useAction(async () => { await deviceKeys!.disable(userId!); await load() }, { errorTitle: 'Could not turn it off' })
  const [remove] = useAction(async (k: PhoneKey) => {
    if (k.id === bio.keyId) await deviceKeys!.disable(userId!)
    else await api!.deviceKeys.remove(k.id)
    await load()
  }, { errorTitle: 'Could not remove it' })
  const [saveName, saving] = useAction(async () => { await api!.deviceKeys.rename(renaming!.id, name); setRenaming(null); await load() }, { errorTitle: 'Could not rename it' })

  if (!ready || !api || !deviceKeys) return null
  const label = bio.support?.label ?? 'Fingerprint or face'
  const can = bio.support?.available
  return (
    <Section title="Fingerprint & face unlock" desc="Open LifeTrack with your phone's own sensor instead of typing the PIN. The PIN always works too.">
      {error ? <Alertish><Txt variant="small" style={{ color: colors.danger }}>{error}</Txt></Alertish> : null}
      {server === false ? (
        <Txt muted>Not set up on this server yet. An administrator needs to run migration 0014_device_keys.sql and deploy the device-key function (docs/APP_SECURITY.md §7).</Txt>
      ) : !can ? (
        <Txt muted>{bio.support?.reason ?? 'Checking this phone…'}</Txt>
      ) : bio.enrolledHere ? (
        <>
          <Row><Badge tone="success">{label} is on for this phone</Badge></Row>
          <Button title={`Turn off ${label.toLowerCase()} unlock`} variant="ghost" onPress={() => { void turnOff() }} loading={turningOff} />
        </>
      ) : (
        <>
          <Txt muted>{bio.broken ? 'Your fingerprints or face changed on this phone, so this was turned off. Set it up again to use it.' : `Turn on ${label.toLowerCase()} unlock for this phone. Your fingerprint or face never leaves the phone: the app only gets a yes or no from the sensor, and the server checks a signature.`}</Txt>
          <Button title={`Turn on ${label.toLowerCase()} unlock`} onPress={() => { void enroll() }} loading={enrolling} disabled={server === null} />
        </>
      )}

      {keys && keys.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Txt variant="small" muted>Phones with fingerprint or face unlock</Txt>
          {keys.map((k) => (
            <View key={k.id} style={{ gap: 6, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Row>
                <Txt variant="heading">{k.label}</Txt>
                {k.id === bio.keyId ? <Badge tone="primary">This phone</Badge> : null}
              </Row>
              <Txt variant="small" muted>{PLATFORM[k.platform] ?? 'Phone'} · added {timeAgo(k.createdAt)} · used {timeAgo(k.lastUsedAt)}</Txt>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><Button title="Rename" variant="ghost" onPress={() => { setName(k.label); setRenaming(k) }} /></View>
                <View style={{ flex: 1 }}>
                  <Button title="Remove" variant="ghost" onPress={async () => { if (await confirm(`Remove ${k.label}?`, 'It will ask for your PIN from now on.', 'Remove')) void remove(k) }} />
                </View>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <Sheet visible={!!renaming} title="Rename this phone" onClose={() => setRenaming(null)} footer={<Button title="Save" onPress={() => { void saveName() }} loading={saving} disabled={!name.trim()} />}>
        <Field label="Name" value={name} onChangeText={setName} maxLength={60} />
      </Sheet>
    </Section>
  )
}

interface SessionRow { id: string; createdAt: string; lastActiveAt: string; userAgent: string; ip: string; current: boolean; unlocked: boolean; trusted: boolean }

/** Where the account is signed in: end one session or all the others, and take back a "trusted" mark. */
export function SessionsSection() {
  const sec = useSecurity()
  const { colors } = useTheme()
  const api = sec.api
  const ready = sec.status === 'ready' && !sec.locked
  const [sessions, setSessions] = useState<SessionRow[] | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    if (!api) return
    try { setSessions(await api.sessions.list()); setError('') }
    catch (e) { setSessions([]); setError(toAppError(e).message || 'Could not load your sessions.') }
  }, [api])
  useEffect(() => { if (ready) void load() }, [ready, load])

  const [untrust] = useAction(async (s: SessionRow) => { await api!.sessions.untrust(s.id); await load() })
  const [revoke] = useAction(async (s: SessionRow) => { await api!.sessions.revoke(s.id); await load() })
  const [others, signingOthers] = useAction(async () => { await api!.sessions.signOutOthers(); await load() })
  const [everywhere, signingAll] = useAction(async () => { await api!.sessions.signOutEverywhere() })

  if (sec.status === 'unsupported' || !api) return null
  const many = (sessions?.length ?? 0) > 1
  const lockOn = !!sec.state?.appLockEnabled
  return (
    <Section title="Where you're signed in" desc="Each phone or browser that is signed in to your account. Sign out any you do not recognise.">
      {error ? <Alertish><Txt variant="small" style={{ color: colors.danger }}>{error}</Txt></Alertish> : null}
      {sessions === null ? <Txt muted>Loading…</Txt> : sessions.map((s) => {
        const d = describeDevice(s.userAgent)
        return (
          <View key={s.id} style={{ gap: 6, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Row>
              <Txt variant="heading">{s.current ? 'This phone' : d.label}</Txt>
              {s.current ? <Badge tone="primary">This device</Badge> : null}
              {lockOn ? (s.trusted ? <Badge tone="warning">Trusted: no PIN</Badge> : <Badge tone={s.unlocked ? 'success' : 'neutral'}>{s.unlocked ? 'Unlocked' : 'Locked'}</Badge>) : null}
            </Row>
            <Txt variant="small" muted>{[s.ip, `active ${timeAgo(s.lastActiveAt)}`, `signed in ${timeAgo(s.createdAt)}`].filter(Boolean).join(' · ')}</Txt>
            {!s.current ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {lockOn && s.trusted ? <View style={{ flex: 1 }}><Button title="Ask for PIN" variant="ghost" onPress={() => { void untrust(s) }} /></View> : null}
                <View style={{ flex: 1 }}>
                  <Button title="Sign out" variant="ghost" onPress={async () => { if (await confirm(`Sign out ${d.label}?`, 'That device will have to sign in again.', 'Sign out')) void revoke(s) }} />
                </View>
              </View>
            ) : null}
          </View>
        )
      })}
      <Button title="Sign out other devices" variant="ghost" onPress={() => { void others() }} loading={signingOthers} disabled={!many} />
      <Button title="Sign out everywhere" variant="danger" loading={signingAll} onPress={async () => { if (await confirm('Sign out everywhere?', 'Every device, including this one, will have to sign in again.', 'Sign out everywhere')) void everywhere() }} />
      <Txt variant="small" muted>A device you sign out loses access to your account at once, apart from screens it already has open, which stop working within an hour. With the app lock on, your finance and notes close immediately.</Txt>
    </Section>
  )
}
