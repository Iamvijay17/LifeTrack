import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, Cell } from 'recharts'
import { Activity, SlidersHorizontal, Target, BookOpen, Briefcase, Check, CheckCircle2, Circle, Droplets, Dumbbell, Flame, Footprints, Moon, Plus, Repeat, Wallet } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate } from '@/components/shared/states'
import { StatCard } from '@/components/shared/StatCard'
import { Chart, C, grid, tooltip, xAxis, yAxis } from '@/components/shared/charts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/misc'
import { QUICK, useQuick } from '@/features/quick/QuickActions'
import { byPriority, isOpen } from '@/features/planner/TaskList'
import { useHabits } from '@/features/habits/habitData'
import { useTables } from '@/hooks/store'
import { useSettings } from '@/hooks/useSettings'
import { useToday } from '@/hooks/useToday'
import { useAuth } from '@/hooks/useAuth'
import { useAction } from '@/hooks/useAction'
import { setTaskStatus } from '@/services/api'
import { dailyProgress, activeDates } from '@lifetrack/core/progress'
import { dailyScore, averageScore } from '@lifetrack/core/score'
import { goalPercent } from '@lifetrack/core/goals'
import { summarize } from '@lifetrack/core/finance'
import { ScoreCard } from '@/features/overview/ScoreCard'
import { WIDGETS, isWidgetOn } from '@/features/overview/widgets'
import { Dialog } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/form'
import { monthKey } from '@/lib/dates'
import { activeDayStreak } from '@lifetrack/core/streaks'
import { countedMinutes } from '@lifetrack/core/learning'
import { addDays, dateStrInTz, eachDay, fmtDay, fmtDuration, startOfWeek, timeStrInTz } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

function Ring({ percent }) {
  const r = 52, c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 120 120" className="h-32 w-32 shrink-0 -rotate-90" role="img" aria-label={percent == null ? 'No plan today' : `${percent}% complete`}>
      <circle cx="60" cy="60" r={r} fill="none" stroke="rgb(var(--muted))" strokeWidth="9" />
      {percent != null && <circle cx="60" cy="60" r={r} fill="none" stroke="var(--c-primary)" strokeWidth="9" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - percent / 100)} style={{ transition: 'stroke-dashoffset .6s ease' }} />}
      <text x="60" y="60" textAnchor="middle" dominantBaseline="central" className="rotate-90 origin-center fill-foreground text-[26px] font-semibold" style={{ transformOrigin: '60px 60px' }}>{percent == null ? '—' : `${percent}%`}</text>
    </svg>
  )
}

const rel = (iso) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`
  return `${Math.round(mins / 1440)}d ago`
}

export default function OverviewPage() {
  const today = useToday()
  const { displayName } = useAuth()
  const { settings, save: saveSettings } = useSettings()
  const [customize, setCustomize] = useState(false)
  const on = (k) => isWidgetOn(settings.dashboard_widgets, k)
  const [toggleWidget] = useAction((k, v) => saveSettings({ dashboard_widgets: { ...settings.dashboard_widgets, [k]: v } }))
  const quick = useQuick()
  const tz = settings.timezone, w = settings.week_starts_on, cur = settings.currency
  const { data, loading, error, refetch } = useTables('tasks', 'study_sessions', 'workouts', 'health_logs', 'transactions', 'job_applications', 'application_history', 'interview_events', 'goals', 'milestones', 'user_settings')
  const { habits, logs: habitLogs, stats: habitStats, loading: hLoading, error: hError } = useHabits(today, w)
  const [complete] = useAction((t) => setTaskStatus(t, 'done', today))

  const calc = (date) => dailyProgress({ date, tasks: data.tasks, habits, habitLogs, sessions: data.study_sessions, workouts: data.workouts, health: data.health_logs.find((h) => h.log_date === date), settings })
  const progress = useMemo(() => calc(today), [data, habits, habitLogs, settings, today]) // eslint-disable-line react-hooks/exhaustive-deps
  const weekStart = startOfWeek(today, w)
  const weekly = useMemo(() => eachDay(weekStart, addDays(weekStart, 6)).map((d) => ({ d, label: fmtDay(d, 'EEE'), pct: d > today ? null : calc(d).percent })), [data, habits, habitLogs, settings, today, weekStart]) // eslint-disable-line react-hooks/exhaustive-deps

  const scoreFor = (date) => dailyScore({ date, tasks: data.tasks, habits, habitLogs, sessions: data.study_sessions, workouts: data.workouts, health: data.health_logs.find((h) => h.log_date === date) ?? null, applications: data.job_applications, interviews: data.interview_events, settings, tz })
  const score = useMemo(() => scoreFor(today), [data, habits, habitLogs, settings, today]) // eslint-disable-line react-hooks/exhaustive-deps
  const weekScores = useMemo(() => eachDay(weekStart, addDays(weekStart, 6)).map((d) => ({ d, label: fmtDay(d, 'EEE'), score: d > today ? null : scoreFor(d).score })), [data, habits, habitLogs, settings, today, weekStart]) // eslint-disable-line react-hooks/exhaustive-deps
  const weekAvg = averageScore(weekScores.filter((x) => x.score != null).map((x) => ({ score: x.score }))).avg
  const activeGoals = data.goals.filter((g) => g.status === 'active').map((g) => ({ g, p: goalPercent(g, data.milestones, data.study_sessions) })).sort((a, b) => (a.g.due_date ?? '9999').localeCompare(b.g.due_date ?? '9999')).slice(0, 4)
  const monthSum = summarize(data.transactions, monthKey(today), settings.monthly_budget_paise)
  const openToday = data.tasks.filter((t) => t.due_date === today && isOpen(t)).length
  const doneTodayTasks = data.tasks.filter((t) => t.due_date === today && t.status === 'done').length

  const todays = data.tasks.filter((t) => t.due_date === today && isOpen(t)).sort(byPriority).slice(0, 3)
  const health = data.health_logs.find((h) => h.log_date === today)
  const studyMin = countedMinutes(data.study_sessions.filter((s) => s.session_date === today))
  const running = data.study_sessions.find((s) => s.status === 'running')
  const weekApps = data.job_applications.filter((a) => a.applied_date && a.applied_date >= weekStart && a.applied_date <= addDays(weekStart, 6)).length
  const spentToday = data.transactions.filter((t) => t.type === 'expense' && t.txn_date === today).reduce((a, t) => a + t.amount_paise, 0)
  const habitsToday = habitStats.filter((s) => !s.habit.archived_at && (s.due || s.today))
  const habitsDone = habitsToday.filter((s) => s.today?.status === 'done').length
  const todayWorkouts = data.workouts.filter((x) => x.workout_date === today)
  const planned = settings.workout_plan?.[String(new Date(today + 'T00:00:00Z').getUTCDay())]
  const gym = todayWorkouts.some((x) => x.status === 'completed') ? 'Done' : todayWorkouts.some((x) => x.status === 'rest') || planned === 'rest' ? 'Rest day' : todayWorkouts.some((x) => x.status === 'skipped') ? 'Skipped' : planned ? 'Planned' : 'Not planned'
  const streak = useMemo(() => activeDayStreak(activeDates({ habitLogs, tasks: data.tasks, sessions: data.study_sessions, workouts: data.workouts }, tz), today), [habitLogs, data, tz, today])

  const activity = useMemo(() => {
    const a = []
    for (const t of data.tasks) if (t.status === 'done' && t.completed_at) a.push({ at: t.completed_at, icon: CheckCircle2, text: `Completed “${t.title}”` })
    for (const s of data.study_sessions) if (s.status === 'completed' && s.ended_at) a.push({ at: s.ended_at, icon: BookOpen, text: `Studied ${fmtDuration(s.duration_seconds / 60)}${s.problems_solved ? ` · ${s.problems_solved} problems` : ''}` })
    for (const x of data.workouts) if (x.status === 'completed') a.push({ at: x.created_at, icon: Dumbbell, text: `Workout: ${x.name}` })
    for (const t of data.transactions) a.push({ at: t.created_at, icon: Wallet, text: `${t.type === 'income' ? 'Income' : t.type === 'savings' ? 'Saved' : 'Spent'} ${formatMoney(t.amount_paise, cur)} · ${t.category}` })
    for (const h of data.application_history) { const app = data.job_applications.find((x) => x.id === h.application_id); if (app) a.push({ at: h.changed_at, icon: Briefcase, text: `${app.company}: ${h.from_status ? `${h.from_status} → ` : 'added as '}${h.to_status}` }) }
    for (const l of habitLogs) if (l.status === 'done') { const hb = habits.find((x) => x.id === l.habit_id); if (hb) a.push({ at: l.updated_at ?? l.created_at, icon: Repeat, text: `Checked in: ${hb.name}` }) }
    return a.sort((x, y) => y.at.localeCompare(x.at)).slice(0, 8)
  }, [data, habitLogs, habits, cur])

  const hour = Number(timeStrInTz(new Date(), tz).slice(0, 2))
  const greeting = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 22 ? 'Good evening' : 'Good night'

  return (
    <>
      <PageHeader title={`${greeting}${displayName ? `, ${displayName.split(' ')[0]}` : ''}`} description={fmtDay(today, 'EEEE, d MMMM yyyy')}
        actions={<Button variant="outline" size="sm" onClick={() => setCustomize(true)}><SlidersHorizontal className="h-4 w-4" />Customize</Button>} />
      <DataGate loading={loading || hLoading} error={error || hError} onRetry={refetch}>
        <div className="space-y-5">
          {(on('score') || on('progress')) && <div className="grid gap-4 lg:grid-cols-5">
            {on('score') && <div className={on('progress') ? 'lg:col-span-2' : 'lg:col-span-5'}><ScoreCard result={score} weekAvg={weekAvg} /></div>}
            {on('progress') && <Card className={on('score') ? 'lg:col-span-3' : 'lg:col-span-5'}><CardContent className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <Ring percent={progress.percent} />
              <div className="min-w-0 flex-1 space-y-2.5">
                <div><p className="text-sm font-medium">Today's progress</p><p className="text-xs text-muted-foreground">{progress.total ? `${Number(progress.done.toFixed(1))} of ${progress.total} planned activities` : 'Nothing planned yet — add a task or habit to start.'}</p></div>
                {progress.items.map((i) => (
                  <div key={i.key} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 text-xs"><span className="text-muted-foreground">{i.label}</span><Progress value={(i.done / i.total) * 100} tone={i.done >= i.total ? 'success' : 'primary'} label={i.label} /><span className="w-20 text-right tabular-nums text-muted-foreground">{i.detail ?? `${i.done}/${i.total}`}</span></div>))}
              </div>
            </CardContent></Card>}
          </div>}
          {on('priorities') && <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-5"><CardHeader><CardTitle>Top priorities</CardTitle><span className="text-xs text-muted-foreground">{openToday} pending · {doneTodayTasks} completed today</span><Link to="/planner" className="text-xs text-secondary hover:underline">Planner</Link></CardHeader><CardContent className="space-y-1">
              {todays.length === 0 ? <div className="py-4 text-center text-sm text-muted-foreground">{data.tasks.some((t) => t.due_date === today) ? 'All priorities done 🎉' : 'No tasks for today.'}<div className="mt-2"><Button size="sm" variant="outline" onClick={() => quick.open('task')}><Plus className="h-4 w-4" />Add task</Button></div></div>
              : todays.map((t) => <button key={t.id} onClick={() => complete(t)} aria-label={`Complete ${t.title}`} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted/40"><Circle className="h-5 w-5 shrink-0 text-muted-foreground" /><span className="truncate text-sm">{t.title}</span></button>)}
            </CardContent></Card>
          </div>}

          {on('stats') && <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            <StatCard icon={BookOpen} label="Learning today" value={fmtDuration(studyMin)} sub={running ? '⏱ timer running' : settings.daily_study_target_minutes ? `target ${fmtDuration(settings.daily_study_target_minutes)}` : undefined} progress={settings.daily_study_target_minutes ? Math.min(100, (studyMin / settings.daily_study_target_minutes) * 100) : null} tone="success" />
            <StatCard icon={Dumbbell} label="Gym" value={gym} sub={todayWorkouts[0]?.name} />
            <StatCard icon={Moon} label="Sleep" value={health?.sleep_minutes != null ? fmtDuration(health.sleep_minutes) : '—'} sub={health?.sleep_minutes != null ? 'last night' : 'not logged'} />
            <StatCard icon={Droplets} label="Water" value={`${health?.water_ml ?? 0} ml`} sub={settings.water_goal_ml ? `goal ${settings.water_goal_ml}` : undefined} progress={settings.water_goal_ml ? ((health?.water_ml ?? 0) / settings.water_goal_ml) * 100 : null} />
            <StatCard icon={Footprints} label="Steps" value={(health?.steps ?? 0).toLocaleString('en-IN')} sub={settings.steps_goal ? `goal ${settings.steps_goal.toLocaleString('en-IN')}` : undefined} progress={settings.steps_goal ? ((health?.steps ?? 0) / settings.steps_goal) * 100 : null} />
            <StatCard icon={Briefcase} label="Applications" value={weekApps} sub="this week" />
            <StatCard icon={Wallet} label="Spent today" value={formatMoney(spentToday, cur)} />
            <StatCard icon={Check} label="Habits" value={`${habitsDone}/${habitsToday.length}`} sub={habitsToday.length ? undefined : 'none due today'} progress={habitsToday.length ? (habitsDone / habitsToday.length) * 100 : null} tone="success" />
          </div>}

          {(on('goals') || on('spending')) && <div className="grid gap-4 lg:grid-cols-2">
            {on('goals') && <Card><CardHeader><CardTitle className="flex items-center gap-2"><Target className="h-4 w-4" />Goal progress</CardTitle><Link to="/goals" className="text-xs text-secondary hover:underline">All goals</Link></CardHeader><CardContent>
              {activeGoals.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">No active goals. <Link to="/goals" className="text-secondary hover:underline">Create one</Link></p>
                : <ul className="space-y-3">{activeGoals.map(({ g, p }) => <li key={g.id}><div className="mb-1 flex justify-between text-sm"><span className="truncate">{g.title}</span><span className="text-muted-foreground tabular-nums">{p.percent}%</span></div><Progress value={p.percent} tone={p.percent >= 100 ? 'success' : 'primary'} label={g.title} /></li>)}</ul>}
            </CardContent></Card>}
            {on('spending') && <Card><CardHeader><CardTitle className="flex items-center gap-2"><Wallet className="h-4 w-4" />Spending this month</CardTitle><Link to="/finance" className="text-xs text-secondary hover:underline">Finance</Link></CardHeader><CardContent className="space-y-3">
              <div className="flex items-baseline justify-between"><span className="text-2xl font-semibold tabular-nums" data-testid="month-spend">{formatMoney(monthSum.expense, cur)}</span>{monthSum.budget > 0 && <span className="text-xs text-muted-foreground">of {formatMoney(monthSum.budget, cur)} budget</span>}</div>
              {monthSum.budgetUsed != null ? <><Progress value={Math.min(100, monthSum.budgetUsed * 100)} tone={monthSum.budgetUsed > 1 ? 'danger' : monthSum.budgetUsed > 0.8 ? 'warning' : 'success'} label="Budget used" /><p className="text-xs text-muted-foreground">{Math.round(monthSum.budgetUsed * 100)}% used · {monthSum.remaining >= 0 ? `${formatMoney(monthSum.remaining, cur)} left` : `${formatMoney(-monthSum.remaining, cur)} over`}</p></> : <p className="text-xs text-muted-foreground">Income {formatMoney(monthSum.income, cur)} · set a budget in Finance to track usage.</p>}
            </CardContent></Card>}
          </div>}

          {(on('weekly') || on('activity')) && <div className="grid gap-4 lg:grid-cols-5">
            {on('weekly') && <Card className={on('activity') ? 'lg:col-span-3' : 'lg:col-span-5'}><CardHeader><CardTitle>Weekly daily score</CardTitle><span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Flame className="h-3.5 w-3.5 text-warning" />{streak}-day active streak</span></CardHeader><CardContent>
              <Chart height={190} empty={weekScores.every((x) => x.score == null)} emptyText="Plan tasks or habits to see your daily score.">
                <BarChart data={weekScores.map((x) => ({ ...x, score: x.score ?? undefined }))}>{grid()}{xAxis({ dataKey: 'label' })}{yAxis({ domain: [0, 100] })}{tooltip({ formatter: (v) => [v, 'Score'] })}<Bar dataKey="score" radius={[4, 4, 0, 0]}>{weekScores.map((x) => <Cell key={x.d} fill={x.d === today ? C.primary : C.secondary} fillOpacity={x.d === today ? 1 : 0.6} />)}</Bar></BarChart>
              </Chart>
            </CardContent></Card>}
            {on('activity') && <Card className={on('weekly') ? 'lg:col-span-2' : 'lg:col-span-5'}><CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4" />Recent activity</CardTitle></CardHeader><CardContent>
              {activity.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Your activity will show up here.</p> : <ul className="space-y-2.5">{activity.map((a, i) => <li key={i} className="flex items-start gap-2.5 text-sm"><a.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{a.text}</span><span className="shrink-0 text-xs text-muted-foreground">{rel(a.at)}</span></li>)}</ul>}
            </CardContent></Card>}
          </div>}

          {on('quick') && <div><h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Quick actions</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">{QUICK.map(({ kind, label, icon: Icon }) => (
              <button key={kind} onClick={() => quick.open(kind)} className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-3 text-xs font-medium transition-colors hover:border-primary/50 hover:bg-primary/5"><Icon className="h-4 w-4 text-secondary" />{label}</button>))}</div></div>}
        </div>
      </DataGate>
      <Dialog open={customize} onOpenChange={setCustomize} title="Customize dashboard" description="Choose which widgets to show. Saved to your account, so it applies on every device.">
        <ul className="space-y-1">{WIDGETS.map((w) => (
          <li key={w.key} className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-muted/40"><span className="text-sm">{w.label}</span><Switch checked={on(w.key)} onChange={(v) => toggleWidget(w.key, v)} label={w.label} /></li>))}</ul>
      </Dialog>
    </>
  )
}
