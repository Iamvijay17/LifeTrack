import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { LogOut, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/form'
import { Dialog } from '@/components/ui/dialog'
import { Segmented } from '@/components/ui/misc'
import { useSettings } from '@/hooks/useSettings'
import { useAuth } from '@/hooks/useAuth'
import { useAction } from '@/hooks/useAction'
import { applyTheme } from '@/hooks/useTheme'
import { auth } from '@/services/auth'
import { SCORE_CATEGORIES, normalizeWeights } from '@/domain/score'
import * as store from '@/hooks/store'
import { isDevMode } from '@/services/db'
import { TIMEZONES, todayStr } from '@/lib/dates'
import { CURRENCIES, parseMoney, paiseToInput } from '@/lib/money'

const schema = z.object({
  timezone: z.string().refine((tz) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true } catch { return false } }, 'Unknown timezone'),
  currency: z.enum(['INR', 'USD', 'EUR']), week_starts_on: z.coerce.number().refine((n) => n === 0 || n === 1),
  daily_study_target_minutes: z.coerce.number({ error: 'Enter minutes' }).int().min(0).max(1440, 'Max 1440'),
  monthly_budget: z.string().refine((v) => v.trim() === '' || parseMoney(v) !== null, 'Enter an amount like 30000'),
  water_goal_ml: z.coerce.number().int().min(0).max(20000), steps_goal: z.coerce.number().int().min(0).max(200000),
})

function Section({ title, desc, children }) {
  return <Card><CardHeader className="flex-col items-start gap-0.5"><CardTitle>{title}</CardTitle>{desc && <p className="text-xs text-muted-foreground">{desc}</p>}</CardHeader><CardContent className="space-y-4">{children}</CardContent></Card>
}

function ProfileCard() {
  const { displayName } = useAuth()
  store.useTable('profiles') // load so we can keep profiles.display_name in step
  const [name, setName] = useState(displayName)
  useEffect(() => setName(displayName), [displayName])
  const [save, pending] = useAction(async () => {
    const n = name.trim()
    if (!n || n.length > 80) throw new Error('Enter a name up to 80 characters.')
    await auth.updateDisplayName(n)
    const p = store.peek('profiles')[0]
    if (p) await store.update('profiles', p.id, { display_name: n }).catch(() => {})
  }, { success: 'Profile saved' })
  return (
    <Section title="Profile">
      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); save() }}>
        <Field label="Display name" className="flex-1"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
        <Button type="submit" loading={pending} disabled={name.trim() === displayName}>Save</Button>
      </form>
    </Section>
  )
}

function PreferencesCard() {
  const { settings, row, save } = useSettings()
  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm({ resolver: zodResolver(schema) })
  const toForm = (s) => ({ timezone: s.timezone, currency: s.currency, week_starts_on: String(s.week_starts_on), daily_study_target_minutes: s.daily_study_target_minutes, monthly_budget: s.monthly_budget_paise ? paiseToInput(s.monthly_budget_paise) : '', water_goal_ml: s.water_goal_ml, steps_goal: s.steps_goal })
  useEffect(() => { reset(toForm(settings)) }, [row?.updated_at]) // eslint-disable-line react-hooks/exhaustive-deps
  const [submit, pending] = useAction(async (v) => {
    const { monthly_budget, ...rest } = v
    await save({ ...rest, monthly_budget_paise: monthly_budget.trim() ? parseMoney(monthly_budget) : 0 })
  }, { success: 'Preferences saved' })
  const [setTheme] = useAction(async (theme) => { applyTheme(theme); await save({ theme }) })
  const tzs = TIMEZONES.includes(settings.timezone) ? TIMEZONES : [settings.timezone, ...TIMEZONES]
  return (
    <>
      <Section title="Appearance" desc="Follows your account on every device.">
        <Segmented value={settings.theme} onChange={setTheme} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' }]} />
      </Section>
      <Section title="Preferences" desc="All dates and daily totals use this timezone on every device.">
        <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Timezone" error={errors.timezone?.message} hint={`Today there: ${todayStr(settings.timezone)}`}><Select {...register('timezone')}>{tzs.map((t) => <option key={t}>{t}</option>)}</Select></Field>
            <Field label="Currency" error={errors.currency?.message}><Select {...register('currency')}>{Object.keys(CURRENCIES).map((c) => <option key={c} value={c}>{c} ({CURRENCIES[c].symbol})</option>)}</Select></Field>
            <Field label="Week starts on" hint="Used for weekly habits and weekly stats."><Select {...register('week_starts_on')}><option value="1">Monday</option><option value="0">Sunday</option></Select></Field>
            <Field label="Daily study target (minutes)" error={errors.daily_study_target_minutes?.message} hint="0 removes it from daily progress."><Input type="number" inputMode="numeric" {...register('daily_study_target_minutes')} /></Field>
            <Field label="Default monthly expense budget" error={errors.monthly_budget?.message}><Input inputMode="decimal" placeholder="e.g. 30000" {...register('monthly_budget')} /></Field>
            <Field label="Water goal (ml)" error={errors.water_goal_ml?.message}><Input type="number" inputMode="numeric" {...register('water_goal_ml')} /></Field>
            <Field label="Daily steps goal" error={errors.steps_goal?.message}><Input type="number" inputMode="numeric" {...register('steps_goal')} /></Field>
          </div>
          <Button type="submit" loading={pending} disabled={!isDirty}>Save preferences</Button>
        </form>
      </Section>
    </>
  )
}

function AccountCard() {
  const { user } = useAuth()
  const [pw, setPw] = useState({ a: '', b: '' })
  const [changePw, changing] = useAction(async () => {
    if (pw.a.length < 8) throw new Error('Use at least 8 characters.')
    if (pw.a !== pw.b) throw new Error('Passwords do not match.')
    await auth.updatePassword(pw.a); setPw({ a: '', b: '' })
  }, { success: 'Password updated' })
  const [del, deleting] = useAction(() => auth.deleteAccount())
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  return (
    <Section title="Account" desc={user?.email}>
      <form className="grid gap-3 sm:grid-cols-3 sm:items-end" onSubmit={(e) => { e.preventDefault(); changePw() }}>
        <Field label="New password"><Input type="password" autoComplete="new-password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} /></Field>
        <Field label="Confirm"><Input type="password" autoComplete="new-password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} /></Field>
        <Button type="submit" variant="outline" loading={changing} disabled={!pw.a}>Change password</Button>
      </form>
      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Button variant="outline" onClick={() => auth.signOut()}><LogOut className="h-4 w-4" />Sign out</Button>
        <Button variant="ghost" className="text-danger" onClick={() => { setTyped(''); setOpen(true) }}><Trash2 className="h-4 w-4" />Delete account…</Button>
      </div>
      <Dialog open={open} onOpenChange={(o) => !deleting && setOpen(o)} title="Delete your account?" description="This permanently deletes your account and ALL data on every device. Export a backup first."
        footer={<><Button variant="outline" onClick={() => setOpen(false)} disabled={deleting}>Cancel</Button><Button variant="destructive" loading={deleting} disabled={typed !== 'DELETE'} onClick={del}>Delete everything</Button></>}>
        <Field label="Type DELETE to confirm"><Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></Field>
      </Dialog>
    </Section>
  )
}

function ScoreCard() {
  const { settings, row, save } = useSettings()
  const [w, setW] = useState(() => normalizeWeights(settings.score_weights))
  useEffect(() => setW(normalizeWeights(settings.score_weights)), [row?.updated_at]) // eslint-disable-line react-hooks/exhaustive-deps
  const total = SCORE_CATEGORIES.reduce((a, c) => a + (Number(w[c.key]) || 0), 0)
  const dirty = SCORE_CATEGORIES.some((c) => Number(w[c.key]) !== normalizeWeights(settings.score_weights)[c.key])
  const [submit, pending] = useAction(async () => {
    for (const c of SCORE_CATEGORIES) { const v = Number(w[c.key]); if (!Number.isFinite(v) || v < 0 || v > 100) throw new Error(`${c.label}: enter a weight between 0 and 100.`) }
    if (total <= 0) throw new Error('At least one weight must be above zero.')
    await save({ score_weights: Object.fromEntries(SCORE_CATEGORIES.map((c) => [c.key, Number(w[c.key])])) })
  }, { success: 'Score weights saved' })
  return (
    <Section title="Daily score weights" desc="Categories with nothing planned or logged that day are skipped and the remaining weights are re-balanced, so rest days are never penalised.">
      <div className="grid gap-3 sm:grid-cols-3">{SCORE_CATEGORIES.map((c) => (
        <Field key={c.key} label={c.label} hint={`${total > 0 ? Math.round(((Number(w[c.key]) || 0) / total) * 100) : 0}% of the total`}><Input type="number" min={0} max={100} inputMode="numeric" value={w[c.key]} onChange={(e) => setW({ ...w, [c.key]: e.target.value })} /></Field>))}</div>
      <div className="flex gap-2"><Button onClick={() => submit()} loading={pending} disabled={!dirty}>Save weights</Button><Button variant="ghost" disabled={pending} onClick={() => setW({ learning: 25, career: 25, fitness: 20, habits: 15, health: 15 })}>Reset to default</Button></div>
    </Section>
  )
}

function FocusCard() {
  const { settings, row, save } = useSettings()
  const f = settings.focus_prefs
  const [v, setV] = useState({ short_break: f.short_break, long_break: f.long_break, long_every: f.long_every })
  useEffect(() => setV({ short_break: f.short_break, long_break: f.long_break, long_every: f.long_every }), [row?.updated_at]) // eslint-disable-line react-hooks/exhaustive-deps
  const [submit, pending] = useAction(async () => {
    const n = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Number(x)]))
    if (!Number.isInteger(n.short_break) || n.short_break < 1 || n.short_break > 60) throw new Error('Short break: 1–60 minutes.')
    if (!Number.isInteger(n.long_break) || n.long_break < 1 || n.long_break > 120) throw new Error('Long break: 1–120 minutes.')
    if (!Number.isInteger(n.long_every) || n.long_every < 2 || n.long_every > 10) throw new Error('Long break every: 2–10 sessions.')
    await save({ focus_prefs: n })
  }, { success: 'Focus settings saved' })
  const dirty = Object.keys(v).some((k) => Number(v[k]) !== f[k])
  return (
    <Section title="Focus mode" desc="Break lengths for the Pomodoro timer.">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Short break (min)"><Input type="number" inputMode="numeric" value={v.short_break} onChange={(e) => setV({ ...v, short_break: e.target.value })} /></Field>
        <Field label="Long break (min)"><Input type="number" inputMode="numeric" value={v.long_break} onChange={(e) => setV({ ...v, long_break: e.target.value })} /></Field>
        <Field label="Long break every (sessions)"><Input type="number" inputMode="numeric" value={v.long_every} onChange={(e) => setV({ ...v, long_every: e.target.value })} /></Field>
      </div>
      <Button onClick={() => submit()} loading={pending} disabled={!dirty}>Save</Button>
    </Section>
  )
}

export default function SettingsPage() {
  const { loading, error } = useSettings()
  return (
    <>
      <PageHeader title="Settings" description={isDevMode ? 'DEV mode: stored in this browser only.' : 'Synced to your account.'} />
      <DataGate loading={loading} error={error} cards={0}>
        <div className="mx-auto max-w-2xl space-y-4"><ProfileCard /><PreferencesCard /><ScoreCard /><FocusCard /><Section title="Your data" desc="Exports, backup and restore live on their own page."><Link to="/export" className="text-sm text-secondary hover:underline">Open Data Export →</Link></Section><AccountCard /></div>
      </DataGate>
    </>
  )
}
