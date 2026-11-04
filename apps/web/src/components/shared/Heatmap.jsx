import { useLayoutEffect, useRef } from 'react'
import { addDays, startOfWeek, fmtDay } from '@/lib/dates'
import { cn } from '@/lib/utils'

const LEVELS = ['bg-muted', 'bg-primary/25', 'bg-primary/45', 'bg-primary/70', 'bg-primary']

/** GitHub-style contribution grid. `levels`: Map<'yyyy-MM-dd', 0..4>. `titles`: Map<date, string> */
export function Heatmap({ levels, titles, today, weeks = 26, weekStartsOn = 1, onSelect, selected }) {
  const end = startOfWeek(today, weekStartsOn)
  const first = addDays(end, -(weeks - 1) * 7)
  const cols = Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d)))
  const dayNames = weekStartsOn === 1 ? ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'] : ['Sun', '', 'Tue', '', 'Thu', '', 'Sat']
  // Start at the newest weeks: on a phone, the oldest ones would otherwise fill the screen and hide today.
  const scroller = useRef(null)
  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth
  }, [])
  return (
    <div>
      <div ref={scroller} className="overflow-x-auto pb-1" role="group" aria-label="Activity heatmap" tabIndex={onSelect ? undefined : 0}>
        <div className="flex w-max gap-1">
          <div aria-hidden className="mr-1 grid grid-rows-7 gap-1 text-[10px] leading-3 text-muted-foreground">
            {dayNames.map((n, i) => (
              <span key={i} className="h-3">
                {n}
              </span>
            ))}
          </div>
          {cols.map((col, w) => (
            <div key={w} className="grid grid-rows-7 gap-1">
              {col.map((d) => {
                // Future days only hold the grid's shape, so they are not buttons at all.
                if (d > today) return <span key={d} aria-hidden className="h-3 w-3" />
                const lvl = levels.get(d) ?? 0
                const text = `${fmtDay(d, 'd MMM yyyy')}${titles?.get(d) ? ' — ' + titles.get(d) : ''}`
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={!onSelect}
                    aria-label={text}
                    aria-pressed={onSelect ? selected === d : undefined}
                    onClick={() => onSelect?.(d)}
                    title={text}
                    className={cn(
                      'h-3 w-3 rounded-[3px] transition-transform enabled:hover:scale-125',
                      LEVELS[lvl],
                      selected === d && 'ring-1 ring-foreground',
                    )}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <div aria-hidden className="mt-2 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
        Less
        {LEVELS.map((c, i) => (
          <span key={i} className={cn('h-3 w-3 rounded-[3px]', c)} />
        ))}
        More
      </div>
    </div>
  )
}
export { levelFor } from '@lifetrack/core/habits'
