import { ArrowRight, EyeOff, History, Undo2 } from 'lucide-react'
import { Badge } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fmtDateTime } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { slotText, when } from './format'

const SOURCE = { recovery: 'Recovered', rebalance: 'Rebalanced', manual: 'Adjusted' }
const hh = (t) => (t ? String(t).slice(0, 5) : null)

/** Every move and every "not now", newest first. A move can be undone while the task is still where it was put; a hidden suggestion can be shown again. */
export function HistoryPanel({ rows, tasks, ctx, onUndo, onRestore, busyId }) {
  const list = [...rows].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 20)
  const stillThere = (r) => {
    const t = tasks.find((x) => x.id === r.task_id)
    return !!t && t.due_date === r.to_date && hh(t.start_time) === hh(r.to_start) && hh(t.end_time) === hh(r.to_end)
  }
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" aria-hidden />
        <CardTitle className="text-sm">History</CardTitle>
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-muted-foreground">
            Rescheduled tasks will be listed here, with the option to undo.
          </p>
        ) : (
          <ul className="space-y-3" data-testid="history">
            {list.map((r) => {
              const dismissed = r.action === 'dismissed'
              const canUndo = !dismissed && !r.undone_at && stillThere(r)
              const canRestore = dismissed && !r.undone_at && r.hide_until >= ctx.today
              return (
                <li key={r.id} className={cn('space-y-1', r.undone_at && 'opacity-60')}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-[13px] font-medium">{r.title || 'Task'}</p>
                    <Badge tone={dismissed ? 'neutral' : r.undone_at ? 'neutral' : 'primary'}>
                      {r.undone_at ? 'Undone' : dismissed ? 'Not now' : (SOURCE[r.source] ?? 'Moved')}
                    </Badge>
                  </div>
                  {dismissed ? (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <EyeOff className="h-3 w-3" aria-hidden /> Hidden until {when(r.hide_until, ctx.today)}
                    </p>
                  ) : (
                    <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                      <span>{when(r.from_date, ctx.today)}</span>
                      <ArrowRight className="h-3 w-3" aria-hidden />
                      <span className="text-foreground">
                        {when(r.to_date, ctx.today)}, {slotText({ start: hh(r.to_start), end: hh(r.to_end) }, ctx.prefs)}
                      </span>
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground">{fmtDateTime(r.created_at, ctx.tz)}</span>
                    {canUndo && (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" loading={busyId === r.id} onClick={() => onUndo(r)}>
                        <Undo2 className="h-3 w-3" aria-hidden /> Undo
                      </Button>
                    )}
                    {canRestore && (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" loading={busyId === r.id} onClick={() => onRestore(r)}>
                        Show again
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
