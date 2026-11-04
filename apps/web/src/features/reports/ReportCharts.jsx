import { Area, AreaChart, Bar, BarChart } from 'recharts'
import { Chart, C, grid, tooltip, xAxis, yAxis, seriesSummary } from '@/components/shared/charts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fmtDay } from '@/lib/dates'

/** Daily score over the range, and the weekly (or, for long ranges, monthly) average. */
export function ReportCharts({ report: r }) {
  const daily = r.daily.map((d) => ({ ...d, label: fmtDay(d.date, r.daily.length > 31 ? 'd MMM' : 'EEE d'), score: d.score ?? undefined }))
  const monthly = r.monthly.length > 1
  const trend = (monthly ? r.monthly : r.weekly).map((x) => ({ ...x, label: fmtDay(x.key, monthly ? 'MMM yy' : 'd MMM') }))
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Daily score</CardTitle>
        </CardHeader>
        <CardContent>
          <Chart
            summary={seriesSummary('Daily score', daily, 'score')}
            height={200}
            empty={!r.summary.scoredDays}
            emptyText="No scored days in this range yet."
          >
            <AreaChart data={daily}>
              {grid()}
              {xAxis({ dataKey: 'label', minTickGap: 16 })}
              {yAxis({ domain: [0, 100] })}
              {tooltip({ formatter: (v) => [v, 'Score'] })}
              <Area dataKey="score" stroke={C.primary} fill={C.primary} fillOpacity={0.15} strokeWidth={2} connectNulls />
            </AreaChart>
          </Chart>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Weekly &amp; monthly trend</CardTitle>
        </CardHeader>
        <CardContent>
          <Chart
            summary={seriesSummary('Average score', trend, 'score')}
            height={200}
            empty={!r.weekly.length}
            emptyText="Scores appear once you have a scored day."
          >
            <BarChart data={trend}>
              {grid()}
              {xAxis({ dataKey: 'label' })}
              {yAxis({ domain: [0, 100] })}
              {tooltip({ formatter: (v, _n, p) => [`${v} (${p.payload.days} days)`, 'Average score'] })}
              <Bar dataKey="score" fill={C.secondary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </Chart>
        </CardContent>
      </Card>
    </div>
  )
}
