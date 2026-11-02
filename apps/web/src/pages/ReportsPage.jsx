import { useMemo, useState } from 'react'
import { Area, AreaChart, Bar, BarChart } from 'recharts'
import { Download, FileText, Printer } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate } from '@/components/shared/states'
import { StatCard } from '@/components/shared/StatCard'
import { Chart, C, grid, tooltip, xAxis, yAxis } from '@/components/shared/charts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { Segmented } from '@/components/ui/misc'
import { useTables } from '@/hooks/store'
import { useSettings } from '@/hooks/useSettings'
import { useToday } from '@/hooks/useToday'
import { rangeFor } from '@/domain/analytics'
import { buildReport, reportToRows } from '@/domain/report'
import { addDays, fmtDay } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { download, toCsv } from '@/services/csv'

const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`)
const TABLES = ['tasks', 'habits', 'habit_logs', 'study_sessions', 'focus_sessions', 'workouts', 'health_logs', 'transactions', 'goals', 'milestones', 'job_applications', 'application_history', 'interview_events']
const DAILY_COLS = [
  { header: 'Date', value: (r) => r.date }, { header: 'Daily score', value: (r) => r.score ?? '' }, { header: 'Tasks done', value: (r) => r.tasksDone }, { header: 'Tasks planned', value: (r) => r.tasksPlanned },
  { header: 'Study (min)', value: (r) => r.studyMinutes }, { header: 'Focus (min)', value: (r) => r.focusMinutes }, { header: 'Workout', value: (r) => (r.workout ? 'yes' : '') },
  { header: 'Habits done', value: (r) => r.habitsDone }, { header: 'Sleep (h)', value: (r) => r.sleepHours ?? '' }, { header: 'Spent (paise)', value: (r) => r.spentPaise },
]

export default function ReportsPage() {
  const today = useToday()
  const { settings } = useSettings()
  const w = settings.week_starts_on
  const { data, loading, error, refetch } = useTables(...TABLES, 'user_settings')
  const [preset, setPreset] = useState('week')
  const [custom, setCustom] = useState({ from: addDays(today, -29), to: today })
  const range = preset === 'custom' ? custom : rangeFor(preset, today, w)
  const ok = range.from <= range.to
  const { from, to } = ok ? range : { from: range.to, to: range.from }
  const money = (p) => formatMoney(p, settings.currency)

  const r = useMemo(() => buildReport(data, from, to, { today, settings, weekStartsOn: w }), [data, from, to, today, settings, w])
  const s = r.summary
  const chart = r.daily.map((d) => ({ ...d, label: fmtDay(d.date, r.daily.length > 31 ? 'd MMM' : 'EEE d'), score: d.score ?? undefined }))

  const exportCsv = () => {
    const { summary } = reportToRows(r, money)
    const text = [toCsv(summary, [{ header: 'Metric', value: (x) => x.metric }, { header: 'Value', value: (x) => x.value }]), '', toCsv(r.daily, DAILY_COLS)].join('\r\n')
    download(`lifetrack-report-${from}_to_${to}.csv`, text)
  }

  return (
    <>
      <PageHeader title="Reports" description="Summaries computed from your own records — no estimates." actions={<><Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" />Print / PDF</Button><Button variant="outline" onClick={exportCsv} disabled={!r.daily.length}><Download className="h-4 w-4" />CSV</Button></>} />
      <div className="mb-5 flex flex-wrap items-center gap-3 print:hidden">
        <Segmented value={preset} onChange={setPreset} options={[{ value: 'week', label: 'This week' }, { value: 'month', label: 'This month' }, { value: 'year', label: 'This year' }, { value: 'custom', label: 'Custom' }]} />
        {preset === 'custom' && <div className="flex items-center gap-2"><Input type="date" aria-label="From" className="w-36" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })} /><span className="text-muted-foreground">→</span><Input type="date" aria-label="To" className="w-36" value={custom.to} min={custom.from} onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })} /></div>}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">{fmtDay(from, 'd MMM yyyy')} – {fmtDay(to, 'd MMM yyyy')}{to > today ? ' (future days are not counted)' : ''}</p>
      <DataGate loading={loading} error={error} onRetry={refetch}>
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={FileText} label="Productivity score" value={s.productivityScore ?? '—'} sub={`${s.scoredDays} scored day${s.scoredDays === 1 ? '' : 's'}`} progress={s.productivityScore} />
            <StatCard label="Study" value={`${s.studyHours} h`} sub={`${s.focusHours} h focus`} />
            <StatCard label="Fitness consistency" value={pct(s.fitnessConsistency)} sub={`${s.workouts} workouts`} />
            <StatCard label="Habit completion" value={pct(s.habitRate)} />
            <StatCard label="Avg sleep" value={s.sleepAvgHours == null ? '—' : `${s.sleepAvgHours.toFixed(1)} h`} />
            <StatCard label="Expenses" value={money(s.expensePaise)} sub={`Income ${money(s.incomePaise)}`} />
            <StatCard label="Goals" value={`${s.goalsActive} active`} sub={s.goalAvgProgress == null ? undefined : `${s.goalAvgProgress}% average progress`} />
            <StatCard label="Job applications" value={s.applications} sub={`${s.interviews} interviews · ${s.offers} offers`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardHeader><CardTitle>Daily score</CardTitle></CardHeader><CardContent>
              <Chart height={200} empty={!s.scoredDays} emptyText="No scored days in this range yet."><AreaChart data={chart}>{grid()}{xAxis({ dataKey: 'label', minTickGap: 16 })}{yAxis({ domain: [0, 100] })}{tooltip({ formatter: (v) => [v, 'Score'] })}<Area dataKey="score" stroke={C.primary} fill={C.primary} fillOpacity={0.15} strokeWidth={2} connectNulls /></AreaChart></Chart></CardContent></Card>
            <Card><CardHeader><CardTitle>Weekly &amp; monthly trend</CardTitle></CardHeader><CardContent>
              <Chart height={200} empty={!r.weekly.length} emptyText="Scores appear once you have a scored day."><BarChart data={(r.monthly.length > 1 ? r.monthly : r.weekly).map((x) => ({ ...x, label: fmtDay(x.key, r.monthly.length > 1 ? 'MMM yy' : 'd MMM') }))}>{grid()}{xAxis({ dataKey: 'label' })}{yAxis({ domain: [0, 100] })}{tooltip({ formatter: (v, _n, p) => [`${v} (${p.payload.days} days)`, 'Average score'] })}<Bar dataKey="score" fill={C.secondary} radius={[4, 4, 0, 0]} /></BarChart></Chart></CardContent></Card>
          </div>
          <Card><CardHeader><CardTitle>Daily activity summary</CardTitle></CardHeader><CardContent className="overflow-x-auto p-0 pt-2">
            {r.daily.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No days in this range yet.</p> : (
              <table className="w-full min-w-[640px] text-sm"><thead><tr className="border-b border-border text-left text-xs text-muted-foreground">{['Date', 'Score', 'Tasks', 'Study', 'Focus', 'Workout', 'Habits', 'Sleep', 'Spent'].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr></thead>
                <tbody>{[...r.daily].reverse().map((d) => <tr key={d.date} className="border-b border-border/60 last:border-0"><td className="px-4 py-2">{fmtDay(d.date, 'EEE, d MMM')}</td><td className="px-4 py-2 font-medium tabular-nums">{d.score ?? '—'}</td><td className="px-4 py-2 tabular-nums">{d.tasksDone}/{d.tasksPlanned}</td><td className="px-4 py-2 tabular-nums">{d.studyMinutes}m</td><td className="px-4 py-2 tabular-nums">{d.focusMinutes}m</td><td className="px-4 py-2">{d.workout ? '✓' : '—'}</td><td className="px-4 py-2 tabular-nums">{d.habitsDone}</td><td className="px-4 py-2 tabular-nums">{d.sleepHours ?? '—'}</td><td className="px-4 py-2 tabular-nums">{money(d.spentPaise)}</td></tr>)}</tbody></table>)}
          </CardContent></Card>
        </div>
      </DataGate>
    </>
  )
}
