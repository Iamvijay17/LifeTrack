import { useState } from 'react'
import { Bell, BellOff, CheckCheck, Pencil, Plus, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate, EmptyState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/form'
import { Badge, Segmented } from '@/components/ui/misc'
import { Menu } from '@/components/ui/menu'
import { useConfirm } from '@/components/shared/Confirm'
import { ReminderDialog } from '@/features/reminders/ReminderDialog'
import { relTime } from '@/components/layout/NotificationBell'
import { useTables } from '@/hooks/store'
import * as store from '@/hooks/store'
import { useSettings } from '@/hooks/useSettings'
import { useToday } from '@/hooks/useToday'
import { useAction } from '@/hooks/useAction'
import { markAllRead, markNotificationRead } from '@/services/api'
import { REMINDER_KINDS, REPEATS, unreadCount } from '@/domain/reminders'
import { fmtDay } from '@/lib/dates'
import { cn } from '@/lib/utils'

export default function NotificationsPage() {
  const today = useToday()
  const confirm = useConfirm()
  const { settings, save } = useSettings()
  const { data, loading, error, refetch } = useTables('notifications', 'reminders')
  const [tab, setTab] = useState('inbox')
  const [dlg, setDlg] = useState({ open: false, reminder: null })
  const [read] = useAction(markNotificationRead)
  const [readAll, readingAll] = useAction(markAllRead, { success: (n) => (n ? 'All marked as read' : undefined) })
  const [delN] = useAction((id) => store.remove('notifications', id))
  const [clear] = useAction(() => store.removeMany('notifications', data.notifications.filter((n) => n.read_at).map((n) => n.id)), { success: 'Read notifications cleared' })
  const [delR] = useAction((id) => store.remove('reminders', id), { success: 'Reminder deleted' })
  const [toggle] = useAction((r) => store.update('reminders', r.id, { active: !r.active, ...(!r.active ? { last_fired_on: null } : {}) }))
  const [setPref] = useAction((k, v) => save({ notification_prefs: { ...settings.notification_prefs, [k]: v } }))

  const inbox = [...data.notifications].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const unread = unreadCount(inbox)
  const reminders = [...data.reminders].sort((a, b) => Number(b.active) - Number(a.active) || (a.remind_date + a.remind_time).localeCompare(b.remind_date + b.remind_time))

  return (
    <>
      <PageHeader title="Notifications" description="Reminders become notifications while LifeTrack is open on any of your devices."
        actions={tab === 'reminders' ? <Button onClick={() => setDlg({ open: true, reminder: null })}><Plus className="h-4 w-4" />New reminder</Button> : undefined} />
      <Segmented className="mb-4" value={tab} onChange={setTab} options={[{ value: 'inbox', label: unread ? `Inbox (${unread})` : 'Inbox' }, { value: 'reminders', label: 'Reminders' }, { value: 'prefs', label: 'Preferences' }]} />
      <DataGate loading={loading} error={error} onRetry={refetch} cards={0}>
        {tab === 'inbox' && (
          <div className="space-y-3">
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" disabled={!unread} loading={readingAll} onClick={() => readAll()}><CheckCheck className="h-4 w-4" />Mark all read</Button>
              <Button variant="ghost" size="sm" disabled={!inbox.some((n) => n.read_at)} onClick={async () => { if (await confirm({ title: 'Clear read notifications?', description: 'Unread ones are kept.', confirmLabel: 'Clear' })) clear() }}>Clear read</Button>
            </div>
            {inbox.length === 0 ? <EmptyState icon={Bell} title="No notifications" description="Create a reminder and it will show up here when it is due." action={<Button size="sm" onClick={() => { setTab('reminders'); setDlg({ open: true, reminder: null }) }}>Set a reminder</Button>} />
              : <Card><ul className="divide-y divide-border">{inbox.map((n) => (
                <li key={n.id} className={cn('flex items-start gap-3 px-4 py-3', !n.read_at && 'bg-primary/5')}>
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-primary')} aria-label={n.read_at ? 'read' : 'unread'} />
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium">{n.title}</p><p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground"><Badge>{n.kind}</Badge>{relTime(n.created_at)}{n.link && <Link to={n.link} onClick={() => read(n)} className="text-secondary hover:underline">Open</Link>}</p></div>
                  {!n.read_at && <Button variant="ghost" size="sm" onClick={() => read(n)}>Mark read</Button>}
                  <Button variant="ghost" size="icon-sm" aria-label="Delete notification" onClick={() => delN(n.id)}><Trash2 className="h-4 w-4" /></Button>
                </li>))}</ul></Card>}
          </div>)}
        {tab === 'reminders' && (reminders.length === 0
          ? <EmptyState icon={BellOff} title="No reminders" description="Remind yourself about tasks, study, workouts, habits, bills — anything." action={<Button onClick={() => setDlg({ open: true, reminder: null })}>New reminder</Button>} />
          : <Card><ul className="divide-y divide-border">{reminders.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3">
              <Switch checked={r.active} onChange={() => toggle(r)} label={`${r.active ? 'Disable' : 'Enable'} ${r.title}`} />
              <div className={cn('min-w-0 flex-1', !r.active && 'opacity-60')}><p className="truncate text-sm font-medium">{r.title}</p>
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"><Badge tone="primary">{REMINDER_KINDS.find((k) => k.value === r.kind)?.label}</Badge>{fmtDay(r.remind_date, 'EEE, d MMM yyyy')} · {r.remind_time.slice(0, 5)}{r.repeat !== 'none' && ` · ${REPEATS.find((x) => x.value === r.repeat)?.label.toLowerCase()}`}{!r.active && ' · done'}</p></div>
              <Menu label={`Actions for ${r.title}`} items={[{ label: 'Edit', icon: Pencil, onClick: () => setDlg({ open: true, reminder: r }) }, { label: 'Delete', icon: Trash2, danger: true, onClick: async () => { if (await confirm({ title: 'Delete this reminder?', description: r.title })) delR(r.id) } }]} />
            </li>))}</ul></Card>)}
        {tab === 'prefs' && (
          <Card><CardContent className="space-y-1 p-2">
            <p className="px-3 pb-1 pt-2 text-sm text-muted-foreground">Choose which kinds of reminders create notifications. Turning a type off silences it everywhere.</p>
            {REMINDER_KINDS.map((k) => (
              <div key={k.value} className="flex items-center justify-between rounded-md px-3 py-2.5 hover:bg-muted/40"><span className="text-sm">{k.label} reminders</span>
                <Switch checked={settings.notification_prefs?.[k.value] !== false} onChange={(v) => setPref(k.value, v)} label={`${k.label} reminders`} /></div>))}
          </CardContent></Card>)}
      </DataGate>
      <ReminderDialog open={dlg.open} reminder={dlg.reminder} today={today} onOpenChange={(o) => setDlg((d) => ({ ...d, open: o }))} />
    </>
  )
}
