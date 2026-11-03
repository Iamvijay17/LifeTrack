import { Bar, BarChart, Line, LineChart, ReferenceLine } from 'recharts'
import { Chart, C, grid, tooltip, xAxis, yAxis } from '@/components/shared/charts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/** Sleep (7 days), water (7 days) and weight trend. `week` = healthWeek(); `weightData` = weightSeries().data. */
export function HealthCharts({ week, weightData, waterGoal }) {
  return (
    <div className="space-y-4 lg:col-span-3">
      <Card>
        <CardHeader>
          <CardTitle>Sleep — last 7 days (hours)</CardTitle>
        </CardHeader>
        <CardContent>
          <Chart height={190} empty={week.every((w) => w.sleep == null)} emptyText="Log bedtime and wake-up time to see your sleep.">
            <BarChart data={week}>
              {grid()}
              {xAxis({ dataKey: 'label' })}
              {yAxis({ domain: [0, 10] })}
              {tooltip({ formatter: (v) => [`${v} h`, 'Sleep'] })}
              <ReferenceLine y={8} stroke={C.grid} strokeDasharray="4 4" />
              <Bar dataKey="sleep" fill={C.secondary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </Chart>
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Water (ml)</CardTitle>
          </CardHeader>
          <CardContent>
            <Chart height={150} empty={week.every((w) => !w.water)} emptyText="No water logged this week.">
              <BarChart data={week}>
                {xAxis({ dataKey: 'label' })}
                {tooltip({ formatter: (v) => [`${v} ml`, 'Water'] })}
                {waterGoal > 0 && <ReferenceLine y={waterGoal} stroke={C.success} strokeDasharray="4 4" />}
                <Bar dataKey="water" fill={C.success} radius={[4, 4, 0, 0]} />
              </BarChart>
            </Chart>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Weight trend (kg)</CardTitle>
          </CardHeader>
          <CardContent>
            <Chart height={150} empty={weightData.length < 2} emptyText="Log weight on two or more days.">
              <LineChart data={weightData}>
                {xAxis({ dataKey: 'label' })}
                {yAxis({ domain: ['dataMin - 1', 'dataMax + 1'] })}
                {tooltip({ formatter: (v) => [`${v} kg`, 'Weight'] })}
                <Line dataKey="kg" stroke={C.primary} strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </Chart>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
