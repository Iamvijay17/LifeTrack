import { useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { fmtDay, weekday } from '@lifetrack/utils'
import { personalRecords, recordText } from '@lifetrack/core/records'
import { DAY_NAMES, dayStatus, exerciseGroups, fitnessWeek, measurementLine, offDayWorkout, planFor, sortedHistory, summarizeSets, todayHeadline, weightHistory, workoutMeta } from '@lifetrack/core/fitness'
import { store } from '../../../src/data/client'
import { useTables } from '../../../src/hooks/useTables'
import { useSettings } from '../../../src/hooks/useSettings'
import { useToday } from '../../../src/hooks/useToday'
import { useAction } from '../../../src/hooks/useAction'
import { useTheme } from '../../../src/providers/ThemeProvider'
import { ExerciseForm, MeasurementForm, RoutineForm, WorkoutForm } from '../../../src/features/fitness/forms'
import { BarChart, LineChart } from '../../../src/ui/charts'
import { ModuleHeader } from '../../../src/ui/ModuleHeader'
import { ActionSheet } from '../../../src/ui/Sheet'
import { confirm } from '../../../src/ui/confirm'
import { Badge, DataGate, EmptyState, Segmented, SelectField, StatTile, pullToRefresh } from '../../../src/ui/controls'
import { AnimatedNumber, Hero } from '../../../src/ui/motion'
import { Button, Card, Txt } from '../../../src/ui'

type Tab = 'week' | 'routines' | 'history' | 'library' | 'body'
export default function Fitness() {
  const { colors } = useTheme()
  const today = useToday()
  const { settings, save: saveSettings } = useSettings()
  const w = settings.week_starts_on
  const { data, loading, refreshing, error, refetch } = useTables('workouts', 'exercise_logs', 'routines', 'exercises', 'body_measurements', 'health_logs')
  const [tab, setTab] = useState<Tab>('week')
  const [wForm, setWForm] = useState<{ open: boolean; workout: any | null; date: string; routineId: string | null }>({ open: false, workout: null, date: today, routineId: null })
  const [rForm, setRForm] = useState<{ open: boolean; routine: any | null }>({ open: false, routine: null })
  const [eForm, setEForm] = useState(false)
  const [mForm, setMForm] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ kind: 'workout' | 'routine' | 'exercise' | 'measurement'; item: any } | null>(null)
  const [del] = useAction((table: string, id: string) => store.remove(table, id))
  const [setOff] = useAction((status: string, date: string) => store.insert('workouts', offDayWorkout(status, date)))
  const [setPlan, planning] = useAction((dow: string, value: string) => saveSettings({ workout_plan: { ...settings.workout_plan, [dow]: value || null } }))

  const routines: any[] = data.routines.filter((r: any) => !r.archived_at)
  const plan = settings.workout_plan ?? {}
  const fw: any = useMemo(() => fitnessWeek({ workouts: data.workouts, logs: data.exercise_logs, plan, today, weekStartsOn: w }), [data.workouts, data.exercise_logs, plan, today, w])
  const { weekDays, byWorkout, stats, weeks, completed } = fw
  const wh: any = useMemo(() => weightHistory(data.health_logs), [data.health_logs])
  const todayDone: any[] = data.workouts.filter((x: any) => x.workout_date === today)
  const planToday = planFor(today, plan, routines)
  const history: any[] = sortedHistory(data.workouts)
  const records: any[] = useMemo(() => personalRecords(data.exercise_logs, data.workouts), [data.exercise_logs, data.workouts])
  const { lib, groups } = exerciseGroups(data.exercises) as any
  const m = menu

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView refreshControl={pullToRefresh(refreshing, refetch)} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
        <ModuleHeader title="Gym & Fitness" action={<Button title="＋ Log" onPress={() => setWForm({ open: true, workout: null, date: today, routineId: null })} />} />
        <DataGate loading={loading} error={error} onRetry={refetch}>
          <Hero>
            <Txt variant="small" muted>Workouts this week</Txt>
            <AnimatedNumber value={stats.count} style={{ color: colors.foreground, fontSize: 44, fontWeight: '800', letterSpacing: -1.5 }} />
            <Txt variant="small" muted>{stats.planned ? `${stats.hit}/${stats.planned} planned days done` : 'no days planned yet'}</Txt>
            <View accessibilityElementsHidden style={{ flexDirection: 'row', gap: 6, marginTop: 12 }}>
              {weekDays.map((d: string) => {
                const trained = completed.some((x: any) => x.workout_date === d)
                return (
                  <View key={d} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                    <Text style={{ color: d === today ? colors.foreground : colors.mutedForeground, fontSize: 10, fontWeight: '600' }}>{fmtDay(d, 'EEEEE')}</Text>
                    <View style={{ width: '100%', maxWidth: 38, aspectRatio: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: trained ? '#F97316' : colors.muted, borderWidth: d === today ? 2 : 0, borderColor: '#F97316' }}>
                      {trained ? <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>✓</Text> : null}
                    </View>
                  </View>
                )
              })}
            </View>
          </Hero>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <StatTile label="Training time" value={`${stats.minutes} min`} sub={stats.cardio ? `${stats.cardio} min cardio` : 'this week'} />
            <StatTile label="Volume" value={`${Math.round(stats.vol).toLocaleString('en-IN')} kg`} sub="reps × weight, this week" />
            <StatTile label="Body weight" value={wh.latest ? `${wh.latest.weight_kg} kg` : '—'} sub={wh.latest ? `as of ${fmtDay(wh.latest.log_date, 'd MMM')}` : 'not logged yet'} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ minWidth: 340 }}>
              <Segmented value={tab} onChange={setTab} options={[{ value: 'week', label: 'Week' }, { value: 'routines', label: 'Routines' }, { value: 'history', label: 'History' }, { value: 'library', label: 'Exercises' }, { value: 'body', label: 'Body' }]} />
            </View>
          </ScrollView>

          {tab === 'week' ? (<>
            <Card>
              <Txt variant="heading">Today</Txt>
              <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: '600' }}>{todayHeadline(todayDone, planToday)}</Text>
              {!todayDone.length ? (
                <View style={{ gap: 8, marginTop: 6 }}>
                  <Button title="Log workout" onPress={() => setWForm({ open: true, workout: null, date: today, routineId: null })} />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}><Button title="Rest day" variant="ghost" onPress={() => setOff('rest', today)} /></View>
                    <View style={{ flex: 1 }}><Button title="Skip" variant="ghost" onPress={() => setOff('skipped', today)} /></View>
                  </View>
                </View>
              ) : null}
              {todayDone.some((x) => x.status !== 'completed') ? <Button title="Undo" variant="ghost" onPress={() => todayDone.filter((x) => x.status !== 'completed').forEach((x) => store.remove('workouts', x.id))} /> : null}
            </Card>
            <Card>
              <Txt variant="heading">Weekly plan</Txt>
              <Txt variant="small" muted>Choose a routine, rest, or leave flexible</Txt>
              {weekDays.map((d: string) => {
                const dow = String(weekday(d)), st = dayStatus(d, data.workouts)
                return (
                  <View key={d} style={{ paddingVertical: 6, gap: 4, backgroundColor: d === today ? colors.accent : 'transparent', borderRadius: 8, paddingHorizontal: 6 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ color: colors.foreground, fontWeight: '600' }}>{DAY_NAMES[Number(dow)].slice(0, 3)} · {fmtDay(d, 'd MMM')}{d === today ? '  TODAY' : ''}</Text>
                      {st ? <Badge tone={st === 'done' ? 'success' : 'neutral'}>{st === 'done' ? 'Done' : st === 'rest' ? 'Rest' : 'Skipped'}</Badge> : null}
                    </View>
                    <SelectField label={`Plan for ${DAY_NAMES[Number(dow)]}`} value={plan[dow] ?? ''} onChange={(v) => { if (!planning) setPlan(dow, v) }}
                      options={[{ value: '', label: 'Flexible / unplanned' }, { value: 'rest', label: 'Rest day' }, ...routines.map((r) => ({ value: r.id, label: r.name }))]} />
                  </View>
                )
              })}
              {routines.length === 0 ? <Txt variant="small" muted>Create a routine in the Routines tab to assign it to days.</Txt> : null}
            </Card>
            <Card><Txt variant="heading">Workouts per week</Txt><BarChart data={weeks.map((x: any) => ({ label: x.label, value: x.workouts }))} color={colors.success} summary={`Workouts per week: ${weeks.map((x: any) => `${x.label} ${x.workouts}`).join(', ')}`} /></Card>
          </>) : null}

          {tab === 'routines' ? (<>
            <Button title="New routine" variant="ghost" onPress={() => setRForm({ open: true, routine: null })} />
            {routines.length === 0 ? <EmptyState title="No routines yet" description="Build your own routines — push/pull/legs, full body, anything. Then assign them to days." action={{ label: 'Create routine', onPress: () => setRForm({ open: true, routine: null }) }} />
              : routines.map((r) => (
                <Card key={r.id} onPress={() => setMenu({ kind: 'routine', item: r })}>
                  <Text style={{ color: colors.foreground, fontWeight: '600', fontSize: 16 }}>{r.name}</Text>
                  {r.exercises.map((e: any, i: number) => <Txt key={i} variant="small" muted>{e.name} · {e.sets}×{e.reps}{Number(e.weight_kg) ? ` @ ${e.weight_kg}kg` : ''}</Txt>)}
                </Card>
              ))}
          </>) : null}

          {tab === 'history' && records.length > 0 ? (
            <Card>
              <Txt variant="heading">Personal records</Txt>
              {records.slice(0, 5).map((r) => (
                <View key={r.name} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 6 }}>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: colors.foreground, fontWeight: '500' }}>{r.name}</Text>
                    <Txt variant="small" muted>{fmtDay(r.date, 'd MMM yyyy')}</Txt>
                  </View>
                  <Text style={{ color: colors.foreground, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{recordText(r)}</Text>
                </View>
              ))}
            </Card>
          ) : null}
          {tab === 'history' ? (history.length === 0
            ? <EmptyState title="No workouts logged" description="Your sets, reps and weights will be listed here." />
            : history.slice(0, 100).map((x) => {
              const sets = byWorkout.get(x.id) ?? [], open = openId === x.id
              return (
                <Card key={x.id}>
                  <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpenId(open ? null : x.id)} onLongPress={() => setMenu({ kind: 'workout', item: x })}>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      <Text numberOfLines={1} style={{ color: colors.foreground, fontWeight: '600', flex: 1 }}>{x.name}</Text>
                      {x.status !== 'completed' ? <Badge>{x.status === 'rest' ? 'Rest day' : 'Skipped'}</Badge> : null}
                      <Text style={{ color: colors.mutedForeground }}>{open ? '▴' : '▾'}</Text>
                    </View>
                    <Txt variant="small" muted>{workoutMeta(x, sets)}</Txt>
                  </Pressable>
                  {open ? (<View style={{ gap: 4, marginTop: 6 }}>
                    {(summarizeSets(sets) as any[]).map((e) => <Text key={e.name} style={{ color: colors.foreground }}><Text style={{ fontWeight: '700' }}>{e.name}</Text> <Text style={{ color: colors.mutedForeground }}>{e.text}</Text></Text>)}
                    {!sets.length ? <Txt muted>{x.notes || 'No sets recorded.'}</Txt> : null}
                    <Button title="Actions…" variant="ghost" onPress={() => setMenu({ kind: 'workout', item: x })} />
                  </View>) : null}
                </Card>
              )
            })) : null}

          {tab === 'library' ? (<>
            <Button title="New exercise" variant="ghost" onPress={() => setEForm(true)} />
            {groups.map(({ group, items }: any) => (
              <View key={group} style={{ gap: 6 }}>
                <Text accessibilityRole="header" style={{ color: colors.mutedForeground, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>{group}</Text>
                {items.map((e: any) => (
                  <Pressable key={e.id} accessibilityRole="button" accessibilityLabel={`Options for ${e.name}`} onPress={() => setMenu({ kind: 'exercise', item: e })} style={{ minHeight: 44, justifyContent: 'center' }}>
                    <Text style={{ color: colors.foreground }}>{e.name}{e.equipment ? <Text style={{ color: colors.mutedForeground }}> · {e.equipment}</Text> : null}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
            {lib.length === 0 ? <EmptyState title="No exercises" description="Add the exercises you use." /> : null}
          </>) : null}

          {tab === 'body' ? (<>
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Txt variant="heading">Weight trend</Txt><Button title="Log" variant="ghost" onPress={() => setMForm(true)} /></View>
              {wh.series.length < 2 ? <Txt muted>Log weight on two or more days to see a trend.</Txt> : <LineChart data={wh.series.map((p: any) => ({ label: p.label, value: p.kg }))} unit=" kg" summary={`Weight trend, latest ${wh.latest.weight_kg} kg`} />}
            </Card>
            <Card>
              <Txt variant="heading">Measurements</Txt>
              {data.body_measurements.length === 0 ? <Txt muted>No measurements yet.</Txt> : [...data.body_measurements].sort((a: any, b: any) => b.measured_on.localeCompare(a.measured_on)).map((x: any) => (
                <Pressable key={x.id} accessibilityRole="button" accessibilityLabel={`Options for ${fmtDay(x.measured_on, 'd MMMM yyyy')}`} onPress={() => setMenu({ kind: 'measurement', item: x })} style={{ paddingVertical: 8, minHeight: 44 }}>
                  <Text style={{ color: colors.foreground, fontWeight: '600' }}>{fmtDay(x.measured_on, 'd MMM yyyy')}</Text>
                  <Txt variant="small" muted>{measurementLine(x) || '—'}</Txt>
                </Pressable>
              ))}
            </Card>
          </>) : null}
        </DataGate>
      </ScrollView>

      <ActionSheet visible={!!m} title={m ? (m.kind === 'workout' ? m.item.name : m.kind === 'measurement' ? fmtDay(m.item.measured_on, 'd MMM yyyy') : m.item.name) : ''} onClose={() => setMenu(null)} actions={m ? ({
        workout: [
          { label: 'Edit', hidden: m.item.status !== 'completed', onPress: () => setWForm({ open: true, workout: m.item, date: m.item.workout_date, routineId: null }) },
          { label: 'Delete', destructive: true, onPress: async () => { if (await confirm('Delete this workout?', `${m.item.name} · ${fmtDay(m.item.workout_date)}. Its sets are deleted too.`)) del('workouts', m.item.id) } },
        ],
        routine: [
          { label: 'Start workout', onPress: () => setWForm({ open: true, workout: null, date: today, routineId: m.item.id }) },
          { label: 'Edit', onPress: () => setRForm({ open: true, routine: m.item }) },
          { label: 'Delete', destructive: true, onPress: async () => { if (await confirm(`Delete ${m.item.name}?`, 'Logged workouts stay in your history.')) del('routines', m.item.id) } },
        ],
        exercise: [{ label: 'Remove from library', destructive: true, onPress: async () => { if (await confirm(`Remove ${m.item.name} from the library?`, 'Past workouts keep the exercise name.')) del('exercises', m.item.id) } }],
        measurement: [{ label: 'Delete entry', destructive: true, onPress: async () => { if (await confirm('Delete this entry?')) del('body_measurements', m.item.id) } }],
      })[m.kind] : []} />
      <WorkoutForm visible={wForm.open} workout={wForm.workout} sets={wForm.workout ? byWorkout.get(wForm.workout.id) ?? [] : []} routines={routines} library={lib} today={today} date={wForm.date} routineId={wForm.routineId} onClose={() => setWForm((f) => ({ ...f, open: false }))} />
      <RoutineForm visible={rForm.open} routine={rForm.routine} library={lib} onClose={() => setRForm({ open: false, routine: null })} />
      <ExerciseForm visible={eForm} onClose={() => setEForm(false)} />
      <MeasurementForm visible={mForm} today={today} onClose={() => setMForm(false)} />
    </SafeAreaView>
  )
}
