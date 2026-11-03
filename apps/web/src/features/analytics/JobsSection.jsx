import { Bar, BarChart, Line, LineChart } from 'recharts'
import { Briefcase } from 'lucide-react'
import { Chart, C, grid, tooltip, xAxis, yAxis } from '@/components/shared/charts'
import { StatCard } from '@/components/shared/StatCard'
import { pctText } from '@/lib/format'
import { Block, Panel } from './Layout'

export function JobsSection({ jobs }) {
  const f = jobs.funnel
  return (
    <Block icon={Briefcase} title="Job search">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Applications" value={f.applied} />
        <StatCard label="Interviews" value={f.interviews} />
        <StatCard label="Rejections" value={f.rejections} />
        <StatCard
          label="Interview conversion"
          value={pctText(f.conversion)}
          sub={f.applied ? `${f.interviews}/${f.applied} applications` : 'no applications'}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={`Applications per ${jobs.unit}`}>
          <Chart height={180} empty={jobs.applied === 0} emptyText="No applications with an applied date in this range.">
            <BarChart data={jobs.chart}>
              {grid()}
              {xAxis({ dataKey: 'label', minTickGap: 16 })}
              {yAxis({ allowDecimals: false })}
              {tooltip()}
              <Bar dataKey="value" name="Applications" fill={C.secondary} radius={[3, 3, 0, 0]} />
            </BarChart>
          </Chart>
        </Panel>
        <Panel title="Package progression (LPA)">
          <Chart height={180} empty={jobs.salary.length === 0} emptyText="No packages recorded in this range.">
            <LineChart data={jobs.salary}>
              {grid()}
              {xAxis({ dataKey: 'label' })}
              {yAxis()}
              {tooltip({ formatter: (v, _n, p) => [`${v} LPA`, p.payload.company] })}
              <Line dataKey="lpa" stroke={C.success} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </Chart>
        </Panel>
      </div>
    </Block>
  )
}
