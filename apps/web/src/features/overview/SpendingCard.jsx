import { Link } from 'react-router-dom'
import { Wallet } from 'lucide-react'
import { Card, CardContent, CardHeader, CardLink, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/misc'
import { AnimatedValue } from '@/components/motion/primitives'
import { budgetTone, signFor } from '@lifetrack/core/finance'
import { fmtDay } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { Fact, FactGrid, Subhead } from './parts'

/**
 * Finance for this month: spending against the budget, money in, what is left, and the latest transactions.
 * `sum` is summarize() for the month; `recent` (optional) the newest transactions.
 */
export function SpendingCard({ sum, money, recent = [], className }) {
  return (
    <Card data-module="finance" data-testid="finance-card" className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-mod-text" aria-hidden />
          Finance this month
        </CardTitle>
        <CardLink to="/finance">Finance</CardLink>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="lt-stat-value text-[1.75rem] leading-tight" data-testid="month-spend">
            <AnimatedValue value={money(sum.expense)} />
          </span>
          {sum.budget > 0 ? (
            <span className="text-xs text-muted-foreground">of {money(sum.budget)} budget</span>
          ) : (
            <span className="text-xs text-muted-foreground">spent</span>
          )}
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
        <FactGrid className="border-t border-border pt-3">
          <Fact label="Income" value={money(sum.income)} tone={sum.income > 0 ? 'success' : undefined} />
          <Fact label="Expenses" value={money(sum.expense)} />
          <Fact
            label={sum.remaining == null ? 'Left to spend' : sum.remaining >= 0 ? 'Budget left' : 'Over budget'}
            value={sum.remaining == null ? null : money(Math.abs(sum.remaining))}
            tone={sum.remaining != null && sum.remaining < 0 ? 'danger' : undefined}
            sub={sum.remaining == null ? 'no budget set' : undefined}
            className="col-span-2 [@container(min-width:28rem)]:col-span-1"
          />
        </FactGrid>
        {recent.length > 0 && (
          <div>
            <Subhead>Recent transactions</Subhead>
            <ul className="space-y-1.5">
              {recent.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {t.category}
                    {t.note ? <span className="text-muted-foreground"> · {t.note}</span> : null}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{fmtDay(t.txn_date, 'd MMM')}</span>
                  <span className={cn('shrink-0 text-xs font-medium tabular-nums', t.type === 'income' && 'text-success')}>
                    {signFor(t.type)}
                    {money(t.amount_paise)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {sum.count === 0 && recent.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nothing recorded this month.{' '}
            <Link to="/finance" className="text-mod-text underline underline-offset-2">
              Add a transaction
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  )
}
