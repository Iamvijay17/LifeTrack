import { AlertTriangle, ArrowRight, Check, Clock3, CornerDownRight, Flame, SlidersHorizontal, X } from 'lucide-react'
import { Badge } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/form'
import { PRIORITY_META } from '@/domain/calendar'
import { m, spring } from '@/components/motion/primitives'
import { cn } from '@/lib/utils'
import { hm, slotText, when, whenLong } from './format'

const PRIORITY_TONE = { urgent: 'danger', high: 'warning', medium: 'primary', low: 'neutral' }

function Slot({ label, date, slot, today, prefs, muted, tone }) {
  return (
    <div
      className={cn(
        'min-w-0 flex-1 rounded-lg border px-3 py-2',
        muted ? 'border-border/60 bg-muted/30' : 'border-mod/30 bg-mod/10',
        tone === 'bad' && 'border-danger/40 bg-danger/10',
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('truncate text-sm font-semibold', muted && 'text-muted-foreground line-through decoration-muted-foreground/40')}>
        {whenLong(date, today)}
      </p>
      <p className="truncate text-xs text-muted-foreground">{slotText(slot, prefs)}</p>
    </div>
  )
}

/**
 * One slipped task and where it could go. Accept is one click and applies at once (with Undo); Adjust opens the manual editor; Reject hides the
 * suggestion for a few days. The checkbox decides whether it is part of "Review and apply all".
 */
export function SuggestionCard({ s, placement, check, included, onInclude, onAccept, onReject, onAdjust, onPick, today, prefs, busy }) {
  const manual = !!placement && placement !== s.to
  const blocked = !placement || !check?.ok
  const meta = PRIORITY_META[s.priority] ?? PRIORITY_META.medium
  return (
    <m.li
      layout="position"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 24, scale: 0.97, transition: { duration: 0.2 } }}
      transition={spring.snappy}
      className={cn('lt-card relative list-none overflow-hidden', included && !blocked && 'ring-1 ring-mod/30')}
      data-testid="suggestion"
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: meta.color }} />
      <div className="space-y-3 p-[var(--pad)] pl-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0" title="Include in Review and apply">
            <Checkbox
              checked={included && !blocked}
              disabled={blocked}
              onChange={onInclude}
              label={<span className="sr-only">Include {s.title} when applying all</span>}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="truncate text-[15px] font-semibold tracking-tight">{s.title}</h3>
              <Badge tone={PRIORITY_TONE[s.priority] ?? 'neutral'}>{meta.label}</Badge>
              {s.kind === 'rebalance' && <Badge tone="warning">Rebalance</Badge>}
              {s.slips >= 2 && (
                <Badge tone="danger" title="This task has been moved before">
                  <Flame className="h-3 w-3" aria-hidden /> Keeps slipping
                </Badge>
              )}
            </div>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {s.reasons.map((r) => (
                <li key={r} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  {r}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <Slot label={s.kind === 'rebalance' ? 'Planned' : 'Was'} date={s.from.date} slot={s.from} today={today} prefs={prefs} muted />
          <ArrowRight className="mx-auto h-4 w-4 shrink-0 rotate-90 text-muted-foreground sm:rotate-0" aria-hidden />
          {placement ? (
            <Slot
              label={manual ? 'Your choice' : 'Suggested'}
              date={placement.date}
              slot={placement}
              today={today}
              prefs={prefs}
              tone={check && !check.ok ? 'bad' : undefined}
            />
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
              No free time in the window. Adjust it by hand, or widen the window in Settings.
            </div>
          )}
        </div>

        {check && (check.errors.length > 0 || check.warnings.length > 0) && (
          <ul className="space-y-1" aria-live="polite">
            {check.errors.map((e) => (
              <li key={e.code} role="alert" className="flex items-start gap-1.5 text-xs text-danger">
                <X className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {e.message}
              </li>
            ))}
            {check.warnings.map((w) => (
              <li key={w.code} className="flex items-start gap-1.5 text-xs text-warning">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {w.message}
              </li>
            ))}
          </ul>
        )}

        {s.alternatives.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <CornerDownRight className="h-3 w-3" aria-hidden /> Or
            </span>
            {s.alternatives.map((a) => {
              const active = placement && placement.date === a.date && placement.start === a.start
              return (
                <button
                  key={`${a.date}-${a.start}`}
                  type="button"
                  onClick={() => onPick(a)}
                  aria-pressed={active}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition-colors hover:border-mod/50 hover:bg-mod/10',
                    active ? 'border-mod bg-mod/15 text-mod-text' : 'border-border text-muted-foreground',
                  )}
                >
                  {when(a.date, today)} · {hm(a.start, prefs)}
                </button>
              )
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button size="sm" onClick={onAccept} disabled={blocked || busy} loading={busy}>
            <Check className="h-4 w-4" aria-hidden /> Accept
          </Button>
          <Button size="sm" variant="outline" onClick={onAdjust} disabled={busy}>
            <SlidersHorizontal className="h-4 w-4" aria-hidden /> Adjust
          </Button>
          <Button size="sm" variant="ghost" onClick={onReject} disabled={busy} className="text-muted-foreground">
            <Clock3 className="h-4 w-4" aria-hidden /> Not now
          </Button>
        </div>
      </div>
    </m.li>
  )
}
