import { useMemo, useState } from 'react'
import { FlaskConical, Flag, History as HistoryIcon, OctagonAlert, Plus, Search, ShieldAlert, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate, EmptyState } from '@/components/shared/states'
import { StatCard } from '@/components/shared/StatCard'
import { useConfirm } from '@/components/shared/Confirm'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge, Segmented } from '@/components/ui/misc'
import { Input, Select, Switch } from '@/components/ui/form'
import { useLoad } from '@/hooks/useLoad'
import { ENVIRONMENTS } from '@lifetrack/core/flags'
import { adminFlags, isPlatformAdmin, platformAvailable, setFlagEnv } from '@/services/platform'
import { UnavailableState, ago } from '@/features/developers/shared'
import { currentEnv } from '@/services/flags'
import { FlagDialog, CreateFlagDialog } from './FlagDialogs'
import { ExperimentsTab } from './ExperimentsTab'
import { ControlsTab } from './ControlsTab'
import { HistoryTab } from './HistoryTab'

/** What a flag does in one environment, in words. */
export function flagState(flag, env) {
  if (flag.protected) return { label: 'Always on', tone: 'success', key: 'protected' }
  if (flag.archived) return { label: 'Archived', tone: 'neutral', key: 'archived' }
  const e = flag.envs?.[env]
  if (!e?.enabled) return { label: 'Off', tone: 'neutral', key: 'off' }
  if (Number(e.rollout_percent) < 100) return { label: `${Number(e.rollout_percent)}% rollout`, tone: 'warning', key: 'rollout' }
  return { label: e.roles?.length ? `On · ${e.roles.join(', ')}` : 'On', tone: 'success', key: 'on' }
}

function FlagsTab({ data, reload, env, setEnv }) {
  const confirm = useConfirm()
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('')
  const [state, setState] = useState('')
  const [open, setOpen] = useState(null)
  const [creating, setCreating] = useState(false)
  const flags = data.flags
  const shown = useMemo(
    () =>
      flags.filter((f) => {
        const text = `${f.key} ${f.name} ${f.description}`.toLowerCase()
        return (!q || text.includes(q.trim().toLowerCase())) && (!kind || f.kind === kind) && (!state || flagState(f, env).key === state)
      }),
    [flags, q, kind, state, env],
  )
  const toggle = async (f, on) => {
    const prod = env === 'production'
    const ok = await confirm({
      title: `${on ? 'Turn on' : 'Turn off'} “${f.name}” in ${env}?`,
      description: prod
        ? `This changes what real people see ${on ? 'within about a minute' : 'right away on their next refresh'}. The change is written to the history and can be rolled back.`
        : `This changes the ${env} environment only. It is written to the history.`,
      confirmLabel: on ? 'Turn on' : 'Turn off',
      destructive: !on,
    })
    if (!ok) return
    try {
      await setFlagEnv(f.key, env, { enabled: on }, on ? 'Turned on' : 'Turned off')
      toast.success(`“${f.name}” is ${on ? 'on' : 'off'} in ${env}.`)
      reload()
    } catch (e) {
      toast.error(e.message)
    }
  }
  const counts = flags.filter((f) => !f.protected && !f.archived)
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Flag}
          label="Flags"
          value={String(flags.length)}
          sub={`${flags.filter((f) => f.protected).length} protected · ${flags.filter((f) => f.archived).length} archived`}
        />
        <StatCard
          icon={ShieldCheck}
          label={`On in ${env}`}
          value={String(counts.filter((f) => flagState(f, env).key === 'on').length)}
          sub="Fully rolled out"
        />
        <StatCard
          icon={FlaskConical}
          label="In rollout"
          value={String(counts.filter((f) => flagState(f, env).key === 'rollout').length)}
          sub={`Partly on in ${env}`}
        />
        <StatCard
          icon={OctagonAlert}
          label="Emergency controls"
          value={
            data.controls.global_disable || data.controls.experiments_disabled || data.controls.disabled_modules.length ? 'Active' : 'Off'
          }
          sub={data.controls.reason || 'Nothing is switched off'}
          tone={data.controls.global_disable ? 'danger' : 'primary'}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            className="pl-9"
            placeholder="Search flags by name, key or description"
            aria-label="Search flags"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select className="w-36" aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All kinds</option>
          <option value="release">Release</option>
          <option value="experiment">Experiment</option>
          <option value="ops">Operational</option>
        </Select>
        <Select className="w-40" aria-label="State" value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">Any state</option>
          <option value="on">On</option>
          <option value="rollout">In rollout</option>
          <option value="off">Off</option>
          <option value="archived">Archived</option>
        </Select>
        <Segmented aria-label="Environment" value={env} onChange={setEnv} options={ENVIRONMENTS.map((e) => ({ value: e, label: e }))} />
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" aria-hidden /> New flag
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          {!shown.length ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              No flags match. {flags.length ? 'Clear a filter to see them all.' : 'Create the first one.'}
            </p>
          ) : (
            <ul className="divide-y divide-border/60" aria-label="Feature flags">
              {shown.map((f) => {
                const st = flagState(f, env)
                const on = flagState(f, env).key !== 'off' && st.key !== 'archived'
                return (
                  <li key={f.key} className="flex flex-wrap items-center gap-3 p-4" data-testid={`flag-${f.key}`}>
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(f.key)} aria-label={`Open ${f.name}`}>
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{f.name}</span>
                        <Badge tone={st.tone}>{st.label}</Badge>
                        <Badge>{f.kind}</Badge>
                        {f.module && <Badge>module: {f.module}</Badge>}
                      </span>
                      <code className="text-xs text-muted-foreground">{f.key}</code>
                      {f.description && <span className="mt-0.5 block text-xs text-muted-foreground">{f.description}</span>}
                    </button>
                    <span className="text-xs text-muted-foreground">
                      {f.protected ? 'cannot be switched off' : `changed ${ago(f.envs?.[env]?.updated_at ?? f.updated_at)}`}
                    </span>
                    <Switch
                      checked={on}
                      label={`${f.name} in ${env}`}
                      onChange={f.protected || f.archived ? () => {} : (v) => toggle(f, v)}
                    />
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
      {open && <FlagDialog flag={flags.find((f) => f.key === open)} env={env} onClose={() => setOpen(null)} onChanged={reload} />}
      {creating && <CreateFlagDialog onClose={() => setCreating(false)} onCreated={reload} />}
    </div>
  )
}

function Manager() {
  const { data, loading, error, reload } = useLoad(adminFlags, [])
  const [tab, setTab] = useState('flags')
  const [env, setEnv] = useState(currentEnv())
  return (
    <>
      <Segmented
        className="mb-4"
        aria-label="Feature management section"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'flags', label: 'Flags' },
          { value: 'experiments', label: 'Experiments' },
          { value: 'controls', label: 'Emergency controls' },
          { value: 'history', label: 'History' },
        ]}
      />
      <DataGate loading={loading && !data} error={error?.message} onRetry={reload} skeleton="page">
        {data && tab === 'flags' && <FlagsTab data={data} reload={reload} env={env} setEnv={setEnv} />}
        {data && tab === 'experiments' && <ExperimentsTab flags={data.flags} controls={data.controls} />}
        {data && tab === 'controls' && <ControlsTab data={data} reload={reload} />}
        {data && tab === 'history' && <HistoryTab flags={data.flags} reloadFlags={reload} />}
      </DataGate>
    </>
  )
}

export default function FeaturesPage() {
  const available = platformAvailable()
  const { data: admin, loading } = useLoad(isPlatformAdmin, [], { enabled: available })
  return (
    <>
      <PageHeader
        title="Feature Management"
        description="Switch features on for some people or everyone, roll them out gradually, run experiments, and stop things in an emergency."
        icon={HistoryIcon}
      />
      {!available ? (
        <UnavailableState />
      ) : loading ? (
        <DataGate loading skeleton="page" />
      ) : !admin ? (
        <EmptyState
          icon={ShieldAlert}
          title="Administrator access required"
          description="Feature flags change what everyone sees, so only administrators can open this page. An administrator is added by the project owner with one SQL statement (docs/FEATURE_FLAGS.md). The server checks this on every change, whatever this page shows."
        />
      ) : (
        <Manager />
      )}
    </>
  )
}
