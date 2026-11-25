import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { addDays, addMonths, eachDay, fmtDay, monthEnd, startOfWeek } from '@/lib/dates'
import { cn } from '@/lib/utils'

const INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/** A month grid with previous/next. `labelFor(day)` extends each day's accessible name; `markFor(day)` draws its marker. */
export function MonthCalendar({ month, onMonth, selected, onSelect, today, weekStartsOn, labelFor, markFor }) {
  const from = startOfWeek(month, weekStartsOn)
  const to = addDays(startOfWeek(monthEnd(month), weekStartsOn), 6)
  const heads = Array.from({ length: 7 }, (_, i) => INITIALS[(weekStartsOn + i) % 7])
  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => onMonth(addMonths(month, -1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <p aria-live="polite" className="text-sm font-semibold tracking-tight">
          {fmtDay(month, 'MMMM yyyy')}
        </p>
        <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => onMonth(addMonths(month, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div aria-hidden className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
        {heads.map((h, i) => (
          <span key={i}>{h}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {eachDay(from, to).map((d) => (
          <button
            key={d}
            type="button"
            data-sound="select"
            onClick={() => onSelect(d)}
            aria-label={`${fmtDay(d, 'd MMMM')}${labelFor?.(d) ? `, ${labelFor(d)}` : ''}`}
            aria-pressed={selected === d}
            className={cn(
              'lt-press relative aspect-square rounded-md text-sm tabular-nums transition-colors duration-150 hover:bg-muted',
              d.slice(0, 7) !== month.slice(0, 7) && 'text-muted-foreground/60',
              d === today && 'font-semibold text-mod-text',
              selected === d && 'bg-mod/20 ring-1 ring-mod',
            )}
          >
            {Number(d.slice(8))}
            {markFor?.(d)}
          </button>
        ))}
      </div>
    </>
  )
}
