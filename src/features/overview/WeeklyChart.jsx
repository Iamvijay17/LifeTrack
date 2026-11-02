import { Bar, BarChart, Cell } from 'recharts'
import { Chart, C, grid, tooltip, xAxis, yAxis } from '@/components/shared/charts'

/** Lazy-loaded so the charting library is not on the critical path of the Overview page. */
export default function WeeklyChart({ weekly, today }) {
  const label = `Daily completion this week: ${weekly.map((x) => `${x.label} ${x.pct == null ? 'no data' : `${x.pct}%`}`).join(', ')}`
  return (
    <Chart height={190} label={label} empty={weekly.every((x) => x.pct == null)} emptyText="Plan tasks or habits to see daily completion.">
      <BarChart data={weekly.map((x) => ({ ...x, pct: x.pct ?? undefined }))}>{grid()}{xAxis({ dataKey: 'label' })}{yAxis({ domain: [0, 100], unit: '%' })}{tooltip({ formatter: (v) => [`${v}%`, 'Completed'] })}<Bar dataKey="pct" radius={[4, 4, 0, 0]}>{weekly.map((x) => <Cell key={x.d} fill={x.d === today ? C.primary : C.secondary} fillOpacity={x.d === today ? 1 : 0.6} />)}</Bar></BarChart>
    </Chart>
  )
}
