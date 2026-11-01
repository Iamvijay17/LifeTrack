import { useMemo, useState } from 'react'
import { BookOpen, CalendarClock, Clock, Code2, Pencil, Plus, Target, Trash2 } from 'lucide-react'
import { Bar, BarChart } from 'recharts'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate, EmptyState } from '@/components/shared/states'
import { StatCard } from '@/components/shared/StatCard'
import { Chart, C, grid, tooltip, xAxis, yAxis } from '@/components/shared/charts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge, Progress, Segmented } from '@/components/ui/misc'
import { Menu } from '@/components/ui/menu'
import { StudyTimer } from '@/features/learning/StudyTimer'
import { GoalDialog, SessionDialog, TopicDialog } from '@/features/learning/dialogs'
import { useConfirm } from '@/components/shared/Confirm'
import { useTables } from '@/hooks/store'
import * as store from '@/hooks/store'
import { useSettings } from '@/hooks/useSettings'
import { useToday } from '@/hooks/useToday'
import { useAction } from '@/hooks/useAction'
import { countedMinutes, counted, goalProgress, problemsSolved, topicTotals } from '@/domain/learning'
import { addDays, eachDay, fmtDay, fmtDuration, startOfWeek } from '@/lib/dates'

export default function LearningPage() {
  const today = useToday()
  const { settings } = useSettings()
  const confirm = useConfirm()
  const { data, loading, error, refetch } = useTables('study_sessions', 'goals', 'learning_topics')
  const [tab, setTab] = useState('overview')
  const [goalDlg, setGoalDlg] = useState({ open: false, goal: null })
  const [sessDlg, setSessDlg] = useState({ open: false, session: null })
  const [topicDlg, setTopicDlg] = useState({ open: false, topic: null })
  const [delSession] = useAction((id) => store.remove('study_sessions', id), { success: 'Session deleted' })
  const [delGoal] = useAction((id) => store.remove('goals', id), { success: 'Goal deleted' })
  const [delTopic] = useAction((id) => store.remove('learning_topics', id), { success: 'Topic deleted' })

  const topics = data.learning_topics.filter((t) => !t.archived)
  const sessions = data.study_sessions
  const running = sessions.find((s) => s.status === 'running')
  const done = useMemo(() => counted(sessions), [sessions])
  const weekStart = startOfWeek(today, settings.week_starts_on)
  const week = useMemo(() => eachDay(weekStart, addDays(weekStart, 6)).map((d) => ({ d, label: fmtDay(d, 'EEE'), hours: Math.round((countedMinutes(done.filter((s) => s.session_date === d)) / 60) * 100) / 100 })), [done, weekStart])
  const todayMin = countedMinutes(done.filter((s) => s.session_date === today))
  const weekMin = countedMinutes(done.filter((s) => s.session_date >= weekStart && s.session_date <= addDays(weekStart, 6)))
  const totals = useMemo(() => topicTotals(topics, sessions), [topics, sessions])
  const groups = [...new Set(topics.map((t) => t.group_name))]
  const history = [...done].sort((a, b) => (b.session_date + b.created_at).localeCompare(a.session_date + a.created_at))
  const nameOf = (s) => data.goals.find((g) => g.id === s.goal_id)?.title ?? topics.find((t) => t.id === s.topic_id)?.name ?? 'General study'
  const target = settings.daily_study_target_minutes

  return (
    <>
      <PageHeader title="Career & Learning" description="Track real study time, goals and DSA practice."
        actions={<><Button variant="outline" onClick={() => setSessDlg({ open: true, session: null })}><Plus className="h-4 w-4" />Log session</Button><Button onClick={() => setGoalDlg({ open: true, goal: null })}><Target className="h-4 w-4" />New goal</Button></>} />
      <DataGate loading={loading} error={error} onRetry={refetch}>
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={Clock} label="Today" value={fmtDuration(todayMin)} sub={target ? `target ${fmtDuration(target)}` : 'no daily target set'} progress={target ? Math.min(100, (todayMin / target) * 100) : null} tone="success" />
            <StatCard icon={BookOpen} label="This week" value={fmtDuration(weekMin)} sub={`${week.filter((w) => w.hours > 0).length} active days`} />
            <StatCard icon={Code2} label="DSA problems" value={problemsSolved(sessions)} sub="all time" />
            <StatCard icon={Target} label="Active goals" value={data.goals.filter((g) => g.status === 'active').length} sub={`${data.goals.filter((g) => g.status === 'completed').length} completed`} />
          </div>
          <Segmented value={tab} onChange={setTab} options={[{ value: 'overview', label: 'Overview' }, { value: 'goals', label: 'Goals' }, { value: 'topics', label: 'Topics' }, { value: 'sessions', label: 'Sessions' }]} />

          {tab === 'overview' && (
            <div className="grid gap-4 lg:grid-cols-5">
              <div className="lg:col-span-2"><StudyTimer running={running} goals={data.goals} topics={topics} today={today} /></div>
              <Card className="lg:col-span-3"><CardHeader><CardTitle>This week (hours)</CardTitle></CardHeader><CardContent>
                <Chart empty={weekMin === 0} emptyText="Complete a study session to see your week.">
                  <BarChart data={week}>{grid()}{xAxis({ dataKey: 'label' })}{yAxis()}{tooltip({ formatter: (v) => [`${v} h`, 'Studied'] })}<Bar dataKey="hours" fill={C.primary} radius={[4, 4, 0, 0]} /></BarChart>
                </Chart>
              </CardContent></Card>
            </div>
          )}

          {tab === 'goals' && (data.goals.length === 0 ? (
            <EmptyState icon={Target} title="No goals yet" description="Set a target in hours, then log sessions against it to see real progress." action={<Button onClick={() => setGoalDlg({ open: true, goal: null })}>Create a goal</Button>} />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">{data.goals.map((g) => { const p = goalProgress(g, sessions); const overdue = g.due_date && g.due_date < today && g.status === 'active'; return (
              <Card key={g.id}><CardContent className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{g.title}</p><div className="mt-1 flex flex-wrap gap-1.5"><Badge tone="primary">{g.category}</Badge>{g.status !== 'active' && <Badge tone={g.status === 'completed' ? 'success' : 'neutral'}>{g.status}</Badge>}{g.due_date && <Badge tone={overdue ? 'danger' : 'neutral'}><CalendarClock className="h-3 w-3" />{fmtDay(g.due_date, 'd MMM')}</Badge>}</div></div>
                  <Menu label={`Actions for ${g.title}`} items={[{ label: 'Edit', icon: Pencil, onClick: () => setGoalDlg({ open: true, goal: g }) }, { label: 'Delete', icon: Trash2, danger: true, onClick: async () => { if (await confirm({ title: 'Delete this goal?', description: 'Study sessions stay in your history.' })) delGoal(g.id) } }]} />
                </div>
                <Progress value={p.percent ?? 0} tone={p.percent >= 100 ? 'success' : 'primary'} label={g.title} />
                <p className="text-xs text-muted-foreground">{fmtDuration(p.done)} {p.target ? `of ${fmtDuration(p.target)} · ${p.percent}%` : '· no target set'}</p>
              </CardContent></Card>) })}</div>
          ))}

          {tab === 'topics' && (<div className="space-y-5">
            <div className="flex justify-end"><Button variant="outline" size="sm" onClick={() => setTopicDlg({ open: true, topic: null })}><Plus className="h-4 w-4" />Add topic</Button></div>
            {groups.length === 0 && <EmptyState title="No topics yet" description="Default topics are created on first sign-in. Add your own any time." />}
            {groups.map((grp) => (
              <section key={grp}><h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{grp}</h3>
                <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">{totals.filter((t) => t.topic.group_name === grp).map(({ topic, minutes, problems }) => {
                  const next = (topic.revision_dates ?? []).filter((d) => d >= today).sort()[0]
                  const due = (topic.revision_dates ?? []).includes(today)
                  return (<Card key={topic.id}><CardContent className="space-y-1.5 p-3">
                    <div className="flex items-center justify-between"><p className="truncate text-sm font-medium">{topic.name}</p>
                      <Menu label={`Actions for ${topic.name}`} items={[{ label: 'Edit notes & revisions', icon: Pencil, onClick: () => setTopicDlg({ open: true, topic }) }, { label: 'Delete', icon: Trash2, danger: true, onClick: async () => { if (await confirm({ title: `Delete ${topic.name}?`, description: 'Past sessions stay, but lose their topic link.' })) delTopic(topic.id) } }]} /></div>
                    <p className="text-xs text-muted-foreground">{minutes > 0 ? fmtDuration(minutes) : 'No time logged'}{problems > 0 && ` · ${problems} problems`}</p>
                    <div className="flex flex-wrap gap-1.5">{due && <Badge tone="warning">Revise today</Badge>}{next && !due && <Badge><CalendarClock className="h-3 w-3" />Revise {fmtDay(next, 'd MMM')}</Badge>}{topic.notes && <Badge>Has notes</Badge>}</div>
                  </CardContent></Card>) })}</div></section>))}
          </div>)}

          {tab === 'sessions' && (history.length === 0 ? (
            <EmptyState icon={Clock} title="No completed sessions yet" description="Use the timer or log a session manually. Running timers don't count until you save them." />
          ) : (
            <Card><ul className="divide-y divide-border">{history.slice(0, 100).map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{nameOf(s)}</p><p className="text-xs text-muted-foreground">{fmtDay(s.session_date)} · {s.source === 'timer' ? 'Timer' : 'Manual'}{s.problems_solved > 0 && ` · ${s.problems_solved} problems`}</p>{s.notes && <p className="mt-0.5 truncate text-xs text-muted-foreground">{s.notes}</p>}</div>
                <span className="text-sm font-medium tabular-nums">{fmtDuration(s.duration_seconds / 60)}</span>
                <Menu label="Session actions" items={[{ label: 'Edit', icon: Pencil, onClick: () => setSessDlg({ open: true, session: s }) }, { label: 'Delete', icon: Trash2, danger: true, onClick: async () => { if (await confirm({ title: 'Delete this session?', description: `${fmtDuration(s.duration_seconds / 60)} of study time will be removed.` })) delSession(s.id) } }]} />
              </li>))}</ul></Card>
          ))}
        </div>
      </DataGate>
      <GoalDialog open={goalDlg.open} goal={goalDlg.goal} topics={topics} onOpenChange={(o) => setGoalDlg((d) => ({ ...d, open: o }))} />
      <SessionDialog open={sessDlg.open} session={sessDlg.session} goals={data.goals} topics={topics} today={today} onOpenChange={(o) => setSessDlg((d) => ({ ...d, open: o }))} />
      <TopicDialog open={topicDlg.open} topic={topicDlg.topic} groups={groups} today={today} onOpenChange={(o) => setTopicDlg((d) => ({ ...d, open: o }))} />
    </>
  )
}
