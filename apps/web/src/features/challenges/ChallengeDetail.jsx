import { useMemo, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, ExternalLink, Flag, Pause, Pencil, Play, Save, Trash2, X } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/misc'
import { useConfirm } from '@/components/shared/Confirm'
import { usePrompt } from '@/components/shared/Prompt'
import { useSettings } from '@/hooks/useSettings'
import { useAction } from '@/hooks/useAction'
import { addMonths, fmtDay, monthStart } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { isSafeUrl } from '@lifetrack/core/notes'
import { rhythmText, progressText, monthCells, totalForecast, templateFromChallenge, isClosed, checkinProblem } from '@/domain/challenges'
import {
  cancelChallenge,
  completeChallenge,
  deleteChallenge,
  pauseChallenge,
  removeCheckin,
  resumeChallenge,
  saveChallengeTemplate,
} from '@/services/api'
import { PaceBadge, ProgressRing, ProgressTimeline, STATUS_LABEL } from './visuals'

const WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

/** One challenge's own month: each day filled, partly filled, missed, paused or still to come. Tap a day to check in for it or change it. */
export function ProgressCalendar({ card, today, onDay }) {
  const { settings } = useSettings()
  const c = card.challenge
  const [month, setMonth] = useState(() => monthStart(today >= c.start_date && today <= c.end_date ? today : c.start_date))
  const cells = useMemo(
    () => monthCells(c, card.progress.map, today, month, settings.week_starts_on),
    [c, card, today, month, settings.week_starts_on],
  )
  const heads = Array.from({ length: 7 }, (_, i) => WEEK[(settings.week_starts_on + i) % 7])
  const inRange = (d) => d >= c.start_date && d <= c.end_date
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Previous month"
          disabled={monthStart(c.start_date) >= month}
          onClick={() => setMonth(addMonths(month, -1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <p aria-live="polite" className="text-sm font-semibold">
          {fmtDay(month, 'MMMM yyyy')}
        </p>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Next month"
          disabled={monthStart(c.end_date) <= month}
          onClick={() => setMonth(addMonths(month, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div aria-hidden className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
        {heads.map((h, i) => (
          <span key={i}>{h}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1" role="grid" aria-label={`Progress calendar for ${fmtDay(month, 'MMMM yyyy')}`}>
        {cells.map((cell, i) =>
          !cell ? (
            <span key={`b${i}`} aria-hidden />
          ) : (
            <button
              key={cell.day}
              type="button"
              disabled={!inRange(cell.day) || cell.day > today || cell.state === 'paused' || isClosed(c)}
              onClick={() => onDay(cell.day, card.progress.map.get(cell.day))}
              aria-label={`${fmtDay(cell.day, 'EEEE d MMMM')}: ${{ done: 'done', partial: 'partly done', missed: 'missed', open: 'open', upcoming: 'not yet', paused: 'paused', none: 'no check-in', outside: 'outside the challenge' }[cell.state]}`}
              data-state={cell.state}
              className={cn(
                'lt-press relative grid h-10 place-items-center rounded-lg border text-xs tabular-nums transition-colors disabled:cursor-default md:h-9',
                cell.state === 'outside' && 'border-transparent text-muted-foreground/40',
                cell.state === 'upcoming' && 'border-border text-muted-foreground',
                cell.state === 'missed' && 'border-danger/40 bg-danger/10 text-danger',
                cell.state === 'paused' && 'border-dashed border-muted-foreground/40 text-muted-foreground',
                cell.state === 'none' && 'border-border text-foreground/80',
                cell.day === today && 'ring-2 ring-offset-1 ring-offset-card',
              )}
              style={{
                ...(cell.state === 'done' ? { background: c.color, borderColor: c.color, color: '#fff' } : {}),
                ...(cell.state === 'partial' ? { background: `${c.color}44`, borderColor: c.color } : {}),
                ...(cell.state === 'open' ? { borderColor: c.color } : {}),
                '--tw-ring-color': c.color,
              }}
            >
              {cell.state === 'done' ? <Check className="h-3.5 w-3.5" aria-hidden /> : Number(cell.day.slice(8))}
            </button>
          ),
        )}
      </div>
    </div>
  )
}

const Stat = ({ label, value }) => (
  <div className="rounded-xl border border-border bg-surface-2/50 p-3">
    <p className="text-[11px] text-muted-foreground">{label}</p>
    <p className="mt-0.5 text-base font-semibold tabular-nums">{value}</p>
  </div>
)

/** Everything about one challenge, and what can be done to it. */
export function ChallengeDetail({ card, today, open, onOpenChange, onEdit, onCheckIn, onEditCheckin }) {
  const confirm = useConfirm()
  const ask = usePrompt()
  const [run, pending] = useAction(async (fn) => fn())
  if (!card) return null
  const { challenge: c, progress: p, milestones } = card
  const closed = isClosed(c)
  const forecast = totalForecast(c, p, today)
  const own = [...p.map.values()]
    .filter((v) => v.checkin)
    .map((v) => v.checkin)
    .sort((a, b) => b.checkin_date.localeCompare(a.checkin_date))

  const cancel = async () => {
    if (
      await confirm({
        title: `Cancel “${c.title}”?`,
        description: 'It moves to History as cancelled. Your check-ins are kept.',
        confirmLabel: 'Cancel challenge',
        cancelLabel: 'Keep going',
      })
    )
      await run(() => cancelChallenge(c.id))
  }
  const finish = async () => {
    if (
      await confirm({
        title: 'Finish now?',
        description: `It will be recorded at ${p.pct}% complete and move to History.`,
        confirmLabel: 'Finish challenge',
        cancelLabel: 'Not yet',
      })
    )
      await run(() => completeChallenge(c.id, today))
  }
  const remove = async () => {
    if (
      await confirm({
        title: `Delete “${c.title}”?`,
        description: `This permanently deletes the challenge and its ${own.length} check-in${own.length === 1 ? '' : 's'}.`,
        confirmLabel: 'Delete',
        cancelLabel: 'Keep it',
      })
    ) {
      await run(() => deleteChallenge(c.id))
      onOpenChange(false)
    }
  }
  const saveTemplate = async () => {
    const name = await ask({ title: 'Save as template', label: 'Template name', value: c.title, confirmLabel: 'Save', maxLength: 80 })
    if (name) await run(() => saveChallengeTemplate(templateFromChallenge(c, name)))
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={c.title}
      description={`${rhythmText(c)} · ${fmtDay(c.start_date, 'd MMM yyyy')} to ${fmtDay(c.end_date, 'd MMM yyyy')}`}
      className="md:max-w-2xl"
    >
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <ProgressRing pct={p.pct} color={c.color} size={92} stroke={8} done={p.pct >= 100} />
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                tone={
                  c.status === 'active' ? 'primary' : c.status === 'completed' ? 'success' : c.status === 'paused' ? 'warning' : 'neutral'
                }
              >
                {STATUS_LABEL[c.status]}
              </Badge>
              {!closed && <PaceBadge pace={c.status === 'paused' ? 'upcoming' : p.pace} />}
              <Badge>{c.category}</Badge>
            </div>
            <p className="text-sm font-medium tabular-nums">{progressText(c, p)}</p>
            {c.description && <p className="text-sm text-muted-foreground">{c.description}</p>}
          </div>
        </div>

        <ProgressTimeline card={card} today={today} />

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Current streak" value={`${p.streak} ${c.kind === 'weekly' ? 'wk' : 'd'}`} />
          <Stat label="Best streak" value={`${p.bestStreak} ${c.kind === 'weekly' ? 'wk' : 'd'}`} />
          <Stat label="Check-in days" value={p.checkinDays} />
          <Stat label={closed ? 'Result' : 'Days left'} value={closed ? `${c.final_pct ?? p.pct}%` : p.daysLeft} />
        </div>
        {forecast && !closed && p.remaining > 0 && (
          <p className="rounded-xl border border-border bg-surface-2/50 p-3 text-sm">
            {forecast.perDay > 0 && (
              <>
                Aim for about{' '}
                <strong className="tabular-nums">
                  {forecast.perDay.toLocaleString()}
                  {c.unit ? ` ${c.unit}` : ''}
                </strong>{' '}
                a day to finish on time.{' '}
              </>
            )}
            {forecast.finishOn && (
              <>
                At your pace you would finish around <strong>{fmtDay(forecast.finishOn, 'd MMM')}</strong>
                {forecast.onTime ? ', in time.' : ', after the end date.'}
              </>
            )}
          </p>
        )}

        <section aria-labelledby="cd-cal">
          <h3 id="cd-cal" className="mb-2 text-sm font-semibold">
            Progress calendar
          </h3>
          <ProgressCalendar
            card={card}
            today={today}
            onDay={(day, hit) =>
              hit?.checkin ? onEditCheckin(hit.checkin) : hit ? null : !checkinProblem(c, day, today, p.map) && onCheckIn(day)
            }
          />
        </section>

        <section aria-labelledby="cd-ms">
          <h3 id="cd-ms" className="mb-2 text-sm font-semibold">
            Milestones
          </h3>
          <ul className="space-y-1.5">
            {milestones.map((m) => (
              <li key={m.pct} className="flex items-center gap-2.5 text-sm">
                <span
                  className={cn(
                    'grid h-6 w-6 shrink-0 place-items-center rounded-full border',
                    !m.reached && 'border-border text-muted-foreground',
                  )}
                  style={m.reached ? { background: c.color, borderColor: c.color, color: '#fff' } : undefined}
                >
                  {m.reached ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Flag className="h-3 w-3" aria-hidden />}
                </span>
                <span className={cn('min-w-0 flex-1', !m.reached && 'text-muted-foreground')}>
                  {m.title} <span className="tabular-nums text-muted-foreground">({m.pct}%)</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {m.reachedOn ? `Reached ${fmtDay(m.reachedOn, 'd MMM')}` : m.reached ? 'Reached' : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="cd-log">
          <h3 id="cd-log" className="mb-2 text-sm font-semibold">
            Check-ins ({own.length})
          </h3>
          {own.length === 0 ? (
            <p className="text-sm text-muted-foreground">No check-ins yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {own.map((k) => (
                <li key={k.id} className="flex items-start gap-3 p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {fmtDay(k.checkin_date, 'EEE d MMM')}
                      {(c.kind === 'total' || c.target > 1) && (
                        <span className="ml-2 tabular-nums text-muted-foreground">
                          {k.amount.toLocaleString()}
                          {c.unit ? ` ${c.unit}` : ''}
                        </span>
                      )}
                    </p>
                    {k.note && <p className="mt-0.5 whitespace-pre-wrap break-words text-muted-foreground">{k.note}</p>}
                    {/* Only web links: rows from the local backend or a restored backup skip the database's https? check. */}
                    {(k.evidence ?? []).some((e) => isSafeUrl(e?.url ?? '')) && (
                      <ul className="mt-1 flex flex-wrap gap-1.5">
                        {k.evidence
                          .filter((e) => isSafeUrl(e?.url ?? ''))
                          .map((e, i) => (
                            <li key={i}>
                              <a
                                href={e.url}
                                target="_blank"
                                rel="noopener noreferrer nofollow"
                                className="inline-flex max-w-[16rem] items-center gap-1 truncate rounded-md bg-muted px-2 py-0.5 text-xs hover:underline"
                              >
                                <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />{' '}
                                <span className="truncate">{e.label || e.url}</span>
                              </a>
                            </li>
                          ))}
                      </ul>
                    )}
                  </div>
                  {!closed && (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit the check-in for ${fmtDay(k.checkin_date, 'd MMM')}`}
                        onClick={() => onEditCheckin(k)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove the check-in for ${fmtDay(k.checkin_date, 'd MMM')}`}
                        disabled={pending}
                        onClick={() => run(() => removeCheckin(k.id))}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          {!closed && (
            <Button variant="outline" size="sm" onClick={() => onEdit(c)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          )}
          {c.status === 'active' && (
            <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => pauseChallenge(c.id, today))}>
              <Pause className="h-4 w-4" /> Pause
            </Button>
          )}
          {c.status === 'paused' && (
            <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => resumeChallenge(c.id, today))}>
              <Play className="h-4 w-4" /> Resume
            </Button>
          )}
          {!closed && (
            <Button variant="outline" size="sm" onClick={finish}>
              <Check className="h-4 w-4" /> Finish now
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={saveTemplate}>
            <Save className="h-4 w-4" /> Save as template
          </Button>
          {!closed && (
            <Button variant="ghost" size="sm" onClick={cancel}>
              Cancel challenge
            </Button>
          )}
          <Button variant="ghost" size="sm" className="ml-auto text-danger" onClick={remove}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
