import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, CircleDashed, FlaskConical, MinusCircle, XCircle } from 'lucide-react'
import { validateWorkflow } from '@lifetrack/core/automation'
import { effectCounts, planRun, sampleChoices, sampleOccurrence } from '@lifetrack/core/automationEngine'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/misc'
import { Field, Select } from '@/components/ui/form'
import { useTables } from '@/hooks/store'
import { useSettings } from '@/hooks/useSettings'
import { useToday } from '@/hooks/useToday'
import { cn } from '@/lib/utils'
import { SAMPLE_TABLES } from './useAutomation'

const ICON = {
  planned: [CheckCircle2, 'text-success'],
  ok: [CheckCircle2, 'text-success'],
  skipped: [MinusCircle, 'text-muted-foreground'],
  failed: [XCircle, 'text-danger'],
}

/**
 * "Test workflow": works out what a run would do, on one of your own rows (or an invented sample), and lists it. It uses the same planner the
 * real runs use, and writes nothing at all.
 */
export function TestDialog({ open, onOpenChange, workflow }) {
  const { data } = useTables(...SAMPLE_TABLES)
  const { settings } = useSettings()
  const today = useToday()
  const [pick, setPick] = useState('')
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    if (open) setNowMs(Date.now()) // "now" is when the test was opened
  }, [open])
  const src = useMemo(
    () => ({
      tasks: data.tasks,
      habits: data.habits,
      habitLogs: data.habit_logs,
      habitPauses: data.habit_pauses,
      goals: data.goals,
      milestones: data.milestones,
      sessions: data.study_sessions,
      reminders: data.reminders,
      events: data.calendar_events,
      exceptions: data.calendar_event_exceptions,
    }),
    [data],
  )
  const ctx = useMemo(
    () => ({ today, tz: settings.timezone, nowMs, weekStartsOn: settings.week_starts_on, automationIds: new Set() }),
    [today, nowMs, settings.timezone, settings.week_starts_on],
  )
  const valid = useMemo(() => validateWorkflow(workflow), [workflow])
  const choices = useMemo(() => sampleChoices(workflow, src), [workflow, src])
  const result = useMemo(() => {
    if (!valid.ok) return null
    const occ = sampleOccurrence(workflow, src, ctx, pick)
    return occ ? { occ, plan: planRun({ ...workflow, id: workflow.id ?? 'preview' }, occ, src, ctx) } : null
  }, [valid.ok, workflow, src, ctx, pick])
  const counts = result ? effectCounts(result.plan.steps) : {}

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Test workflow"
      description="What would happen if this ran now. Nothing is saved or changed."
      className="md:max-w-xl"
    >
      <div className="space-y-4 overflow-y-auto px-5 pb-5">
        {!valid.ok ? (
          <div role="alert" className="rounded-lg border border-danger/40 bg-danger/5 p-3 text-[13px]">
            <p className="font-medium text-danger">Fix these first</p>
            <ul className="mt-1 list-disc pl-5 text-muted-foreground">
              {valid.errors.slice(0, 6).map((e) => (
                <li key={e.message}>{e.message}</li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            {choices.length > 0 && (
              <Field label="Try it on">
                <Select value={pick} onChange={(e) => setPick(e.target.value)}>
                  <option value="">{choices[0].label} (first one)</option>
                  {choices.slice(1).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {result?.occ.synthetic && <Badge tone="warning">You have no matching data yet, so this uses an invented sample</Badge>}
            {result && (
              <>
                <p className="flex items-center gap-2 text-sm font-medium" role="status">
                  <FlaskConical className="h-4 w-4 text-mod-text" aria-hidden />
                  {result.plan.status === 'planned' ? 'It would do this:' : `It would be skipped: ${result.plan.reason}`}
                </p>
                <ol className="space-y-1.5" aria-label="Test result">
                  {result.plan.steps.map((s, i) => {
                    const [Icon, tone] = ICON[s.status] ?? [CircleDashed, 'text-muted-foreground']
                    return (
                      <li key={`${s.node_id}-${i}`} className="flex gap-2.5 text-[13px]">
                        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone)} aria-hidden />
                        <div className="min-w-0">
                          <p className={cn(s.status === 'skipped' && 'text-muted-foreground')}>
                            {s.status === 'planned' && s.type === 'action' ? 'Would: ' : ''}
                            {s.detail}
                          </p>
                          {s.checks?.map((c, j) => (
                            <p key={j} className="text-xs text-muted-foreground">
                              {c.pass ? '✓' : '✗'} {c.label}: {String(c.actual)}
                            </p>
                          ))}
                        </div>
                      </li>
                    )
                  })}
                </ol>
                {Object.keys(counts).length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    A real run would write:{' '}
                    {Object.entries(counts)
                      .map(([k, n]) => `${n} ${k}`)
                      .join(', ')}
                    .
                  </p>
                )}
              </>
            )}
          </>
        )}
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
