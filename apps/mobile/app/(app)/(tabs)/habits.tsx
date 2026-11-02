import { useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, Switch, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { habitHeatmap, habitStats, habitSummary, isScheduledOn, pctText, scheduleLabel } from '@lifetrack/core/habits'
import { api, store } from '../../../src/data/client'
import { useTables } from '../../../src/hooks/useTables'
import { useSettings } from '../../../src/hooks/useSettings'
import { useToday } from '../../../src/hooks/useToday'
import { useAction } from '../../../src/hooks/useAction'
import { useTheme } from '../../../src/providers/ThemeProvider'
import { HabitForm } from '../../../src/features/habits/HabitForm'
import { Heatmap } from '../../../src/ui/Heatmap'
import { ActionSheet } from '../../../src/ui/Sheet'
import { confirm } from '../../../src/ui/confirm'
import { Badge, Chip, DataGate, DateNav, EmptyState, ProgressBar, StatTile, pullToRefresh } from '../../../src/ui/controls'
import { Button, Card, Txt } from '../../../src/ui'

function HabitRow({ s, date, onMenu }: { s: any; date: string; onMenu: (s: any) => void }) {
  const { colors } = useTheme()
  const { habit } = s
  const log = s.logs.find((l: any) => l.log_date === date)
  const done = log?.status === 'done'
  const off = log && !done
  const [setStatus, pending] = useAction((st: string | null) => api.setHabitStatus(habit.id, date, st))
  const last = useRef(0)
  const tap = () => { const n = Date.now(); if (n - last.current < 600) return; last.current = n; setStatus(done ? null : 'done') } // ignore accidental double taps
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, opacity: habit.archived_at ? 0.6 : 1 }}>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: done, busy: pending, disabled: !!habit.archived_at }} accessibilityLabel={`${done ? 'Undo' : 'Complete'} ${habit.name}`}
          disabled={pending || !!habit.archived_at} onPress={tap}
          style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: habit.color, backgroundColor: done ? habit.color : 'transparent', alignItems: 'center', justifyContent: 'center', opacity: pending ? 0.6 : 1 }}>
          <Text style={{ color: done ? '#fff' : 'transparent', fontSize: 22, fontWeight: '700' }}>✓</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Options for ${habit.name}`} onPress={() => onMenu(s)} style={{ flex: 1, gap: 4 }}>
          <Text numberOfLines={1} style={{ color: off ? colors.mutedForeground : colors.foreground, fontSize: 16, fontWeight: '600' }}>{habit.name}</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{scheduleLabel(habit)} · 🔥 {s.current}{s.unit} · {pctText(s.rate30)} (30d)</Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {off ? <Badge>{log.status === 'rest' ? 'Rest day' : 'Skipped'}</Badge> : null}
            {!isScheduledOn(habit, date) && !log ? <Badge>Not scheduled</Badge> : null}
            {habit.archived_at ? <Badge>Archived</Badge> : null}
          </View>
        </Pressable>
      </View>
    </Card>
  )
}

export default function Habits() {
  const { colors } = useTheme()
  const today = useToday()
  const { settings } = useSettings()
  const w = settings.week_starts_on
  const [date, setDate] = useState<string | null>(null)
  const day = date ?? today
  const { data, loading, refreshing, error, refetch } = useTables('habits', 'habit_logs')
  const [form, setForm] = useState<{ open: boolean; habit: any | null }>({ open: false, habit: null })
  const [menu, setMenu] = useState<any | null>(null)
  const [focus, setFocus] = useState('all')
  const [showArchived, setShowArchived] = useState(false)
  const [setStatus] = useAction((id: string, st: string | null) => api.setHabitStatus(id, day, st))
  const [patch] = useAction((id: string, p: Record<string, unknown>) => store.update('habits', id, p))
  const [del] = useAction((id: string) => store.remove('habits', id))

  const stats: any[] = useMemo(() => habitStats(data.habits, data.habit_logs, today, w), [data.habits, data.habit_logs, today, w])
  const summary = useMemo(() => habitSummary(stats, day), [stats, day])
  const active: any[] = summary.active
  const visible = stats.filter((s) => showArchived || !s.habit.archived_at)
  const { levels } = useMemo(() => habitHeatmap(active, focus, today), [active, focus, today])

  const m = menu, h = m?.habit, mlog = m?.logs.find((l: any) => l.log_date === day)
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView refreshControl={pullToRefresh(refreshing, refetch)} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Txt variant="title">Habits</Txt>
          <Button title="＋ New" onPress={() => setForm({ open: true, habit: null })} />
        </View>
        <DataGate loading={loading} error={error} onRetry={refetch}>
          {stats.length === 0 ? (
            <EmptyState title="Build your first habit" description="Daily, weekly or on specific days. Check in with one tap and watch the streak grow." action={{ label: 'Create a habit', onPress: () => setForm({ open: true, habit: null }) }} />
          ) : (<>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              <StatTile label={day === today ? 'Done today' : 'Done that day'} value={`${summary.doneToday}/${summary.total}`} progress={summary.total ? (summary.doneToday / summary.total) * 100 : 0} tone="success" />
              <StatTile label="Best current streak" value={summary.bestCurrent} sub="days / weeks" />
              <StatTile label="Longest streak" value={summary.longest} sub="across all habits" />
              <StatTile label="30-day completion" value={pctText(summary.avg30)} progress={summary.avg30 == null ? null : summary.avg30 * 100} />
            </View>
            <DateNav date={day} today={today} onChange={setDate} />
            <View style={{ gap: 10 }}>{visible.map((s) => <HabitRow key={s.habit.id} s={s} date={day} onMenu={setMenu} />)}</View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Txt muted variant="small">Show archived</Txt>
              <Switch accessibilityLabel="Show archived habits" value={showArchived} onValueChange={setShowArchived} trackColor={{ true: colors.primary }} />
            </View>
            <Card>
              <Txt variant="heading">Consistency</Txt>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>
                <Chip label="All habits" selected={focus === 'all'} onPress={() => setFocus('all')} />
                {active.map((s) => <Chip key={s.habit.id} label={s.habit.name} color={s.habit.color} selected={focus === s.habit.id} onPress={() => setFocus(s.habit.id)} />)}
              </ScrollView>
              {levels.size === 0 ? <Txt muted>Check in on a habit and your heatmap starts filling in.</Txt> : <Heatmap levels={levels} today={today} weekStartsOn={w} selected={day} onSelect={setDate} />}
            </Card>
            <Card>
              <Txt variant="heading">Per-habit stats</Txt>
              {active.map((s) => (
                <View key={s.habit.id} style={{ gap: 6, paddingVertical: 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text numberOfLines={1} style={{ color: colors.foreground, flex: 1 }}>{s.habit.name}</Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Now {s.current}{s.unit} · Best {s.longest}{s.unit} · {pctText(s.rateAll)}</Text>
                  </View>
                  <ProgressBar value={(s.rateAll ?? 0) * 100} color={s.habit.color} label={`${s.habit.name} completion`} />
                </View>
              ))}
            </Card>
          </>)}
        </DataGate>
      </ScrollView>
      <ActionSheet visible={!!m} title={h?.name ?? ''} onClose={() => setMenu(null)} actions={m ? [
        { label: 'Skip this day', hidden: !!h.archived_at, onPress: () => setStatus(h.id, 'skipped') },
        { label: 'Rest day', hidden: !!h.archived_at, onPress: () => setStatus(h.id, 'rest') },
        { label: 'Clear check-in', hidden: !mlog, onPress: () => setStatus(h.id, null) },
        { label: 'Edit', onPress: () => setForm({ open: true, habit: h }) },
        { label: h.archived_at ? 'Restore' : 'Archive', onPress: () => patch(h.id, { archived_at: h.archived_at ? null : new Date().toISOString() }) },
        { label: 'Delete', destructive: true, onPress: async () => { if (await confirm(`Delete "${h.name}"?`, 'This permanently deletes the habit and its whole history. Archive it instead to keep the history.')) del(h.id) } },
      ] : []} />
      <HabitForm visible={form.open} habit={form.habit} today={today} onClose={() => setForm({ open: false, habit: null })} />
    </SafeAreaView>
  )
}
