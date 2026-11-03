import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/misc'
import { pctText } from '@/lib/format'

export function PerHabitStats({ active }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Per-habit stats</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {active.map((s) => (
          <div key={s.habit.id} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 sm:grid-cols-[1fr_5rem_5rem_6rem]">
            <span className="truncate text-sm">{s.habit.name}</span>
            <span className="text-xs text-muted-foreground sm:text-right">
              Now{' '}
              <b className="text-foreground">
                {s.current}
                {s.unit}
              </b>
            </span>
            <span className="hidden text-xs text-muted-foreground sm:block sm:text-right">
              Best{' '}
              <b className="text-foreground">
                {s.longest}
                {s.unit}
              </b>
            </span>
            <span className="hidden text-xs text-muted-foreground sm:block sm:text-right">{pctText(s.rateAll)} overall</span>
            <Progress className="col-span-full" value={(s.rateAll ?? 0) * 100} label={`${s.habit.name} completion`} />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
