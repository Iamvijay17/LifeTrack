import { useMemo, useState } from 'react'
import { Pressable, ScrollView, Switch, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { fmtDay, fmtDuration, formatMoney } from '@lifetrack/utils'
import { QUICK_KINDS, WIDGETS, WIDGETS_NEEDING_DATA, dashboardData, isBrandNew, isWidgetOn, relTime } from '@lifetrack/core/dashboard'
import { signFor } from '@lifetrack/core/finance'
import { dueLabel } from '@lifetrack/core/upcoming'
import { api } from '../../../src/data/client'
import { useTable } from '../../../src/data/useTable'
import { useTables } from '../../../src/hooks/useTables'
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
import { Button, Card, Txt } from '../../../src/ui'

type IconName = React.ComponentProps<typeof Ionicons>['name']
const KIND_ICON: Record<string, IconName> = { task: 'checkmark-circle-outline', study: 'book-outline', workout: 'barbell-outline', money: 'wallet-outline', job: 'briefcase-outline', habit: 'repeat-outline' }
const UPCOMING_ICON: Record<string, IconName> = { overdue: 'alert-circle-outline', task: 'checkbox-outline', interview: 'briefcase-outline', followup: 'send-outline', goal: 'flag-outline', milestone: 'flag-outline', reminder: 'notifications-outline', recurring: 'repeat-outline' }
const UPCOMING_ROUTE: Record<string, string> = { overdue: '/planner', task: '/planner', interview: '/module/jobs', followup: '/module/jobs', goal: '/module/goals', milestone: '/module/goals', reminder: '/module/notifications', recurring: '/finance' }
const GUIDE_ROUTE: Record<string, string> = { habit: '/habits', goal: '/module/goals', health: '/module/health' }
const GUIDE_QUICK: Record<string, string> = { task: 'task', money: 'expense' }

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
  const { data, loading, refreshing, error, refetch } = useTables('tasks', 'study_sessions', 'workouts', 'health_logs', 'transactions', 'job_applications', 'application_history', 'interview_events', 'goals', 'milestones', 'habits', 'habit_logs', 'budgets', 'reminders')
  const [complete] = useAction((t: any) => api.setTaskStatus(t, 'done', today))
  const [toggleWidget] = useAction((k: string, v: boolean) => save({ dashboard_widgets: { ...settings.dashboard_widgets, [k]: v } }))
  const cur = settings.currency
  const money = (p: number) => formatMoney(p, cur)

  const d: any = useMemo(() => dashboardData({ tasks: data.tasks, studySessions: data.study_sessions, workouts: data.workouts, healthLogs: data.health_logs, transactions: data.transactions, applications: data.job_applications, history: data.application_history, interviews: data.interview_events, goals: data.goals, milestones: data.milestones, habits: data.habits, habitLogs: data.habit_logs, budgets: data.budgets, reminders: data.reminders, recurringRules }, { settings, today }), [data, recurringRules, settings, today])
  // A brand-new account sees the guide rather than rows of zeros; everything appears after the first real entry.
  const fresh = isWidgetOn(settings.dashboard_widgets, 'getting_started') && isBrandNew(data.tasks, data.habits, data.goals, data.transactions, data.health_logs, data.study_sessions, data.workouts, data.job_applications)
  const on = (k: string) => isWidgetOn(settings.dashboard_widgets, k) && !(fresh && WIDGETS_NEEDING_DATA.includes(k))
  const first = displayName.split(' ')[0]
  const h = d.health

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView refreshControl={pullToRefresh(refreshing, refetch)} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Txt variant="title" style={{ fontSize: 24 }}>{d.greeting}{first ? `, ${first}` : ''}</Txt>
            <Txt muted>{fmtDay(today, 'EEEE, d MMMM yyyy')}</Txt>
          </View>
          <Button title="Customize" variant="ghost" onPress={() => setCustomize(true)} />
        </View>
        <DataGate loading={loading} error={error} onRetry={refetch}>
          {on('getting_started') && !d.gettingStarted.complete ? (
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
          ) : null}

          {on('score') ? <ScoreCard result={d.score} weekAvg={d.weekAvg} /> : null}

          {on('progress') ? (
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
                  <View style={{ flex: 1 }}><ProgressBar value={(i.done / i.total) * 100} color={i.done >= i.total ? colors.success : colors.primary} label={i.label} /></View>
                  <Text style={{ width: 70, textAlign: 'right', color: colors.mutedForeground, fontSize: 12 }}>{i.detail ?? `${i.done}/${i.total}`}</Text>
                </View>
              ))}
            </Card>
          ) : null}

          {on('priorities') ? (
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Txt variant="heading">Top priorities</Txt>
                <Pressable accessibilityRole="link" onPress={() => router.navigate('/planner')} hitSlop={8}><Text style={{ color: colors.secondary }}>Planner</Text></Pressable>
              </View>
              <Txt variant="small" muted>{d.openToday} pending · {d.doneTodayTasks} completed today</Txt>
              {d.topTasks.length === 0
                ? <View style={{ alignItems: 'center', gap: 8, paddingVertical: 8 }}><Txt muted>{d.hasTasksToday ? 'All priorities done 🎉' : 'No tasks for today.'}</Txt><Button title="Add task" variant="ghost" onPress={() => quick.open('task')} /></View>
                : d.topTasks.map((t: any) => (
                  <Pressable key={t.id} accessibilityRole="checkbox" accessibilityState={{ checked: false }} accessibilityLabel={`Complete ${t.title}`} onPress={() => complete(t)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
                    <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.mutedForeground }} />
                    <Text numberOfLines={1} style={{ color: colors.foreground, flex: 1, fontSize: 16 }}>{t.title}</Text>
                  </Pressable>
                ))}
            </Card>
          ) : null}

          {on('upcoming') ? (
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
          ) : null}

          {on('stats') ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              <StatTile label="Learning today" value={fmtDuration(d.studyMin)} sub={d.timerRunning ? 'timer running' : settings.daily_study_target_minutes ? `target ${fmtDuration(settings.daily_study_target_minutes)}` : undefined} progress={settings.daily_study_target_minutes ? Math.min(100, (d.studyMin / settings.daily_study_target_minutes) * 100) : null} tone="success" />
              <StatTile label="Gym" value={d.gym} sub={d.todayWorkouts[0]?.name} />
              <StatTile label="Sleep" value={h?.sleep_minutes != null ? fmtDuration(h.sleep_minutes) : '—'} sub={h?.sleep_minutes != null ? 'last night' : 'not logged'} />
              <StatTile label="Water" value={`${h?.water_ml ?? 0} ml`} sub={settings.water_goal_ml ? `goal ${settings.water_goal_ml}` : undefined} progress={settings.water_goal_ml ? ((h?.water_ml ?? 0) / settings.water_goal_ml) * 100 : null} />
              <StatTile label="Steps" value={(h?.steps ?? 0).toLocaleString('en-IN')} sub={settings.steps_goal ? `goal ${settings.steps_goal.toLocaleString('en-IN')}` : undefined} progress={settings.steps_goal ? ((h?.steps ?? 0) / settings.steps_goal) * 100 : null} />
              <StatTile label="Applications" value={d.weekApps} sub="this week" />
              <StatTile label="Spent today" value={money(d.spentToday)} />
              <StatTile label="Habits" value={`${d.habitsDone}/${d.habitsDue}`} sub={d.habitsDue ? undefined : 'none due today'} progress={d.habitsDue ? (d.habitsDone / d.habitsDue) * 100 : null} tone="success" />
            </View>
          ) : null}

          {on('goals') ? (
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt variant="heading">Goal progress</Txt>
                <Pressable accessibilityRole="link" onPress={() => router.push('/module/goals')} hitSlop={8}><Text style={{ color: colors.secondary }}>All goals</Text></Pressable>
              </View>
              {d.activeGoals.length === 0 ? <Txt muted>No active goals yet.</Txt> : d.activeGoals.map(({ g, p }: any) => (
                <View key={g.id} style={{ gap: 4, paddingVertical: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text numberOfLines={1} style={{ color: colors.foreground, flex: 1 }}>{g.title}</Text><Txt variant="small" muted>{p.percent}%</Txt></View>
                  <ProgressBar value={p.percent} color={p.percent >= 100 ? colors.success : colors.primary} label={g.title} />
                </View>
              ))}
            </Card>
          ) : null}

          {on('spending') ? (
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt variant="heading">Spending this month</Txt>
                <Pressable accessibilityRole="link" onPress={() => router.navigate('/finance')} hitSlop={8}><Text style={{ color: colors.secondary }}>Finance</Text></Pressable>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Text style={{ color: colors.foreground, fontSize: 24, fontWeight: '600' }}>{money(d.month.expense)}</Text>
                {d.month.budget > 0 ? <Txt variant="small" muted>of {money(d.month.budget)} budget</Txt> : null}
              </View>
              {d.month.budgetUsed != null ? (<>
                <ProgressBar value={Math.min(100, d.month.budgetUsed * 100)} color={d.month.budgetUsed > 1 ? colors.danger : d.month.budgetUsed > 0.8 ? colors.warning : colors.success} label="Budget used" />
                <Txt variant="small" muted>{Math.round(d.month.budgetUsed * 100)}% used · {d.month.remaining >= 0 ? `${money(d.month.remaining)} left` : `${money(-d.month.remaining)} over`}</Txt>
              </>) : <Txt variant="small" muted>Income {money(d.month.income)} · set a budget in Finance to track usage.</Txt>}
            </Card>
          ) : null}

          {on('weekly') ? (
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt variant="heading">This week&apos;s score</Txt><Txt variant="small" muted>{d.streak > 0 ? `${d.streak}-day active streak` : 'Start a streak today'}</Txt></View>
              <BarChart data={d.weekScores.map((x: any) => ({ label: x.label, value: x.score }))} maxValue={100} summary={`Daily score this week: ${d.weekScores.map((x: any) => `${x.label} ${x.score ?? 'none'}`).join(', ')}`} />
            </Card>
          ) : null}

          {on('activity') ? (
            <Card>
              <Txt variant="heading">Recent activity</Txt>
              {d.activity.length === 0 ? <Txt muted>Your activity will show up here.</Txt> : d.activity.map((a: any, i: number) => (
                <View key={i} style={{ flexDirection: 'row', gap: 10, paddingVertical: 4, alignItems: 'flex-start' }}>
                  <Ionicons name={KIND_ICON[a.kind]} size={16} color={colors.mutedForeground} style={{ width: 22, marginTop: 2 }} />
                  <Text numberOfLines={2} style={{ color: colors.foreground, flex: 1 }}>{a.text}</Text>
                  <Txt variant="small" muted>{relTime(a.at)}</Txt>
                </View>
              ))}
            </Card>
          ) : null}

          {on('quick') ? (
            <View style={{ gap: 8 }}>
              <Txt variant="small" muted>QUICK ACTIONS</Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {QUICK_KINDS.map((q: any) => (
                  <Pressable key={q.kind} accessibilityRole="button" accessibilityLabel={q.label} onPress={() => quick.open(q.kind)}
                    style={{ flexBasis: '47%', flexGrow: 1, minHeight: 52, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', padding: 8 }}>
                    <Text style={{ color: colors.foreground, fontWeight: '500' }}>{q.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </DataGate>
      </ScrollView>

      <Sheet visible={customize} title="Customize dashboard" onClose={() => setCustomize(false)}>
        <Txt muted>Choose which widgets to show. Saved to your account, so it applies on every device.</Txt>
        {WIDGETS.map((w: any) => (
          <View key={w.key} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 }}>
            <Text style={{ color: colors.foreground, fontSize: 16 }}>{w.label}</Text>
            <Switch accessibilityLabel={w.label} value={isWidgetOn(settings.dashboard_widgets, w.key)} onValueChange={(v) => { toggleWidget(w.key, v) }} trackColor={{ true: colors.primary }} />
          </View>
        ))}
      </Sheet>
    </SafeAreaView>
  )
}
