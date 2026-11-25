import { Check } from 'lucide-react'
import { Badge } from '@/components/ui/misc'
import { eachDay, fmtDay } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { PACE_LABEL, dayState } from '@/domain/challenges'

const PACE_TONE = { ahead: 'success', on_track: 'primary', behind: 'warning', upcoming: 'neutral' }
export const STATUS_LABEL = { active: 'Active', paused: 'Paused', completed: 'Completed', cancelled: 'Cancelled' }

export function PaceBadge({ pace }) {
  return <Badge tone={PACE_TONE[pace] ?? 'neutral'}>{PACE_LABEL[pace] ?? pace}</Badge>
}

/** A ring that fills as the percentage grows. The number sits in the middle; the colour is the challenge's own. */
export function ProgressRing({ pct, color, size = 76, stroke = 7, done }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${pct}% complete`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.22,1,0.36,1)', filter: `drop-shadow(0 0 6px ${color}66)` }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-sm font-semibold tabular-nums">
        {done ? <Check className="h-6 w-6" style={{ color }} aria-hidden /> : `${pct}%`}
      </div>
    </div>
  )
}

const CELL = {
  done: (c) => ({ background: c, borderColor: c }),
  partial: (c) => ({ background: `${c}55`, borderColor: c }),
  missed: () => ({}),
  open: (c) => ({ borderColor: c }),
}

/** Cells of the visual timeline: one per day up to two months, otherwise one per week filled by how much of it was done. */
function timelineCells(card, today) {
  const { challenge: c, progress: p } = card
  const days = eachDay(c.start_date, c.end_date)
  if (days.length <= 62)
    return days.map((day) => ({
      key: day,
      from: day,
      state: dayState(c, day, p.map, today),
      title: `${fmtDay(day, 'EEE d MMM')}: ${stateWords(dayState(c, day, p.map, today))}`,
    }))
  const out = []
  for (let i = 0; i < days.length; i += 7) {
    const week = days.slice(i, i + 7)
    const states = week.map((d) => dayState(c, d, p.map, today))
    const done = states.filter((s) => s === 'done').length
    const live = states.filter((s) => s !== 'paused').length
    const allFuture = states.every((s) => s === 'upcoming')
    out.push({
      key: week[0],
      from: week[0],
      fill: live ? done / live : 0,
      state: allFuture ? 'upcoming' : done === live && live ? 'done' : done ? 'partial' : week.includes(today) ? 'open' : 'missed',
      title: `Week of ${fmtDay(week[0], 'd MMM')}: ${done} of ${live} days`,
    })
  }
  return out
}
const stateWords = (s) =>
  ({
    done: 'done',
    partial: 'part done',
    missed: 'missed',
    open: 'open today',
    upcoming: 'to come',
    paused: 'paused',
    none: 'no check-in',
  })[s] ?? s

/**
 * The challenge as a strip from its first day to its last: filled days are done, a ring marks today, hollow days are still to come. Flags under the
 * strip are the milestones, lit once reached.
 */
export function ProgressTimeline({ card, today, className }) {
  const { challenge: c, milestones } = card
  const cells = timelineCells(card, today)
  return (
    <div className={cn('space-y-2', className)}>
      <div
        role="img"
        aria-label={`Timeline of ${c.title}: ${card.progress.units} of ${card.progress.goal} done`}
        className="flex h-5 w-full gap-[2px]"
      >
        {cells.map((cell) => {
          const style = (CELL[cell.state] ?? (() => ({})))(c.color)
          return (
            <span
              key={cell.key}
              title={cell.title}
              data-state={cell.state}
              className={cn(
                'relative min-w-[2px] flex-1 rounded-[3px] border transition-[background-color,border-color,transform] duration-300',
                cell.state === 'done' && 'scale-y-100',
                cell.state === 'missed' && 'border-danger/40 bg-danger/10',
                cell.state === 'paused' && 'border-dashed border-muted-foreground/40 bg-muted/60',
                cell.state === 'upcoming' && 'border-border bg-muted/30',
                cell.state === 'none' && 'border-border bg-muted/50',
                cell.state === 'open' && 'bg-transparent shadow-[0_0_0_2px_var(--ring-c)]',
              )}
              style={{ ...style, '--ring-c': c.color + '66' }}
            >
              {cell.fill != null && cell.fill > 0 && cell.fill < 1 && (
                <span
                  className="absolute inset-x-0 bottom-0 rounded-[2px]"
                  style={{ height: `${cell.fill * 100}%`, background: c.color }}
                />
              )}
            </span>
          )
        })}
      </div>
      <div className="relative h-5" aria-hidden>
        {milestones.map((m) => (
          <span
            key={m.pct}
            title={`${m.title} (${m.pct}%)${m.reachedOn ? `, reached ${fmtDay(m.reachedOn, 'd MMM')}` : ''}`}
            className="absolute top-0 -translate-x-1/2 text-[10px] tabular-nums"
            style={{ left: `${m.pct}%`, color: m.reached ? c.color : undefined }}
          >
            <span
              className={cn('mx-auto mb-0.5 block h-2 w-2 rounded-full border', !m.reached && 'border-muted-foreground/50')}
              style={m.reached ? { background: c.color, borderColor: c.color } : undefined}
            />
            <span className={cn(!m.reached && 'text-muted-foreground')}>{m.pct}%</span>
          </span>
        ))}
      </div>
    </div>
  )
}
