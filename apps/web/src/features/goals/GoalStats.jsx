import { CheckCircle2, Target } from 'lucide-react'
import { StatCard } from '@/components/shared/StatCard'

/** `summary` is goalSummary(). */
export function GoalStats({ summary }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard icon={Target} label="Active" value={summary.active} sub={`${summary.overdue} overdue`} />
      <StatCard
        icon={CheckCircle2}
        label="Completed"
        value={summary.completed}
        sub={summary.completedShare == null ? undefined : `${summary.completedShare}% of closed goals`}
        tone="success"
      />
      <StatCard icon={Target} label="Average progress" value={summary.avg == null ? '—' : `${summary.avg}%`} progress={summary.avg} />
      <StatCard icon={Target} label="Milestones done" value={`${summary.milestonesDone}/${summary.milestonesTotal}`} />
    </div>
  )
}
