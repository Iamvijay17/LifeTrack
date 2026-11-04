import { LayoutGroup, m, spring } from '@/components/motion/primitives'
import { fmtDay } from '@/lib/dates'
import { cn } from '@/lib/utils'

/**
 * Seven days in a row, each a tappable chip with its date and a small fill showing how that day went.
 * `days`: [{ date, ratio (0-1 or null), note (extends the accessible name) }]. `selected`, `today` and `onSelect` work on 'yyyy-MM-dd' strings.
 */
export function WeekStrip({ days, selected, today, onSelect, label = 'Choose a day', className }) {
  return (
    <LayoutGroup id={label}>
      <div role="group" aria-label={label} className={cn('grid grid-cols-7 gap-1 sm:gap-1.5', className)}>
        {days.map(({ date, ratio, note }) => {
          const on = selected === date
          const isToday = today === date
          const future = today != null && date > today
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelect?.(date)}
              disabled={!onSelect}
              aria-pressed={onSelect ? on : undefined}
              aria-label={`${fmtDay(date, 'EEEE, d MMMM')}${note ? `, ${note}` : ''}`}
              className={cn(
                'lt-press relative flex flex-col items-center gap-1 rounded-lg px-0.5 py-2 transition-colors duration-150',
                on ? 'text-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
              )}
            >
              {on && (
                <m.span
                  layoutId="week-pill"
                  aria-hidden
                  className="absolute inset-0 rounded-lg border border-mod/40 bg-mod/10"
                  transition={spring.snappy}
                />
              )}
              <span className="relative text-[10px] font-medium uppercase tracking-wide">{fmtDay(date, 'EEE')}</span>
              <span className={cn('relative text-sm font-semibold tabular-nums', isToday && 'text-mod-text')}>{Number(date.slice(8))}</span>
              <span aria-hidden className="relative h-1 w-5 overflow-hidden rounded-full bg-muted">
                {!future && ratio != null && (
                  <span
                    className="block h-full w-full origin-left rounded-full bg-gradient-to-r from-mod to-mod-2 transition-transform duration-500 ease-out"
                    style={{ transform: `scaleX(${Math.max(0, Math.min(1, ratio))})` }}
                  />
                )}
              </span>
            </button>
          )
        })}
      </div>
    </LayoutGroup>
  )
}
