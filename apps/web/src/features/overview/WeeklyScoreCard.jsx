import { Bar, BarChart, Cell } from 'recharts'
import { Flame } from 'lucide-react'
import { Chart, C, grid, tooltip, xAxis, yAxis } from '@/components/shared/charts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/** The daily score for each day of this week. `series` is weekScoreSeries(). */
export function WeeklyScoreCard({ series, today, streak, className }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Weekly daily score</CardTitle>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Flame className="h-3.5 w-3.5 text-warning" />
          {streak}-day active streak
        </span>
      </CardHeader>
      <CardContent>
        <Chart height={190} empty={series.every((x) => x.score == null)} emptyText="Plan tasks or habits to see your daily score.">
          <BarChart data={series.map((x) => ({ ...x, score: x.score ?? undefined }))}>
            {grid()}
            {xAxis({ dataKey: 'label' })}
            {yAxis({ domain: [0, 100] })}
            {tooltip({ formatter: (v) => [v, 'Score'] })}
            <Bar dataKey="score" radius={[4, 4, 0, 0]}>
              {series.map((x) => (
                <Cell key={x.d} fill={x.d === today ? C.primary : C.secondary} fillOpacity={x.d === today ? 1 : 0.6} />
              ))}
            </Bar>
          </BarChart>
        </Chart>
      </CardContent>
    </Card>
  )
}
