import { Line, LineChart } from 'recharts'
import { Ruler, Trash2 } from 'lucide-react'
import { Chart, C, grid, tooltip, xAxis, yAxis, seriesSummary } from '@/components/shared/charts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useConfirmedDelete } from '@/hooks/useConfirmedDelete'
import { fmtDay } from '@/lib/dates'

const PARTS = [
  ['Chest', 'chest_cm'],
  ['Waist', 'waist_cm'],
  ['Hips', 'hips_cm'],
  ['Arm', 'arm_cm'],
  ['Thigh', 'thigh_cm'],
  ['BF%', 'body_fat_pct'],
]
const describe = (m) =>
  PARTS.filter(([, key]) => m[key] != null)
    .map(([label, key]) => `${label} ${m[key]}`)
    .join(' · ')

export function BodyTab({ weightData, measurements, onLog }) {
  const removeEntry = useConfirmedDelete('body_measurements', 'Entry deleted')
  const sorted = [...measurements].sort((a, b) => b.measured_on.localeCompare(a.measured_on))
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Weight trend</CardTitle>
          <Button size="sm" variant="outline" onClick={onLog}>
            <Ruler className="h-4 w-4" />
            Log
          </Button>
        </CardHeader>
        <CardContent>
          <Chart
            summary={seriesSummary('Weight', weightData, 'kg', ' kg')}
            height={220}
            empty={weightData.length < 2}
            emptyText="Log weight on two or more days to see a trend."
          >
            <LineChart data={weightData}>
              {grid()}
              {xAxis({ dataKey: 'label' })}
              {yAxis({ domain: ['dataMin - 1', 'dataMax + 1'] })}
              {tooltip({ formatter: (v) => [`${v} kg`, 'Weight'] })}
              <Line type="monotone" dataKey="kg" stroke={C.mod} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </Chart>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Measurements</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pt-2">
          {sorted.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No measurements yet.</p>
          ) : (
            <ul className="divide-y divide-border/70">
              {sorted.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <div>
                    <p className="font-medium">{fmtDay(m.measured_on, 'd MMM yyyy')}</p>
                    <p className="text-xs text-muted-foreground">{describe(m)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Delete measurement"
                    onClick={() => removeEntry(m.id, { title: 'Delete this entry?' })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
