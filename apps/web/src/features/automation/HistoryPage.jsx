import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, RotateCcw, Workflow } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate, EmptyState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge, Segmented } from '@/components/ui/misc'
import { Field, Input, Select } from '@/components/ui/form'
import { triggerDef } from '@lifetrack/core/automation'
import { cn } from '@/lib/utils'
import { dateStrInTz } from '@/lib/dates'
import { useSettings } from '@/hooks/useSettings'
import { useAction } from '@/hooks/useAction'
import { retryExecution } from '@/services/api'
import { todayStr } from '@/lib/dates'
import { ExecutionDetail } from './ExecutionDetail'
import { statusMeta, when } from './format'
import { useAutomationData } from './useAutomation'

const PAGE = 25

function Row({ e, tz, open, onToggle }) {
  const s = statusMeta(e.status)
  const trig = triggerDef(e.trigger_kind)
  const [retry, retrying] = useAction(() => retryExecution(e.id, { today: todayStr(tz) }), { success: 'Retried' })
  const ok = (e.steps ?? []).filter((x) => x.type === 'action' && x.status === 'ok').length
  return (
    <Card className="overflow-hidden p-0" data-testid="execution">
      <div className="flex items-center gap-3 px-3.5 py-3">
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <s.icon className={cn('h-5 w-5 shrink-0', s.text)} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2">
              <span className="truncate text-sm font-semibold">{e.workflow_name || 'Deleted workflow'}</span>
              <Badge tone={s.tone}>{s.label}</Badge>
              {e.attempt > 1 && <Badge>Attempt {e.attempt}</Badge>}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {when(e.created_at, tz)} · {trig?.label ?? e.trigger_kind}
              {e.trigger_info?.label ? ` · ${e.trigger_info.label}` : ''}
              {e.status === 'completed' ? ` · ${ok} action${ok === 1 ? '' : 's'} done` : ''}
              {e.status === 'failed' && e.error ? ` · ${e.error}` : ''}
              {e.status === 'skipped' && e.reason ? ` · ${e.reason}` : ''}
            </span>
          </span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
        {e.status === 'failed' && (e.steps ?? []).some((x) => x.status === 'failed' || x.status === 'planned') && (
          <Button size="sm" variant="outline" loading={retrying} onClick={() => retry()}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Retry
          </Button>
        )}
      </div>
      {open && <ExecutionDetail execution={e} tz={tz} />}
    </Card>
  )
}

/** Every run, newest first, with the filters that answer "what happened, and why?". */
export default function HistoryPage() {
  const { settings } = useSettings()
  const tz = settings.timezone
  const { workflows, executions, loading, error, refetch } = useAutomationData()
  const [status, setStatus] = useState('all')
  const [workflow, setWorkflow] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [open, setOpen] = useState(null)
  const [shown, setShown] = useState(PAGE)

  const rows = useMemo(
    () =>
      executions.filter((e) => {
        if (status !== 'all' && e.status !== status) return false
        if (workflow && e.workflow_id !== workflow) return false
        const day = dateStrInTz(e.created_at, tz)
        return (!from || day >= from) && (!to || day <= to)
      }),
    [executions, status, workflow, from, to, tz],
  )
  const reset = () => {
    setStatus('all')
    setWorkflow('')
    setFrom('')
    setTo('')
    setShown(PAGE)
  }
  const filtered = status !== 'all' || workflow || from || to

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Automation history"
        description="Every run, what it did, and why it succeeded, failed or was skipped."
        icon={Workflow}
        actions={
          <Link to="/automation" className="text-sm font-medium text-mod-text underline-offset-2 hover:underline">
            Back to Automation Studio
          </Link>
        }
      />
      <DataGate loading={loading} error={error} onRetry={refetch} cards={4}>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Segmented
            value={status}
            onChange={(v) => {
              setStatus(v)
              setShown(PAGE)
            }}
            options={[
              { value: 'all', label: 'All' },
              { value: 'completed', label: 'Successful' },
              { value: 'failed', label: 'Failed' },
              { value: 'skipped', label: 'Skipped' },
            ]}
          />
          <Field label="Workflow" className="w-48">
            <Select
              value={workflow}
              onChange={(e) => {
                setWorkflow(e.target.value)
                setShown(PAGE)
              }}
            >
              <option value="">All workflows</option>
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="From" className="w-40">
            <Input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => {
                setFrom(e.target.value)
                setShown(PAGE)
              }}
            />
          </Field>
          <Field label="To" className="w-40">
            <Input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => {
                setTo(e.target.value)
                setShown(PAGE)
              }}
            />
          </Field>
          {filtered && (
            <Button variant="ghost" size="sm" onClick={reset}>
              Clear filters
            </Button>
          )}
        </div>
        {rows.length === 0 ? (
          <EmptyState
            icon={Workflow}
            title={filtered ? 'No runs match these filters' : 'Nothing has run yet'}
            description={
              filtered
                ? 'Try a wider date range or another status.'
                : 'When an automation runs, it is recorded here with every step it took.'
            }
            action={
              filtered ? (
                <Button variant="outline" onClick={reset}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground" role="status">
              {rows.length} run{rows.length === 1 ? '' : 's'}
            </p>
            {rows.slice(0, shown).map((e) => (
              <Row key={e.id} e={e} tz={tz} open={open === e.id} onToggle={() => setOpen(open === e.id ? null : e.id)} />
            ))}
            {rows.length > shown && (
              <Button variant="outline" className="w-full" onClick={() => setShown((n) => n + PAGE)}>
                Show more
              </Button>
            )}
          </div>
        )}
      </DataGate>
    </div>
  )
}
