import { Wallet } from 'lucide-react'
import { Card, CardContent, CardHeader, CardLink, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/misc'
import { AnimatedValue } from '@/components/motion/primitives'
import { budgetTone } from '@/domain/finance'

/** This month's spending against the budget. `sum` is summarize() for the month. */
export function SpendingCard({ sum, money, className }) {
  return (
    <Card data-module="finance" className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-mod-text" aria-hidden />
          Spending this month
        </CardTitle>
        <CardLink to="/finance">Finance</CardLink>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="lt-stat-value text-[1.75rem] leading-tight" data-testid="month-spend">
            <AnimatedValue value={money(sum.expense)} />
          </span>
          {sum.budget > 0 && <span className="text-xs text-muted-foreground">of {money(sum.budget)} budget</span>}
        </div>
        {sum.budgetUsed != null ? (
          <>
            <Progress value={Math.min(100, sum.budgetUsed * 100)} tone={budgetTone(sum.budgetUsed)} label="Budget used" />
            <p className="text-xs text-muted-foreground">
              {Math.round(sum.budgetUsed * 100)}% used ·{' '}
              {sum.remaining >= 0 ? `${money(sum.remaining)} left` : `${money(-sum.remaining)} over`}
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Income {money(sum.income)} · set a budget in Finance to track usage.</p>
        )}
        {sum.savings != null && (
          <dl className="grid grid-cols-2 gap-2 border-t border-border pt-3 text-xs">
            <div className="rounded-md bg-surface-2/60 p-2.5">
              <dt className="text-muted-foreground">Money in</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">{money(sum.income)}</dd>
            </div>
            <div className="rounded-md bg-surface-2/60 p-2.5">
              <dt className="text-muted-foreground">Set aside</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">{money(sum.savings)}</dd>
            </div>
          </dl>
        )}
      </CardContent>
    </Card>
  )
}
