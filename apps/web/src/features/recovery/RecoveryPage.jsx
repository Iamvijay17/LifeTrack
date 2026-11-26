import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { CalendarClock, CheckCircle2, Flame, ListChecks, Settings2, Sparkles } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { FirstUseHint } from '@/components/shared/FirstUseHint'
import { DataGate, EmptyState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { AnimatedValue, AnimatePresence, LayoutGroup } from '@/components/motion/primitives'
import { checkPlacement, projectLoads } from '@/domain/recovery'
import { addDays } from '@/lib/dates'
import { plural } from '@/lib/utils'
import { applyReschedules, dismissRecovery, saveRow, undoReschedules } from '@/services/api'
import * as store from '@/hooks/store'
import { useAction } from '@/hooks/useAction'
import { toAppError } from '@/services/errors'
import { AdjustDialog } from './AdjustDialog'
import { DayLoadPanel } from './DayLoadPanel'
import { HistoryPanel } from './HistoryPanel'
import { PreviewDialog } from './PreviewDialog'
import { SettingsDialog } from './SettingsDialog'
import { SuggestionCard } from './SuggestionCard'
import { useRecovery } from './useRecovery'

const toChange = (s, placement, manual) => ({
  taskId: s.taskId,
  from: s.from,
  to: { date: placement.date, start: placement.start, end: placement.end },
  kind: manual ? 'manual' : s.kind,
  reason: s.reasons.join(' · '),
})

function Stat({ icon: Icon, label, value, tone }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-xl border border-border/70 bg-card/50 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3 sm:px-3.5 sm:py-3">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tone ?? 'bg-mod/15 text-mod-text'}`}>
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-xl font-semibold leading-none tracking-tight tabular-nums">
          <AnimatedValue value={value} />
        </p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

export default function RecoveryPage() {
  const { source, ctx, plan, prefs, updatePrefs, loading, error, refetch } = useRecovery()
  const [overrides, setOverrides] = useState({}) // suggestion id -> a placement chosen by hand or from the alternatives
  const [excluded, setExcluded] = useState(() => new Set()) // ids left out of "Review and apply"
  const [adjusting, setAdjusting] = useState(null)
  const [previewing, setPreviewing] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [busy, setBusy] = useState(() => new Set())
  const [busyHistory, setBusyHistory] = useState(null)

  const placementOf = useCallback((s) => overrides[s.id] ?? s.to, [overrides])
  // Each suggestion is checked against everything on the calendar AND the suggestions above it, so two never overlap: the more important one wins.
  const rows = useMemo(() => {
    const taken = []
    return plan.suggestions.map((s) => {
      const placement = placementOf(s)
      const check = placement ? checkPlacement(source, ctx, { taskId: s.taskId, ...placement }, { accepted: taken }) : null
      const included = !!placement && !!check?.ok && !excluded.has(s.id)
      if (included) taken.push({ taskId: s.taskId, ...placement })
      return { s, placement, check, included, manual: !!placement && placement !== s.to }
    })
  }, [plan.suggestions, placementOf, source, ctx, excluded])
  const chosen = rows.filter((r) => r.included)
  const after = useMemo(
    () =>
      projectLoads(
        plan.days,
        chosen.map((r) => ({ kind: r.s.kind, from: r.s.from, to: r.placement, durationMin: r.s.durationMin })),
      ),
    [plan.days, chosen],
  )

  const tick = (id, on) =>
    setBusy((b) => {
      const n = new Set(b)
      on ? n.add(id) : n.delete(id)
      return n
    })
  const run = { tz: ctx.tz, prefs, today: ctx.today }

  const undo = useCallback(async (ids) => {
    const res = await undoReschedules(ids)
    if (res.skipped.length) toast.error(res.skipped[0].message)
    else toast.success(plural(res.undone.length, 'task') + ' put back')
    return res.undone.length > 0
  }, [])

  // A toast's Undo runs outside any action, so its failure is reported here rather than left as an unhandled rejection.
  const undoFailed = (e) => toast.error(`Couldn't undo: ${toAppError(e).message}`)
  const report = (res) => {
    if (res.applied.length) {
      toast.success(`${plural(res.applied.length, 'task')} rescheduled`, {
        action: { label: 'Undo', onClick: () => undo(res.applied.map((h) => h.id)).catch(undoFailed) },
      })
    }
    for (const k of res.skipped) toast.error(k.message)
  }
  const [applyOne] = useAction(async (r) => {
    tick(r.s.id, true)
    try {
      const res = await applyReschedules([toChange(r.s, r.placement, r.manual)], { ...run, nowMs: Date.now() })
      report(res)
      return res
    } finally {
      tick(r.s.id, false)
    }
  })
  const [applyMany] = useAction(async (items) => {
    const res = await applyReschedules(
      items.map((i) => toChange(i.s, i.placement, i.manual)),
      { ...run, nowMs: Date.now() },
    )
    return res
  })
  const [reject] = useAction(async (r) => {
    const until = addDays(ctx.today, plan.config.dismissDays)
    await dismissRecovery([{ taskId: r.s.taskId, title: r.s.title, from: r.s.from }], until)
    toast(`“${r.s.title}” hidden for ${plan.config.dismissDays} days`, {
      action: {
        label: 'Undo',
        onClick: () => {
          const row = store
            .peek('task_reschedules')
            .find((x) => x.task_id === r.s.taskId && x.action === 'dismissed' && !x.undone_at && x.hide_until === until)
          if (row) saveRow('task_reschedules', row, { undone_at: new Date().toISOString() }).catch(undoFailed)
        },
      },
    })
  })
  const [restore] = useAction(async (row) => {
    setBusyHistory(row.id)
    try {
      await saveRow('task_reschedules', row, { undone_at: new Date().toISOString() })
    } finally {
      setBusyHistory(null)
    }
  })
  const [undoRow] = useAction(async (row) => {
    setBusyHistory(row.id)
    try {
      await undo([row.id])
    } finally {
      setBusyHistory(null)
    }
  })

  const adjustingRow = rows.find((r) => r.s.id === adjusting)
  const others = useMemo(
    () => rows.filter((r) => r.included && r.s.id !== adjusting).map((r) => ({ taskId: r.s.taskId, ...r.placement })),
    [rows, adjusting],
  )
  const caughtUp = plan.suggestions.length === 0

  return (
    <>
      <PageHeader
        title="Smart Recovery"
        description="Get slipped tasks back on the calendar, without touching your fixed plans."
        icon={CalendarClock}
        actions={
          <>
            <Button variant="outline" onClick={() => setSettingsOpen(true)}>
              <Settings2 className="h-4 w-4" aria-hidden /> Settings
            </Button>
            <Button onClick={() => setPreviewing(true)} disabled={!chosen.length}>
              <ListChecks className="h-4 w-4" aria-hidden /> Review &amp; apply{chosen.length ? ` (${chosen.length})` : ''}
            </Button>
          </>
        }
      />
      <FirstUseHint id="recovery" title="Nothing moves without you">
        Smart Recovery only suggests new dates for missed tasks. Preview a change before you apply it, and undo it afterwards.
      </FirstUseHint>
      <DataGate loading={loading} error={error} onRetry={refetch} cards={3}>
        <section className="lt-hero mb-4 grid grid-cols-3 gap-2 p-2.5 sm:gap-3 sm:p-3 md:p-4" aria-label="Summary">
          <Stat icon={Flame} label="Slipped tasks" value={plan.overdue} tone="bg-danger/15 text-danger" />
          <Stat icon={Sparkles} label="Suggested moves" value={plan.suggestions.length} />
          <Stat icon={CalendarClock} label="Overloaded days" value={plan.overloaded} tone="bg-warning/15 text-warning" />
        </section>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="min-w-0 space-y-3">
            {caughtUp ? (
              <EmptyState
                icon={CheckCircle2}
                title={plan.hiddenCount ? 'Everything left is on hold' : "You're all caught up"}
                description={
                  plan.hiddenCount
                    ? `${plural(plan.hiddenCount, 'suggestion')} hidden for a few days. They come back on their own, or use Show again in the history.`
                    : 'Nothing slipped and no day is overloaded. Tasks that miss their date will show up here with a new time to try.'
                }
              />
            ) : (
              <LayoutGroup id="recovery">
                <ul className="space-y-3" aria-label="Suggestions">
                  <AnimatePresence initial={false}>
                    {rows.map((r) => (
                      <SuggestionCard
                        key={r.s.id}
                        s={r.s}
                        placement={r.placement}
                        check={r.check}
                        included={!excluded.has(r.s.id)}
                        busy={busy.has(r.s.id)}
                        today={ctx.today}
                        prefs={prefs}
                        onInclude={(on) =>
                          setExcluded((e) => {
                            const n = new Set(e)
                            on ? n.delete(r.s.id) : n.add(r.s.id)
                            return n
                          })
                        }
                        onAccept={() => applyOne(r)}
                        onReject={() => reject(r)}
                        onAdjust={() => setAdjusting(r.s.id)}
                        onPick={(a) => setOverrides((o) => ({ ...o, [r.s.id]: a }))}
                      />
                    ))}
                  </AnimatePresence>
                </ul>
              </LayoutGroup>
            )}
            <p className="px-1 text-xs text-muted-foreground">
              Based on priority, how late each task is and what is already booked. Open the{' '}
              <Link to="/calendar" className="text-mod-text underline underline-offset-2">
                calendar
              </Link>{' '}
              to see the whole week.
            </p>
          </div>
          <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            <DayLoadPanel days={plan.days} after={after} today={ctx.today} />
            <HistoryPanel
              rows={source.reschedules}
              tasks={source.tasks}
              ctx={ctx}
              busyId={busyHistory}
              onUndo={undoRow}
              onRestore={restore}
            />
          </aside>
        </div>
      </DataGate>

      <AdjustDialog
        open={!!adjustingRow}
        onOpenChange={(o) => !o && setAdjusting(null)}
        suggestion={adjustingRow?.s}
        initial={adjustingRow?.placement ?? { date: ctx.today, start: '09:00', end: '10:00' }}
        source={source}
        ctx={ctx}
        accepted={others}
        onSave={(p) => {
          setOverrides((o) => ({ ...o, [adjusting]: p }))
          setExcluded((e) => {
            const n = new Set(e)
            n.delete(adjusting)
            return n
          })
          setAdjusting(null)
        }}
      />
      <PreviewDialog
        open={previewing}
        onOpenChange={setPreviewing}
        items={chosen.map((r) => ({ s: r.s, placement: r.placement, check: r.check, manual: r.manual }))}
        days={plan.days}
        ctx={ctx}
        onApply={applyMany}
        onUndo={undo}
      />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} prefs={prefs} update={updatePrefs} />
    </>
  )
}
