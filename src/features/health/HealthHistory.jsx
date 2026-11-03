import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fmtDay, fmtDuration } from '@/lib/dates'

export const describeLog = (h) =>
  [
    h.sleep_minutes != null && `😴 ${fmtDuration(h.sleep_minutes)}`,
    h.water_ml > 0 && `💧 ${h.water_ml} ml`,
    h.steps > 0 && `👟 ${h.steps.toLocaleString('en-IN')}`,
    h.energy_level && `⚡ ${h.energy_level}/5`,
    h.weight_kg != null && `${h.weight_kg} kg`,
  ]
    .filter(Boolean)
    .join('  ·  ')

/** Recent daily logs; choosing one opens it in the daily log form. */
export function HealthHistory({ logs, onSelect }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>History</CardTitle>
      </CardHeader>
      <CardContent className="p-0 pt-2">
        {logs.length === 0 ? (
          <p className="px-4 pb-6 pt-2 text-center text-sm text-muted-foreground">Your daily logs will appear here.</p>
        ) : (
          <ul className="divide-y divide-border">
            {logs.map((h) => (
              <li key={h.id}>
                <button
                  onClick={() => onSelect(h.log_date)}
                  className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-left text-sm hover:bg-muted/30"
                >
                  <span className="font-medium">{fmtDay(h.log_date, 'EEE, d MMM')}</span>
                  <span className="text-xs text-muted-foreground">{describeLog(h)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
