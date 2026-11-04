import { Bar, BarChart, Line, LineChart } from 'recharts'
import { Dumbbell } from 'lucide-react'
import { Chart, C, grid, tooltip, xAxis, yAxis, seriesSummary } from '@/components/shared/charts'
import { StatCard } from '@/components/shared/StatCard'
import { fmtDuration } from '@/lib/dates'
import { pctText } from '@/lib/format'
import { Block, Panel } from './Layout'

export function FitnessSection({ fitness: f }) {
  const change = f.weightChange
  return (
    <Block icon={Dumbbell} title="Fitness">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Workouts completed" value={f.workouts} />
        <StatCard
          label="Plan consistency"
          value={f.plannedDays ? pctText(f.consistency) : '—'}
          sub={f.plannedDays ? `${f.hitDays}/${f.plannedDays} planned days` : 'no planned days'}
          progress={f.plannedDays ? f.consistency * 100 : null}
          tone="success"
        />
        <StatCard label="Training time" value={fmtDuration(f.minutes)} />
        <StatCard label="Weight change" value={change == null ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(1)} kg`} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title={`Workouts per ${f.unit}`}>
          <Chart
            summary={seriesSummary('Workouts', f.chart, 'value')}
            height={180}
            empty={f.workouts === 0}
            emptyText="No workouts in this range."
          >
            <BarChart data={f.chart}>
              {grid()}
              {xAxis({ dataKey: 'label', minTickGap: 16 })}
              {yAxis({ allowDecimals: false })}
              {tooltip()}
              <Bar dataKey="value" name="Workouts" fill={C.success} radius={[3, 3, 0, 0]} />
            </BarChart>
          </Chart>
        </Panel>
        <Panel title="Weight trend (kg)">
          <Chart
            summary={seriesSummary('Weight', f.weights, 'kg', ' kg')}
            height={180}
            empty={f.weights.length < 2}
            emptyText="Log weight on two or more days in this range."
          >
            <LineChart data={f.weights}>
              {grid()}
              {xAxis({ dataKey: 'label', minTickGap: 16 })}
              {yAxis({ domain: ['dataMin - 1', 'dataMax + 1'] })}
              {tooltip({ formatter: (v) => [`${v} kg`, 'Weight'] })}
              <Line dataKey="kg" stroke={C.primary} strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </Chart>
        </Panel>
      </div>
    </Block>
  )
}
