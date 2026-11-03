import { Bar, BarChart } from 'recharts'
import { BookOpen } from 'lucide-react'
import { Chart, C, grid, tooltip, xAxis, yAxis } from '@/components/shared/charts'
import { StatCard } from '@/components/shared/StatCard'
import { Progress } from '@/components/ui/misc'
import { fmtDuration } from '@/lib/dates'
import { Block, EmptyNote, Panel } from './Layout'

export function LearningSection({ learning: l }) {
  return (
    <Block icon={BookOpen} title="Career & learning">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Study hours" value={fmtDuration(l.minutes)} sub={`${l.sessionCount} sessions`} />
        <StatCard label="DSA problems solved" value={l.problems} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={`Study hours per ${l.unit}`}>
          <Chart height={190} empty={l.minutes === 0} emptyText="No completed study sessions in this range.">
            <BarChart data={l.chart}>
              {grid()}
              {xAxis({ dataKey: 'label', minTickGap: 16 })}
              {yAxis()}
              {tooltip({ formatter: (v) => [`${v} h`, 'Studied'] })}
              <Bar dataKey="value" fill={C.primary} radius={[3, 3, 0, 0]} />
            </BarChart>
          </Chart>
        </Panel>
        <Panel title="Learning goals">
          {l.goals.length === 0 ? (
            <EmptyNote>No goals yet.</EmptyNote>
          ) : (
            <ul className="space-y-3">
              {l.goals.map(({ goal, progress }) => (
                <li key={goal.id}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="truncate">{goal.title}</span>
                    <span className="text-muted-foreground">{progress.percent}%</span>
                  </div>
                  <Progress value={progress.percent} tone={progress.percent >= 100 ? 'success' : 'primary'} label={goal.title} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </Block>
  )
}
