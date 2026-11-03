import { Search } from 'lucide-react'
import { Input, Select } from '@/components/ui/form'
import { Segmented } from '@/components/ui/misc'
import { JOB_STATUSES, STATUS_LABEL } from '@/domain/jobs'

const VIEWS = [
  { value: 'board', label: 'Board' },
  { value: 'table', label: 'Table' },
  { value: 'calendar', label: 'Interviews' },
  { value: 'insights', label: 'Insights' },
]

/** View switcher plus search and filters (shown only for the board and table views). */
export function JobsToolbar({ view, onViewChange, filters, onFiltersChange, sources }) {
  const set = (key) => (e) => onFiltersChange({ ...filters, [key]: e.target.value })
  const filterable = view === 'board' || view === 'table'
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Segmented value={view} onChange={onViewChange} options={VIEWS} />
      {filterable && (
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          <div className="relative min-w-40 max-w-xs flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search…" aria-label="Search applications" value={filters.q} onChange={set('q')} />
          </div>
          {view === 'table' && (
            <Select aria-label="Filter by status" className="w-36" value={filters.status} onChange={set('status')}>
              <option value="">All statuses</option>
              {JOB_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          )}
          {sources.length > 0 && (
            <Select aria-label="Filter by source" className="w-36" value={filters.source} onChange={set('source')}>
              <option value="">All sources</option>
              {sources.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          )}
        </div>
      )}
    </div>
  )
}
