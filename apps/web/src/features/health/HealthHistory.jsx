import { Droplets, Footprints, Moon, Scale, Zap } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fmtDay, fmtDuration } from '@/lib/dates'

/** One day's values in display order. Nothing logged means nothing shown, never a zero. */
export const logFacts = (h) =>
  [
    h.sleep_minutes != null && { icon: Moon, label: 'Sleep', text: fmtDuration(h.sleep_minutes) },
    h.water_ml > 0 && { icon: Droplets, label: 'Water', text: `${h.water_ml} ml` },
    h.steps > 0 && { icon: Footprints, label: 'Steps', text: h.steps.toLocaleString('en-IN') },
    h.energy_level && { icon: Zap, label: 'Energy', text: `${h.energy_level}/5` },
    h.weight_kg != null && { icon: Scale, label: 'Weight', text: `${h.weight_kg} kg` },
  ].filter(Boolean)

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
          <ul className="divide-y divide-border/70">
            {logs.map((h) => (
              <li key={h.id}>
                <button
                  onClick={() => onSelect(h.log_date)}
                  className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted/40 md:px-5"
                >
                  <span className="font-medium">{fmtDay(h.log_date, 'EEE, d MMM')}</span>
                  <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {logFacts(h).map(({ icon: Icon, label, text }) => (
                      <span key={label} className="inline-flex items-center gap-1 tabular-nums">
                        <Icon className="h-3 w-3" aria-hidden />
                        <span className="sr-only">{label}: </span>
                        {text}
                      </span>
                    ))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
