import { useState } from 'react'
import { Bar, BarChart, Cell, ErrorBar } from 'recharts'
import { FlaskConical, Pause, Play, Plus, Square } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog } from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/misc'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { EmptyState, DataGate } from '@/components/shared/states'
import { Chart, grid, tooltip, xAxis, yAxis, PALETTE } from '@/components/shared/charts'
import { useConfirm } from '@/components/shared/Confirm'
import { useLoad } from '@/hooks/useLoad'
import { summariseExperiment, validateVariants } from '@lifetrack/core/flags'
import { adminExperiments, experimentResults, saveExperiment, setExperimentStatus } from '@/services/platform'
import { stamp } from '@/features/developers/shared'

const TONE = { draft: 'neutral', running: 'success', paused: 'warning', completed: 'primary' }
const pct = (v, dp = 1) => (v == null ? '—' : `${(v * 100).toFixed(dp)}%`)

function Results({ exp }) {
  const { data, loading, error, reload } = useLoad(() => experimentResults(exp.key), [exp.key, exp.status])
  const sum = data ? summariseExperiment(data.rows, data.variants) : null
  const chart =
    sum?.variants.map((v) => ({
      variant: v.variant,
      rate: v.rate == null ? 0 : Number((v.rate * 100).toFixed(2)),
      err: v.interval ? [Number(((v.rate - v.interval[0]) * 100).toFixed(2)), Number(((v.interval[1] - v.rate) * 100).toFixed(2))] : [0, 0],
    })) ?? []
  return (
    <DataGate loading={loading && !data} error={error?.message} onRetry={reload} skeleton="chart">
      {sum && (
        <div className="space-y-4" data-testid="experiment-results">
          <p className="text-sm text-muted-foreground" role="note">
            {sum.note}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  {[
                    'Variant',
                    'Participants',
                    'Share (target)',
                    `Conversions (${data.primary_event})`,
                    'Rate',
                    '95% range',
                    'vs control',
                  ].map((h) => (
                    <th key={h} scope="col" className="py-1 pr-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sum.variants.map((v) => (
                  <tr key={v.variant} className="border-t border-border/60">
                    <th scope="row" className="py-1.5 pr-3 font-medium">
                      {v.variant}
                    </th>
                    <td className="pr-3">{v.participants.toLocaleString()}</td>
                    <td className="pr-3">
                      {pct(v.share, 0)} ({pct(v.expectedShare, 0)})
                    </td>
                    <td className="pr-3">{v.conversions.toLocaleString()}</td>
                    <td className="pr-3">{pct(v.rate)}</td>
                    <td className="pr-3">{v.interval ? `${pct(v.interval[0])} – ${pct(v.interval[1])}` : '—'}</td>
                    <td>
                      {v.differencePoints == null ? '—' : `${v.differencePoints > 0 ? '+' : ''}${v.differencePoints.toFixed(1)} points`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Chart
            height={180}
            empty={!sum.total}
            emptyText="Nobody has been enrolled yet."
            summary="Conversion rate by variant with 95% ranges"
          >
            <BarChart data={chart}>
              {grid()}
              {xAxis({ dataKey: 'variant' })}
              {yAxis({ unit: '%', width: 44 })}
              {tooltip()}
              <Bar dataKey="rate" name="Conversion rate (%)" radius={[4, 4, 0, 0]}>
                {chart.map((c, i) => (
                  <Cell key={c.variant} fill={PALETTE[i % PALETTE.length]} />
                ))}
                <ErrorBar dataKey="err" width={6} strokeWidth={1.5} stroke="currentColor" />
              </Bar>
            </BarChart>
          </Chart>
        </div>
      )}
    </DataGate>
  )
}

function ExperimentDialog({ flags, existing, onClose, onSaved }) {
  const experimentFlags = flags.filter((f) => f.kind === 'experiment' && !f.archived && !f.protected)
  const [e, setE] = useState(
    existing
      ? {
          key: existing.key,
          flagKey: existing.flag_key,
          name: existing.name,
          hypothesis: existing.hypothesis,
          traffic: String(Number(existing.traffic_percent)),
          primaryEvent: existing.primary_event,
          treatment: String(existing.variants.find((v) => v.key !== 'control')?.weight ?? 50),
        }
      : {
          key: '',
          flagKey: experimentFlags[0]?.key ?? '',
          name: '',
          hypothesis: '',
          traffic: '100',
          primaryEvent: 'conversion',
          treatment: '50',
        },
  )
  const [busy, setBusy] = useState(false)
  const variants = [
    { key: 'control', weight: 100 - Number(e.treatment) },
    { key: 'treatment', weight: Number(e.treatment) },
  ]
  const problems = validateVariants(variants)
  const save = async () => {
    setBusy(true)
    try {
      await saveExperiment({ ...e, traffic: Number(e.traffic), variants })
      toast.success('Experiment saved as a draft. It is off until you start it and switch its flag on.')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={existing ? 'Edit experiment' : 'New experiment'}
      description="An experiment compares what people do with the treatment against a control group. It does not run until it is started and its flag is on."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy} disabled={!e.key || !e.name || !e.flagKey || problems.length > 0}>
            Save draft
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {!experimentFlags.length && (
          <p className="rounded-md bg-warning/10 p-2 text-xs">
            Create a flag of the kind “experiment” first: the experiment is switched on and off through it.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Key">
            <Input
              value={e.key}
              disabled={!!existing}
              onChange={(x) => setE({ ...e, key: x.target.value.trim() })}
              placeholder="checkout_copy"
            />
          </Field>
          <Field label="Flag">
            <Select value={e.flagKey} onChange={(x) => setE({ ...e, flagKey: x.target.value })}>
              {experimentFlags.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.key}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Name">
          <Input value={e.name} onChange={(x) => setE({ ...e, name: x.target.value })} maxLength={80} />
        </Field>
        <Field label="Hypothesis" hint="What do you expect, and why? Written before the numbers come in.">
          <Textarea rows={2} value={e.hypothesis} onChange={(x) => setE({ ...e, hypothesis: x.target.value })} maxLength={500} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Traffic %" hint="Share of eligible people enrolled">
            <Input type="number" min="0" max="100" value={e.traffic} onChange={(x) => setE({ ...e, traffic: x.target.value })} />
          </Field>
          <Field label="Treatment %" hint={`Control gets ${100 - Number(e.treatment || 0)}%`}>
            <Input type="number" min="1" max="99" value={e.treatment} onChange={(x) => setE({ ...e, treatment: x.target.value })} />
          </Field>
          <Field label="Goal event" hint="Reported by the app">
            <Input value={e.primaryEvent} onChange={(x) => setE({ ...e, primaryEvent: x.target.value.trim() })} />
          </Field>
        </div>
        {problems.length > 0 && (
          <ul role="alert" className="list-disc pl-5 text-xs text-danger">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  )
}

export function ExperimentsTab({ flags, controls }) {
  const confirm = useConfirm()
  const { data, loading, error, reload } = useLoad(adminExperiments, [])
  const [editing, setEditing] = useState(null) // {} for new, an experiment to edit
  const [open, setOpen] = useState(null)
  const move = async (x, status, verb) => {
    const ok = await confirm({
      title: `${verb} “${x.name}”?`,
      description:
        status === 'running'
          ? 'People start being assigned to the variants (once its flag is on). Assignments are stable: the same person always sees the same variant.'
          : status === 'completed'
            ? 'Nobody new is enrolled and the results stop changing. A completed experiment cannot be restarted.'
            : 'Nobody new is enrolled while it is paused. People already enrolled keep their variant.',
      confirmLabel: verb,
      destructive: status === 'completed',
    })
    if (!ok) return
    try {
      await setExperimentStatus(x.key, status, verb)
      toast.success(`“${x.name}” is now ${status}.`)
      reload()
    } catch (e) {
      toast.error(e.message)
    }
  }
  return (
    <div className="space-y-4">
      {controls.experiments_disabled && (
        <p role="status" className="rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
          All experiments are switched off by an emergency control. Nobody is being enrolled.
        </p>
      )}
      <div className="flex justify-end">
        <Button onClick={() => setEditing({})}>
          <Plus className="h-4 w-4" aria-hidden /> New experiment
        </Button>
      </div>
      <DataGate loading={loading && !data} error={error?.message} onRetry={reload} skeleton="list">
        {data && !data.length ? (
          <EmptyState
            icon={FlaskConical}
            title="No experiments yet"
            description="Create a flag of the kind “experiment”, then an experiment on it. Experiments are off until you start them."
          />
        ) : (
          data?.map((x) => (
            <Card key={x.key} data-testid={`experiment-${x.key}`}>
              <CardHeader className="flex-wrap gap-2">
                <CardTitle as="h3" className="flex flex-wrap items-center gap-2">
                  {x.name} <Badge tone={TONE[x.status]}>{x.status}</Badge>
                  <code className="text-xs font-normal text-muted-foreground">{x.key}</code>
                </CardTitle>
                <span className="flex flex-wrap gap-2">
                  {x.status === 'draft' && (
                    <Button size="sm" variant="outline" onClick={() => setEditing(x)}>
                      Edit
                    </Button>
                  )}
                  {(x.status === 'draft' || x.status === 'paused') && (
                    <Button size="sm" onClick={() => move(x, 'running', x.status === 'draft' ? 'Start' : 'Resume')}>
                      <Play className="h-3.5 w-3.5" aria-hidden /> {x.status === 'draft' ? 'Start' : 'Resume'}
                    </Button>
                  )}
                  {x.status === 'running' && (
                    <Button size="sm" variant="outline" onClick={() => move(x, 'paused', 'Pause')}>
                      <Pause className="h-3.5 w-3.5" aria-hidden /> Pause
                    </Button>
                  )}
                  {(x.status === 'running' || x.status === 'paused') && (
                    <Button size="sm" variant="outline" onClick={() => move(x, 'completed', 'Complete')}>
                      <Square className="h-3.5 w-3.5" aria-hidden /> Complete
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setOpen(open === x.key ? null : x.key)} aria-expanded={open === x.key}>
                    {open === x.key ? 'Hide results' : 'Results'}
                  </Button>
                </span>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Flag <code>{x.flag_key}</code> · {Number(x.traffic_percent)}% of eligible people ·{' '}
                  {x.variants.map((v) => `${v.key} ${v.weight}%`).join(' / ')} · goal “{x.primary_event}” ·{' '}
                  {x.participants.toLocaleString()} participants{x.started_at ? ` · started ${stamp(x.started_at)}` : ''}
                </p>
                {x.hypothesis && <p className="text-sm">{x.hypothesis}</p>}
                {open === x.key && <Results exp={x} />}
              </CardContent>
            </Card>
          ))
        )}
      </DataGate>
      {editing && (
        <ExperimentDialog flags={flags} existing={editing.key ? editing : null} onClose={() => setEditing(null)} onSaved={reload} />
      )}
    </div>
  )
}
