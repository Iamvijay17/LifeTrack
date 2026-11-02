import { Area, AreaChart } from 'recharts'
import { HeartPulse } from 'lucide-react'
import { Chart, C, grid, tooltip, xAxis, yAxis } from '@/components/shared/charts'
import { StatCard } from '@/components/shared/StatCard'
import { fmtDuration } from '@/lib/dates'
import { Block, Panel } from './Layout'

export function HealthSection({ health: h }) {
  return (
    <Block icon={HeartPulse} title="Sleep & health">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Average sleep" value={h.sleepAvg == null ? '—' : fmtDuration(h.sleepAvg)} />
        <StatCard label="Average water" value={h.waterAvg == null ? '—' : `${Math.round(h.waterAvg)} ml`} />
        <StatCard label="Average steps" value={h.stepsAvg == null ? '—' : Math.round(h.stepsAvg).toLocaleString('en-IN')} />
      </div>
      <Panel title="Sleep (hours)">
        <Chart height={190} empty={h.sleepSeries.every((d) => d.hours == null)} emptyText="No sleep logged in this range.">
          <AreaChart data={h.sleepSeries}>
            {grid()}
            {xAxis({ dataKey: 'label', minTickGap: 16 })}
            {yAxis({ domain: [0, 10] })}
            {tooltip({ formatter: (v) => [`${v} h`, 'Sleep'] })}
            <Area dataKey="hours" stroke={C.secondary} fill={C.secondary} fillOpacity={0.2} connectNulls />
          </AreaChart>
        </Chart>
      </Panel>
    </Block>
  )
}
