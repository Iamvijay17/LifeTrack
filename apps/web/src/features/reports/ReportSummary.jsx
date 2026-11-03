import { FileText } from 'lucide-react'
import { StatCard } from '@/components/shared/StatCard'
import { pctText } from '@/lib/format'

/** The headline numbers. `s` is buildReport().summary. */
export function ReportSummary({ s, money }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        icon={FileText}
        label="Productivity score"
        value={s.productivityScore ?? '—'}
        sub={`${s.scoredDays} scored day${s.scoredDays === 1 ? '' : 's'}`}
        progress={s.productivityScore}
      />
      <StatCard label="Study" value={`${s.studyHours} h`} sub={`${s.focusHours} h focus`} />
      <StatCard label="Fitness consistency" value={pctText(s.fitnessConsistency)} sub={`${s.workouts} workouts`} />
      <StatCard label="Habit completion" value={pctText(s.habitRate)} />
      <StatCard label="Avg sleep" value={s.sleepAvgHours == null ? '—' : `${s.sleepAvgHours.toFixed(1)} h`} />
      <StatCard label="Expenses" value={money(s.expensePaise)} sub={`Income ${money(s.incomePaise)}`} />
      <StatCard
        label="Goals"
        value={`${s.goalsActive} active`}
        sub={s.goalAvgProgress == null ? undefined : `${s.goalAvgProgress}% average progress`}
      />
      <StatCard label="Job applications" value={s.applications} sub={`${s.interviews} interviews · ${s.offers} offers`} />
    </div>
  )
}
