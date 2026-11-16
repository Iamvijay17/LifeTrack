import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowRight, CheckCircle2, Undo2 } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { projectLoads } from '@/domain/recovery'
import { AnimatePresence, m } from '@/components/motion/primitives'
import { DayLoadPanel } from './DayLoadPanel'
import { slotText, when } from './format'

/**
 * The last look before anything changes: every move as a before → after pair, the day loads with and without them, and any warnings. Nothing is
 * saved until Apply. After applying it becomes the result: what moved, what was skipped and why, and Undo.
 */
export function PreviewDialog({ open, onOpenChange, items, days, ctx, onApply, onUndo }) {
  const [phase, setPhase] = useState('review') // review | working | done
  const [result, setResult] = useState(null)
  const [undone, setUndone] = useState(false)
  const [titles, setTitles] = useState({})
  useEffect(() => {
    if (open) {
      setPhase('review')
      setResult(null)
      setUndone(false)
    }
  }, [open])
  const after = projectLoads(
    days,
    items.map((i) => ({ kind: i.s.kind, from: i.s.from, to: i.placement, durationMin: i.s.durationMin })),
  )
  const warnings = items.reduce((n, i) => n + i.check.warnings.length, 0)
  const apply = async () => {
    setPhase('working')
    setTitles(Object.fromEntries(items.map((i) => [i.s.taskId, i.s.title])))
    const res = await onApply(items)
    if (!res) return setPhase('review') // failed: the action already told the user why
    setResult(res)
    setPhase('done')
  }
  const undo = async () => {
    setUndone(true)
    const ok = await onUndo(result.applied.map((h) => h.id))
    if (!ok) setUndone(false)
  }
  const title = (id) => titles[id] ?? 'Task'
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => phase !== 'working' && onOpenChange(v)}
      className="md:max-w-2xl"
      title={phase === 'done' ? 'Schedule updated' : 'Review changes'}
      description={phase === 'done' ? undefined : 'Nothing changes until you apply. Fixed events and habits stay where they are.'}
      footer={
        phase === 'done' ? (
          <div className="flex w-full justify-end gap-2">
            {result.applied.length > 0 && (
              <Button variant="outline" onClick={undo} disabled={undone}>
                <Undo2 className="h-4 w-4" aria-hidden /> {undone ? 'Undone' : 'Undo all'}
              </Button>
            )}
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        ) : (
          <div className="flex w-full items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={phase === 'working'}>
              Cancel
            </Button>
            <Button onClick={apply} loading={phase === 'working'} disabled={!items.length}>
              Apply {items.length} {items.length === 1 ? 'change' : 'changes'}
            </Button>
          </div>
        )
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        {phase === 'done' ? (
          <m.div key="done" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 p-3">
              <CheckCircle2 className="h-6 w-6 text-success" aria-hidden />
              <div>
                <p className="text-sm font-semibold">
                  {result.applied.length} {result.applied.length === 1 ? 'task' : 'tasks'} rescheduled
                </p>
                <p className="text-xs text-muted-foreground">
                  {undone ? 'Everything was put back.' : 'The history keeps a record, so you can undo from there too.'}
                </p>
              </div>
            </div>
            {result.skipped.length > 0 && (
              <ul className="space-y-1.5" aria-label="Not applied">
                {result.skipped.map((k) => (
                  <li key={k.taskId} className="flex items-start gap-2 text-sm text-warning">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span>
                      <strong className="font-medium">{title(k.taskId)}</strong> was left as it is. {k.message}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </m.div>
        ) : (
          <m.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <ul className="divide-y divide-border rounded-xl border border-border" aria-label="Changes to apply">
              {items.map(({ s, placement, check }) => (
                <li key={s.id} className="space-y-1 px-3 py-2.5">
                  <p className="truncate text-sm font-medium">{s.title}</p>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span>
                      {when(s.from.date, ctx.today)}, {slotText(s.from, ctx.prefs)}
                    </span>
                    <ArrowRight className="h-3 w-3" aria-hidden />
                    <span className="font-medium text-foreground">
                      {when(placement.date, ctx.today)}, {slotText(placement, ctx.prefs)}
                    </span>
                  </p>
                  {check.warnings.map((w) => (
                    <p key={w.code} className="flex items-center gap-1.5 text-xs text-warning">
                      <AlertTriangle className="h-3 w-3" aria-hidden /> {w.message}
                    </p>
                  ))}
                </li>
              ))}
              {!items.length && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing is selected.</li>}
            </ul>
            {warnings > 0 && (
              <p className="text-xs text-warning">
                {warnings === 1 ? '1 warning' : `${warnings} warnings`}: you can still apply. Conflicts with events are blocked.
              </p>
            )}
            <DayLoadPanel days={days} after={after} today={ctx.today} />
          </m.div>
        )}
      </AnimatePresence>
    </Dialog>
  )
}
