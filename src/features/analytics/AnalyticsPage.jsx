import { useMemo } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate } from '@/components/shared/states'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { useTables } from '@/hooks/store'
import { useDateRange } from '@/hooks/useDateRange'
import { useSettings } from '@/hooks/useSettings'
import { useToday } from '@/hooks/useToday'
import { buildAnalytics } from '@/domain/analytics'
import { fmtDay } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { FinanceSection } from './FinanceSection'
import { FitnessSection } from './FitnessSection'
import { HabitsSection } from './HabitsSection'
import { HealthSection } from './HealthSection'
import { JobsSection } from './JobsSection'
import { LearningSection } from './LearningSection'

const TABLES = [
  'study_sessions',
  'goals',
  'milestones',
  'job_applications',
  'application_history',
  'interview_events',
  'workouts',
  'health_logs',
  'transactions',
  'habits',
  'habit_logs',
]

export default function AnalyticsPage() {
  const today = useToday()
  const { settings } = useSettings()
  const { data, loading, error, refetch } = useTables(...TABLES)
  const range = useDateRange(today, settings.week_starts_on, 'month')
  const { from, to } = range
  const money = (paise, opts) => formatMoney(paise, settings.currency, opts)

  const a = useMemo(
    () =>
      buildAnalytics(data, { from, to, today, weekStartsOn: settings.week_starts_on, plan: settings.workout_plan, tz: settings.timezone }),
    [data, from, to, today, settings.week_starts_on, settings.workout_plan, settings.timezone],
  )

  return (
    <>
      <PageHeader title="Analytics" description="Everything here is computed from your real records. Empty ranges stay empty." />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <DateRangePicker range={range} className="contents" />
        <span className="text-xs text-muted-foreground">
          {fmtDay(from, 'd MMM yyyy')} – {fmtDay(to, 'd MMM yyyy')}
        </span>
      </div>
      <DataGate loading={loading} error={error} onRetry={refetch}>
        <div className="space-y-8">
          <LearningSection learning={a.learning} />
          <JobsSection jobs={a.jobs} />
          <FitnessSection fitness={a.fitness} />
          <HealthSection health={a.health} />
          <FinanceSection finance={a.finance} money={money} />
          <HabitsSection habits={a.habits} />
        </div>
      </DataGate>
    </>
  )
}
