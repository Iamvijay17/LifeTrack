import { Bar, BarChart } from 'recharts'
import { Timer } from 'lucide-react'
import { Chart, C, grid, tooltip, xAxis, yAxis } from '@/components/shared/charts'
import { StatCard } from '@/components/shared/StatCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fmtDay, fmtDuration } from '@/lib/dates'

/** Today's and this week's focus time, and the weekly chart. `week` = [{ label, minutes }]. */
export function FocusSummary({ todayMinutes, completedToday, week, weekMinutes, from, to }) {
  return (
    <div className="space-y-4 lg:col-span-2">
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={Timer}
          label="Focus today"
          value={fmtDuration(Math.round(todayMinutes))}
          sub={`${completedToday} completed block${completedToday === 1 ? '' : 's'}`}
        />
        <StatCard
          icon={Timer}
          label="This week"
          value={fmtDuration(Math.round(weekMinutes))}
          sub={`${fmtDay(from, 'd MMM')} – ${fmtDay(to, 'd MMM')}`}
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Weekly focus (minutes)</CardTitle>
        </CardHeader>
        <CardContent>
          <Chart height={150} empty={weekMinutes === 0} emptyText="Finish a focus block to see your week.">
            <BarChart data={week}>
              {grid()}
              {xAxis({ dataKey: 'label' })}
              {yAxis()}
              {tooltip({ formatter: (v) => [`${v} min`, 'Focus'] })}
              <Bar dataKey="minutes" fill={C.primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </Chart>
        </CardContent>
      </Card>
    </div>
  )
}
