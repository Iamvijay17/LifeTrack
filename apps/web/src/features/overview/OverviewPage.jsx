import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { DataGate } from '@/components/shared/states'
import { Stagger, StaggerItem } from '@/components/motion/primitives'
import { useQuick } from '@/features/quick/QuickActions'
import { useHabits } from '@/features/habits/useHabits'
import { useTable, useTables } from '@/hooks/store'
import { useAction } from '@/hooks/useAction'
import { useAuth } from '@/hooks/useAuth'
import { useSettings } from '@/hooks/useSettings'
import { useToday } from '@/hooks/useToday'
import { setHabitStatus, setTaskStatus } from '@/services/api'
import { activeDates, dailyProgress } from '@/domain/progress'
import { dailyScore } from '@/domain/score'
import { activeDayStreak } from '@/domain/streaks'
import { dashboardGoals, greetingFor, recentActivity, todayHeadlines } from '@/domain/dashboard'
import { dayStatus } from '@/domain/nutrition'
import { gettingStartedSteps, isBrandNew } from '@lifetrack/core/dashboard'
import { COMMAND_NEEDING_DATA, layoutOf } from '@lifetrack/core/commandCenter'
import { lifeScore } from '@lifetrack/core/lifeScore'
import {
  financeSnapshot,
  fitnessSnapshot,
  habitsSnapshot,
  jobsSnapshot,
  learningSnapshot,
  sleepSnapshot,
  taskSummary,
} from '@lifetrack/core/snapshots'
import { upcomingItems } from '@lifetrack/core/upcoming'
import { todayAgenda } from '@lifetrack/core/agenda'
import { activePipelineCount } from '@/domain/jobs'
import { addDays, eachDay, fmtDay, startOfWeek, timeStrInTz } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { celebrate } from '@/lib/celebrate'
import { cn } from '@/lib/utils'
import { healthWeek } from '@/domain/health'
import { DashboardHero } from './DashboardHero'
import { ActivityCard } from './ActivityCard'
import { CustomizeDialog } from './CustomizeDialog'
import { GettingStartedCard } from './GettingStartedCard'
import { GoalsCard } from './GoalsCard'
import { PrioritiesCard } from './PrioritiesCard'
import { ProgressCard } from './ProgressCard'
import { QuickActionsGrid } from './QuickActionsGrid'
import { ScoreCard } from './ScoreCard'
import { NutritionCard } from './NutritionCard'
import { SpendingCard } from './SpendingCard'
import { TodayStats } from './TodayStats'
import { TodayCard } from './TodayCard'
import { UpcomingCard } from './UpcomingCard'
import { WeeklyScoreCard } from './WeeklyScoreCard'
import { FitnessCard } from './FitnessCard'
import { HabitsCard } from './HabitsCard'
import { JobsCard } from './JobsCard'
import { KpiStrip } from './KpiStrip'
import { LearningCard } from './LearningCard'
import { SleepCard } from './SleepCard'
import { useDashboardLayout } from './useDashboardLayout'
import { isWidgetOn } from './widgets'

// Spelled out in full, so Tailwind can see them. Widgets stack in one column until `lg`, then take their own span of 12.
const SPAN = {
  4: 'lg:col-span-4',
  5: 'lg:col-span-5',
  6: 'lg:col-span-6',
  7: 'lg:col-span-7',
  8: 'lg:col-span-8',
  9: 'lg:col-span-9',
  10: 'lg:col-span-10',
  11: 'lg:col-span-11',
  12: 'lg:col-span-12',
}

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
  // Same for the nutrition tables (migration 0009).
  const { rows: foodLogs } = useTable('food_logs')
  const { rows: nutritionSettings } = useTable('nutrition_settings')
  const { habits, logs: habitLogs, stats: habitStats, loading: habitsLoading, error: habitsError } = useHabits(today, weekStartsOn)

  const layout = useDashboardLayout(settings.dashboard_widgets, saveSettings)
  const resetLayout = () => {
    setCustomizing(false) // the Undo below is a toast, which a modal dialog would sit on top of
    const before = layout.reset()
    toast.success('Dashboard layout restored', { action: { label: 'Undo', onClick: () => layout.restore(before) } })
  }
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
  // Every score on the page (today, the 7 and 30 day Life Scores, the trend charts) is rolled up from the same per-day results, each worked
  // out once per change of data and then kept, so switching a period or range never recomputes a day.
  const scoreFor = useMemo(() => {
    const cache = new Map()
    return (date) => {
      if (!cache.has(date))
        cache.set(
          date,
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
        )
      return cache.get(date)
    }
  }, [tasks, habits, habitLogs, sessions, workouts, healthLogs, applications, interviews, settings, tz])
  const score = useMemo(() => scoreFor(today), [scoreFor, today])
  const weekLife = useMemo(() => lifeScore(scoreFor, today, 7), [scoreFor, today])
  const scoreOn = isWidgetOn(layout.prefs, 'score')
  const monthLife = useMemo(() => (scoreOn ? lifeScore(scoreFor, today, 30) : null), [scoreOn, scoreFor, today])

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
  const finance = useMemo(
    () => financeSnapshot({ transactions: data.transactions, budgets: data.budgets, settings, today }),
    [data.transactions, data.budgets, settings, today],
  )
  const nutrition = useMemo(() => dayStatus(foodLogs, nutritionSettings[0] ?? null, today), [foodLogs, nutritionSettings, today])
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
      recentActivity(
        {
          tasks,
          sessions,
          workouts,
          transactions: data.transactions,
          history: data.application_history,
          applications,
          habitLogs,
          habits,
          healthLogs,
          currency,
        },
        10,
      ),
    [tasks, sessions, workouts, data.transactions, data.application_history, applications, habitLogs, habits, healthLogs, currency],
  )

  // One summary per module, from the same rows the module pages read, so the dashboard can never disagree with them.
  const learning = useMemo(
    () =>
      learningSnapshot({
        sessions,
        goals: data.goals,
        topics: data.learning_topics,
        today,
        weekStartsOn,
        targetMinutes: settings.daily_study_target_minutes,
      }),
    [sessions, data.goals, data.learning_topics, today, weekStartsOn, settings.daily_study_target_minutes],
  )
  const jobs = useMemo(
    () => jobsSnapshot({ applications, interviews, history: data.application_history, today, weekStartsOn }),
    [applications, interviews, data.application_history, today, weekStartsOn],
  )
  const fitness = useMemo(
    () =>
      fitnessSnapshot({
        workouts,
        health: healthLogs.find((h) => h.log_date === today),
        settings,
        today,
        weekStartsOn,
        caloriesEaten: nutrition.logged ? nutrition.totals.kcal : null,
      }),
    [workouts, healthLogs, settings, today, weekStartsOn, nutrition],
  )
  const sleep = useMemo(() => sleepSnapshot({ healthLogs, settings, today }), [healthLogs, settings, today])
  const habitsSnap = useMemo(
    () => habitsSnapshot({ habits, habitLogs, today, weekStartsOn, agenda }),
    [habits, habitLogs, today, weekStartsOn, agenda],
  )
  const kpis = useMemo(() => {
    const overdueRow = upcoming.items.some((i) => i.kind === 'overdue') ? 1 : 0 // the list folds every overdue task into one row
    return {
      score: weekLife.score,
      change: weekLife.change,
      percent: progress.percent,
      tasks: taskSummary(tasks, today),
      overdue: taskSummary(tasks, today).overdue,
      events: upcoming.items.length + upcoming.more - overdueRow,
    }
  }, [weekLife, progress.percent, tasks, today, upcoming])

  // The last seven days of each metric, for the small charts on the tiles. Real data only: a day with nothing logged stays empty.
  const trends = useMemo(() => {
    const days = eachDay(addDays(today, -6), today)
    const week = healthWeek(healthLogs, today)
    return {
      sleep: week.map((d) => d.sleep),
      workouts: days.map((d) => (workouts.some((w) => w.workout_date === d && w.status === 'completed') ? 1 : 0)),
      spend: days.map((d) =>
        data.transactions.filter((t) => t.type === 'expense' && t.txn_date === d).reduce((sum, t) => sum + t.amount_paise, 0),
      ),
    }
  }, [today, healthLogs, workouts, data.transactions])

  // Clearing the whole day is worth a moment of confetti, but only when it just happened, not on every visit to a finished day.
  const remaining = agenda.total - agenda.doneCount
  const lastRemaining = useRef(null)
  useEffect(() => {
    if (loading || habitsLoading) return
    if (lastRemaining.current > 0 && remaining === 0 && agenda.total > 0) celebrate()
    lastRemaining.current = remaining
  }, [remaining, agenda.total, loading, habitsLoading])

  // A brand-new account sees the guide rather than rows of zeros; everything appears after the first real entry.
  const guideOn = isWidgetOn(layout.prefs, 'getting_started')
  const fresh = guideOn && isBrandNew(tasks, habits, data.goals, data.transactions, healthLogs, sessions, workouts, applications)
  const hidden = (key) => (fresh && COMMAND_NEEDING_DATA.includes(key)) || (key === 'getting_started' && guide.complete)

  const greeting = greetingFor(Number(timeStrInTz(new Date(), tz).slice(0, 2)))

  const firstName = displayName ? `, ${displayName.split(' ')[0]}` : ''
  const widgets = {
    getting_started: (cls) =>
      !guide.complete && (
        <GettingStartedCard
          guide={guide}
          onQuick={quick.open}
          onDismiss={() => layout.setVisible('getting_started', false)}
          className={cls}
        />
      ),
    today: (cls) => (
      <TodayCard agenda={agenda} nowTime={timeStrInTz(new Date(), tz).slice(0, 5)} money={money} onToggle={toggleAgenda} className={cls} />
    ),
    score: (cls) => <ScoreCard daily={score} week={weekLife} month={monthLife} className={cls} />,
    progress: (cls) => <ProgressCard progress={progress} className={cls} />,
    priorities: (cls) => (
      <PrioritiesCard
        priorities={headlines.priorities}
        hasTasksToday={headlines.hasTasksToday}
        openTasks={headlines.openTasks}
        doneTasks={headlines.doneTasks}
        onComplete={complete}
        onAddTask={() => quick.open('task')}
        className={cls}
      />
    ),
    upcoming: (cls) => <UpcomingCard upcoming={upcoming} today={today} money={money} className={cls} />,
    stats: () => (
      <TodayStats h={headlines} settings={settings} money={money} activeApplications={activePipelineCount(applications)} trends={trends} />
    ),
    goals: (cls) => <GoalsCard rows={goals} className={cls} />,
    learning: (cls) => <LearningCard snap={learning} className={cls} />,
    jobs: (cls) => <JobsCard snap={jobs} tz={tz} className={cls} />,
    fitness: (cls) => <FitnessCard snap={fitness} className={cls} />,
    sleep: (cls) => <SleepCard snap={sleep} className={cls} />,
    habits: (cls) => <HabitsCard snap={habitsSnap} className={cls} />,
    spending: (cls) => <SpendingCard sum={finance.sum} recent={finance.recent} money={money} className={cls} />,
    nutrition: (cls) => <NutritionCard status={nutrition} className={cls} />,
    weekly: (cls) => <WeeklyScoreCard scoreFor={scoreFor} today={today} weekStartsOn={weekStartsOn} streak={streak} className={cls} />,
    activity: (cls) => <ActivityCard items={activity} className={cls} />,
    quick: () => <QuickActionsGrid onOpen={quick.open} />,
  }
  const rows = layoutOf(layout.prefs, (key) => !hidden(key))

  return (
    <>
      <DashboardHero
        greeting={`${greeting}${firstName}`}
        date={fmtDay(today, 'EEEE, d MMMM yyyy')}
        tz={tz}
        agenda={agenda}
        streak={streak}
        onCustomize={() => setCustomizing(true)}
      />
      <DataGate loading={loading || habitsLoading} error={error || habitsError} onRetry={refetch}>
        {!fresh && <KpiStrip kpis={kpis} />}
        <Stagger gap={0.05} className="grid grid-cols-1 gap-4 lg:grid-cols-12" data-testid="widget-grid">
          {rows.map(({ key, span, size }) => (
            <StaggerItem
              key={key}
              data-widget={key}
              data-size={size}
              className={cn('min-w-0 [container-type:inline-size]', SPAN[span] ?? 'lg:col-span-12')}
            >
              {widgets[key]('h-full')}
            </StaggerItem>
          ))}
        </Stagger>
      </DataGate>
      <CustomizeDialog
        open={customizing}
        onOpenChange={setCustomizing}
        prefs={layout.prefs}
        onToggle={layout.setVisible}
        onReorder={layout.setOrder}
        onResize={layout.setSize}
        onReset={resetLayout}
      />
    </>
  )
}
