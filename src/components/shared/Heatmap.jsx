import { addDays, startOfWeek, fmtDay } from '@/lib/dates'
import { cn } from '@/lib/utils'

const LEVELS = ['bg-muted/60', 'bg-primary/25', 'bg-primary/45', 'bg-primary/70', 'bg-primary']

/** GitHub-style contribution grid. `levels`: Map<'yyyy-MM-dd', 0..4>. `titles`: Map<date, string> */
export function Heatmap({ levels, titles, today, weeks = 26, weekStartsOn = 1, onSelect, selected }) {
  const end = startOfWeek(today, weekStartsOn)
  const first = addDays(end, -(weeks - 1) * 7)
  const cols = Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d)))
  const dayNames = weekStartsOn === 1 ? ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'] : ['Sun', '', 'Tue', '', 'Thu', '', 'Sat']
  return (
    <div className="overflow-x-auto pb-1" role="img" aria-label="Activity heatmap">
      <div className="flex gap-1">
        <div className="mr-1 grid grid-rows-7 gap-1 text-[10px] leading-3 text-muted-foreground">
          {dayNames.map((n, i) => (
            <span key={i} className="h-3">
              {n}
            </span>
          ))}
        </div>
        {cols.map((col, w) => (
          <div key={w} className="grid grid-rows-7 gap-1">
            {col.map((d) => {
              const future = d > today
              const lvl = levels.get(d) ?? 0
              return (
                <button
                  key={d}
                  type="button"
                  disabled={future || !onSelect}
                  onClick={() => onSelect?.(d)}
                  title={future ? undefined : `${fmtDay(d, 'd MMM yyyy')}${titles?.get(d) ? ' — ' + titles.get(d) : ''}`}
                  className={cn(
                    'h-3 w-3 rounded-[3px] transition-transform enabled:hover:scale-125',
                    future ? 'opacity-0' : LEVELS[lvl],
                    selected === d && 'ring-1 ring-foreground',
                  )}
                />
              )
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
        Less
        {LEVELS.map((c, i) => (
          <span key={i} className={cn('h-3 w-3 rounded-[3px]', c)} />
        ))}
        More
      </div>
    </div>
  )
}
export const levelFor = (ratio) => (ratio <= 0 ? 0 : ratio <= 0.25 ? 1 : ratio <= 0.5 ? 2 : ratio < 1 ? 3 : 4)
