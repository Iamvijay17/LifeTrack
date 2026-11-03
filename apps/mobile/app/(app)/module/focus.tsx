import { useMemo, useState } from 'react'
import { Alert, ScrollView, Text, Vibration, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Circle } from 'react-native-svg'
import { fmtDay, fmtDuration, timeStrInTz } from '@lifetrack/utils'
import { completedCount, dailyFocus, fmtClock, focusMinutes, nextBreak, PRESETS, weekRange } from '@lifetrack/core/focus'
import { FOCUS_MODE_LABEL, focusMinutesFor, focusSessionName, isValidFocusMinutes, parseFocusTarget } from '@lifetrack/core/focusTimer'
import { api, store } from '../../../src/data/client'
import { haptics } from '../../../src/lib/haptics'
import { useTables } from '../../../src/hooks/useTables'
import { useSettings } from '../../../src/hooks/useSettings'
import { useToday } from '../../../src/hooks/useToday'
import { useAction } from '../../../src/hooks/useAction'
import { useFocusTimer, type FocusState } from '../../../src/hooks/useFocusTimer'
import { useTheme } from '../../../src/providers/ThemeProvider'
import { BarChart } from '../../../src/ui/charts'
import { ModuleHeader } from '../../../src/ui/ModuleHeader'
import { confirm } from '../../../src/ui/confirm'
import { DataGate, EmptyState, Segmented, SelectField, StatTile, pullToRefresh, Chip } from '../../../src/ui/controls'
import { Button, Card, Field, Txt } from '../../../src/ui'

type Mode = FocusState['mode']

function Dial({ left, total, mode }: { left: number; total: number; mode: Mode }) {
  const { colors } = useTheme()
  const r = 88, c = 2 * Math.PI * r, pct = total ? Math.max(0, Math.min(1, left / total)) : 1
  return (
    <View accessible accessibilityRole="timer" accessibilityLabel={`${fmtClock(left)} remaining`} style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={220} height={220} viewBox="0 0 200 200" style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={100} cy={100} r={r} fill="none" stroke={colors.muted} strokeWidth={8} />
        <Circle cx={100} cy={100} r={r} fill="none" stroke={mode === 'focus' ? colors.primary : colors.success} strokeWidth={8} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
      </Svg>
      <Text style={{ position: 'absolute', color: colors.foreground, fontSize: 44, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{fmtClock(left)}</Text>
    </View>
  )
}

export default function Focus() {
  const { colors } = useTheme()
  const today = useToday()
  const { settings } = useSettings()
  const prefs = settings.focus_prefs as { short_break: number; long_break: number; long_every: number }
  const { data, loading, refreshing, error, refetch } = useTables('focus_sessions', 'tasks', 'learning_topics')
  const [mode, setMode] = useState<Mode>('focus')
  const [preset, setPreset] = useState('25')
  const [custom, setCustom] = useState('30')
  const [target, setTarget] = useState('')
  const [label, setLabel] = useState('')

  const todays = useMemo(() => data.focus_sessions.filter((s: any) => s.session_date === today), [data.focus_sessions, today])
  const doneToday = completedCount(todays)
  const [save] = useAction(api.recordFocus)

  const timer = useFocusTimer({
    onFinish: async (t, completed) => {
      Vibration.vibrate([0, 300, 150, 300])
      haptics.success()
      if (t.mode === 'focus') {
        await save({ plannedMinutes: t.plannedMinutes, actualSeconds: t.plannedMinutes * 60, completed, taskId: t.taskId, topicId: t.topicId, label: t.label, date: today })
        setMode(nextBreak(doneToday + 1, prefs.long_every) as Mode)
        Alert.alert('Focus session complete', `${t.plannedMinutes} minutes recorded.`)
      } else { setMode('focus'); Alert.alert('Break over', 'Ready for the next focus block?') }
    },
  })

  const minutes = focusMinutesFor(mode, preset, custom, prefs)
  const valid = isValidFocusMinutes(minutes)
  const begin = () => {
    if (!valid) { Alert.alert('Check the duration', 'Choose a duration between 1 and 240 minutes.'); return }
    timer.start({ mode, plannedMinutes: minutes, ...parseFocusTarget(target), label })
  }
  const [stopEarly] = useAction(async () => {
    const t = timer.timer
    if (!t) return
    const spent = timer.stop()
    if (t.mode !== 'focus') return
    const r = await api.recordFocus({ plannedMinutes: t.plannedMinutes, actualSeconds: spent, completed: false, taskId: t.taskId, topicId: t.topicId, label: t.label, date: today })
    if (!r) Alert.alert('Stopped', 'Under a minute, so nothing was recorded.')
  })
  const [remove] = useAction((id: string) => store.remove('focus_sessions', id))

  const { from, to } = weekRange(today, settings.week_starts_on)
  const week = useMemo(() => dailyFocus(data.focus_sessions, from, to).map((d: any) => ({ label: fmtDay(d.date, 'EEE'), value: d.minutes })), [data.focus_sessions, from, to])
  const weekTotal = week.reduce((a: number, d: any) => a + d.value, 0)
  const active = timer.timer
  const shownMode = active?.mode ?? mode
  const total = (active?.plannedMinutes ?? (valid ? minutes : 25)) * 60
  const openTasks = data.tasks.filter((t: any) => t.status === 'pending' || t.status === 'in_progress')
  const targetOptions = [
    { value: '', label: 'Nothing specific' },
    ...openTasks.map((t: any) => ({ value: `task:${t.id}`, label: t.title, group: 'Tasks' })),
    ...data.learning_topics.filter((t: any) => !t.archived).map((t: any) => ({ value: `topic:${t.id}`, label: t.name, group: t.group_name })),
  ]

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView refreshControl={pullToRefresh(refreshing, refetch)} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
        <ModuleHeader title="Focus Timer" />
        <DataGate loading={loading || !timer.ready} error={error} onRetry={refetch}>
          <Card>
            <View style={{ gap: 14 }}>
              {!active ? <Segmented value={mode} onChange={setMode} options={[{ value: 'focus', label: 'Focus' }, { value: 'short_break', label: 'Short' }, { value: 'long_break', label: 'Long' }]} /> : <Txt style={{ textAlign: 'center', color: colors.secondary }}>{FOCUS_MODE_LABEL[active.mode]}{active.label ? ` · ${active.label}` : ''}</Txt>}
              <Dial left={active ? timer.left : valid ? minutes * 60 : 0} total={total} mode={shownMode} />
              {!active ? (
                <View style={{ gap: 12 }}>
                  {mode === 'focus' ? (<>
                    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                      {PRESETS.map((p: any) => <Chip key={p.minutes} label={p.label} selected={preset === String(p.minutes)} onPress={() => setPreset(String(p.minutes))} />)}
                      <Chip label="Custom" selected={preset === 'custom'} onPress={() => setPreset('custom')} />
                    </View>
                    {preset === 'custom' ? <Field label="Minutes" value={custom} onChangeText={setCustom} keyboardType="number-pad" maxLength={3} /> : null}
                    <SelectField label="Working on" value={target} options={targetOptions} onChange={setTarget} />
                    <Field label="Note (optional)" value={label} onChangeText={setLabel} maxLength={120} placeholder="e.g. Chapter 4 exercises" />
                  </>) : <Txt muted style={{ textAlign: 'center' }}>{minutes}-minute break. Change break lengths in Settings.</Txt>}
                  <Button title={`Start ${FOCUS_MODE_LABEL[mode].toLowerCase()}`} onPress={begin} disabled={!valid} />
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  {timer.running ? <Button title="Pause" variant="ghost" onPress={timer.pause} /> : <Button title="Resume" onPress={timer.resume} />}
                  {active.mode === 'focus'
                    ? <Button title="Stop & save" variant="ghost" onPress={() => stopEarly()} />
                    : <Button title="Skip break" variant="ghost" onPress={async () => { if (await confirm('Skip this break?', undefined, 'Skip')) { timer.stop(); setMode('focus') } }} />}
                </View>
              )}
            </View>
          </Card>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <StatTile label="Focus today" value={fmtDuration(Math.round(focusMinutes(todays)))} sub={`${doneToday} completed block${doneToday === 1 ? '' : 's'}`} />
            <StatTile label="This week" value={fmtDuration(Math.round(weekTotal))} sub={`${fmtDay(from, 'd MMM')} – ${fmtDay(to, 'd MMM')}`} />
          </View>
          <Card><Txt variant="heading">Weekly focus (minutes)</Txt><BarChart data={week} summary={`Focus minutes this week: ${week.map((d: any) => `${d.label} ${d.value}`).join(', ')}`} /></Card>
          <Card>
            <Txt variant="heading">Today&apos;s sessions</Txt>
            {todays.length === 0 ? <EmptyState title="No focus sessions yet today" description="Start a 25-minute block — short, distraction-free work adds up." /> : [...todays].sort((a: any, b: any) => b.started_at.localeCompare(a.started_at)).map((s: any) => {
              const name = focusSessionName(s, data.tasks, data.learning_topics)
              return (
                <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
                  <View accessibilityLabel={s.completed ? 'completed' : 'stopped early'} style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.completed ? colors.success : colors.warning }} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: colors.foreground, fontWeight: '500' }}>{name || 'Focus'}{s.label && s.label !== name ? ` — ${s.label}` : ''}</Text>
                    <Txt variant="small" muted>{timeStrInTz(s.started_at, settings.timezone)} · {Math.round(s.actual_seconds / 60)} of {s.planned_minutes} min{s.completed ? '' : ' (stopped early)'}</Txt>
                  </View>
                  <Button title="Delete" variant="ghost" onPress={async () => { if (await confirm('Delete this session?')) remove(s.id) }} />
                </View>
              )
            })}
          </Card>
        </DataGate>
      </ScrollView>
    </SafeAreaView>
  )
}
