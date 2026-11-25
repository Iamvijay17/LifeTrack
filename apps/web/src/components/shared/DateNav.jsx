import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/pickers'
import { addDays, fmtDay } from '@/lib/dates'

/** Previous / next day, and the date itself opens a calendar to jump anywhere. */
export function DateNav({ date, onChange, today }) {
  const isToday = date === today
  const label = isToday ? 'Today' : fmtDay(date, 'EEE, d MMM yyyy')
  return (
    <div className="flex items-center gap-1.5">
      <Button variant="outline" size="icon-sm" aria-label="Previous day" onClick={() => onChange(addDays(date, -1))}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <DatePicker
        aria-label={`${label}. Choose another date`}
        value={date}
        display={label}
        clearable={false}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="h-11 min-w-32 justify-center border-transparent bg-transparent font-medium hover:bg-muted/60 md:h-8"
      />
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
