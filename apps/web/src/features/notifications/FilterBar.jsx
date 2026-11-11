import { Search, X } from 'lucide-react'
import { CATEGORIES, PRIORITIES, STATUS_FILTERS } from '@lifetrack/core/notifications'
import { Input, Select } from '@/components/ui/form'
import { cn } from '@/lib/utils'

/**
 * Search, category chips and (optionally) priority, status and sort. It holds no state: `value` is
 * { query, kind, priority, status, sort } and `onChange(patch)` reports what changed. `counts` is categoryCounts() for the chips.
 */
export function FilterBar({ value, onChange, counts, compact = false, showPriority = !compact, showStatus = false, showSort = !compact }) {
  const chip = (kind, label, count) => {
    const on = value.kind === kind
    return (
      <button
        key={kind}
        type="button"
        aria-pressed={on}
        onClick={() => onChange({ kind })}
        className={cn(
          'lt-press inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
          on ? 'border-mod/40 bg-mod/15 text-mod-text' : 'border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground',
        )}
      >
        {label}
        <span className={cn('tabular-nums', on ? 'text-mod-text/80' : 'text-muted-foreground/70')}>{count}</span>
      </button>
    )
  }
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={value.query}
            onChange={(e) => onChange({ query: e.target.value })}
            placeholder="Search notifications"
            aria-label="Search notifications"
            autoComplete="off"
            className="pl-9 pr-9"
          />
          {value.query && (
            <button
              type="button"
              onClick={() => onChange({ query: '' })}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {showStatus && (
          <Select aria-label="Status" value={value.status} onChange={(e) => onChange({ status: e.target.value })} className="w-36">
            {STATUS_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        )}
        {showPriority && (
          <Select aria-label="Priority" value={value.priority} onChange={(e) => onChange({ priority: e.target.value })} className="w-36">
            <option value="all">Any priority</option>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        )}
        {showSort && (
          <Select aria-label="Sort" value={value.sort} onChange={(e) => onChange({ sort: e.target.value })} className="w-36">
            <option value="newest">Newest first</option>
            <option value="priority">Most important</option>
          </Select>
        )}
      </div>
      <div role="group" aria-label="Category" className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
        {chip('all', 'All', counts.all ?? 0)}
        {CATEGORIES.filter((c) => (counts[c.value] ?? 0) > 0 || value.kind === c.value).map((c) =>
          chip(c.value, c.label, counts[c.value] ?? 0),
        )}
      </div>
    </div>
  )
}
