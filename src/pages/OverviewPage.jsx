import { Suspense, lazy, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Activity, BookOpen, Briefcase, Check, CheckCircle2, Circle, Droplets, Dumbbell, Flame, Footprints, Moon, Plus, Repeat, Wallet } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate } from '@/components/shared/states'
import { StatCard } from '@/components/shared/StatCard'
import { Skeleton } from '@/components/ui/misc'
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
import { dailyProgress, activeDates } from '@/domain/progress'
import { activeDayStreak } from '@/domain/streaks'
import { countedMinutes } from '@/domain/learning'
import { addDays, dateStrInTz, eachDay, fmtDay, fmtDuration, startOfWeek, timeStrInTz } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

const WeeklyChart = lazy(() => import('@/features/overview/WeeklyChart'))

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
  const { settings } = useSettings()
  const quick = useQuick()
  const tz = settings.timezone, w = settings.week_starts_on, cur = settings.currency
  const { data, loading, error, refetch } = useTables('tasks', 'study_sessions', 'workouts', 'health_logs', 'transactions', 'job_applications', 'application_history', 'user_settings')
  const { habits, logs: habitLogs, stats: habitStats, loading: hLoading, error: hError } = useHabits(today, w)
  const [complete] = useAction((t) => setTaskStatus(t, 'done', today))

  const calc = (date) => dailyProgress({ date, tasks: data.tasks, habits, habitLogs, sessions: data.study_sessions, workouts: data.workouts, health: data.health_logs.find((h) => h.log_date === date), settings })
  const progress = useMemo(() => calc(today), [data, habits, habitLogs, settings, today]) // eslint-disable-line react-hooks/exhaustive-deps
  const weekStart = startOfWeek(today, w)
  const weekly = useMemo(() => eachDay(weekStart, addDays(weekStart, 6)).map((d) => ({ d, label: fmtDay(d, 'EEE'), pct: d > today ? null : calc(d).percent })), [data, habits, habitLogs, settings, today, weekStart]) // eslint-disable-line react-hooks/exhaustive-deps

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
      <PageHeader title={`${greeting}${displayName ? `, ${displayName.split(' ')[0]}` : ''}`} description={fmtDay(today, 'EEEE, d MMMM yyyy')} />
      <DataGate loading={loading || hLoading} error={error || hError} onRetry={refetch}>
        <div className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3"><CardContent className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <Ring percent={progress.percent} />
              <div className="min-w-0 flex-1 space-y-2.5">
                <div><p className="text-sm font-medium">Today's progress</p><p className="text-xs text-muted-foreground">{progress.total ? `${Number(progress.done.toFixed(1))} of ${progress.total} planned activities` : 'Nothing planned yet — add a task or habit to start.'}</p></div>
                {progress.items.map((i) => (
                  <div key={i.key} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 text-xs"><span className="text-muted-foreground">{i.label}</span><Progress value={(i.done / i.total) * 100} tone={i.done >= i.total ? 'success' : 'primary'} label={i.label} /><span className="w-20 text-right tabular-nums text-muted-foreground">{i.detail ?? `${i.done}/${i.total}`}</span></div>))}
              </div>
            </CardContent></Card>
            <Card className="lg:col-span-2"><CardHeader><CardTitle>Top priorities</CardTitle><Link to="/planner" className="text-xs text-secondary hover:underline">Planner</Link></CardHeader><CardContent className="space-y-1">
              {todays.length === 0 ? <div className="py-4 text-center text-sm text-muted-foreground">{data.tasks.some((t) => t.due_date === today) ? 'All priorities done 🎉' : 'No tasks for today.'}<div className="mt-2"><Button size="sm" variant="outline" onClick={() => quick.open('task')}><Plus className="h-4 w-4" />Add task</Button></div></div>
              : todays.map((t) => <button key={t.id} onClick={() => complete(t)} aria-label={`Complete ${t.title}`} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted/40"><Circle className="h-5 w-5 shrink-0 text-muted-foreground" /><span className="truncate text-sm">{t.title}</span></button>)}
            </CardContent></Card>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            <StatCard icon={BookOpen} label="Learning today" value={fmtDuration(studyMin)} sub={running ? '⏱ timer running' : settings.daily_study_target_minutes ? `target ${fmtDuration(settings.daily_study_target_minutes)}` : undefined} progress={settings.daily_study_target_minutes ? Math.min(100, (studyMin / settings.daily_study_target_minutes) * 100) : null} tone="success" />
            <StatCard icon={Dumbbell} label="Gym" value={gym} sub={todayWorkouts[0]?.name} />
            <StatCard icon={Moon} label="Sleep" value={health?.sleep_minutes != null ? fmtDuration(health.sleep_minutes) : '—'} sub={health?.sleep_minutes != null ? 'last night' : 'not logged'} />
            <StatCard icon={Droplets} label="Water" value={`${health?.water_ml ?? 0} ml`} sub={settings.water_goal_ml ? `goal ${settings.water_goal_ml}` : undefined} progress={settings.water_goal_ml ? ((health?.water_ml ?? 0) / settings.water_goal_ml) * 100 : null} />
            <StatCard icon={Footprints} label="Steps" value={(health?.steps ?? 0).toLocaleString('en-IN')} sub={settings.steps_goal ? `goal ${settings.steps_goal.toLocaleString('en-IN')}` : undefined} progress={settings.steps_goal ? ((health?.steps ?? 0) / settings.steps_goal) * 100 : null} />
            <StatCard icon={Briefcase} label="Applications" value={weekApps} sub="this week" />
            <StatCard icon={Wallet} label="Spent today" value={formatMoney(spentToday, cur)} />
            <StatCard icon={Check} label="Habits" value={`${habitsDone}/${habitsToday.length}`} sub={habitsToday.length ? undefined : 'none due today'} progress={habitsToday.length ? (habitsDone / habitsToday.length) * 100 : null} tone="success" />
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3"><CardHeader><CardTitle>Weekly productivity</CardTitle><span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Flame className="h-3.5 w-3.5 text-warning" />{streak}-day active streak</span></CardHeader><CardContent>
              <Suspense fallback={<Skeleton className="h-[190px] w-full" />}><WeeklyChart weekly={weekly} today={today} /></Suspense>
            </CardContent></Card>
            <Card className="lg:col-span-2"><CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4" />Recent activity</CardTitle></CardHeader><CardContent>
              {activity.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Your activity will show up here.</p> : <ul className="space-y-2.5">{activity.map((a, i) => <li key={i} className="flex items-start gap-2.5 text-sm"><a.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{a.text}</span><span className="shrink-0 text-xs text-muted-foreground">{rel(a.at)}</span></li>)}</ul>}
            </CardContent></Card>
          </div>

          <div><h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Quick actions</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">{QUICK.map(({ kind, label, icon: Icon }) => (
              <button key={kind} onClick={() => quick.open(kind)} className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-3 text-xs font-medium transition-colors hover:border-primary/50 hover:bg-primary/5"><Icon className="h-4 w-4 text-secondary" />{label}</button>))}</div></div>
        </div>
      </DataGate>
    </>
  )
}
