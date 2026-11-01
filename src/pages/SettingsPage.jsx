import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertTriangle, Download, FileJson, LogOut, Trash2, Upload } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/form'
import { Dialog } from '@/components/ui/dialog'
import { Segmented, Progress } from '@/components/ui/misc'
import { useSettings } from '@/hooks/useSettings'
import { useAuth } from '@/hooks/useAuth'
import { useAction } from '@/hooks/useAction'
import { useConfirm } from '@/components/shared/Confirm'
import { applyTheme } from '@/hooks/useTheme'
import { auth } from '@/services/auth'
import { buildExport, importBackup, parseBackup, summarizeBackup } from '@/services/backup'
import { download, toCsv, TX_COLUMNS, JOB_COLUMNS } from '@/services/csv'
import * as store from '@/hooks/store'
import { db, isDevMode } from '@/services/db'
import { TIMEZONES, todayStr } from '@/lib/dates'
import { CURRENCIES, parseMoney, paiseToInput } from '@/lib/money'

const schema = z.object({
  timezone: z.string().refine((tz) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true } catch { return false } }, 'Unknown timezone'),
  currency: z.enum(['INR', 'USD', 'EUR']), week_starts_on: z.coerce.number().refine((n) => n === 0 || n === 1),
  daily_study_target_minutes: z.coerce.number({ invalid_type_error: 'Enter minutes' }).int().min(0).max(1440, 'Max 1440'),
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

function DataCard() {
  const confirm = useConfirm()
  const file = useRef(null)
  const [pending, setPending] = useState(null) // parsed backup awaiting confirmation
  const [prog, setProg] = useState(null)
  const [exportAll, exporting] = useAction(async () => {
    const data = await buildExport()
    download(`lifetrack-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json')
  }, { success: 'Backup downloaded' })
  const [csv, csving] = useAction(async (which) => {
    const rows = await db.list(which === 'tx' ? 'transactions' : 'job_applications')
    if (!rows.length) throw new Error('Nothing to export yet.')
    download(which === 'tx' ? 'lifetrack-transactions.csv' : 'lifetrack-applications.csv', toCsv(rows, which === 'tx' ? TX_COLUMNS : JOB_COLUMNS))
  })
  const [pick] = useAction(async (f) => { setPending({ ...parseBackup(await f.text()), name: f.name }) })
  const [restore, restoring] = useAction(async () => {
    setProg({ done: 0, total: 1 })
    try { await importBackup(pending, (done, total) => setProg({ done, total })) } finally { setProg(null) }
    setPending(null)
  }, { success: 'Backup restored' })
  return (
    <Section title="Your data" desc="Export everything any time. Restoring merges into this account and never deletes existing data.">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={exportAll} loading={exporting}><FileJson className="h-4 w-4" />Export JSON backup</Button>
        <Button variant="outline" onClick={() => csv('tx')} loading={csving}><Download className="h-4 w-4" />Transactions CSV</Button>
        <Button variant="outline" onClick={() => csv('jobs')} loading={csving}><Download className="h-4 w-4" />Applications CSV</Button>
        <Button variant="outline" onClick={() => file.current?.click()}><Upload className="h-4 w-4" />Restore from JSON…</Button>
        <input ref={file} type="file" accept="application/json,.json" hidden data-testid="import-file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pick(f) }} />
      </div>
      <Dialog open={!!pending} onOpenChange={(o) => !o && !restoring && setPending(null)} title="Restore backup?" description={pending && `${pending.name} · exported ${new Date(pending.exported_at).toLocaleString()}`}
        footer={<><Button variant="outline" disabled={restoring} onClick={() => setPending(null)}>Cancel</Button><Button onClick={restore} loading={restoring}>Restore</Button></>}>
        {pending && <div className="space-y-3 text-sm"><ul className="grid grid-cols-2 gap-x-4 gap-y-1">{summarizeBackup(pending).map((s) => <li key={s.table} className="flex justify-between"><span className="text-muted-foreground">{s.table}</span><b>{s.count}</b></li>)}</ul>
          {prog && <Progress value={(prog.done / prog.total) * 100} label="Import progress" />}
          <p className="text-xs text-muted-foreground">Records are merged by ID into your account. Existing data is kept.</p></div>}
      </Dialog>
    </Section>
  )
}

function AccountCard() {
  const { user } = useAuth()
  const confirm = useConfirm()
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

export default function SettingsPage() {
  const { loading, error } = useSettings()
  return (
    <>
      <PageHeader title="Settings" description={isDevMode ? 'DEV mode: stored in this browser only.' : 'Synced to your account.'} />
      <DataGate loading={loading} error={error} cards={0}>
        <div className="mx-auto max-w-2xl space-y-4"><ProfileCard /><PreferencesCard /><DataCard /><AccountCard /></div>
      </DataGate>
    </>
  )
}
