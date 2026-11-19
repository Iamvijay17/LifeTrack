import { useMemo, useState } from 'react'
import { Flame } from 'lucide-react'
import { EmptyChart } from '@/components/shared/chartParts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Segmented } from '@/components/ui/misc'
import { TREND_RANGES, scoreTrend } from '@lifetrack/core/lifeScore'
import { plural } from '@/lib/utils'

const OPTIONS = TREND_RANGES.map((r) => ({ value: r.key, label: r.label }))
const NAME = { daily: 'day', weekly: 'week', monthly: 'month' }
const TICKS = [100, 50, 0]
// The same fill as the shared `G.mod` gradient, as CSS (an SVG gradient can't paint an HTML bar).
const BAR_FILL = 'linear-gradient(rgb(var(--mod)), rgb(var(--mod-2) / 0.75))'

/**
 * The 0–100 bars, drawn with plain elements instead of the chart library: this card is on the landing page, and Recharts is a large download
 * for one small chart. Same look as the other charts: dashed grid, axis colours, the average as a dashed line, the latest bar emphasised.
 */
function ScoreBars({ series, avg, range, summary }) {
  const last = series.length - 1
  return (
    <div role="img" aria-label={summary} className="flex h-[210px] flex-col pt-1.5 text-[11px]" style={{ color: 'var(--c-axis)' }}>
      <div className="relative flex-1 pl-9">
        {TICKS.map((t) => (
          <div key={t} aria-hidden className="absolute inset-x-0 flex translate-y-1/2 items-center" style={{ bottom: `${t}%` }}>
            <span className="w-9 shrink-0 pr-2 text-right tabular-nums">{t}</span>
            <span className="flex-1 border-t border-dashed" style={{ borderColor: 'var(--c-grid)' }} />
          </div>
        ))}
        {avg != null && (
          <div
            aria-hidden
            className="absolute left-9 right-0 border-t border-dashed"
            style={{ bottom: `${avg}%`, borderColor: 'var(--c-axis)' }}
          />
        )}
        <div className="relative flex h-full items-end">
          {series.map((x, i) => (
            <div
              key={x.key}
              title={`${x.label}${x.partial ? ' (so far)' : ''} · ${x.score == null ? 'no score' : `Score ${x.score}`} · ${plural(x.scoredDays, 'day')} counted`}
              className="flex h-full flex-1 items-end justify-center rounded-lg transition-colors hover:bg-mod/[0.08]"
            >
              {x.score != null && (
                <span
                  className="w-[76%] rounded-b-[2px] rounded-t-[6px]"
                  style={{ height: `${x.score}%`, background: BAR_FILL, opacity: i === last ? 1 : 0.5 }}
                />
              )}
            </div>
          ))}
        </div>
      </div>
      <div aria-hidden className="flex pl-9 pt-2">
        {series.map((x, i) => (
          // Every other day is labelled (14 would crowd), every week and month.
          <span key={x.key} className="min-w-0 flex-1 truncate text-center">
            {range !== 'daily' || i % 2 === 0 ? x.label : ''}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * The Life Score over time: the last 14 days, 8 weeks or 6 months. `scoreFor(date)` is the cached daily score, so changing range only
 * rolls up days that were already worked out. A period with nothing planned or recorded is left empty, not drawn as zero.
 */
export function WeeklyScoreCard({ scoreFor, today, weekStartsOn, streak, className }) {
  const [range, setRange] = useState('daily')
  const series = useMemo(() => scoreTrend(scoreFor, today, range, weekStartsOn), [scoreFor, today, range, weekStartsOn])
  const scored = series.filter((x) => x.score != null)
  const avg = scored.length ? Math.round(scored.reduce((a, x) => a + x.score, 0) / scored.length) : null
  return (
    <Card data-testid="trend-card" className={className}>
      <CardHeader className="flex-wrap gap-y-2">
        <CardTitle>Life Score trends</CardTitle>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Flame className={streak > 0 ? 'lt-flame h-3.5 w-3.5 text-warning' : 'h-3.5 w-3.5 text-muted-foreground'} aria-hidden />
          {streak > 0 ? `${streak}-day active streak` : 'Start a streak today'}
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Segmented value={range} onChange={setRange} options={OPTIONS} />
          <p className="text-xs text-muted-foreground">
            {avg == null ? 'No score in this range yet' : `Average ${avg} over ${plural(scored.length, NAME[range])} with data`}
          </p>
        </div>
        {scored.length === 0 ? (
          <div className="h-[210px]">
            <EmptyChart text="Plan tasks or habits to see your score over time." />
          </div>
        ) : (
          <ScoreBars
            series={series}
            avg={avg}
            range={range}
            summary={`Life Score by ${NAME[range]}: ${series.map((x) => `${x.label} ${x.score ?? 'none'}`).join(', ')}`}
          />
        )}
      </CardContent>
    </Card>
  )
}
