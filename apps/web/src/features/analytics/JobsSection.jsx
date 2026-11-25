import { Bar, BarChart, Line, LineChart } from 'recharts'
import { Briefcase } from 'lucide-react'
import { Chart, C, grid, tooltip, xAxis, yAxis, seriesSummary } from '@/components/shared/charts'
import { StatCard } from '@/components/shared/StatCard'
import { pctText } from '@/lib/format'
import { Block, Panel } from './Layout'

export function JobsSection({ jobs }) {
  const f = jobs.funnel
  return (
    <Block icon={Briefcase} module="jobs" title="Job search">
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
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title={`Applications per ${jobs.unit}`}>
          <Chart
            summary={seriesSummary('Applications', jobs.chart, 'value')}
            height={180}
            empty={jobs.applied === 0}
            emptyText="No applications with an applied date in this range."
          >
            <BarChart data={jobs.chart}>
              {grid()}
              {xAxis({ dataKey: 'label', minTickGap: 16 })}
              {yAxis({ allowDecimals: false })}
              {tooltip()}
              <Bar dataKey="value" name="Applications" fill={C.mod} radius={[5, 5, 2, 2]} />
            </BarChart>
          </Chart>
        </Panel>
        <Panel title="Package progression (LPA)">
          <Chart
            summary={seriesSummary('Package progression', jobs.salary, 'lpa', ' LPA')}
            height={180}
            empty={jobs.salary.length === 0}
            emptyText="No packages recorded in this range."
          >
            <LineChart data={jobs.salary}>
              {grid()}
              {xAxis({ dataKey: 'label' })}
              {yAxis()}
              {tooltip({ formatter: (v, _n, p) => [`${v} LPA`, p.payload.company] })}
              <Line type="monotone" dataKey="lpa" stroke={C.mod} strokeWidth={2.5} dot={{ r: 3, strokeWidth: 0, fill: C.mod }} />
            </LineChart>
          </Chart>
        </Panel>
      </div>
    </Block>
  )
}
