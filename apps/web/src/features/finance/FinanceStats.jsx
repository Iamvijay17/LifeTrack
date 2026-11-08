import { PiggyBank, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { AnimatedValue, ease, m } from '@/components/motion/primitives'
import { budgetTone, savingsRate } from '@/domain/finance'
import { plural } from '@/lib/format'
import { cn } from '@/lib/utils'

const GAUGE = {
  primary: ['#34D399', '#14B8A6'],
  success: ['#34D399', '#14B8A6'],
  warning: ['#FBBF24', '#F97316'],
  danger: ['#FB7185', '#E11D48'],
}
const ARC = 'M 12 58 A 48 48 0 0 1 108 58'

/** Half a dial showing how much of the month's budget is left. */
function BudgetGauge({ used, tone }) {
  const [from, to] = GAUGE[tone] ?? GAUGE.success
  const left = used == null ? 0 : Math.max(0, 1 - used)
  return (
    <svg viewBox="0 0 120 66" className="h-[66px] w-[120px] shrink-0" aria-hidden>
      <defs>
        <linearGradient id="lt-budget-gauge" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      <path d={ARC} fill="none" stroke="rgb(var(--muted))" strokeWidth="9" strokeLinecap="round" />
      {used != null && left > 0 && (
        <m.path
          d={ARC}
          fill="none"
          stroke="url(#lt-budget-gauge)"
          strokeWidth="9"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: left }}
          transition={{ duration: 0.9, ease: ease.out }}
        />
      )}
    </svg>
  )
}

function Figure({ icon: Icon, label, value, sub, tint }) {
  return (
    <div className="min-w-0 p-4 md:p-5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <span className={cn('grid h-5 w-5 place-items-center rounded-[6px]', tint)}>
          <Icon className="h-3 w-3" aria-hidden />
        </span>
        {label}
      </div>
      <div className="lt-stat-value mt-2 truncate text-[1.5rem] leading-tight md:text-[1.75rem]">
        <AnimatedValue value={value} />
      </div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  )
}

/** The month as a ledger: money in, money out, money kept, and what's left of the budget. `sum` is summarize(); clicking the budget edits it. */
export function FinanceStats({ sum, expenseCount, isOverride, money, onEditBudget }) {
  const used = sum.budgetUsed
  const rate = savingsRate(sum)
  const flow = sum.income + sum.expense + sum.savings
  const segments = [
    { key: 'income', value: sum.income, cls: 'bg-gradient-to-r from-emerald-400 to-emerald-500', label: 'Income' },
    { key: 'expense', value: sum.expense, cls: 'bg-gradient-to-r from-rose-400 to-rose-500', label: 'Expenses' },
    { key: 'savings', value: sum.savings, cls: 'bg-gradient-to-r from-violet-400 to-violet-500', label: 'Savings' },
  ]
  return (
    <section className="lt-hero">
      <div className="grid grid-cols-2 divide-border/70 lg:grid-cols-[1fr_1fr_1fr_1.15fr] lg:divide-x">
        <Figure icon={TrendingUp} tint="bg-emerald-500/15 text-emerald-500" label="Income" value={money(sum.income)} />
        <Figure
          icon={TrendingDown}
          tint="bg-rose-500/15 text-rose-500"
          label="Expenses"
          value={money(sum.expense)}
          sub={plural(expenseCount, 'transaction')}
        />
        <Figure
          icon={PiggyBank}
          tint="bg-violet-500/15 text-violet-500"
          label="Savings"
          value={money(sum.savings)}
          sub={rate == null ? undefined : `${rate}% of income`}
        />
        <button
          type="button"
          onClick={onEditBudget}
          className="group flex min-w-0 items-center justify-between gap-2 p-4 text-left transition-colors hover:bg-mod/[0.06] md:p-5"
        >
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <span className="lt-icon-soft h-5 w-5 rounded-[6px]">
                <Wallet className="h-3 w-3" aria-hidden />
              </span>
              Budget left
            </span>
            <span className="lt-stat-value mt-2 block truncate text-[1.5rem] leading-tight md:text-[1.75rem]">
              <AnimatedValue value={sum.remaining == null ? 'No budget' : money(sum.remaining)} />
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {sum.budget ? `of ${money(sum.budget)}${isOverride ? '' : ' (default)'}` : 'Set a monthly budget'}
            </span>
          </span>
          <span
            className="max-sm:hidden"
            role={used == null ? undefined : 'progressbar'}
            aria-label={used == null ? undefined : 'Budget used'}
            aria-valuenow={used == null ? undefined : Math.round(Math.min(100, used * 100))}
            aria-valuemin={used == null ? undefined : 0}
            aria-valuemax={used == null ? undefined : 100}
          >
            <BudgetGauge used={used} tone={budgetTone(used)} />
          </span>
        </button>
      </div>
      {flow > 0 && (
        <div aria-hidden className="flex h-1 w-full gap-px bg-muted">
          {segments.map((x) =>
            x.value > 0 ? (
              <m.span
                key={x.key}
                className={cn('h-full origin-left', x.cls)}
                style={{ flexGrow: x.value, flexBasis: 0 }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.8, ease: ease.out }}
              />
            ) : null,
          )}
        </div>
      )}
    </section>
  )
}
