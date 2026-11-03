import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { addDays, fmtDay } from '@/lib/dates'

export function DateNav({ date, onChange, today }) {
  const isToday = date === today
  return (
    <div className="flex items-center gap-1.5">
      <Button variant="outline" size="icon-sm" aria-label="Previous day" onClick={() => onChange(addDays(date, -1))}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="min-w-32 text-center text-sm font-medium">{isToday ? 'Today' : fmtDay(date, 'EEE, d MMM yyyy')}</div>
      <Button variant="outline" size="icon-sm" aria-label="Next day" onClick={() => onChange(addDays(date, 1))}>
        <ChevronRight className="h-4 w-4" />
      </Button>
      {!isToday && (
        <Button variant="ghost" size="sm" onClick={() => onChange(today)}>
          Today
        </Button>
      )}
    </div>
  )
}
