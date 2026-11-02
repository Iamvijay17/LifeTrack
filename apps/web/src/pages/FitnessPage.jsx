import { useMemo, useState } from 'react'
import { Bar, BarChart, Line, LineChart } from 'recharts'
import { ChevronDown, Dumbbell, Flame, Moon, Pencil, Plus, Ruler, Scale, Timer, Trash2, Trophy } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate, EmptyState } from '@/components/shared/states'
import { StatCard } from '@/components/shared/StatCard'
import { Chart, C, grid, tooltip, xAxis, yAxis } from '@/components/shared/charts'
import { ExerciseDialog, MeasurementDialog, RoutineDialog, WorkoutDialog } from '@/features/fitness/dialogs'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/form'
import { Badge, Segmented } from '@/components/ui/misc'
import { Menu } from '@/components/ui/menu'
import { useConfirm } from '@/components/shared/Confirm'
import { useTables } from '@/hooks/store'
import * as store from '@/hooks/store'
import { useSettings } from '@/hooks/useSettings'
import { useToday } from '@/hooks/useToday'
import { useAction } from '@/hooks/useAction'
import { fmtDay, weekday } from '@/lib/dates'
import { DAY_NAMES, exerciseGroups, fitnessWeek, measurementLine, offDayWorkout, planFor, sortedHistory, summarizeSets, todayHeadline, volume, weightHistory, workoutMeta } from '@lifetrack/core/fitness'
import { cn } from '@/lib/utils'

export default function FitnessPage() {
  const today = useToday()
  const confirm = useConfirm()
  const { settings, save: saveSettings } = useSettings()
  const w = settings.week_starts_on
  const { data, loading, error, refetch } = useTables('workouts', 'exercise_logs', 'routines', 'exercises', 'body_measurements', 'health_logs')
  const [tab, setTab] = useState('week')
  const [wDlg, setWDlg] = useState({ open: false, workout: null, date: today })
  const [rDlg, setRDlg] = useState({ open: false, routine: null })
  const [eDlg, setEDlg] = useState(false)
  const [mDlg, setMDlg] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [delW] = useAction((id) => store.remove('workouts', id), { success: 'Workout deleted' })
  const [delR] = useAction((id) => store.remove('routines', id), { success: 'Routine deleted' })
  const [delE] = useAction((id) => store.remove('exercises', id), { success: 'Exercise removed' })
  const [delM] = useAction((id) => store.remove('body_measurements', id), { success: 'Entry deleted' })
  const [setOff] = useAction((status, date) => store.insert('workouts', offDayWorkout(status, date)), { success: 'Saved' })
  const [setPlan, planning] = useAction((dow, value) => saveSettings({ workout_plan: { ...settings.workout_plan, [dow]: value || null } }), { success: 'Plan updated' })

  const routines = data.routines.filter((r) => !r.archived_at)
  const plan = settings.workout_plan ?? {}
  const fw = useMemo(() => fitnessWeek({ workouts: data.workouts, logs: data.exercise_logs, plan, today, weekStartsOn: w }), [data.workouts, data.exercise_logs, plan, today, w])
  const { weekDays, byWorkout: setsByWorkout, completed, weeks, stats: weekStats } = fw
  const planLabel = (d) => planFor(d, plan, routines)
  const { weights, series: weightData } = useMemo(() => weightHistory(data.health_logs), [data.health_logs])
  const todayDone = data.workouts.filter((x) => x.workout_date === today)
  const planToday = planLabel(today)
  const history = sortedHistory(data.workouts)
  const { lib, groups: libGroups } = exerciseGroups(data.exercises)

  return (
    <>
      <PageHeader title="Gym & Fitness" description="Your plan, your split — nothing is hardcoded."
        actions={<Button onClick={() => setWDlg({ open: true, workout: null, date: today, routineId: null })}><Plus className="h-4 w-4" />Log workout</Button>} />
      <DataGate loading={loading} error={error} onRetry={refetch}>
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={Dumbbell} label="Workouts this week" value={weekStats.count} sub={weekStats.planned ? `${weekStats.hit}/${weekStats.planned} planned days done` : 'no days planned yet'} progress={weekStats.planned ? (weekStats.hit / weekStats.planned) * 100 : null} tone="success" />
            <StatCard icon={Timer} label="Training time" value={`${weekStats.minutes} min`} sub={weekStats.cardio ? `${weekStats.cardio} min cardio` : 'this week'} />
            <StatCard icon={Trophy} label="Volume" value={`${Math.round(weekStats.vol).toLocaleString('en-IN')} kg`} sub="reps × weight, this week" />
            <StatCard icon={Scale} label="Body weight" value={weights.length ? `${weights.at(-1).weight_kg} kg` : '—'} sub={weights.length ? `as of ${fmtDay(weights.at(-1).log_date, 'd MMM')}` : 'not logged yet'} />
          </div>
          <Segmented value={tab} onChange={setTab} options={[{ value: 'week', label: 'This week' }, { value: 'routines', label: 'Routines' }, { value: 'history', label: 'History' }, { value: 'library', label: 'Exercises' }, { value: 'body', label: 'Body' }]} />

          {tab === 'week' && (
            <div className="grid gap-4 lg:grid-cols-5">
              <Card className="lg:col-span-3"><CardHeader><CardTitle>Weekly plan</CardTitle><span className="text-xs text-muted-foreground">Choose a routine, rest, or leave flexible</span></CardHeader><CardContent className="space-y-1.5">
                {weekDays.map((d) => {
                  const dow = String(weekday(d)), done = completed.some((x) => x.workout_date === d), off = data.workouts.find((x) => x.workout_date === d && x.status !== 'completed')
                  return (
                    <div key={d} className={cn('flex items-center gap-3 rounded-md px-2 py-1.5', d === today && 'bg-primary/10')}>
                      <div className="w-24 shrink-0"><p className="text-sm font-medium">{DAY_NAMES[dow].slice(0, 3)}{d === today && <span className="ml-1.5 text-[10px] text-secondary">TODAY</span>}</p><p className="text-xs text-muted-foreground">{fmtDay(d, 'd MMM')}</p></div>
                      <Select aria-label={`Plan for ${DAY_NAMES[dow]}`} className="flex-1" disabled={planning} value={plan[dow] ?? ''} onChange={(e) => setPlan(dow, e.target.value)}>
                        <option value="">Flexible / unplanned</option><option value="rest">Rest day</option>{routines.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </Select>
                      <div className="w-20 shrink-0 text-right">{done ? <Badge tone="success">Done</Badge> : off ? <Badge>{off.status === 'rest' ? 'Rest' : 'Skipped'}</Badge> : null}</div>
                    </div>)
                })}
                {routines.length === 0 && <p className="px-2 pt-2 text-xs text-muted-foreground">Create a routine in the Routines tab to assign it to days.</p>}
              </CardContent></Card>
              <div className="space-y-4 lg:col-span-2">
                <Card><CardContent className="space-y-3">
                  <p className="text-xs font-medium text-muted-foreground">Today</p>
                  <p className="text-lg font-semibold">{todayHeadline(todayDone, planToday)}</p>
                  {!todayDone.length && <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => setWDlg({ open: true, workout: null, date: today, routineId: null })}><Dumbbell className="h-4 w-4" />Log workout</Button><Button size="sm" variant="outline" onClick={() => setOff('rest', today)}><Moon className="h-4 w-4" />Rest day</Button><Button size="sm" variant="ghost" onClick={() => setOff('skipped', today)}>Skip</Button></div>}
                  {todayDone.some((x) => x.status !== 'completed') && <Button size="sm" variant="ghost" onClick={() => todayDone.filter((x) => x.status !== 'completed').forEach((x) => store.remove('workouts', x.id))}>Undo</Button>}
                </CardContent></Card>
                <Card><CardHeader><CardTitle>Workouts per week</CardTitle></CardHeader><CardContent><Chart height={150} empty={weeks.every((x) => !x.workouts)} emptyText="Log a workout to see consistency."><BarChart data={weeks}>{xAxis({ dataKey: 'label' })}{yAxis({ allowDecimals: false })}{tooltip()}<Bar dataKey="workouts" name="Workouts" fill={C.success} radius={[4, 4, 0, 0]} /></BarChart></Chart></CardContent></Card>
              </div>
            </div>)}

          {tab === 'routines' && (<div className="space-y-3">
            <div className="flex justify-end"><Button variant="outline" size="sm" onClick={() => setRDlg({ open: true, routine: null })}><Plus className="h-4 w-4" />New routine</Button></div>
            {routines.length === 0 ? <EmptyState icon={Dumbbell} title="No routines yet" description="Build your own routines — push/pull/legs, full body, anything. Then assign them to days." action={<Button onClick={() => setRDlg({ open: true, routine: null })}>Create routine</Button>} /> :
              <div className="grid gap-3 md:grid-cols-2">{routines.map((r) => (
                <Card key={r.id}><CardContent className="space-y-2">
                  <div className="flex items-center justify-between"><p className="font-medium">{r.name}</p>
                    <Menu label={`Actions for ${r.name}`} items={[{ label: 'Start workout', icon: Dumbbell, onClick: () => setWDlg({ open: true, workout: null, date: today, routineId: r.id }) }, { label: 'Edit', icon: Pencil, onClick: () => setRDlg({ open: true, routine: r }) }, { label: 'Delete', icon: Trash2, danger: true, onClick: async () => { if (await confirm({ title: `Delete ${r.name}?`, description: 'Logged workouts stay in your history.' })) delR(r.id) } }]} /></div>
                  <ul className="space-y-0.5 text-sm text-muted-foreground">{r.exercises.map((e, i) => <li key={i}>{e.name} <span className="text-xs">· {e.sets}×{e.reps}{Number(e.weight_kg) ? ` @ ${e.weight_kg}kg` : ''}</span></li>)}</ul>
                </CardContent></Card>))}</div>}
          </div>)}

          {tab === 'history' && (history.length === 0 ? <EmptyState icon={Flame} title="No workouts logged" description="Your sets, reps and weights will be listed here." /> : (
            <Card><ul className="divide-y divide-border">{history.slice(0, 100).map((x) => { const sets = setsByWorkout.get(x.id) ?? []; const open = openId === x.id; return (
              <li key={x.id}><div className="flex items-center gap-3 px-4 py-3">
                <button className="min-w-0 flex-1 text-left" onClick={() => setOpenId(open ? null : x.id)} aria-expanded={open}>
                  <p className="flex items-center gap-2 truncate text-sm font-medium">{x.name}{x.status !== 'completed' && <Badge>{x.status === 'rest' ? 'Rest day' : 'Skipped'}</Badge>}<ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} /></p>
                  <p className="text-xs text-muted-foreground">{workoutMeta(x, sets)}</p>
                </button>
                <Menu label="Workout actions" items={[{ label: 'Edit', icon: Pencil, hidden: x.status !== 'completed', onClick: () => setWDlg({ open: true, workout: x, date: x.workout_date }) }, { label: 'Delete', icon: Trash2, danger: true, onClick: async () => { if (await confirm({ title: 'Delete this workout?', description: `${x.name} · ${fmtDay(x.workout_date)}. Its sets are deleted too.` })) delW(x.id) } }]} />
              </div>
              {open && <div className="space-y-1 bg-muted/20 px-4 pb-3 text-sm">{summarizeSets(sets).map((e) => <p key={e.name}><b>{e.name}</b> <span className="text-muted-foreground">{e.text}</span></p>)}{!sets.length && <p className="text-muted-foreground">{x.notes || 'No sets recorded.'}</p>}</div>}</li>) })}</ul></Card>))}

          {tab === 'library' && (<div className="space-y-4">
            <div className="flex justify-end"><Button variant="outline" size="sm" onClick={() => setEDlg(true)}><Plus className="h-4 w-4" />New exercise</Button></div>
            {libGroups.map(({ group: g, items }) => (<section key={g}><h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{g}</h3>
              <div className="flex flex-wrap gap-2">{items.map((e) => (
                <span key={e.id} className="group inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-sm">{e.name}{e.equipment && <span className="text-xs text-muted-foreground">· {e.equipment}</span>}
                  <button aria-label={`Remove ${e.name}`} className="hidden text-muted-foreground hover:text-danger group-hover:inline focus:inline" onClick={async () => { if (await confirm({ title: `Remove ${e.name} from the library?`, description: 'Past workouts keep the exercise name.' })) delE(e.id) }}><Trash2 className="h-3 w-3" /></button></span>))}</div></section>))}
          </div>)}

          {tab === 'body' && (<div className="grid gap-4 lg:grid-cols-2">
            <Card><CardHeader><CardTitle>Weight trend</CardTitle><Button size="sm" variant="outline" onClick={() => setMDlg(true)}><Ruler className="h-4 w-4" />Log</Button></CardHeader><CardContent>
              <Chart height={220} empty={weightData.length < 2} emptyText="Log weight on two or more days to see a trend."><LineChart data={weightData}>{grid()}{xAxis({ dataKey: 'label' })}{yAxis({ domain: ['dataMin - 1', 'dataMax + 1'] })}{tooltip({ formatter: (v) => [`${v} kg`, 'Weight'] })}<Line dataKey="kg" stroke={C.primary} strokeWidth={2} dot={{ r: 2 }} /></LineChart></Chart></CardContent></Card>
            <Card><CardHeader><CardTitle>Measurements</CardTitle></CardHeader><CardContent className="p-0 pt-2">
              {data.body_measurements.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No measurements yet.</p> : <ul className="divide-y divide-border">{[...data.body_measurements].sort((a, b) => b.measured_on.localeCompare(a.measured_on)).map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm"><div><p className="font-medium">{fmtDay(m.measured_on, 'd MMM yyyy')}</p><p className="text-xs text-muted-foreground">{measurementLine(m)}</p></div>
                  <Button variant="ghost" size="icon-sm" aria-label="Delete measurement" onClick={async () => { if (await confirm({ title: 'Delete this entry?' })) delM(m.id) }}><Trash2 className="h-4 w-4" /></Button></li>))}</ul>}
            </CardContent></Card>
          </div>)}
        </div>
      </DataGate>
      <WorkoutDialog open={wDlg.open} workout={wDlg.workout} sets={wDlg.workout ? setsByWorkout.get(wDlg.workout.id) ?? [] : []} routines={routines} library={lib} today={today} date={wDlg.date} routineId={wDlg.routineId} onOpenChange={(o) => setWDlg((d) => ({ ...d, open: o }))} />
      <RoutineDialog open={rDlg.open} routine={rDlg.routine} library={lib} onOpenChange={(o) => setRDlg((d) => ({ ...d, open: o }))} />
      <ExerciseDialog open={eDlg} onOpenChange={setEDlg} />
      <MeasurementDialog open={mDlg} onOpenChange={setMDlg} today={today} />
    </>
  )
}
