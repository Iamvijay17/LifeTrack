import { Salad } from 'lucide-react'
import { Card, CardContent, CardHeader, CardLink, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/misc'
import { AnimatedValue } from '@/components/motion/primitives'
import { fmtGrams } from '@/domain/nutrition'

/** Today's food at a glance. `status` is dayStatus() from the shared nutrition logic. */
export function NutritionCard({ status, className }) {
  const { totals, goals, logged, percent, remaining, hasCalorieGoal, count } = status
  const over = remaining != null && remaining < 0
  return (
    <Card data-module="nutrition" className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Salad className="h-4 w-4 text-mod-text" aria-hidden />
          Food today
        </CardTitle>
        <CardLink to="/nutrition">{logged ? 'Nutrition' : 'Log food'}</CardLink>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="lt-stat-value text-[1.75rem] leading-tight" data-testid="food-kcal">
            <AnimatedValue value={`${Math.round(totals.kcal).toLocaleString('en-IN')} kcal`} />
          </span>
          {hasCalorieGoal && <span className="text-xs text-muted-foreground">of {goals.kcal.toLocaleString('en-IN')} kcal</span>}
        </div>
        {hasCalorieGoal ? (
          <>
            <Progress value={Math.min(100, percent)} tone={over ? 'danger' : 'primary'} label="Calories today" />
            <p className="text-xs text-muted-foreground">
              {Math.round(percent)}% of target · {over ? `${Math.round(-remaining)} kcal over` : `${Math.round(remaining)} kcal left`}
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            {logged ? `${count} ${count === 1 ? 'entry' : 'entries'} logged.` : 'Nothing logged yet.'} Set a calorie target in Nutrition to
            track it.
          </p>
        )}
        {logged && (
          <dl className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs">
            {[
              ['Protein', totals.protein_g],
              ['Carbs', totals.carbs_g],
              ['Fat', totals.fat_g],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md bg-surface-2/60 p-2.5">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">{fmtGrams(value)}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  )
}
