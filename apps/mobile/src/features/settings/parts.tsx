import { useEffect, useState, type ReactNode } from 'react'
import { Linking, Text, View } from 'react-native'
import { TIMEZONES, todayStr } from '@lifetrack/utils'
import { SCORE_CATEGORIES, normalizeWeights, validateScoreWeights } from '@lifetrack/core/score'
import { DELETE_CONFIRM_WORD, displayNameSchema, focusPrefsFormSchema, passwordChangeSchema, preferencesFormSchema, preferencesToForm, preferencesToPayload } from '@lifetrack/schemas'
import { CURRENCIES } from '@lifetrack/utils'

import { store } from '../../data/client'
import { authService } from '../../lib/supabase'
import { signOutCleanly } from '../../lib/signOut'
import { useAction } from '../../hooks/useAction'
import { useSettings } from '../../hooks/useSettings'
import { useZodForm } from '../../hooks/useZodForm'
import { useAuth } from '../../providers/AuthProvider'
import { useTheme } from '../../providers/ThemeProvider'
import { Sheet } from '../../ui/Sheet'
import { ChipGroup, Segmented, SelectField } from '../../ui/controls'
import { Button, Card, Field, Txt } from '../../ui'
import { useTable } from '../../data/useTable'

// Public site that hosts /privacy and /terms (stores require a public URL). PUBLIC value, inlined at build time.
const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL?.replace(/\/+$/, '')

export function Section({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return <Card><Txt variant="heading">{title}</Txt>{desc ? <Txt variant="small" muted>{desc}</Txt> : null}<View style={{ gap: 12, marginTop: 6 }}>{children}</View></Card>
}

export function ProfileSection() {
  const { displayName } = useAuth()
  const { rows } = useTable<any>('profiles')
  const [name, setName] = useState(displayName)
  useEffect(() => setName(displayName), [displayName])
  const [save, pending] = useAction(async () => {
    const r = displayNameSchema.safeParse(name)
    if (!r.success) throw new Error(r.error.issues[0].message)
    await authService!.updateDisplayName(r.data)
    if (rows[0]) await store.update('profiles', rows[0].id, { display_name: r.data }).catch(() => {})
  })
  return (
    <Section title="Profile">
      <Field label="Display name" value={name} onChangeText={setName} maxLength={80} />
      <Button title="Save" onPress={save} loading={pending} disabled={name.trim() === displayName} />
    </Section>
  )
}

export function AppearanceSection() {
  const { settings, save } = useSettings()
  const { setPreference } = useTheme()
  const [setTheme] = useAction(async (theme: 'dark' | 'light' | 'system') => { setPreference(theme); await save({ theme }) })
  return (
    <Section title="Appearance" desc="Follows your account on every device.">
      <Segmented value={settings.theme} onChange={(v) => { setTheme(v) }} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' }]} />
    </Section>
  )
}

export function PreferencesSection() {
  const { settings, save } = useSettings()
  const { values, errors, set, reset, validate } = useZodForm(preferencesFormSchema, preferencesToForm(settings))
  useEffect(() => { reset(preferencesToForm(settings)) }, [settings.updated_at]) // eslint-disable-line react-hooks/exhaustive-deps
  const [submit, pending] = useAction(async () => { const v = validate(); if (!v) return; await save(preferencesToPayload(v)) })
  const tzs = (TIMEZONES as string[]).includes(settings.timezone) ? TIMEZONES : [settings.timezone, ...TIMEZONES]
  const dirty = JSON.stringify(values) !== JSON.stringify(preferencesToForm(settings))
  const num = (k: 'daily_study_target_minutes' | 'water_goal_ml' | 'steps_goal', label: string, hint?: string) =>
    <Field label={label} value={String(values[k] ?? '')} onChangeText={(t) => set(k, t as any)} error={errors[k]} keyboardType="number-pad" />
  return (
    <Section title="Preferences" desc="All dates and daily totals use this timezone on every device.">
      <SelectField label={`Timezone (today there: ${todayStr(values.timezone)})`} value={values.timezone} options={(tzs as string[]).map((t) => ({ value: t, label: t }))} onChange={(v) => set('timezone', v)} error={errors.timezone} />
      <ChipGroup label="Currency" value={values.currency} options={Object.keys(CURRENCIES).map((c) => ({ value: c as 'INR' | 'USD' | 'EUR', label: `${c} (${CURRENCIES[c].symbol})` }))} onChange={(v) => set('currency', v)} />
      <ChipGroup label="Week starts on" value={String(values.week_starts_on)} options={[{ value: '1', label: 'Monday' }, { value: '0', label: 'Sunday' }]} onChange={(v) => set('week_starts_on', v as any)} />
      {num('daily_study_target_minutes', 'Daily study target (minutes)')}
      <Field label="Default monthly expense budget" value={values.monthly_budget} onChangeText={(t) => set('monthly_budget', t)} error={errors.monthly_budget} keyboardType="decimal-pad" placeholder="e.g. 30000" />
      {num('water_goal_ml', 'Water goal (ml)')}
      {num('steps_goal', 'Daily steps goal')}
      <Button title="Save preferences" onPress={submit} loading={pending} disabled={!dirty} />
    </Section>
  )
}

export function ScoreWeightsSection() {
  const { settings, save } = useSettings()
  const base = normalizeWeights(settings.score_weights) as Record<string, number>
  const [w, setW] = useState<Record<string, string | number>>(base)
  useEffect(() => setW(normalizeWeights(settings.score_weights) as Record<string, number>), [settings.updated_at]) // eslint-disable-line react-hooks/exhaustive-deps
  const total = (SCORE_CATEGORIES as any[]).reduce((a, c) => a + (Number(w[c.key]) || 0), 0)
  const dirty = (SCORE_CATEGORIES as any[]).some((c) => Number(w[c.key]) !== base[c.key])
  const [submit, pending] = useAction(async () => { await save({ score_weights: validateScoreWeights(w) }) })
  return (
    <Section title="Daily score weights" desc="Categories with nothing planned or logged that day are skipped and the remaining weights are re-balanced, so rest days are never penalised.">
      {(SCORE_CATEGORIES as any[]).map((c) => (
        <Field key={c.key} label={`${c.label} — ${total > 0 ? Math.round(((Number(w[c.key]) || 0) / total) * 100) : 0}% of the total`} value={String(w[c.key] ?? '')} onChangeText={(t) => setW({ ...w, [c.key]: t })} keyboardType="number-pad" maxLength={3} />
      ))}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Button title="Reset" variant="ghost" disabled={pending} onPress={() => setW({ learning: 25, career: 25, fitness: 20, habits: 15, health: 15 })} /></View>
        <View style={{ flex: 2 }}><Button title="Save weights" onPress={submit} loading={pending} disabled={!dirty} /></View>
      </View>
    </Section>
  )
}

export function FocusSection() {
  const { settings, save } = useSettings()
  const f = settings.focus_prefs as { short_break: number; long_break: number; long_every: number }
  const [v, setV] = useState({ short_break: String(f.short_break), long_break: String(f.long_break), long_every: String(f.long_every) })
  useEffect(() => setV({ short_break: String(f.short_break), long_break: String(f.long_break), long_every: String(f.long_every) }), [settings.updated_at]) // eslint-disable-line react-hooks/exhaustive-deps
  const [submit, pending] = useAction(async () => {
    const r = focusPrefsFormSchema.safeParse(v)
    if (!r.success) throw new Error(r.error.issues[0].message)
    await save({ focus_prefs: r.data })
  })
  const dirty = (Object.keys(v) as (keyof typeof v)[]).some((k) => Number(v[k]) !== f[k])
  return (
    <Section title="Focus mode" desc="Break lengths for the Pomodoro timer.">
      <Field label="Short break (min)" value={v.short_break} onChangeText={(t) => setV({ ...v, short_break: t })} keyboardType="number-pad" maxLength={3} />
      <Field label="Long break (min)" value={v.long_break} onChangeText={(t) => setV({ ...v, long_break: t })} keyboardType="number-pad" maxLength={3} />
      <Field label="Long break every (sessions)" value={v.long_every} onChangeText={(t) => setV({ ...v, long_every: t })} keyboardType="number-pad" maxLength={2} />
      <Button title="Save" onPress={submit} loading={pending} disabled={!dirty} />
    </Section>
  )
}

export function AccountSection() {
  const { colors } = useTheme()
  const { email } = useAuth()
  const [pw, setPw] = useState({ a: '', b: '' })
  const [changePw, changing] = useAction(async () => {
    const r = passwordChangeSchema.safeParse(pw)
    if (!r.success) throw new Error(r.error.issues[0].message)
    await authService!.updatePassword(pw.a)
    setPw({ a: '', b: '' })
  })
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [del, deleting] = useAction(async () => { await authService!.deleteAccount() }) // signing out clears the session; the auth guard returns to sign-in
  return (
    <Section title="Account" desc={email}>
      <Field label="New password" value={pw.a} onChangeText={(a) => setPw({ ...pw, a })} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
      <Field label="Confirm password" value={pw.b} onChangeText={(b) => setPw({ ...pw, b })} secureTextEntry autoComplete="new-password" />
      <Button title="Change password" variant="ghost" onPress={changePw} loading={changing} disabled={!pw.a} />
      <View style={{ height: 1, backgroundColor: colors.border }} />
      <Button title="Sign out" variant="ghost" onPress={() => { signOutCleanly().catch(() => {}) }} />
      {WEB_URL ? <>
        <Button title="Privacy policy" variant="ghost" onPress={() => { Linking.openURL(`${WEB_URL}/privacy`).catch(() => {}) }} />
        <Button title="Terms of service" variant="ghost" onPress={() => { Linking.openURL(`${WEB_URL}/terms`).catch(() => {}) }} />
      </> : null}
      <Button title="Delete account…" variant="danger" onPress={() => { setTyped(''); setOpen(true) }} />
      <Sheet visible={open} title="Delete your account?" onClose={() => { if (!deleting) setOpen(false) }} footer={<Button title="Delete everything" variant="danger" onPress={del} loading={deleting} disabled={typed !== DELETE_CONFIRM_WORD} />}>
        <Text style={{ color: colors.foreground }}>This permanently deletes your account and ALL of your data on every device. This cannot be undone.</Text>
        <Field label={`Type ${DELETE_CONFIRM_WORD} to confirm`} value={typed} onChangeText={setTyped} autoCapitalize="characters" autoCorrect={false} autoComplete="off" />
      </Sheet>
    </Section>
  )
}
