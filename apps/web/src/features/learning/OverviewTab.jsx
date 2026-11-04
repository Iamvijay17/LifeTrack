import { Bar, BarChart } from 'recharts'
import { Chart, grid, tooltip, xAxis, yAxis, seriesSummary, G } from '@/components/shared/charts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StudyTimer } from './StudyTimer'

/** Timer + this week's study hours. */
export function OverviewTab({ running, goals, topics, today, week, weekMinutes }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <div className="lg:col-span-2">
        <StudyTimer running={running} goals={goals} topics={topics} today={today} />
      </div>
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>This week (hours)</CardTitle>
        </CardHeader>
        <CardContent>
          <Chart
            summary={seriesSummary('Hours studied this week', week, 'hours', ' h')}
            empty={weekMinutes === 0}
            emptyText="Complete a study session to see your week."
          >
            <BarChart data={week}>
              {grid()}
              {xAxis({ dataKey: 'label' })}
              {yAxis()}
              {tooltip({ formatter: (v) => [`${v} h`, 'Studied'] })}
              <Bar dataKey="hours" fill={G.mod} radius={[6, 6, 2, 2]} />
            </BarChart>
          </Chart>
        </CardContent>
      </Card>
    </div>
  )
}
