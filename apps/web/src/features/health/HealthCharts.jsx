import { Bar, BarChart, Line, LineChart, ReferenceLine } from 'recharts'
import { Chart, C, grid, tooltip, xAxis, yAxis, seriesSummary, G } from '@/components/shared/charts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SleepFacts } from './SleepFacts'

/** Sleep (7 days), water (7 days) and weight trend. `week` = healthWeek(); `weightData` = weightSeries().data. */
export function HealthCharts({ week, weightData, waterGoal, sleepGoal, consistency, energy }) {
  return (
    <div className="space-y-4 lg:col-span-3">
      <Card>
        <CardHeader>
          <CardTitle>Sleep — last 7 days (hours)</CardTitle>
        </CardHeader>
        <CardContent>
          <Chart
            height={190}
            empty={week.every((w) => w.sleep == null)}
            emptyText="Log bedtime and wake-up time to see your sleep."
            summary={`Hours slept: ${week.map((w) => `${w.label} ${w.sleep ?? 'not logged'}`).join(', ')}`}
          >
            <BarChart data={week}>
              {grid()}
              {xAxis({ dataKey: 'label' })}
              {yAxis({ domain: [0, 12], ticks: [0, 4, 8, 12] })}
              {tooltip({ formatter: (v) => [`${v} h`, 'Sleep'] })}
              <Bar dataKey="sleep" fill={G.mod} radius={[6, 6, 2, 2]} />
              <ReferenceLine y={sleepGoal / 60} stroke={C.success} strokeDasharray="4 4" />
            </BarChart>
          </Chart>
          <SleepFacts c={consistency} goalMinutes={sleepGoal} energy={energy} />
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Water (ml)</CardTitle>
          </CardHeader>
          <CardContent>
            <Chart
              height={150}
              empty={week.every((w) => !w.water)}
              emptyText="No water logged this week."
              summary={`Water in millilitres: ${week.map((w) => `${w.label} ${w.water ?? 0}`).join(', ')}`}
            >
              <BarChart data={week}>
                {xAxis({ dataKey: 'label' })}
                {tooltip({ formatter: (v) => [`${v} ml`, 'Water'] })}
                {waterGoal > 0 && <ReferenceLine y={waterGoal} stroke={C.success} strokeDasharray="4 4" />}
                <Bar dataKey="water" fill={G.mod} radius={[6, 6, 2, 2]} />
              </BarChart>
            </Chart>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Weight trend (kg)</CardTitle>
          </CardHeader>
          <CardContent>
            <Chart
              summary={seriesSummary('Weight', weightData, 'kg', ' kg')}
              height={150}
              empty={weightData.length < 2}
              emptyText="Log weight on two or more days."
            >
              <LineChart data={weightData}>
                {xAxis({ dataKey: 'label' })}
                {yAxis({ domain: ['dataMin - 1', 'dataMax + 1'] })}
                {tooltip({ formatter: (v) => [`${v} kg`, 'Weight'] })}
                <Line type="monotone" dataKey="kg" stroke={C.mod} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </Chart>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
