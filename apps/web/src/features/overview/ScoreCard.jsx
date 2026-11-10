import { useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Info } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress, Segmented } from '@/components/ui/misc'
import { AnimatedValue, ProgressRing } from '@/components/motion/primitives'
import { explainScore } from '@lifetrack/core/score'
import { explainLifeScore, summarizeScores } from '@lifetrack/core/lifeScore'
import { scoreTone } from '@lifetrack/core/dashboard'
import { cn, plural } from '@/lib/utils'

const RING = {
  success: ['#34D399', '#059669'],
  primary: ['rgb(var(--mod))', 'rgb(var(--mod-2))'],
  warning: ['#FBBF24', '#F97316'],
}
const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
]
const DAYS = { today: 1, '7d': 7, '30d': 30 }

/** "▲ 4 vs the 7 days before", or nothing when there is nothing fair to compare with. */
function Change({ value, days }) {
  if (value == null) return null
  const Icon = value >= 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-medium',
        value > 0 ? 'text-success' : value < 0 ? 'text-danger' : 'text-muted-foreground',
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {value === 0 ? 'No change' : `${Math.abs(value)} ${value > 0 ? 'up' : 'down'}`}
      <span className="font-normal text-muted-foreground"> vs the {days} days before</span>
    </span>
  )
}

/**
 * The Life Score: today's daily score, or its average over 7 or 30 days, with what each category added.
 * `daily` is dailyScore() for today; `week` and `month` are lifeScore() results. Days with nothing planned or recorded are not counted.
 */
export function ScoreCard({ daily, week, month, className }) {
  const [period, setPeriod] = useState('7d')
  const [open, setOpen] = useState(false)
  const summary = period === 'today' ? { ...summarizeScores([daily]), change: null } : period === '7d' ? week : month
  const s = summary.score
  const tone = scoreTone(s)
  const days = DAYS[period]
  return (
    <Card data-testid="score-card" className={cn('flex flex-col', className)}>
      <CardHeader className="flex-wrap">
        <CardTitle>Life Score</CardTitle>
        <button
          onClick={() => setOpen(true)}
          className="-my-2 -mr-2 flex items-center gap-1 rounded-md p-2 text-xs text-muted-foreground transition-colors hover:text-mod-text"
        >
          <Info className="h-3.5 w-3.5" aria-hidden />
          How is this calculated?
        </button>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-center gap-4">
        <Segmented value={period} onChange={setPeriod} options={PERIODS} className="self-center" />
        <div className="flex flex-col items-center gap-1.5">
          <ProgressRing
            value={s}
            size={148}
            stroke={12}
            from={RING[tone][0]}
            to={RING[tone][1]}
            label={`Life Score ${s ?? 'not available'}`}
          >
            <div>
              <span className="block text-[2.5rem] font-semibold leading-none tracking-display" data-testid="score-value">
                {s == null ? '—' : <AnimatedValue value={s} />}
              </span>
              <span className="text-[11px] text-muted-foreground">/ 100</span>
            </div>
          </ProgressRing>
          <Change value={summary.change} days={days} />
          {s != null && period !== 'today' && (
            <p className="text-center text-xs text-muted-foreground">
              Average of {plural(summary.scoredDays, 'day')} with something planned or logged
              {summary.scoredDays < summary.days ? ` (of ${summary.days})` : ''}
            </p>
          )}
        </div>
        <div className="min-w-0 space-y-2">
          {s == null && (
            <p className="text-center text-xs text-muted-foreground">
              Nothing planned or logged {period === 'today' ? 'yet' : 'in this period'}. Rest days and empty categories are never counted as
              zero.
            </p>
          )}
          <ul className="space-y-1.5">
            {summary.categories.map((c) => (
              <li key={c.key} className="grid grid-cols-[5.5rem_1fr_3.25rem] items-center gap-2 text-xs">
                <span className="truncate text-muted-foreground">{c.label}</span>
                {c.applicableDays > 0 ? (
                  <Progress value={c.fraction * 100} tone={c.fraction >= 1 ? 'success' : 'primary'} label={`${c.label} completion`} />
                ) : (
                  <span className="text-muted-foreground/70">not tracked</span>
                )}
                <span
                  className="text-right tabular-nums text-muted-foreground"
                  title={c.applicableDays > 0 ? `${c.points.toFixed(1)} of ${c.share.toFixed(1)} points` : undefined}
                >
                  {c.applicableDays > 0 ? `${Math.round(c.points)}/${Math.round(c.share)}` : '—'}
                </span>
              </li>
            ))}
          </ul>
          {s != null && <p className="text-right text-[11px] text-muted-foreground">points earned / available</p>}
        </div>
      </CardContent>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="How your Life Score works"
        footer={
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        }
        className="md:max-w-xl"
      >
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">{period === 'today' ? explainScore(daily) : explainLifeScore(summary)}</p>
          <ul className="space-y-3">
            {(period === 'today' ? daily.categories : summary.categories).map((c) => (
              <li key={c.key} className="rounded-lg border border-border bg-surface-2/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-x-3">
                  <b className="font-semibold">{c.label}</b>
                  {period === 'today' ? (
                    <span className="text-xs text-muted-foreground">
                      weight {c.weight}%
                      {c.applicable && c.effectiveWeight > 0 ? ` → counts as ${Math.round(c.effectiveWeight)}% today` : ''}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {c.applicableDays > 0 ? `${c.points.toFixed(1)} of ${c.share.toFixed(1)} points` : 'not counted'}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{c.hint}</p>
                {period === 'today' ? (
                  c.applicable ? (
                    <ul className="mt-2 space-y-0.5 text-xs">
                      {c.items.map((i) => (
                        <li key={i.label} className="flex justify-between">
                          <span>{i.label}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {i.detail} · {Math.round(i.fraction * 100)}%
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Nothing planned or logged for this category today, so it is skipped.
                    </p>
                  )
                ) : c.applicableDays > 0 ? (
                  <p className="mt-2 text-xs">
                    Planned or logged on {plural(c.applicableDays, 'day')} of {summary.scoredDays}; average completion{' '}
                    <b className="tabular-nums">{Math.round(c.fraction * 100)}%</b>.
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Nothing planned or logged in this category in the period, so it does not affect the score.
                  </p>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Each day is scored from what you planned or recorded; a day with nothing is left out, not scored zero. Change the weights in
            Settings → Daily score weights.
          </p>
        </div>
      </Dialog>
    </Card>
  )
}
