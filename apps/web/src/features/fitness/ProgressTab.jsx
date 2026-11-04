import { useMemo, useState } from 'react'
import { Line, LineChart } from 'recharts'
import { Trophy } from 'lucide-react'
import { Chart, C, grid, tooltip, xAxis, yAxis } from '@/components/shared/charts'
import { EmptyState } from '@/components/shared/states'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/form'
import { Segmented } from '@/components/ui/misc'
import { exerciseProgress, personalRecords, recordText } from '@lifetrack/core/records'
import { fmtDay } from '@/lib/dates'
import { plural } from '@/lib/format'

const METRICS = [
  { value: 'weight', label: 'Top weight', unit: 'kg' },
  { value: 'volume', label: 'Volume', unit: 'kg' },
  { value: 'reps', label: 'Top reps', unit: 'reps' },
]

/** Personal records and how one exercise has moved over time. Both come straight from logged sets. */
export function ProgressTab({ logs, workouts, onLog }) {
  const records = useMemo(() => personalRecords(logs, workouts), [logs, workouts])
  const [picked, setPicked] = useState('')
  const [metric, setMetric] = useState('weight')
  const exercise = records.some((r) => r.name === picked) ? picked : records[0]?.name
  const series = useMemo(
    () => (exercise ? exerciseProgress(logs, workouts, exercise).map((p) => ({ ...p, label: fmtDay(p.date, 'd MMM') })) : []),
    [logs, workouts, exercise],
  )
  const unit = METRICS.find((m) => m.value === metric).unit
  if (records.length === 0)
    return (
      <EmptyState
        icon={Trophy}
        title="No records yet"
        description="Log a workout with sets and your personal bests appear here."
        action={
          onLog && (
            <button className="text-sm text-secondary underline underline-offset-2" onClick={onLog}>
              Log a workout
            </button>
          )
        }
      />
    )
  const latest = series.at(-1)
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHeader className="flex-wrap">
          <CardTitle>Exercise progress</CardTitle>
          <Select aria-label="Exercise" className="w-48" value={exercise} onChange={(e) => setPicked(e.target.value)}>
            {records.map((r) => (
              <option key={r.name}>{r.name}</option>
            ))}
          </Select>
        </CardHeader>
        <CardContent className="space-y-3">
          <Segmented value={metric} onChange={setMetric} options={METRICS} />
          <Chart
            height={220}
            empty={series.length < 2}
            emptyText="Train this exercise on two or more days to see a trend."
            summary={
              latest ? `${exercise}, ${series.length} training days. Latest ${latest[metric]} ${unit} on ${latest.label}.` : undefined
            }
          >
            <LineChart data={series}>
              {grid()}
              {xAxis({ dataKey: 'label', minTickGap: 24 })}
              {yAxis({ domain: ['auto', 'auto'], width: 44 })}
              {tooltip({ formatter: (v) => [`${v} ${unit}`, METRICS.find((m) => m.value === metric).label] })}
              <Line dataKey={metric} stroke={C.primary} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </Chart>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-warning" aria-hidden />
            Personal records
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 pt-2">
          <ul className="max-h-96 divide-y divide-border overflow-y-auto">
            {records.map((r) => (
              <li key={r.name} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmtDay(r.date, 'd MMM yyyy')} · {plural(r.sessions, 'session')}
                  </p>
                </div>
                <span className="shrink-0 font-semibold tabular-nums">{recordText(r)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
