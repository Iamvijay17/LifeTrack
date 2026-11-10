import { Flame, Target } from 'lucide-react'
import { AnimatedValue, ProgressRing } from '@/components/motion/primitives'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/misc'
import { fmtGrams, percentOfGoal, remainingOf, round } from '@/domain/nutrition'
import { cn } from '@/lib/utils'

const MACROS = [
  { key: 'protein_g', label: 'Protein', tone: 'primary' },
  { key: 'carbs_g', label: 'Carbs', tone: 'warning' },
  { key: 'fat_g', label: 'Fat', tone: 'danger' },
  { key: 'fiber_g', label: 'Fibre', tone: 'success' },
]

function Macro({ label, value, goal, tone }) {
  const percent = percentOfGoal(value, goal)
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-xs tabular-nums text-muted-foreground">
          <b className="text-sm font-semibold text-foreground">{round(value)}</b>
          {goal ? ` / ${goal} g` : ' g'}
        </span>
      </div>
      <Progress
        value={percent ?? 0}
        tone={percent != null && percent > 110 ? 'danger' : tone}
        className="mt-1.5"
        label={`${label} today`}
      />
    </div>
  )
}

/**
 * Today's calories as a ring, what is left, and the four nutrients as bars. Without a calorie goal the ring just shows what was eaten.
 * `totals` = dayTotals(); `goals` = goalsOf().
 */
export function CalorieHero({ totals, goals, isToday, onEditGoals }) {
  const goal = goals.kcal
  const percent = percentOfGoal(totals.kcal, goal)
  const left = remainingOf(totals.kcal, goal)
  const over = left != null && left < 0
  return (
    <Card className="relative isolate flex flex-col justify-center overflow-hidden lg:col-span-2">
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(60%_80%_at_0%_0%,rgb(var(--mod)/0.12),transparent)]" />
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
        <ProgressRing
          value={percent == null ? null : Math.min(100, percent)}
          size={160}
          stroke={13}
          label={goal ? `${Math.round(totals.kcal)} of ${goal} calories` : `${Math.round(totals.kcal)} calories`}
          className="mx-auto sm:mx-0"
          {...(over ? { from: '#F43F5E', to: '#FB923C' } : {})}
        >
          <div>
            <Flame className="mx-auto mb-0.5 h-4 w-4 text-mod-text" aria-hidden />
            <div className="lt-stat-value text-[1.75rem] leading-none">
              <AnimatedValue value={Math.round(totals.kcal).toLocaleString('en-IN')} />
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">{goal ? `of ${goal.toLocaleString('en-IN')} kcal` : 'kcal eaten'}</div>
          </div>
        </ProgressRing>
        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                {over ? 'Over your goal by' : isToday ? 'Remaining today' : 'Remaining'}
              </p>
              <p className={cn('lt-stat-value text-2xl leading-tight', over && 'text-danger')}>
                {left == null ? '—' : <AnimatedValue value={`${Math.abs(Math.round(left)).toLocaleString('en-IN')} kcal`} />}
              </p>
            </div>
            {!goal && (
              <Button variant="outline" size="sm" onClick={onEditGoals}>
                <Target className="h-4 w-4" aria-hidden />
                Set daily targets
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-3">
            {MACROS.map((m) => (
              <Macro key={m.key} label={m.label} value={totals[m.key]} goal={goals[m.key]} tone={m.tone} />
            ))}
          </div>
          <p className="sr-only">
            Protein {fmtGrams(totals.protein_g)}, carbs {fmtGrams(totals.carbs_g)}, fat {fmtGrams(totals.fat_g)}, fibre{' '}
            {fmtGrams(totals.fiber_g)}.
          </p>
        </div>
      </div>
    </Card>
  )
}
