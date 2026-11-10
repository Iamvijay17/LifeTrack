import { useMemo, useState } from 'react'
import { Bar, BarChart, Cell, ReferenceLine } from 'recharts'
import { Flame } from 'lucide-react'
import { Chart, G, grid, tooltip, xAxis, yAxis } from '@/components/shared/charts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Segmented } from '@/components/ui/misc'
import { TREND_RANGES, scoreTrend } from '@lifetrack/core/lifeScore'
import { plural } from '@/lib/utils'

const OPTIONS = TREND_RANGES.map((r) => ({ value: r.key, label: r.label }))
const NAME = { daily: 'day', weekly: 'week', monthly: 'month' }

/**
 * The Life Score over time: the last 14 days, 8 weeks or 6 months. `scoreFor(date)` is the cached daily score, so changing range only
 * rolls up days that were already worked out. A period with nothing planned or recorded is left empty, not drawn as zero.
 */
export function WeeklyScoreCard({ scoreFor, today, weekStartsOn, streak, className }) {
  const [range, setRange] = useState('daily')
  const series = useMemo(() => scoreTrend(scoreFor, today, range, weekStartsOn), [scoreFor, today, range, weekStartsOn])
  const scored = series.filter((x) => x.score != null)
  const avg = scored.length ? Math.round(scored.reduce((a, x) => a + x.score, 0) / scored.length) : null
  const last = series.length - 1
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
        <Chart
          height={210}
          empty={scored.length === 0}
          emptyText="Plan tasks or habits to see your score over time."
          summary={`Life Score by ${NAME[range]}: ${series.map((x) => `${x.label} ${x.score ?? 'none'}`).join(', ')}`}
        >
          <BarChart data={series.map((x) => ({ ...x, score: x.score ?? undefined }))} barCategoryGap="24%">
            {grid()}
            {xAxis({ dataKey: 'label', interval: range === 'daily' ? 1 : 0 })}
            {yAxis({ domain: [0, 100], ticks: [0, 50, 100] })}
            {avg != null && <ReferenceLine y={avg} stroke="var(--c-axis)" strokeDasharray="4 4" />}
            {tooltip({
              formatter: (v) => [v, 'Score'],
              labelFormatter: (label, payload) => {
                const p = payload?.[0]?.payload
                return p ? `${label}${p.partial ? ' (so far)' : ''} · ${plural(p.scoredDays, 'day')} counted` : label
              },
            })}
            <Bar dataKey="score" radius={[6, 6, 2, 2]}>
              {series.map((x, i) => (
                <Cell key={x.key} fill={G.mod} fillOpacity={i === last ? 1 : 0.5} />
              ))}
            </Bar>
          </BarChart>
        </Chart>
      </CardContent>
    </Card>
  )
}
