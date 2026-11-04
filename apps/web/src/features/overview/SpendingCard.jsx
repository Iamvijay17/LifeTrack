import { Wallet } from 'lucide-react'
import { Card, CardContent, CardHeader, CardLink, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/misc'
import { budgetTone } from '@/domain/finance'

/** This month's spending against the budget. `sum` is summarize() for the month. */
export function SpendingCard({ sum, money }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-4 w-4" />
          Spending this month
        </CardTitle>
        <CardLink to="/finance">Finance</CardLink>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-semibold tabular-nums" data-testid="month-spend">
            {money(sum.expense)}
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
      </CardContent>
    </Card>
  )
}
