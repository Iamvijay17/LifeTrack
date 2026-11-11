import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { countUnread } from '@lifetrack/core/notifications'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/misc'
import { useTables } from '@/hooks/store'
import * as store from '@/hooks/store'
import { useAction } from '@/hooks/useAction'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { useNow } from '@/hooks/useNow'
import { useToday } from '@/hooks/useToday'
import { rescheduleReminder } from '@/services/api'
import { sortReminders, togglePatch } from '@/domain/reminders'
import { timeStrInTz } from '@/lib/dates'
import { HistoryTab } from './HistoryTab'
import { InboxTab } from './InboxTab'
import { PreferencesTab } from './PreferencesTab'
import { ReminderDialog } from './ReminderDialog'
import { RemindersTab } from './RemindersTab'
import { SnoozeDialog } from './SnoozeDialog'
import { useNotificationActions } from './useNotificationActions'
import { useNotificationSettings } from './useNotificationSettings'

const TABS = ['inbox', 'reminders', 'history', 'prefs']

export default function NotificationsPage() {
  const today = useToday()
  const { settings, prefs, tz, update, setCategory } = useNotificationSettings()
  const { data, loading, error, refetch } = useTables('notifications', 'reminders')
  const [params, setParams] = useSearchParams()
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'inbox'
  const setTab = (next) =>
    setParams(
      (p) => {
        const q = new URLSearchParams(p)
        if (next === 'inbox') q.delete('tab')
        else q.set('tab', next)
        q.delete('new')
        return q
      },
      { replace: true },
    )
  const now = useNow(15_000) // snoozed notifications come back, and reminders turn overdue, as the clock moves
  const desktop = useIsDesktop()
  const actions = useNotificationActions()
  const [dlg, setDlg] = useState({ open: false, reminder: null })
  const [pick, setPick] = useState(null) // a notification waiting for a custom snooze time
  const [move, setMove] = useState(null) // a reminder waiting for a new date and time

  // The drawer's "New reminder" link arrives as ?tab=reminders&new=1.
  useEffect(() => {
    if (params.get('new') !== '1') return
    setDlg({ open: true, reminder: null })
    setParams(
      (p) => {
        const q = new URLSearchParams(p)
        q.delete('new')
        return q
      },
      { replace: true },
    )
  }, [params, setParams])

  const [toggleReminder] = useAction((r) => store.update('reminders', r.id, togglePatch(r)))
  const reminders = useMemo(() => sortReminders(data.reminders), [data.reminders])
  const unread = countUnread(data.notifications, now)
  const newReminder = () => setDlg({ open: true, reminder: null })
  const onOpen = useCallback((n) => actions.read(n), [actions]) // a stable function keeps the cards from re-rendering on every tick of the clock

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Reminders, calendar alerts and nudges from every module, in one place."
        actions={
          tab === 'inbox' || tab === 'reminders' ? (
            <Button onClick={newReminder}>
              <Plus className="h-4 w-4" />
              New reminder
            </Button>
          ) : undefined
        }
      />
      <Segmented
        className="mb-4"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'inbox', label: unread ? `Inbox (${unread})` : 'Inbox' },
          { value: 'reminders', label: 'Reminders' },
          { value: 'history', label: 'History' },
          { value: 'prefs', label: 'Preferences' },
        ]}
      />
      <DataGate loading={loading} error={error} onRetry={refetch} cards={0}>
        {tab === 'inbox' && (
          <InboxTab
            rows={data.notifications}
            now={now}
            tz={tz}
            swipe={!desktop}
            actions={actions}
            onOpen={onOpen}
            onPickTime={setPick}
            onCreateReminder={() => {
              setTab('reminders')
              newReminder()
            }}
          />
        )}
        {tab === 'reminders' && (
          <RemindersTab
            reminders={reminders}
            today={today}
            nowTime={timeStrInTz(new Date(now), tz)}
            onCreate={newReminder}
            onEdit={(reminder) => setDlg({ open: true, reminder })}
            onReschedule={setMove}
            onToggle={toggleReminder}
          />
        )}
        {tab === 'history' && (
          <HistoryTab rows={data.notifications} now={now} tz={tz} actions={actions} onOpen={onOpen} onPickTime={setPick} />
        )}
        {tab === 'prefs' && <PreferencesTab settings={settings} prefs={prefs} tz={tz} onSettings={update} onCategory={setCategory} />}
      </DataGate>

      <ReminderDialog open={dlg.open} reminder={dlg.reminder} today={today} onOpenChange={(o) => setDlg((d) => ({ ...d, open: o }))} />
      <SnoozeDialog
        open={!!pick}
        onOpenChange={(o) => !o && setPick(null)}
        title="Snooze until…"
        description={pick?.title}
        onConfirm={(ms) => actions.snooze(pick, ms)}
      />
      <SnoozeDialog
        open={!!move}
        onOpenChange={(o) => !o && setMove(null)}
        title="Reschedule reminder"
        description={move?.title}
        confirmLabel="Reschedule"
        initial={
          move && `${move.remind_date}T${move.remind_time.slice(0, 5)}` > `${today}T${timeStrInTz(new Date(now), tz)}`
            ? { date: move.remind_date, time: move.remind_time.slice(0, 5) }
            : undefined
        }
        onConfirm={async (_ms, { date, time }) => {
          await rescheduleReminder(move, { date, time, tz })
          toast.success('Reminder rescheduled')
        }}
      />
    </>
  )
}
