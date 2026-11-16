import { Flame } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { m, spring } from '@/components/motion/primitives'
import { fmtDay } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { hours, when } from './format'

const LEVEL = {
  ok: { label: 'Light', text: 'text-success', bar: 'bg-success/70' },
  busy: { label: 'Busy', text: 'text-warning', bar: 'bg-warning/80' },
  over: { label: 'Overloaded', text: 'text-danger', bar: 'bg-danger/80' },
}

/** One row per day of the window: how full it is now (solid bar) and how full it would be with the chosen changes (outline). Over capacity is red. */
export function DayLoadPanel({ days, after, today }) {
  const max = Math.max(...days.map((d) => d.capacity), ...days.map((d) => d.load), ...after.map((d) => d.load))
  const changed = after.some((a, i) => a.load !== days[i]?.load)
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-sm">Load by day</CardTitle>
        <span className="text-[11px] text-muted-foreground">
          {changed ? 'Solid: now · Outline: after changes' : 'Events, tasks and habits'}
        </span>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {days.map((d, i) => {
          const a = after[i] ?? d
          const lv = LEVEL[d.level]
          const av = LEVEL[a.level]
          return (
            <div
              key={d.date}
              className="grid grid-cols-[4.5rem_minmax(0,1fr)_3.25rem] items-center gap-2 text-xs"
              data-testid="day-load"
              data-level={d.level}
            >
              <div className="min-w-0">
                <p className={cn('truncate font-medium', d.date === today && 'text-mod-text')}>{when(d.date, today)}</p>
                <p className="text-[10px] text-muted-foreground">{fmtDay(d.date, 'd MMM')}</p>
              </div>
              <div
                className="relative h-3 rounded-full bg-muted/60"
                role="img"
                aria-label={`${when(d.date, today)}: ${hours(d.load)} of ${hours(d.capacity)}, ${lv.label.toLowerCase()}${changed && a.load !== d.load ? `, ${hours(a.load)} after the changes` : ''}`}
              >
                <m.div
                  className={cn('absolute inset-y-0 left-0 rounded-full', lv.bar)}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, (d.load / max) * 100)}%` }}
                  transition={spring.soft}
                />
                {changed && a.load !== d.load && (
                  <m.div
                    className={cn('absolute inset-y-[-2px] left-0 rounded-full border-2', av.text.replace('text-', 'border-'))}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, (a.load / max) * 100)}%` }}
                    transition={spring.soft}
                  />
                )}
                <span
                  aria-hidden
                  className="absolute inset-y-[-3px] w-px bg-foreground/40"
                  style={{ left: `${(d.capacity / max) * 100}%` }}
                  title="Daily capacity"
                />
              </div>
              <p className={cn('flex items-center justify-end gap-0.5 text-right tabular-nums', av.text)}>
                {a.level === 'over' && <Flame className="h-3 w-3" aria-hidden />}
                {hours(a.load)}
              </p>
            </div>
          )
        })}
        <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">
          The line marks a full day ({hours(days[0]?.capacity ?? 480)}). Fixed events, interviews and habits are never moved.
        </p>
      </CardContent>
    </Card>
  )
}
