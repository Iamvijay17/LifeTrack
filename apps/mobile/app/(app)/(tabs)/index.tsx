import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Pressable, ScrollView, Switch, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { fmtDay, fmtDuration, formatMoney } from '@lifetrack/utils'
import { QUICK_KINDS, WIDGETS, WIDGETS_NEEDING_DATA, dashboardData, isBrandNew, isWidgetOn, relTime, widgetOrder } from '@lifetrack/core/dashboard'
import { signFor } from '@lifetrack/core/finance'
import { dueLabel } from '@lifetrack/core/upcoming'
import { nextTimed } from '@lifetrack/core/agenda'
import { timeStrInTz } from '@lifetrack/utils'
import { api } from '../../../src/data/client'
import { useTable } from '../../../src/data/useTable'
import { useTables } from '../../../src/hooks/useTables'
import { useNow } from '../../../src/hooks/useNow'
import { useSettings } from '../../../src/hooks/useSettings'
import { useToday } from '../../../src/hooks/useToday'
import { useAction } from '../../../src/hooks/useAction'
import { useAuth } from '../../../src/providers/AuthProvider'
import { useTheme } from '../../../src/providers/ThemeProvider'
import { Ring, ScoreCard } from '../../../src/features/dashboard/parts'
import { useQuick } from '../../../src/features/quick/QuickActions'
import { BarChart } from '../../../src/ui/charts'
import { Sheet } from '../../../src/ui/Sheet'
import { DataGate, ProgressBar, StatTile, pullToRefresh } from '../../../src/ui/controls'
import { Accent } from '../../../src/ui/accent'
import { AnimatedNumber, CheckCircle, FadeIn, Hero, IconTile, PressableScale, useConfetti } from '../../../src/ui/motion'
import { Button, Card, Txt } from '../../../src/ui'

const QUICK_LOOK: Record<string, { icon: IconName; module: any }> = {
  task: { icon: 'checkbox-outline', module: 'planner' },
  study: { icon: 'book-outline', module: 'learning' },
  workout: { icon: 'barbell-outline', module: 'fitness' },
  expense: { icon: 'wallet-outline', module: 'finance' },
  water: { icon: 'water-outline', module: 'health' },
  habit: { icon: 'checkmark-done-outline', module: 'habits' },
  application: { icon: 'briefcase-outline', module: 'jobs' },
}
const AGENDA_MODULE: Record<string, any> = { task: 'planner', habit: 'habits', workout: 'fitness', interview: 'jobs', reminder: 'notifications', revision: 'learning', followup: 'jobs', bill: 'finance' }
const ACTIVITY_MODULE: Record<string, any> = { task: 'planner', study: 'learning', workout: 'fitness', money: 'finance', job: 'jobs', habit: 'habits' }

/** Ticks here and nowhere else, so a second passing re-renders only these few characters. */
function LiveClock({ tz, color }: { tz: string; color: string }) {
  const now = useNow(1000)
  return <Text accessibilityLabel={`Current time ${timeStrInTz(new Date(now), tz)}`} style={{ color, fontSize: 30, fontWeight: '600', fontVariant: ['tabular-nums'], letterSpacing: -1 }}>{timeStrInTz(new Date(now), tz)}</Text>
}
const HeroChip = ({ children }: { children: ReactNode }) => {
  const { colors } = useTheme()
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}>{children}</View>
}

type IconName = React.ComponentProps<typeof Ionicons>['name']
const KIND_ICON: Record<string, IconName> = { task: 'checkmark-circle-outline', study: 'book-outline', workout: 'barbell-outline', money: 'wallet-outline', job: 'briefcase-outline', habit: 'repeat-outline' }
const UPCOMING_ICON: Record<string, IconName> = { overdue: 'alert-circle-outline', task: 'checkbox-outline', interview: 'briefcase-outline', followup: 'send-outline', goal: 'flag-outline', milestone: 'flag-outline', reminder: 'notifications-outline', recurring: 'repeat-outline' }
const UPCOMING_ROUTE: Record<string, string> = { overdue: '/planner', task: '/planner', interview: '/module/jobs', followup: '/module/jobs', goal: '/module/goals', milestone: '/module/goals', reminder: '/module/notifications', recurring: '/finance' }
const AGENDA_ICON: Record<string, IconName> = { task: 'ellipse-outline', habit: 'repeat-outline', workout: 'barbell-outline', interview: 'briefcase-outline', reminder: 'notifications-outline', revision: 'school-outline', followup: 'send-outline', bill: 'wallet-outline' }
const AGENDA_ROUTE: Record<string, string> = { task: '/planner', habit: '/habits', workout: '/module/fitness', interview: '/module/jobs', reminder: '/module/notifications', revision: '/module/learning', followup: '/module/jobs', bill: '/finance' }
const GUIDE_ROUTE: Record<string, string> = { habit: '/habits', goal: '/module/goals', health: '/module/health' }
const GUIDE_QUICK: Record<string, string> = { task: 'task', money: 'expense' }

type AgendaProps = { agenda: any; nowTime: string; money: (p: number) => string; onToggle: (i: any) => void; onOpen: (i: any) => void }
/** One ordered list of the whole day: a time rail first, then "Anytime", then what is done. */
function TodayAgenda({ agenda, nowTime, money, onToggle, onOpen }: AgendaProps) {
  const { colors } = useTheme()
  const next = nextTimed(agenda, nowTime)
  const row = (i: any) => {
    const completable = i.kind === 'task' || i.kind === 'habit'
    return (
      <Accent key={i.id} module={AGENDA_MODULE[i.kind]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, backgroundColor: next?.id === i.id ? colors.muted : 'transparent', borderRadius: 12 }}>
          {completable ? (
            <CheckCircle done={i.done} onPress={() => onToggle(i)} label={`${i.done ? 'Mark not done' : 'Complete'} ${i.title}`} size={24} />
          ) : (
            <View style={{ width: 44, alignItems: 'center' }}><IconTile name={AGENDA_ICON[i.kind]} size={26} soft /></View>
          )}
          <Pressable accessibilityRole="link" accessibilityLabel={i.title} onPress={() => onOpen(i)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingRight: 8 }}>
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, color: i.done ? colors.mutedForeground : colors.foreground, textDecorationLine: i.done ? 'line-through' : 'none' }}>{i.title}</Text>
            {i.amount_paise != null ? <Text style={{ color: colors.foreground, fontSize: 13 }}>{signFor(i.txnType)}{money(i.amount_paise)}</Text> : null}
            {i.time ? <Text style={{ color: colors.mutedForeground, fontSize: 13, fontVariant: ['tabular-nums'] }}>{i.time}</Text> : null}
          </Pressable>
        </View>
      </Accent>
    )
  }
  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Txt variant="heading">Today</Txt>
        <Txt variant="small" muted>{agenda.doneCount} of {agenda.total} done</Txt>
      </View>
      {agenda.total > 0 ? <View style={{ marginVertical: 6 }}><ProgressBar value={(agenda.doneCount / agenda.total) * 100} label="Today's agenda done" /></View> : null}
      {agenda.total === 0 ? <Txt muted>Nothing planned for today. Add a task or check in a habit to start.</Txt> : null}
      {agenda.timed.map(row)}
      {agenda.anytime.length > 0 && agenda.timed.length > 0 ? <Txt variant="small" muted>Anytime</Txt> : null}
      {agenda.anytime.map(row)}
      {agenda.done.length > 0 ? <Txt variant="small" muted>Done</Txt> : null}
      {agenda.done.map(row)}
    </Card>
  )
}

export default function Dashboard() {
  const { colors } = useTheme()
  const router = useRouter()
  const today = useToday()
  const { displayName } = useAuth()
  const { settings, save } = useSettings()
  const quick = useQuick()
  const [customize, setCustomize] = useState(false)
  // Read on its own: until migration 0008 is applied the table is missing, and that must not take the whole dashboard down.
  const { rows: recurringRules } = useTable('recurring_rules')
  const { data, loading, refreshing, error, refetch } = useTables('tasks', 'study_sessions', 'workouts', 'health_logs', 'transactions', 'job_applications', 'application_history', 'interview_events', 'goals', 'milestones', 'habits', 'habit_logs', 'budgets', 'reminders', 'routines', 'learning_topics')
  const [complete] = useAction((t: any) => api.setTaskStatus(t, 'done', today))
  // Ticking a row in Today: tasks and habits can be completed (and un-ticked) in place.
  const [toggleAgenda] = useAction(async (i: any) => {
    if (i.kind === 'task') return api.setTaskStatus(i.source, i.done ? 'pending' : 'done', today)
    return api.setHabitStatus(i.refId, today, i.done ? null : 'done')
  })
  const [toggleWidget] = useAction((k: string, v: boolean) => save({ dashboard_widgets: { ...settings.dashboard_widgets, [k]: v } }))
  const cur = settings.currency
  const money = (p: number) => formatMoney(p, cur)

  const d: any = useMemo(() => dashboardData({ tasks: data.tasks, studySessions: data.study_sessions, workouts: data.workouts, healthLogs: data.health_logs, transactions: data.transactions, applications: data.job_applications, history: data.application_history, interviews: data.interview_events, goals: data.goals, milestones: data.milestones, habits: data.habits, habitLogs: data.habit_logs, budgets: data.budgets, reminders: data.reminders, recurringRules, routines: data.routines, topics: data.learning_topics }, { settings, today }), [data, recurringRules, settings, today])
  // A brand-new account sees the guide rather than rows of zeros; everything appears after the first real entry.
  const fresh = isWidgetOn(settings.dashboard_widgets, 'getting_started') && isBrandNew(data.tasks, data.habits, data.goals, data.transactions, data.health_logs, data.study_sessions, data.workouts, data.job_applications)
  const on = (k: string) => isWidgetOn(settings.dashboard_widgets, k) && !(fresh && WIDGETS_NEEDING_DATA.includes(k))
  const first = displayName.split(' ')[0]
  const h = d.health
  // Clearing the whole day earns confetti, but only as it happens, not on every visit to a finished day.
  const confetti = useConfetti()
  const remaining = loading ? null : d.agenda.total - d.agenda.doneCount
  const lastRemaining = useRef<number | null>(null)
  useEffect(() => {
    if (lastRemaining.current != null && lastRemaining.current > 0 && remaining === 0 && d.agenda.total > 0) confetti.fire()
    lastRemaining.current = remaining
  }, [remaining]) // eslint-disable-line react-hooks/exhaustive-deps
  const order: string[] = widgetOrder(settings.dashboard_widgets)
  const [reorder] = useAction((next: string[]) => save({ dashboard_widgets: { ...settings.dashboard_widgets, order: next } }))
  const move = (key: string, by: number) => {
    const at = order.indexOf(key)
    const to = at + by
    if (to < 0 || to >= order.length) return
    const next = [...order]
    next.splice(at, 1)
    next.splice(to, 0, key)
    reorder(next)
  }
  const labelOf = (key: string) => WIDGETS.find((w: any) => w.key === key)?.label ?? key

  const sections: Record<string, ReactNode> = {
    getting_started: on('getting_started') && !d.gettingStarted.complete ? (
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Txt variant="heading">Get started</Txt>
                <Pressable accessibilityRole="button" accessibilityLabel="Dismiss the getting started guide" onPress={() => toggleWidget('getting_started', false)} hitSlop={12} style={{ minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' }}>
                  <Ionicons name="close" size={20} color={colors.mutedForeground} />
                </Pressable>
              </View>
              {d.gettingStarted.steps.map((s: any) => (
                <Pressable key={s.key} disabled={s.done} accessibilityRole="button" accessibilityState={{ disabled: s.done, checked: s.done }} accessibilityLabel={s.label}
                  onPress={() => (GUIDE_ROUTE[s.key] ? router.navigate(GUIDE_ROUTE[s.key] as never) : quick.open(GUIDE_QUICK[s.key] as never))}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
                  <Ionicons name={s.done ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={s.done ? colors.success : colors.mutedForeground} />
                  <Text style={{ color: s.done ? colors.mutedForeground : colors.foreground, fontSize: 16, textDecorationLine: s.done ? 'line-through' : 'none' }}>{s.label}</Text>
                </Pressable>
              ))}
            </Card>
          ) : null,
    today: on('today') ? <TodayAgenda agenda={d.agenda} nowTime={timeStrInTz(new Date(), settings.timezone).slice(0, 5)} money={money} onToggle={toggleAgenda} onOpen={(i: any) => router.navigate(AGENDA_ROUTE[i.kind] as never)} /> : null,
    score: on('score') ? <ScoreCard result={d.score} weekAvg={d.weekAvg} /> : null,
    progress: on('progress') ? (
            <Card>
              <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
                <Ring percent={d.progress.percent} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Txt variant="heading">Today&apos;s progress</Txt>
                  <Txt variant="small" muted>{d.progress.total ? `${Number(d.progress.done.toFixed(1))} of ${d.progress.total} planned activities` : 'Nothing planned yet — add a task or habit to start.'}</Txt>
                </View>
              </View>
              {d.progress.items.map((i: any) => (
                <View key={i.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 3 }}>
                  <Text style={{ width: 64, color: colors.mutedForeground, fontSize: 12 }}>{i.label}</Text>
                  <View style={{ flex: 1 }}><ProgressBar value={(i.done / i.total) * 100} color={i.done >= i.total ? colors.success : undefined} label={i.label} /></View>
                  <Text style={{ width: 70, textAlign: 'right', color: colors.mutedForeground, fontSize: 12 }}>{i.detail ?? `${i.done}/${i.total}`}</Text>
                </View>
              ))}
            </Card>
          ) : null,
    priorities: on('priorities') ? (
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Txt variant="heading">Top priorities</Txt>
                <Pressable accessibilityRole="link" onPress={() => router.navigate('/planner')} hitSlop={8}><Text style={{ color: colors.secondary }}>Planner</Text></Pressable>
              </View>
              <Txt variant="small" muted>{d.openToday} pending · {d.doneTodayTasks} completed today</Txt>
              {d.topTasks.length === 0
                ? <View style={{ alignItems: 'center', gap: 8, paddingVertical: 8 }}><Txt muted>{d.hasTasksToday ? 'All priorities done' : 'No tasks for today.'}</Txt><Button title="Add task" variant="ghost" onPress={() => quick.open('task')} /></View>
                : d.topTasks.map((t: any) => (
                  <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 48 }}>
                    <Accent module="planner"><CheckCircle done={false} onPress={() => complete(t)} label={`Complete ${t.title}`} size={24} /></Accent>
                    <Text numberOfLines={1} style={{ color: colors.foreground, flex: 1, fontSize: 16 }}>{t.title}</Text>
                  </View>
                ))}
            </Card>
          ) : null,
    upcoming: on('upcoming') ? (
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Txt variant="heading">Upcoming</Txt>
                <Txt variant="small" muted>next 7 days</Txt>
              </View>
              {d.upcoming.items.length === 0 ? <Txt muted>Nothing due. Interviews, deadlines and reminders will show up here.</Txt> : d.upcoming.items.map((u: any) => (
                <Pressable key={u.id} accessibilityRole="link" onPress={() => router.navigate(UPCOMING_ROUTE[u.kind] as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
                  <Ionicons name={UPCOMING_ICON[u.kind]} size={18} color={u.overdue ? colors.danger : colors.mutedForeground} />
                  <Text numberOfLines={1} style={{ color: colors.foreground, flex: 1 }}>{u.title}</Text>
                  {u.amount_paise != null ? <Text style={{ color: colors.foreground, fontSize: 13, fontVariant: ['tabular-nums'] }}>{signFor(u.txnType)}{money(u.amount_paise)}</Text> : null}
                  <Text style={{ color: u.overdue ? colors.danger : colors.mutedForeground, fontSize: 13 }}>{dueLabel(u, today, (x: string) => fmtDay(x, 'd MMM'))}</Text>
                </Pressable>
              ))}
              {d.upcoming.more > 0 ? <Txt variant="small" muted>and {d.upcoming.more} more</Txt> : null}
            </Card>
          ) : null,
    stats: on('stats') ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              <StatTile module="learning" icon="book-outline" onPress={() => router.push('/module/learning')} label="Learning today" value={fmtDuration(d.studyMin)} sub={d.timerRunning ? 'timer running' : settings.daily_study_target_minutes ? `target ${fmtDuration(settings.daily_study_target_minutes)}` : undefined} progress={settings.daily_study_target_minutes ? Math.min(100, (d.studyMin / settings.daily_study_target_minutes) * 100) : null} />
              <StatTile module="fitness" icon="barbell-outline" onPress={() => router.push('/module/fitness')} label="Gym" value={d.gym} sub={d.todayWorkouts[0]?.name} />
              <StatTile module="health" icon="moon-outline" onPress={() => router.push('/module/health')} label="Sleep" value={h?.sleep_minutes != null ? fmtDuration(h.sleep_minutes) : '—'} sub={h?.sleep_minutes != null ? 'last night' : 'not logged'} />
              <StatTile module="health" icon="water-outline" onPress={() => router.push('/module/health')} label="Water" value={`${h?.water_ml ?? 0} ml`} sub={settings.water_goal_ml ? `goal ${settings.water_goal_ml}` : undefined} progress={settings.water_goal_ml ? ((h?.water_ml ?? 0) / settings.water_goal_ml) * 100 : null} />
              <StatTile module="health" icon="footsteps-outline" onPress={() => router.push('/module/health')} label="Steps" value={d.stepsToday.toLocaleString('en-IN')} sub={settings.steps_goal ? `goal ${settings.steps_goal.toLocaleString('en-IN')}${d.cardioStepsToday > 0 ? ' · incl. cardio' : ''}` : undefined} progress={settings.steps_goal ? (d.stepsToday / settings.steps_goal) * 100 : null} />
              <StatTile module="jobs" icon="briefcase-outline" onPress={() => router.push('/module/jobs')} label="Applications" value={d.weekApps} sub="this week" />
              <StatTile module="finance" icon="wallet-outline" onPress={() => router.navigate('/finance')} label="Spent today" value={money(d.spentToday)} />
              <StatTile module="habits" icon="repeat-outline" onPress={() => router.navigate('/habits')} label="Habits" value={`${d.habitsDone}/${d.habitsDue}`} sub={d.habitsDue ? undefined : 'none due today'} progress={d.habitsDue ? (d.habitsDone / d.habitsDue) * 100 : null} />
            </View>
          ) : null,
    goals: on('goals') ? (
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt variant="heading">Goal progress</Txt>
                <Pressable accessibilityRole="link" onPress={() => router.push('/module/goals')} hitSlop={8}><Text style={{ color: colors.secondary }}>All goals</Text></Pressable>
              </View>
              {d.activeGoals.length === 0 ? <Txt muted>No active goals yet.</Txt> : d.activeGoals.map(({ g, p }: any) => (
                <View key={g.id} style={{ gap: 4, paddingVertical: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text numberOfLines={1} style={{ color: colors.foreground, flex: 1 }}>{g.title}</Text><Txt variant="small" muted>{p.percent}%</Txt></View>
                  <ProgressBar value={p.percent} color={p.percent >= 100 ? colors.success : undefined} label={g.title} />
                </View>
              ))}
            </Card>
          ) : null,
    spending: on('spending') ? (
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt variant="heading">Spending this month</Txt>
                <Pressable accessibilityRole="link" onPress={() => router.navigate('/finance')} hitSlop={8}><Text style={{ color: colors.secondary }}>Finance</Text></Pressable>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <AnimatedNumber value={money(d.month.expense)} style={{ color: colors.foreground, fontSize: 24, fontWeight: '700', letterSpacing: -0.5 }} />
                {d.month.budget > 0 ? <Txt variant="small" muted>of {money(d.month.budget)} budget</Txt> : null}
              </View>
              {d.month.budgetUsed != null ? (<>
                <ProgressBar value={Math.min(100, d.month.budgetUsed * 100)} color={d.month.budgetUsed > 1 ? colors.danger : d.month.budgetUsed > 0.8 ? colors.warning : colors.success} label="Budget used" />
                <Txt variant="small" muted>{Math.round(d.month.budgetUsed * 100)}% used · {d.month.remaining >= 0 ? `${money(d.month.remaining)} left` : `${money(-d.month.remaining)} over`}</Txt>
              </>) : <Txt variant="small" muted>Income {money(d.month.income)} · set a budget in Finance to track usage.</Txt>}
            </Card>
          ) : null,
    weekly: on('weekly') ? (
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt variant="heading">This week&apos;s score</Txt><Txt variant="small" muted>{d.streak > 0 ? `${d.streak}-day active streak` : 'Start a streak today'}</Txt></View>
              <BarChart data={d.weekScores.map((x: any) => ({ label: x.label, value: x.score }))} maxValue={100} summary={`Daily score this week: ${d.weekScores.map((x: any) => `${x.label} ${x.score ?? 'none'}`).join(', ')}`} />
            </Card>
          ) : null,
    activity: on('activity') ? (
            <Card>
              <Txt variant="heading">Recent activity</Txt>
              {d.activity.length === 0 ? <Txt muted>Your activity will show up here.</Txt> : d.activity.map((a: any, i: number) => (
                <View key={i} style={{ flexDirection: 'row', gap: 10, paddingVertical: 4, alignItems: 'center' }}>
                  <IconTile name={KIND_ICON[a.kind]} size={26} soft module={ACTIVITY_MODULE[a.kind]} />
                  <Text numberOfLines={2} style={{ color: colors.foreground, flex: 1 }}>{a.text}</Text>
                  <Txt variant="small" muted>{relTime(a.at)}</Txt>
                </View>
              ))}
            </Card>
          ) : null,
    quick: on('quick') ? (
            <View style={{ gap: 8 }}>
              <Txt variant="small" muted style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.8 }}>QUICK ACTIONS</Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {QUICK_KINDS.map((q: any) => (
                  <PressableScale key={q.kind} accessibilityRole="button" accessibilityLabel={q.label} onPress={() => quick.open(q.kind)}
                    style={{ flexBasis: '47%', flexGrow: 1, minHeight: 60, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 }}>
                    <IconTile name={QUICK_LOOK[q.kind].icon} size={36} module={QUICK_LOOK[q.kind].module} />
                    <Text numberOfLines={2} style={{ color: colors.foreground, fontWeight: '500', flex: 1 }}>{q.label}</Text>
                  </PressableScale>
                ))}
              </View>
            </View>
          ) : null,
  }
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView refreshControl={pullToRefresh(refreshing, refetch)} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
        <FadeIn>
          <Hero>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Txt variant="small" muted style={{ textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 11, fontWeight: '600' }}>{fmtDay(today, 'EEEE, d MMMM yyyy')}</Txt>
                <Txt variant="title" style={{ fontSize: 26, marginTop: 6 }}>{d.greeting}{first ? `, ${first}` : ''}</Txt>
              </View>
              <LiveClock tz={settings.timezone} color={colors.foreground} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 12 }}>
              {d.agenda.total > 0 ? <HeroChip><AnimatedNumber value={d.agenda.doneCount} style={{ color: colors.foreground, fontSize: 12, fontWeight: '600' }} /><Txt variant="small" style={{ fontSize: 12 }}>of {d.agenda.total} done today</Txt></HeroChip> : null}
              <HeroChip><Ionicons name="flame" size={13} color={d.streak > 0 ? colors.warning : colors.mutedForeground} /><Txt variant="small" style={{ fontSize: 12 }}>{d.streak > 0 ? `${d.streak}-day streak` : 'Start a streak today'}</Txt></HeroChip>
              <View style={{ flex: 1 }} />
              <Button title="Customize" variant="ghost" onPress={() => setCustomize(true)} />
            </View>
          </Hero>
        </FadeIn>
        <DataGate loading={loading} error={error} onRetry={refetch}>
          {order.map((key) => (sections[key] ? <Fragment key={key}>{sections[key]}</Fragment> : null))}
        </DataGate>
      </ScrollView>

      <Sheet visible={customize} title="Customize dashboard" onClose={() => setCustomize(false)}>
        <Txt muted>Choose which widgets to show and arrange their order. Saved to your account, so it applies on every device.</Txt>
        {order.map((key, at) => (
          <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 48 }}>
            <Text style={{ color: colors.foreground, fontSize: 16, flex: 1 }}>{labelOf(key)}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Move ${labelOf(key)} up`} accessibilityState={{ disabled: at === 0 }} disabled={at === 0} hitSlop={4} onPress={() => move(key, -1)} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', opacity: at === 0 ? 0.3 : 1 }}>
              <Ionicons name="chevron-up" size={18} color={colors.mutedForeground} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Move ${labelOf(key)} down`} accessibilityState={{ disabled: at === order.length - 1 }} disabled={at === order.length - 1} hitSlop={4} onPress={() => move(key, 1)} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', opacity: at === order.length - 1 ? 0.3 : 1 }}>
              <Ionicons name="chevron-down" size={18} color={colors.mutedForeground} />
            </Pressable>
            <Switch accessibilityLabel={labelOf(key)} value={isWidgetOn(settings.dashboard_widgets, key)} onValueChange={(v) => { toggleWidget(key, v) }} trackColor={{ true: colors.primary }} />
          </View>
        ))}
      </Sheet>
      {confetti.node}
    </SafeAreaView>
  )
}
