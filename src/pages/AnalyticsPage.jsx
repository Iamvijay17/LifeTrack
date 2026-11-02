import { useMemo, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, Line, LineChart } from 'recharts'
import { BookOpen, Briefcase, Dumbbell, HeartPulse, Repeat, Wallet } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate } from '@/components/shared/states'
import { StatCard } from '@/components/shared/StatCard'
import { Chart, C, grid, tooltip, xAxis, yAxis } from '@/components/shared/charts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/form'
import { Progress, Segmented } from '@/components/ui/misc'
import { useTables } from '@/hooks/store'
import { useSettings } from '@/hooks/useSettings'
import { useToday } from '@/hooks/useToday'
import { avg, bucketize, rangeFor } from '@/domain/analytics'
import { counted, countedMinutes, goalProgress, problemsSolved } from '@/domain/learning'
import { funnel, salaryProgression } from '@/domain/jobs'
import { completion, streaks } from '@/domain/streaks'
import { categoryBreakdown } from '@/domain/finance'
import { addDays, eachDay, fmtDay, fmtDuration, inRange, weekday } from '@/lib/dates'
import { formatMoney } from '@/lib/money'

const pctText = (r) => (r == null ? '—' : `${Math.round(r * 100)}%`)
const Block = ({ icon: Icon, title, children }) => <section className="space-y-3"><h2 className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-secondary" />{title}</h2>{children}</section>
const Panel = ({ title, children }) => <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent>{children}</CardContent></Card>

export default function AnalyticsPage() {
  const today = useToday()
  const { settings } = useSettings()
  const w = settings.week_starts_on, cur = settings.currency
  const money = (p, o) => formatMoney(p, cur, o)
  const { data, loading, error, refetch } = useTables('study_sessions', 'goals', 'job_applications', 'application_history', 'interview_events', 'workouts', 'exercise_logs', 'health_logs', 'transactions', 'habits', 'habit_logs')
  const [preset, setPreset] = useState('month')
  const [custom, setCustom] = useState({ from: addDays(today, -29), to: today })
  const range = preset === 'custom' ? custom : rangeFor(preset, today, w)
  const valid = range.from <= range.to
  const { from, to } = valid ? range : { from: range.to, to: range.from }
  const upto = to > today ? today : to // never count the future

  const a = useMemo(() => {
    const sessions = data.study_sessions.filter((s) => inRange(s.session_date, from, to))
    const study = bucketize(counted(sessions), (s) => s.session_date, (s) => (s.duration_seconds ?? 0) / 3600, from, to, w)
    const apps = data.job_applications.filter((x) => inRange(x.applied_date, from, to))
    const jobs = funnel(data.job_applications, data.application_history, data.interview_events, from, to)
    const jobBuckets = bucketize(apps, (x) => x.applied_date, () => 1, from, to, w)
    const done = data.workouts.filter((x) => x.status === 'completed' && inRange(x.workout_date, from, to))
    const days = eachDay(from, upto > from ? upto : from).filter((d) => d <= today)
    const plannedDays = days.filter((d) => { const p = settings.workout_plan?.[String(weekday(d))]; return p && p !== 'rest' })
    const hit = plannedDays.filter((d) => done.some((x) => x.workout_date === d))
    const wBuckets = bucketize(done, (x) => x.workout_date, () => 1, from, to, w)
    const weights = data.health_logs.filter((h) => h.weight_kg != null && inRange(h.log_date, from, to)).sort((x, y) => x.log_date.localeCompare(y.log_date)).map((h) => ({ label: fmtDay(h.log_date, 'd MMM'), kg: Number(h.weight_kg) }))
    const hl = data.health_logs.filter((h) => inRange(h.log_date, from, to))
    const sleepB = bucketize(hl.filter((h) => h.sleep_minutes != null), (h) => h.log_date, (h) => h.sleep_minutes / 60, from, to, w)
    const sleepCount = bucketize(hl.filter((h) => h.sleep_minutes != null), (h) => h.log_date, () => 1, from, to, w)
    const sleepSeries = sleepB.data.map((d, i) => ({ label: d.label, hours: sleepCount.data[i].value ? Math.round((d.value / sleepCount.data[i].value) * 10) / 10 : undefined }))
    const tx = data.transactions.filter((t) => inRange(t.txn_date, from, to))
    const sum = { income: 0, expense: 0, savings: 0 }
    for (const t of tx) sum[t.type] += t.amount_paise
    const spend = bucketize(tx.filter((t) => t.type === 'expense'), (t) => t.txn_date, (t) => t.amount_paise / 100, from, to, w)
    const habits = data.habits.map((h) => { const logs = data.habit_logs.filter((l) => l.habit_id === h.id); return { h, ...completion(h, logs, from, to, today, w), ...streaks(h, logs, today, w) } })
    const ranked = habits.filter((x) => x.expected > 0).sort((x, y) => y.rate - x.rate || y.done - x.done)
    const totalDone = habits.reduce((s, x) => s + x.done, 0), totalExp = habits.reduce((s, x) => s + x.expected, 0)
    return { sessions, study, apps, jobs, jobBuckets, done, plannedDays, hit, wBuckets, weights, hl, sleepSeries, tx, sum, spend, habits, ranked, habitRate: totalExp ? totalDone / totalExp : null }
  }, [data, from, to, upto, w, today, settings.workout_plan])

  const mins = countedMinutes(a.sessions)
  const sleepAvg = avg(a.hl.filter((h) => h.sleep_minutes != null).map((h) => h.sleep_minutes))
  const waterAvg = avg(a.hl.filter((h) => h.water_ml > 0).map((h) => h.water_ml))
  const stepsAvg = avg(a.hl.filter((h) => h.steps > 0).map((h) => h.steps))
  const cats = categoryBreakdown(a.tx)
  const goals = data.goals.filter((g) => g.status !== 'archived')
  const longest = a.habits.reduce((m, x) => Math.max(m, x.longest), 0)

  return (
    <>
      <PageHeader title="Analytics" description="Everything here is computed from your real records. Empty ranges stay empty." />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented value={preset} onChange={setPreset} options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }, { value: 'custom', label: 'Custom' }]} />
        {preset === 'custom' && <div className="flex items-center gap-2"><Input type="date" aria-label="From" className="w-36" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })} /><span className="text-muted-foreground">→</span><Input type="date" aria-label="To" className="w-36" value={custom.to} min={custom.from} onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })} /></div>}
        <span className="text-xs text-muted-foreground">{fmtDay(from, 'd MMM yyyy')} – {fmtDay(to, 'd MMM yyyy')}</span>
      </div>
      <DataGate loading={loading} error={error} onRetry={refetch}>
        <div className="space-y-8">
          <Block icon={BookOpen} title="Career & learning">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><StatCard label="Study hours" value={fmtDuration(mins)} sub={`${counted(a.sessions).length} sessions`} /><StatCard label="DSA problems solved" value={problemsSolved(a.sessions)} /></div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title={`Study hours per ${a.study.unit}`}><Chart height={190} empty={mins === 0} emptyText="No completed study sessions in this range."><BarChart data={a.study.data.map((d) => ({ ...d, value: Math.round(d.value * 100) / 100 }))}>{grid()}{xAxis({ dataKey: 'label', minTickGap: 16 })}{yAxis()}{tooltip({ formatter: (v) => [`${v} h`, 'Studied'] })}<Bar dataKey="value" fill={C.primary} radius={[3, 3, 0, 0]} /></BarChart></Chart></Panel>
              <Panel title="Learning goals">{goals.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No goals yet.</p> : <ul className="space-y-3">{goals.map((g) => { const p = goalProgress(g, data.study_sessions); return <li key={g.id}><div className="mb-1 flex justify-between text-sm"><span className="truncate">{g.title}</span><span className="text-muted-foreground">{p.percent == null ? 'no target' : `${p.percent}%`}</span></div><Progress value={p.percent ?? 0} tone={p.percent >= 100 ? 'success' : 'primary'} label={g.title} /></li> })}</ul>}</Panel>
            </div>
          </Block>

          <Block icon={Briefcase} title="Job search">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><StatCard label="Applications" value={a.jobs.applied} /><StatCard label="Interviews" value={a.jobs.interviews} /><StatCard label="Rejections" value={a.jobs.rejections} /><StatCard label="Interview conversion" value={pctText(a.jobs.conversion)} sub={a.jobs.applied ? `${a.jobs.interviews}/${a.jobs.applied} applications` : 'no applications'} /></div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title={`Applications per ${a.jobBuckets.unit}`}><Chart height={180} empty={a.apps.length === 0} emptyText="No applications with an applied date in this range."><BarChart data={a.jobBuckets.data}>{grid()}{xAxis({ dataKey: 'label', minTickGap: 16 })}{yAxis({ allowDecimals: false })}{tooltip()}<Bar dataKey="value" name="Applications" fill={C.secondary} radius={[3, 3, 0, 0]} /></BarChart></Chart></Panel>
              <Panel title="Package progression (LPA)"><Chart height={180} empty={salaryProgression(data.job_applications.filter((x) => inRange(x.applied_date ?? x.created_at.slice(0, 10), from, to)), settings.timezone).length === 0} emptyText="No packages recorded in this range."><LineChart data={salaryProgression(data.job_applications.filter((x) => inRange(x.applied_date ?? x.created_at.slice(0, 10), from, to)), settings.timezone).map((d) => ({ ...d, label: fmtDay(d.date, 'd MMM') }))}>{grid()}{xAxis({ dataKey: 'label' })}{yAxis()}{tooltip({ formatter: (v, _n, p) => [`${v} LPA`, p.payload.company] })}<Line dataKey="lpa" stroke={C.success} strokeWidth={2} dot={{ r: 3 }} /></LineChart></Chart></Panel>
            </div>
          </Block>

          <Block icon={Dumbbell} title="Fitness">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><StatCard label="Workouts completed" value={a.done.length} /><StatCard label="Plan consistency" value={a.plannedDays.length ? pctText(a.hit.length / a.plannedDays.length) : '—'} sub={a.plannedDays.length ? `${a.hit.length}/${a.plannedDays.length} planned days` : 'no planned days'} progress={a.plannedDays.length ? (a.hit.length / a.plannedDays.length) * 100 : null} tone="success" /><StatCard label="Training time" value={fmtDuration(a.done.reduce((s, x) => s + (x.duration_minutes ?? 0), 0))} /><StatCard label="Weight change" value={a.weights.length > 1 ? `${(a.weights.at(-1).kg - a.weights[0].kg > 0 ? '+' : '')}${(a.weights.at(-1).kg - a.weights[0].kg).toFixed(1)} kg` : '—'} /></div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title={`Workouts per ${a.wBuckets.unit}`}><Chart height={180} empty={a.done.length === 0} emptyText="No workouts in this range."><BarChart data={a.wBuckets.data}>{grid()}{xAxis({ dataKey: 'label', minTickGap: 16 })}{yAxis({ allowDecimals: false })}{tooltip()}<Bar dataKey="value" name="Workouts" fill={C.success} radius={[3, 3, 0, 0]} /></BarChart></Chart></Panel>
              <Panel title="Weight trend (kg)"><Chart height={180} empty={a.weights.length < 2} emptyText="Log weight on two or more days in this range."><LineChart data={a.weights}>{grid()}{xAxis({ dataKey: 'label', minTickGap: 16 })}{yAxis({ domain: ['dataMin - 1', 'dataMax + 1'] })}{tooltip({ formatter: (v) => [`${v} kg`, 'Weight'] })}<Line dataKey="kg" stroke={C.primary} strokeWidth={2} dot={{ r: 2 }} /></LineChart></Chart></Panel>
            </div>
          </Block>

          <Block icon={HeartPulse} title="Sleep & health">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><StatCard label="Average sleep" value={sleepAvg == null ? '—' : fmtDuration(sleepAvg)} /><StatCard label="Average water" value={waterAvg == null ? '—' : `${Math.round(waterAvg)} ml`} /><StatCard label="Average steps" value={stepsAvg == null ? '—' : Math.round(stepsAvg).toLocaleString('en-IN')} /></div>
            <Panel title="Sleep (hours)"><Chart height={190} empty={a.sleepSeries.every((d) => d.hours == null)} emptyText="No sleep logged in this range."><AreaChart data={a.sleepSeries}>{grid()}{xAxis({ dataKey: 'label', minTickGap: 16 })}{yAxis({ domain: [0, 10] })}{tooltip({ formatter: (v) => [`${v} h`, 'Sleep'] })}<Area dataKey="hours" stroke={C.secondary} fill={C.secondary} fillOpacity={0.2} connectNulls /></AreaChart></Chart></Panel>
          </Block>

          <Block icon={Wallet} title="Finance">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><StatCard label="Income" value={money(a.sum.income)} /><StatCard label="Expenses" value={money(a.sum.expense)} /><StatCard label="Savings" value={money(a.sum.savings)} sub={a.sum.income ? `${Math.round((a.sum.savings / a.sum.income) * 100)}% of income` : undefined} /></div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title={`Spending per ${a.spend.unit}`}><Chart height={190} empty={a.sum.expense === 0} emptyText="No expenses in this range."><BarChart data={a.spend.data}>{grid()}{xAxis({ dataKey: 'label', minTickGap: 16 })}{yAxis({ width: 48 })}{tooltip({ formatter: (v) => [money(Math.round(v * 100)), 'Spent'] })}<Bar dataKey="value" fill={C.danger} radius={[3, 3, 0, 0]} /></BarChart></Chart></Panel>
              <Panel title="Top expense categories">{cats.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No expenses in this range.</p> : <ul className="space-y-3">{cats.slice(0, 6).map((c) => <li key={c.category}><div className="mb-1 flex justify-between text-sm"><span>{c.category}</span><span className="text-muted-foreground">{money(c.paise)} · {Math.round(c.share * 100)}%</span></div><Progress value={c.share * 100} label={c.category} /></li>)}</ul>}</Panel>
            </div>
          </Block>

          <Block icon={Repeat} title="Habits">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><StatCard label="Completion" value={pctText(a.habitRate)} progress={a.habitRate == null ? null : a.habitRate * 100} tone="success" /><StatCard label="Longest streak" value={longest} sub="any habit, all time" /><StatCard label="Active habits" value={data.habits.filter((h) => !h.archived_at).length} /></div>
            <Panel title="Most consistent habits">{a.ranked.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No habit activity in this range.</p> : <ul className="space-y-3">{a.ranked.slice(0, 8).map((x) => <li key={x.h.id}><div className="mb-1 flex justify-between text-sm"><span className="truncate">{x.h.name}</span><span className="text-muted-foreground">{pctText(x.rate)} · {x.done}/{x.expected}</span></div><Progress value={x.rate * 100} tone={x.rate >= 0.8 ? 'success' : 'primary'} label={x.h.name} /></li>)}</ul>}</Panel>
          </Block>
        </div>
      </DataGate>
    </>
  )
}
