import { Dumbbell, Moon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { todayStatus } from '@/domain/fitness'

/** Today's status with one-tap "log / rest / skip", and an undo when today was marked rest or skipped. */
export function TodayCard({ todays, planToday, onLog, onMarkOff, onUndo }) {
  const marked = todays.filter((x) => x.status !== 'completed')
  return (
    <Card className="lt-hero">
      <CardContent className="space-y-3">
        <p className="lt-eyebrow">Today</p>
        <p className="text-xl font-bold tracking-tight">{todayStatus(todays, planToday)}</p>
        {!todays.length && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={onLog}>
              <Dumbbell className="h-4 w-4" />
              Log workout
            </Button>
            <Button size="sm" variant="outline" onClick={() => onMarkOff('rest')}>
              <Moon className="h-4 w-4" />
              Rest day
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onMarkOff('skipped')}>
              Skip
            </Button>
          </div>
        )}
        {marked.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => onUndo(marked)}>
            Undo
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
