import { useCallback, useMemo, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { useQuick } from '@/features/quick/QuickActions'
import { useHabits } from '@/features/habits/useHabits'
import { useTables } from '@/hooks/store'
import { useAction } from '@/hooks/useAction'
import { useAuth } from '@/hooks/useAuth'
import { useSettings } from '@/hooks/useSettings'
import { useToday } from '@/hooks/useToday'
import { setTaskStatus } from '@/services/api'
import { activeDates, dailyProgress } from '@/domain/progress'
import { averageScore, dailyScore } from '@/domain/score'
import { activeDayStreak } from '@/domain/streaks'
import { dashboardGoals, greetingFor, recentActivity, todayHeadlines, weekScoreSeries } from '@/domain/dashboard'
import { summarize } from '@/domain/finance'
import { fmtDay, monthKey, startOfWeek, timeStrInTz } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { ActivityCard } from './ActivityCard'
import { CustomizeDialog } from './CustomizeDialog'
import { GoalsCard } from './GoalsCard'
import { PrioritiesCard } from './PrioritiesCard'
import { ProgressCard } from './ProgressCard'
import { QuickActionsGrid } from './QuickActionsGrid'
import { ScoreCard } from './ScoreCard'
import { SpendingCard } from './SpendingCard'
import { TodayStats } from './TodayStats'
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
]

export default function OverviewPage() {
  const today = useToday()
  const { displayName } = useAuth()
  const { settings, save: saveSettings } = useSettings()
  const quick = useQuick()
  const [customizing, setCustomizing] = useState(false)
  const { timezone: tz, week_starts_on: weekStartsOn, currency } = settings
  const { data, loading, error, refetch } = useTables(...TABLES)
  const { habits, logs: habitLogs, stats: habitStats, loading: habitsLoading, error: habitsError } = useHabits(today, weekStartsOn)

  const on = (key) => isWidgetOn(settings.dashboard_widgets, key)
  const [toggleWidget] = useAction((key, value) => saveSettings({ dashboard_widgets: { ...settings.dashboard_widgets, [key]: value } }))
  const [complete] = useAction((task) => setTaskStatus(task, 'done', today))
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
    () => summarize(data.transactions, monthKey(today), settings.monthly_budget_paise),
    [data.transactions, today, settings.monthly_budget_paise],
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
          {(on('score') || on('progress')) && (
            <div className="grid gap-4 lg:grid-cols-5">
              {on('score') && (
                <div className={on('progress') ? 'lg:col-span-2' : 'lg:col-span-5'}>
                  <ScoreCard result={score} weekAvg={weekAvg} />
                </div>
              )}
              {on('progress') && <ProgressCard progress={progress} className={on('score') ? 'lg:col-span-3' : 'lg:col-span-5'} />}
            </div>
          )}
          {on('priorities') && (
            <div className="grid gap-4 lg:grid-cols-5">
              <PrioritiesCard
                priorities={headlines.priorities}
                hasTasksToday={headlines.hasTasksToday}
                openTasks={headlines.openTasks}
                doneTasks={headlines.doneTasks}
                onComplete={complete}
                onAddTask={() => quick.open('task')}
              />
            </div>
          )}
          {on('stats') && <TodayStats h={headlines} settings={settings} money={money} />}
          {(on('goals') || on('spending')) && (
            <div className="grid gap-4 lg:grid-cols-2">
              {on('goals') && <GoalsCard rows={goals} />}
              {on('spending') && <SpendingCard sum={monthSum} money={money} />}
            </div>
          )}
          {(on('weekly') || on('activity')) && (
            <div className="grid gap-4 lg:grid-cols-5">
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
