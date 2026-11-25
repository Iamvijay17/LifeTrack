import { Bar, BarChart, Line, LineChart } from 'recharts'
import { Chart, C, grid, tooltip, xAxis, yAxis, seriesSummary } from '@/components/shared/charts'
import { fmtDay } from '@/lib/dates'
import { salaryProgression, weeklyApplications } from '@/domain/jobs'

export function WeeklyApplicationsChart({ apps, today, weekStartsOn }) {
  const data = weeklyApplications(apps, today, weekStartsOn)
  return (
    <Chart
      summary={seriesSummary('Applications per week', data, 'count')}
      height={200}
      empty={data.every((d) => d.count === 0)}
      emptyText="No applications with an applied date yet."
    >
      <BarChart data={data}>
        {grid()}
        {xAxis({ dataKey: 'label' })}
        {yAxis({ allowDecimals: false })}
        {tooltip({ formatter: (v) => [v, 'Applications'] })}
        <Bar dataKey="count" fill={C.mod} radius={[6, 6, 2, 2]} />
      </BarChart>
    </Chart>
  )
}

export function SalaryChart({ apps, tz }) {
  const data = salaryProgression(apps, tz).map((d) => ({ ...d, label: fmtDay(d.date, 'd MMM') }))
  return (
    <Chart
      summary={seriesSummary('Package progression', data, 'lpa', ' LPA')}
      height={200}
      empty={data.length === 0}
      emptyText="Add a package (LPA) to applications to see the progression."
    >
      <LineChart data={data}>
        {grid()}
        {xAxis({ dataKey: 'label' })}
        {yAxis({ unit: 'L' })}
        {tooltip({ formatter: (v, _n, p) => [`${v} LPA`, p.payload.company] })}
        <Line type="monotone" dataKey="lpa" stroke={C.mod} strokeWidth={2.5} dot={{ r: 3, strokeWidth: 0, fill: C.mod }} />
      </LineChart>
    </Chart>
  )
}
