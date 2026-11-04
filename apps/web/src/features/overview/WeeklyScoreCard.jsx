import { Bar, BarChart, Cell } from 'recharts'
import { Flame } from 'lucide-react'
import { Chart, G, grid, tooltip, xAxis, yAxis } from '@/components/shared/charts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/** The daily score for each day of this week. `series` is weekScoreSeries(). */
export function WeeklyScoreCard({ series, today, streak, className }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>This week's score</CardTitle>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Flame className={streak > 0 ? 'lt-flame h-3.5 w-3.5 text-warning' : 'h-3.5 w-3.5 text-muted-foreground'} aria-hidden />
          {streak > 0 ? `${streak}-day active streak` : 'Start a streak today'}
        </span>
      </CardHeader>
      <CardContent>
        <Chart
          height={210}
          empty={series.every((x) => !x.score)}
          emptyText="Plan tasks or habits to see your daily score."
          summary={`Daily score this week: ${series.map((x) => `${x.label} ${x.score ?? 'none'}`).join(', ')}`}
        >
          <BarChart data={series.map((x) => ({ ...x, score: x.score ?? undefined }))} barCategoryGap="28%">
            {grid()}
            {xAxis({ dataKey: 'label' })}
            {yAxis({ domain: [0, 100], ticks: [0, 50, 100] })}
            {tooltip({ formatter: (v) => [v, 'Score'] })}
            <Bar dataKey="score" radius={[6, 6, 2, 2]}>
              {series.map((x) => (
                <Cell key={x.d} fill={G.mod} fillOpacity={x.d === today ? 1 : 0.45} />
              ))}
            </Bar>
          </BarChart>
        </Chart>
      </CardContent>
    </Card>
  )
}
