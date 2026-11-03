import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/misc'
import { useTables } from '@/hooks/store'
import * as store from '@/hooks/store'
import { useSettings } from '@/hooks/useSettings'
import { useToday } from '@/hooks/useToday'
import { useAction } from '@/hooks/useAction'
import { markAllRead, markNotificationRead } from '@/services/api'
import { sortInbox, sortReminders, togglePatch, unreadCount } from '@/domain/reminders'
import { InboxTab } from './InboxTab'
import { PreferencesTab } from './PreferencesTab'
import { ReminderDialog } from './ReminderDialog'
import { RemindersTab } from './RemindersTab'

export default function NotificationsPage() {
  const today = useToday()
  const { settings, save } = useSettings()
  const { data, loading, error, refetch } = useTables('notifications', 'reminders')
  const [tab, setTab] = useState('inbox')
  const [dlg, setDlg] = useState({ open: false, reminder: null })

  const [read] = useAction(markNotificationRead)
  const [readAll, readingAll] = useAction(markAllRead, { success: (n) => (n ? 'All marked as read' : undefined) })
  const [deleteNotification] = useAction((id) => store.remove('notifications', id))
  const [clearRead] = useAction(
    () =>
      store.removeMany(
        'notifications',
        data.notifications.filter((n) => n.read_at).map((n) => n.id),
      ),
    { success: 'Read notifications cleared' },
  )
  const [toggleReminder] = useAction((r) => store.update('reminders', r.id, togglePatch(r)))
  const [setPref] = useAction((kind, on) => save({ notification_prefs: { ...settings.notification_prefs, [kind]: on } }))

  const inbox = useMemo(() => sortInbox(data.notifications), [data.notifications])
  const reminders = useMemo(() => sortReminders(data.reminders), [data.reminders])
  const unread = unreadCount(inbox)
  const newReminder = () => setDlg({ open: true, reminder: null })

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Reminders become notifications while LifeTrack is open on any of your devices."
        actions={
          tab === 'reminders' ? (
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
          { value: 'prefs', label: 'Preferences' },
        ]}
      />
      <DataGate loading={loading} error={error} onRetry={refetch} cards={0}>
        {tab === 'inbox' && (
          <InboxTab
            inbox={inbox}
            unread={unread}
            readingAll={readingAll}
            onRead={read}
            onReadAll={() => readAll()}
            onDelete={deleteNotification}
            onClearRead={() => clearRead()}
            onCreateReminder={() => {
              setTab('reminders')
              newReminder()
            }}
          />
        )}
        {tab === 'reminders' && (
          <RemindersTab
            reminders={reminders}
            onCreate={newReminder}
            onEdit={(reminder) => setDlg({ open: true, reminder })}
            onToggle={toggleReminder}
          />
        )}
        {tab === 'prefs' && <PreferencesTab prefs={settings.notification_prefs} onChange={setPref} />}
      </DataGate>
      <ReminderDialog open={dlg.open} reminder={dlg.reminder} today={today} onOpenChange={(o) => setDlg((d) => ({ ...d, open: o }))} />
    </>
  )
}
