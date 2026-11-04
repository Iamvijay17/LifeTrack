import { PiggyBank, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { StatCard } from '@/components/shared/StatCard'
import { budgetTone, savingsRate } from '@/domain/finance'
import { plural } from '@/lib/format'

/** Income / expenses / savings / budget for the month. `sum` is summarize(); clicking the budget card edits it. */
export function FinanceStats({ sum, expenseCount, isOverride, money, onEditBudget }) {
  const used = sum.budgetUsed
  const rate = savingsRate(sum)
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard icon={TrendingUp} label="Income" value={money(sum.income)} />
      <StatCard icon={TrendingDown} label="Expenses" value={money(sum.expense)} sub={plural(expenseCount, 'transaction')} />
      <StatCard icon={PiggyBank} label="Savings" value={money(sum.savings)} sub={rate == null ? undefined : `${rate}% of income`} />
      <StatCard
        icon={Wallet}
        label="Budget left"
        value={sum.remaining == null ? 'No budget' : money(sum.remaining)}
        sub={sum.budget ? `of ${money(sum.budget)}${isOverride ? '' : ' (default)'}` : 'Set a monthly budget'}
        progress={used == null ? null : Math.min(100, used * 100)}
        tone={budgetTone(used)}
        onClick={onEditBudget}
      />
    </div>
  )
}
