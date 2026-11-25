import { CalendarDays, Flame, Pause, Play, Plus } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/misc'
import { CheckButton } from '@/components/shared/CheckButton'
import { fmtDay, diffDays } from '@/lib/dates'
import { rhythmText, progressText, checkinProblem } from '@/domain/challenges'
import { PaceBadge, ProgressRing, ProgressTimeline, STATUS_LABEL } from './visuals'

/** Words for where a challenge is in time. */
function timeText(c, p) {
  if (p.phase === 'upcoming') return `Starts in ${diffDays(c.start_date, p.today ?? c.start_date)} days`
  if (p.phase === 'ended') return 'Ended: finishing up'
  return p.daysLeft === 0 ? 'Last day' : `${p.daysLeft} day${p.daysLeft === 1 ? '' : 's'} left`
}

/**
 * One challenge: ring, rhythm, pace and streak, the timeline, and today's check-in. A daily yes/no day and a weekly day check in with one tap (the ring
 * ripples, the tick draws itself); anything with an amount opens the check-in form. Tapping the title opens the detail view.
 */
export function ChallengeCard({ card, today, onOpen, onCheckIn, onQuickCheckIn, onUndo, onResume, busy }) {
  const { challenge: c, progress: p, next } = card
  const paused = c.status === 'paused'
  const todayHit = p.map.get(today)
  const quick = c.kind === 'weekly' || (c.kind === 'daily' && c.target <= 1)
  const full = todayHit && (c.kind !== 'daily' || todayHit.amount >= c.target)
  const blocked = checkinProblem(c, today, today, p.map, 1)
  const canCheckToday = p.phase === 'running' && !paused
  return (
    <Card className="relative overflow-hidden" style={{ boxShadow: `0 0 0 1px ${c.color}22, 0 12px 40px -24px ${c.color}` }}>
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full opacity-[0.12] blur-3xl"
        style={{ background: c.color }}
      />
      <div className="relative space-y-4 p-4 md:p-5">
        <div className="flex items-start gap-4">
          <ProgressRing pct={p.pct} color={c.color} done={p.pct >= 100} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={onOpen}
                className="min-w-0 text-left text-base font-semibold tracking-tight hover:underline focus-visible:underline"
              >
                <span className="line-clamp-2">{c.title}</span>
              </button>
              {paused && (
                <Badge tone="warning">
                  <Pause className="h-3 w-3" aria-hidden /> {STATUS_LABEL.paused}
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {rhythmText(c)} · {fmtDay(c.start_date, 'd MMM')} to {fmtDay(c.end_date, 'd MMM')}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <PaceBadge pace={paused ? 'upcoming' : p.pace} />
              {paused && <span className="text-xs text-muted-foreground">Paused days are not counted</span>}
              {!paused && p.streak > 1 && (
                <Badge tone="warning">
                  <Flame className="h-3 w-3" aria-hidden /> {p.streak} {c.kind === 'weekly' ? 'week' : 'day'} streak
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">{timeText(c, { ...p, today })}</span>
            </div>
          </div>
        </div>

        <ProgressTimeline card={card} today={today} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 text-sm">
            <p className="font-medium tabular-nums">{progressText(c, p)}</p>
            <p className="text-xs text-muted-foreground">
              {next ? `Next: ${next.title} (${next.pct}%)` : p.pct >= 100 ? 'Every milestone reached' : ' '}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {paused ? (
              <Button size="sm" variant="outline" loading={busy} onClick={onResume}>
                <Play className="h-4 w-4" /> Resume
              </Button>
            ) : canCheckToday ? (
              <>
                {todayHit?.source === 'habit' ? (
                  <Badge tone="success">Counted from your habit</Badge>
                ) : quick ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{todayHit ? 'Done today' : 'Check in'}</span>
                    <CheckButton
                      size="lg"
                      done={!!full}
                      color={c.color}
                      label={full ? `Undo today's check-in for ${c.title}` : `Check in today for ${c.title}`}
                      disabled={busy || (!todayHit && !!blocked)}
                      onToggle={() => (full ? onUndo(todayHit.checkin) : onQuickCheckIn())}
                    />
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant={full ? 'outline' : 'default'}
                    disabled={busy || (!!blocked && !todayHit)}
                    onClick={() => onCheckIn(today)}
                  >
                    <Plus className="h-4 w-4" /> {todayHit ? 'Add more' : 'Check in'}
                  </Button>
                )}
                {quick && !todayHit && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Check in with a note for ${c.title}`}
                    onClick={() => onCheckIn(today)}
                  >
                    <CalendarDays className="h-4 w-4" />
                  </Button>
                )}
              </>
            ) : null}
            <Button size="sm" variant="ghost" onClick={onOpen}>
              Details
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}
