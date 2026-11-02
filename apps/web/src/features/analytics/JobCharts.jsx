import { Bar, BarChart, CartesianGrid, Line, LineChart, Tooltip } from 'recharts'
import { Chart, C, grid, tooltip, xAxis, yAxis } from '@/components/shared/charts'
import { addDays, fmtDay, startOfWeek } from '@/lib/dates'
import { salaryProgression } from '@lifetrack/core/jobs'

export function weeklyApplications(apps, today, weekStartsOn, weeks = 8) {
  const start = startOfWeek(today, weekStartsOn)
  return Array.from({ length: weeks }, (_, i) => {
    const ws = addDays(start, -(weeks - 1 - i) * 7)
    const we = addDays(ws, 6)
    return { label: fmtDay(ws, 'd MMM'), count: apps.filter((a) => a.applied_date && a.applied_date >= ws && a.applied_date <= we).length }
  })
}

export function WeeklyApplicationsChart({ apps, today, weekStartsOn }) {
  const data = weeklyApplications(apps, today, weekStartsOn)
  return <Chart height={200} empty={data.every((d) => d.count === 0)} emptyText="No applications with an applied date yet."><BarChart data={data}>{grid()}{xAxis({ dataKey: 'label' })}{yAxis({ allowDecimals: false })}{tooltip({ formatter: (v) => [v, 'Applications'] })}<Bar dataKey="count" fill={C.primary} radius={[4, 4, 0, 0]} /></BarChart></Chart>
}

export function SalaryChart({ apps, tz }) {
  const data = salaryProgression(apps, tz).map((d) => ({ ...d, label: fmtDay(d.date, 'd MMM') }))
  return <Chart height={200} empty={data.length === 0} emptyText="Add a package (LPA) to applications to see the progression."><LineChart data={data}>{grid()}{xAxis({ dataKey: 'label' })}{yAxis({ unit: 'L' })}{tooltip({ formatter: (v, _n, p) => [`${v} LPA`, p.payload.company] })}<Line dataKey="lpa" stroke={C.secondary} strokeWidth={2} dot={{ r: 3 }} /></LineChart></Chart>
}
