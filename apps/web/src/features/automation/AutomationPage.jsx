import { useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, History, PauseCircle, Plus, Power, Sparkles, Workflow, XCircle } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { FirstUseHint } from '@/components/shared/FirstUseHint'
import { DataGate, EmptyState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/misc'
import { Segmented } from '@/components/ui/misc'
import { Switch } from '@/components/ui/form'
import { AnimatedValue } from '@/components/motion/primitives'
import { useSettings } from '@/hooks/useSettings'
import { cn } from '@/lib/utils'
import { Templates } from './Templates'
import { WorkflowCard } from './WorkflowCard'
import { ago, statusMeta } from './format'
import { useAutomationData } from './useAutomation'
import { useWorkflowActions } from './useWorkflowActions'

function Stat({ icon: Icon, label, value, tone = 'bg-mod/15 text-mod-text' }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-card/50 px-3.5 py-3">
      <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg', tone)}>
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

export default function AutomationPage() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'templates' ? 'templates' : 'workflows'
  const { workflows, executions, lastRun, paused, stats, loading, error, refetch } = useAutomationData()
  const { settings } = useSettings()
  const act = useWorkflowActions()
  const recent = useMemo(() => executions.filter((e) => e.status !== 'pending').slice(0, 5), [executions])

  return (
    <div className="mx-auto max-w-6xl 2xl:max-w-[90rem]">
      <PageHeader
        title="Automation Studio"
        description="Rules that do the repetitive things for you: when this happens, if that is true, do this."
        icon={Workflow}
        actions={
          <>
            <Button variant="outline" onClick={() => nav('/automation/history')}>
              <History className="h-4 w-4" aria-hidden /> History
            </Button>
            <Button onClick={() => nav('/automation/new')}>
              <Plus className="h-4 w-4" aria-hidden /> Quick create
            </Button>
          </>
        }
      />
      <FirstUseHint id="automation" title="Automate the routine parts">
        A workflow runs when its trigger happens, but only while LifeTrack is open. Start from a template, then test it before turning it
        on.
      </FirstUseHint>
      <DataGate loading={loading} error={error} onRetry={refetch} cards={4}>
        <div className="space-y-5">
          <section aria-label="Overview" className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
            <Stat icon={Workflow} label="Workflows" value={stats.total} />
            <Stat icon={Power} label="Active" value={stats.active} tone="bg-success/15 text-success" />
            <Stat icon={PauseCircle} label="Disabled" value={stats.disabled} tone="bg-muted text-muted-foreground" />
            <Stat icon={CheckCircle2} label="Successful runs" value={stats.completed} tone="bg-success/15 text-success" />
            <Stat
              icon={XCircle}
              label="Failed runs"
              value={stats.failed}
              tone={stats.failed ? 'bg-danger/15 text-danger' : 'bg-muted text-muted-foreground'}
            />
          </section>

          <Card className={cn('flex flex-wrap items-center justify-between gap-3 p-3.5', paused && 'border-warning/50 bg-warning/5')}>
            <div className="min-w-0">
              <p className="text-sm font-medium">{paused ? 'All automations are paused' : 'Automations are running'}</p>
              <p className="text-xs text-muted-foreground">
                {paused
                  ? 'Nothing new starts until you resume. Runs already started finish.'
                  : 'They run while LifeTrack is open on any of your devices, in your timezone (' + settings.timezone + ').'}
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              Pause all
              <Switch checked={paused} onChange={act.setPaused} label="Pause all automations" />
            </label>
          </Card>

          <div className="flex items-center justify-between gap-3">
            <Segmented
              value={tab}
              onChange={(v) => setParams(v === 'templates' ? { tab: 'templates' } : {}, { replace: true })}
              options={[
                { value: 'workflows', label: `Workflows${stats.total ? ` · ${stats.total}` : ''}` },
                { value: 'templates', label: 'Templates' },
              ]}
            />
          </div>

          {tab === 'templates' ? (
            <Templates />
          ) : (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <section aria-label="Workflows" className="space-y-2.5">
                {workflows.length === 0 ? (
                  <EmptyState
                    icon={Workflow}
                    title="No automations yet"
                    description="Start from a template (a daily reminder, a missed-habit recovery task, a weekly review) and edit it, or build your own from a blank canvas."
                    action={
                      <div className="flex flex-wrap justify-center gap-2">
                        <Button onClick={() => setParams({ tab: 'templates' })}>
                          <Sparkles className="h-4 w-4" aria-hidden /> Browse templates
                        </Button>
                        <Button variant="outline" onClick={() => nav('/automation/new')}>
                          <Plus className="h-4 w-4" aria-hidden /> Blank workflow
                        </Button>
                      </div>
                    }
                  />
                ) : (
                  workflows.map((w) => <WorkflowCard key={w.id} workflow={w} last={lastRun.get(w.id)} act={act} />)
                )}
              </section>
              <aside aria-label="Recently executed" className="space-y-2">
                <h2 className="text-sm font-semibold">Recently executed</h2>
                {recent.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">
                    Nothing has run yet. Runs show up here as they happen.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {recent.map((e) => {
                      const s = statusMeta(e.status)
                      return (
                        <li key={e.id}>
                          <Link
                            to="/automation/history"
                            className="flex items-center gap-2.5 rounded-lg border border-border/70 bg-card/50 px-3 py-2 text-[13px] transition-colors hover:bg-muted/50"
                          >
                            <s.icon className={cn('h-4 w-4 shrink-0', s.text)} aria-hidden />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">{e.workflow_name || 'Deleted workflow'}</span>
                              <span className="block truncate text-xs text-muted-foreground">{e.trigger_info?.label || s.label}</span>
                            </span>
                            <span className="shrink-0 text-[11px] text-muted-foreground">{ago(e.created_at)}</span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
                <Badge tone="neutral" className="mt-1">
                  Runs only while the app is open
                </Badge>
              </aside>
            </div>
          )}
        </div>
      </DataGate>
    </div>
  )
}
