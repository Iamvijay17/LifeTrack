import { useState } from 'react'
import { Pressable, ScrollView, Switch, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { fmtDay } from '@lifetrack/utils'
import { REMINDER_KINDS, kindLabel, prefEnabled, repeatLabel, sortInbox, sortReminders, unreadCount } from '@lifetrack/core/reminders'
import { relTime } from '@lifetrack/core/dashboard'
import { api, store } from '../../../src/data/client'
import { useTables } from '../../../src/hooks/useTables'
import { useSettings } from '../../../src/hooks/useSettings'
import { useToday } from '../../../src/hooks/useToday'
import { useAction } from '../../../src/hooks/useAction'
import { useTheme } from '../../../src/providers/ThemeProvider'
import { PushDeviceCard } from '../../../src/features/notifications/PushDeviceCard'
import { routeFromNotificationData } from '../../../src/features/notifications/payload'
import { webLinkToRoute } from '../../../src/lib/deepLinks'
import { ReminderForm } from '../../../src/features/reminders/ReminderForm'
import { ModuleHeader } from '../../../src/ui/ModuleHeader'
import { ActionSheet } from '../../../src/ui/Sheet'
import { confirm } from '../../../src/ui/confirm'
import { Badge, DataGate, EmptyState, Segmented, pullToRefresh } from '../../../src/ui/controls'
import { Button, Card, Txt } from '../../../src/ui'

type Tab = 'inbox' | 'reminders' | 'prefs'
export default function Notifications() {
  const { colors } = useTheme()
  const router = useRouter()
  const today = useToday()
  const { settings, save } = useSettings()
  const { data, loading, refreshing, error, refetch } = useTables('notifications', 'reminders')
  const [tab, setTab] = useState<Tab>('inbox')
  const [form, setForm] = useState<{ open: boolean; reminder: any | null }>({ open: false, reminder: null })
  const [menu, setMenu] = useState<any | null>(null)
  const [read] = useAction((n: any) => api.markNotificationRead(n))
  const [readAll, readingAll] = useAction(() => api.markAllRead())
  const [clear] = useAction(() => api.clearReadNotifications())
  const [delN] = useAction((id: string) => store.remove('notifications', id))
  const [delR] = useAction((id: string) => store.remove('reminders', id))
  const [toggle] = useAction((r: any) => api.toggleReminder(r))
  const [setPref] = useAction((k: string, v: boolean) => save({ notification_prefs: { ...settings.notification_prefs, [k]: v } }))

  const inbox: any[] = sortInbox(data.notifications)
  const unread = unreadCount(inbox)
  const reminders: any[] = sortReminders(data.reminders)
  const open = (n: any) => { read(n); if (n.link) router.push(webLinkToRoute(n.link) as never) }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView refreshControl={pullToRefresh(refreshing, refetch)} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
        <ModuleHeader title="Notifications" action={tab === 'reminders' ? <Button title="＋ New" onPress={() => setForm({ open: true, reminder: null })} /> : undefined} />
        <Segmented value={tab} onChange={setTab} options={[{ value: 'inbox', label: unread ? `Inbox (${unread})` : 'Inbox' }, { value: 'reminders', label: 'Reminders' }, { value: 'prefs', label: 'Preferences' }]} />
        <DataGate loading={loading} error={error} onRetry={refetch}>
          {tab === 'inbox' ? (<>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><Button title="Mark all read" variant="ghost" disabled={!unread} loading={readingAll} onPress={() => readAll()} /></View>
              <View style={{ flex: 1 }}><Button title="Clear read" variant="ghost" disabled={!inbox.some((n) => n.read_at)} onPress={async () => { if (await confirm('Clear read notifications?', 'Unread ones are kept.', 'Clear')) clear() }} /></View>
            </View>
            {inbox.length === 0 ? <EmptyState title="No notifications" description="Create a reminder and it will show up here when it is due." action={{ label: 'Set a reminder', onPress: () => { setTab('reminders'); setForm({ open: true, reminder: null }) } }} />
              : inbox.map((n) => (
                <Card key={n.id} onPress={() => open(n)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View accessibilityLabel={n.read_at ? 'read' : 'unread'} style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: n.read_at ? 'transparent' : colors.primary }} />
                    <Text numberOfLines={2} style={{ flex: 1, color: colors.foreground, fontWeight: n.read_at ? '400' : '600', fontSize: 16 }}>{n.title}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Options for ${n.title}`} onPress={() => setMenu({ kind: 'notification', item: n })} hitSlop={10} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.mutedForeground, fontSize: 20 }}>⋯</Text></Pressable>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Badge>{n.kind}</Badge><Txt variant="small" muted>{relTime(n.created_at)}</Txt></View>
                </Card>
              ))}
          </>) : null}

          {tab === 'reminders' ? (reminders.length === 0
            ? <EmptyState title="No reminders" description="Remind yourself about tasks, study, workouts, habits, bills — anything." action={{ label: 'New reminder', onPress: () => setForm({ open: true, reminder: null }) }} />
            : reminders.map((r) => (
              <Card key={r.id}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Switch accessibilityLabel={`${r.active ? 'Disable' : 'Enable'} ${r.title}`} value={r.active} onValueChange={() => { toggle(r) }} trackColor={{ true: colors.primary }} />
                  <Pressable accessibilityRole="button" accessibilityLabel={`Options for ${r.title}`} onPress={() => setMenu({ kind: 'reminder', item: r })} style={{ flex: 1, opacity: r.active ? 1 : 0.6, gap: 2 }}>
                    <Text numberOfLines={1} style={{ color: colors.foreground, fontWeight: '600', fontSize: 16 }}>{r.title}</Text>
                    <Txt variant="small" muted>{kindLabel(r.kind)} · {fmtDay(r.remind_date, 'EEE, d MMM yyyy')} · {r.remind_time.slice(0, 5)}{r.repeat !== 'none' ? ` · ${repeatLabel(r.repeat).toLowerCase()}` : ''}{!r.active ? ' · done' : ''}</Txt>
                  </Pressable>
                </View>
              </Card>
            ))) : null}

          {tab === 'prefs' ? (<>
            <PushDeviceCard />
            <Card>
              <Txt variant="heading">Reminder types</Txt>
              <Txt variant="small" muted>Choose which kinds of reminders create notifications. Turning a type off silences it everywhere.</Txt>
              {(REMINDER_KINDS as { value: string; label: string }[]).map((k) => (
                <View key={k.value} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 }}>
                  <Text style={{ color: colors.foreground, fontSize: 16 }}>{k.label} reminders</Text>
                  <Switch accessibilityLabel={`${k.label} reminders`} value={prefEnabled(settings.notification_prefs, k.value)} onValueChange={(v) => { setPref(k.value, v) }} trackColor={{ true: colors.primary }} />
                </View>
              ))}
            </Card>
          </>) : null}
        </DataGate>
      </ScrollView>
      <ActionSheet visible={!!menu} title={menu?.item?.title ?? ''} onClose={() => setMenu(null)} actions={menu ? (menu.kind === 'notification' ? [
        { label: 'Mark read', hidden: !!menu.item.read_at, onPress: () => read(menu.item) },
        { label: 'Open', hidden: !menu.item.link, onPress: () => open(menu.item) },
        { label: 'Delete', destructive: true, onPress: () => delN(menu.item.id) },
      ] : [
        { label: 'Edit', onPress: () => setForm({ open: true, reminder: menu.item }) },
        { label: 'Delete', destructive: true, onPress: async () => { if (await confirm('Delete this reminder?', menu.item.title)) delR(menu.item.id) } },
      ]) : []} />
      <ReminderForm visible={form.open} reminder={form.reminder} today={today} onClose={() => setForm({ open: false, reminder: null })} />
    </SafeAreaView>
  )
}
