import { AlertTriangle } from 'lucide-react'
import { budgetAlert } from '@lifetrack/core/finance'
import { cn } from '@/lib/utils'

/** A plain-language heads-up once spending reaches 80% of the month's budget. Renders nothing before then. */
export function BudgetAlert({ sum, money, onEdit }) {
  const alert = budgetAlert(sum)
  if (!alert) return null
  const over = alert.level === 'danger'
  return (
    <div
      role="status"
      data-testid="budget-alert"
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-4 py-3 text-sm',
        over ? 'border-danger/40 bg-danger/10' : 'border-warning/40 bg-warning/10',
      )}
    >
      <AlertTriangle className={cn('h-4 w-4 shrink-0', over ? 'text-danger' : 'text-warning')} aria-hidden />
      <p className="min-w-0 flex-1">
        {over
          ? `You're ${money(alert.overBy)} over this month's budget.`
          : `You've used ${alert.percent}% of this month's budget. ${money(alert.left)} left.`}
      </p>
      <button type="button" onClick={onEdit} className="rounded-md text-xs text-secondary underline underline-offset-2">
        Edit budget
      </button>
    </div>
  )
}
