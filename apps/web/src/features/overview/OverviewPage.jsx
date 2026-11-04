import { useCallback, useMemo, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { useQuick } from '@/features/quick/QuickActions'
import { useHabits } from '@/features/habits/useHabits'
import { useTable, useTables } from '@/hooks/store'
import { useAction } from '@/hooks/useAction'
import { useAuth } from '@/hooks/useAuth'
import { useSettings } from '@/hooks/useSettings'
import { useToday } from '@/hooks/useToday'
import { setHabitStatus, setTaskStatus } from '@/services/api'
import { activeDates, dailyProgress } from '@/domain/progress'
import { averageScore, dailyScore } from '@/domain/score'
import { activeDayStreak } from '@/domain/streaks'
import { dashboardGoals, greetingFor, recentActivity, todayHeadlines, weekScoreSeries } from '@/domain/dashboard'
import { resolveBudget, summarize } from '@/domain/finance'
import { WIDGETS_NEEDING_DATA, gettingStartedSteps, isBrandNew } from '@lifetrack/core/dashboard'
import { upcomingItems } from '@lifetrack/core/upcoming'
import { todayAgenda } from '@lifetrack/core/agenda'
import { activePipelineCount } from '@/domain/jobs'
import { fmtDay, monthKey, monthStart, startOfWeek, timeStrInTz } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { ActivityCard } from './ActivityCard'
import { CustomizeDialog } from './CustomizeDialog'
import { GettingStartedCard } from './GettingStartedCard'
import { GoalsCard } from './GoalsCard'
import { PrioritiesCard } from './PrioritiesCard'
import { ProgressCard } from './ProgressCard'
import { QuickActionsGrid } from './QuickActionsGrid'
import { ScoreCard } from './ScoreCard'
import { SpendingCard } from './SpendingCard'
import { TodayStats } from './TodayStats'
import { TodayCard } from './TodayCard'
import { UpcomingCard } from './UpcomingCard'
import { WeeklyScoreCard } from './WeeklyScoreCard'
import { isWidgetOn } from './widgets'

const TABLES = [
  'tasks',
  'study_sessions',
  'workouts',
  'health_logs',
  'transactions',
  'job_applications',
  'application_history',
  'interview_events',
  'goals',
  'milestones',
  'user_settings',
  'budgets',
  'reminders',
  'routines',
  'learning_topics',
]

export default function OverviewPage() {
  const today = useToday()
  const { displayName } = useAuth()
  const { settings, save: saveSettings } = useSettings()
  const quick = useQuick()
  const [customizing, setCustomizing] = useState(false)
  const { timezone: tz, week_starts_on: weekStartsOn, currency } = settings
  const { data, loading, error, refetch } = useTables(...TABLES)
  // Read on its own: until migration 0008 is applied the table is missing, and that must not take the whole dashboard down.
  const { rows: recurringRules } = useTable('recurring_rules')
  const { habits, logs: habitLogs, stats: habitStats, loading: habitsLoading, error: habitsError } = useHabits(today, weekStartsOn)

  const [toggleWidget] = useAction((key, value) => saveSettings({ dashboard_widgets: { ...settings.dashboard_widgets, [key]: value } }))
  const [undo] = useAction((task) => setTaskStatus(task, 'pending', today))
  const [complete] = useAction(async (task) => {
    await setTaskStatus(task, 'done', today)
    // A stray tap shouldn't cost anything. Repeating tasks have already spawned their next occurrence, so those are undone from the Planner.
    toast.success('Task completed', task.recurrence === 'none' ? { action: { label: 'Undo', onClick: () => undo(task) } } : undefined)
  })
  // Ticking a row in Today: tasks and habits can be completed (and un-ticked) in place.
  const [toggleAgenda] = useAction(async (item) => {
    if (item.kind === 'task') return item.done ? setTaskStatus(item.source, 'pending', today) : complete(item.source)
    return setHabitStatus(item.refId, today, item.done ? null : 'done')
  })
  const money = (paise) => formatMoney(paise, currency)

  const {
    tasks,
    study_sessions: sessions,
    workouts,
    health_logs: healthLogs,
    job_applications: applications,
    interview_events: interviews,
  } = data
  const weekStart = startOfWeek(today, weekStartsOn)

  const progress = useMemo(
    () =>
      dailyProgress({
        date: today,
        tasks,
        habits,
        habitLogs,
        sessions,
        workouts,
        health: healthLogs.find((h) => h.log_date === today),
        settings,
      }),
    [tasks, habits, habitLogs, sessions, workouts, healthLogs, settings, today],
  )
  const scoreFor = useCallback(
    (date) =>
      dailyScore({
        date,
        tasks,
        habits,
        habitLogs,
        sessions,
        workouts,
        health: healthLogs.find((h) => h.log_date === date) ?? null,
        applications,
        interviews,
        settings,
        tz,
      }),
    [tasks, habits, habitLogs, sessions, workouts, healthLogs, applications, interviews, settings, tz],
  )
  const score = useMemo(() => scoreFor(today), [scoreFor, today])
  const weekScores = useMemo(() => weekScoreSeries(scoreFor, weekStart, today), [scoreFor, weekStart, today])
  const weekAvg = averageScore(weekScores.filter((x) => x.score != null).map((x) => ({ score: x.score }))).avg

  const headlines = useMemo(
    () =>
      todayHeadlines({
        tasks,
        sessions,
        healthLogs,
        transactions: data.transactions,
        applications,
        workouts,
        habitStats,
        plan: settings.workout_plan,
        today,
        weekStart,
      }),
    [tasks, sessions, healthLogs, data.transactions, applications, workouts, habitStats, settings.workout_plan, today, weekStart],
  )
  const goals = useMemo(() => dashboardGoals(data.goals, data.milestones, sessions), [data.goals, data.milestones, sessions])
  const monthSum = useMemo(
    () =>
      summarize(data.transactions, monthKey(today), resolveBudget(data.budgets, monthStart(today), settings.monthly_budget_paise).paise),
    [data.transactions, data.budgets, today, settings.monthly_budget_paise],
  )
  const upcoming = useMemo(
    () =>
      upcomingItems(
        {
          tasks,
          interviews,
          applications,
          goals: data.goals,
          milestones: data.milestones,
          reminders: data.reminders,
          recurring: recurringRules,
        },
        { today, tz, days: 7 },
      ),
    [tasks, interviews, applications, data.goals, data.milestones, data.reminders, recurringRules, today, tz],
  )
  const agenda = useMemo(
    () =>
      todayAgenda(
        {
          tasks,
          habits,
          habitLogs,
          workouts,
          routines: data.routines,
          interviews,
          applications,
          reminders: data.reminders,
          topics: data.learning_topics,
          recurringRules,
        },
        { today, tz, weekStartsOn, workoutPlan: settings.workout_plan },
      ),
    [
      tasks,
      habits,
      habitLogs,
      workouts,
      data.routines,
      interviews,
      applications,
      data.reminders,
      data.learning_topics,
      recurringRules,
      today,
      tz,
      weekStartsOn,
      settings.workout_plan,
    ],
  )
  const guide = useMemo(
    () => gettingStartedSteps({ tasks, habits, goals: data.goals, transactions: data.transactions, healthLogs }),
    [tasks, habits, data.goals, data.transactions, healthLogs],
  )
  const streak = useMemo(
    () => activeDayStreak(activeDates({ habitLogs, tasks, sessions, workouts }, tz), today),
    [habitLogs, tasks, sessions, workouts, tz, today],
  )
  const activity = useMemo(
    () =>
      recentActivity({
        tasks,
        sessions,
        workouts,
        transactions: data.transactions,
        history: data.application_history,
        applications,
        habitLogs,
        habits,
        currency,
      }),
    [tasks, sessions, workouts, data.transactions, data.application_history, applications, habitLogs, habits, currency],
  )

  // A brand-new account sees the guide rather than rows of zeros; everything appears after the first real entry.
  const guideOn = isWidgetOn(settings.dashboard_widgets, 'getting_started')
  const fresh = guideOn && isBrandNew(tasks, habits, data.goals, data.transactions, healthLogs, sessions, workouts, applications)
  const on = (key) => isWidgetOn(settings.dashboard_widgets, key) && !(fresh && WIDGETS_NEEDING_DATA.includes(key))

  const greeting = greetingFor(Number(timeStrInTz(new Date(), tz).slice(0, 2)))

  return (
    <>
      <PageHeader
        title={`${greeting}${displayName ? `, ${displayName.split(' ')[0]}` : ''}`}
        description={fmtDay(today, 'EEEE, d MMMM yyyy')}
        actions={
          <Button variant="outline" size="sm" onClick={() => setCustomizing(true)}>
            <SlidersHorizontal className="h-4 w-4" />
            Customize
          </Button>
        }
      />
      <DataGate loading={loading || habitsLoading} error={error || habitsError} onRetry={refetch}>
        <div className="space-y-5">
          {on('getting_started') && !guide.complete && (
            <GettingStartedCard guide={guide} onQuick={quick.open} onDismiss={() => toggleWidget('getting_started', false)} />
          )}
          {on('today') && (
            <TodayCard agenda={agenda} nowTime={timeStrInTz(new Date(), tz).slice(0, 5)} money={money} onToggle={toggleAgenda} />
          )}
          {(on('score') || on('progress')) && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
              {on('score') && (
                <div className={on('progress') ? 'lg:col-span-2' : 'lg:col-span-5'}>
                  <ScoreCard result={score} weekAvg={weekAvg} />
                </div>
              )}
              {on('progress') && <ProgressCard progress={progress} className={on('score') ? 'lg:col-span-3' : 'lg:col-span-5'} />}
            </div>
          )}
          {(on('priorities') || on('upcoming')) && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
              {on('priorities') && (
                <PrioritiesCard
                  priorities={headlines.priorities}
                  hasTasksToday={headlines.hasTasksToday}
                  openTasks={headlines.openTasks}
                  doneTasks={headlines.doneTasks}
                  onComplete={complete}
                  onAddTask={() => quick.open('task')}
                  className={on('upcoming') ? 'lg:col-span-3' : 'lg:col-span-5'}
                />
              )}
              {on('upcoming') && (
                <UpcomingCard
                  upcoming={upcoming}
                  today={today}
                  money={money}
                  className={on('priorities') ? 'lg:col-span-2' : 'lg:col-span-5'}
                />
              )}
            </div>
          )}
          {on('stats') && (
            <TodayStats h={headlines} settings={settings} money={money} activeApplications={activePipelineCount(applications)} />
          )}
          {(on('goals') || on('spending')) && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {on('goals') && <GoalsCard rows={goals} />}
              {on('spending') && <SpendingCard sum={monthSum} money={money} />}
            </div>
          )}
          {(on('weekly') || on('activity')) && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
              {on('weekly') && (
                <WeeklyScoreCard
                  series={weekScores}
                  today={today}
                  streak={streak}
                  className={on('activity') ? 'lg:col-span-3' : 'lg:col-span-5'}
                />
              )}
              {on('activity') && <ActivityCard items={activity} className={on('weekly') ? 'lg:col-span-2' : 'lg:col-span-5'} />}
            </div>
          )}
          {on('quick') && <QuickActionsGrid onOpen={quick.open} />}
        </div>
      </DataGate>
      <CustomizeDialog open={customizing} onOpenChange={setCustomizing} prefs={settings.dashboard_widgets} onToggle={toggleWidget} />
    </>
  )
}
