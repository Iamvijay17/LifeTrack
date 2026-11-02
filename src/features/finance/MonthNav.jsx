import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { addMonths, fmtDay, monthStart } from '@/lib/dates'

/** Previous / next month controls. `month` is the first day of the month shown; `onChange(null)` means "this month". */
export function MonthNav({ month, today, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon-sm" aria-label="Previous month" onClick={() => onChange(addMonths(month, -1))}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-32 text-center text-sm font-medium">{fmtDay(month, 'MMMM yyyy')}</span>
      <Button variant="outline" size="icon-sm" aria-label="Next month" onClick={() => onChange(addMonths(month, 1))}>
        <ChevronRight className="h-4 w-4" />
      </Button>
      {month !== monthStart(today) && (
        <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
          This month
        </Button>
      )}
    </div>
  )
}
