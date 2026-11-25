import { Bar, BarChart } from 'recharts'
import { Chart, tooltip, xAxis, yAxis, seriesSummary, G } from '@/components/shared/charts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TodayCard } from './TodayCard'
import { WeeklyPlan } from './WeeklyPlan'

export function WeekTab({
  weekDays,
  today,
  plan,
  routines,
  workouts,
  completed,
  todays,
  planToday,
  weeks,
  planning,
  onPlan,
  onLog,
  onMarkOff,
  onUndo,
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <WeeklyPlan
        weekDays={weekDays}
        today={today}
        plan={plan}
        routines={routines}
        workouts={workouts}
        completed={completed}
        planning={planning}
        onPlan={onPlan}
      />
      <div className="space-y-4 lg:col-span-2">
        <TodayCard todays={todays} planToday={planToday} onLog={onLog} onMarkOff={onMarkOff} onUndo={onUndo} />
        <Card>
          <CardHeader>
            <CardTitle>Workouts per week</CardTitle>
          </CardHeader>
          <CardContent>
            <Chart
              summary={seriesSummary('Workouts per week', weeks, 'workouts')}
              height={150}
              empty={weeks.every((x) => !x.workouts)}
              emptyText="Log a workout to see consistency."
            >
              <BarChart data={weeks}>
                {xAxis({ dataKey: 'label' })}
                {yAxis({ allowDecimals: false })}
                {tooltip()}
                <Bar dataKey="workouts" name="Workouts" fill={G.mod} radius={[6, 6, 2, 2]} />
              </BarChart>
            </Chart>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
