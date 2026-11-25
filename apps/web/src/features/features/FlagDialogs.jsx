import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/misc'
import { Checkbox, Field, Input, Select, Switch, Textarea } from '@/components/ui/form'
import { useConfirm } from '@/components/shared/Confirm'
import { FLAG_KINDS, ROLES, validateEnvInput, validateFlagInput } from '@lifetrack/core/flags'
import { archiveFlag, createFlag, flagHistory, setFlagEnv, updateFlag } from '@/services/platform'
import { useLoad } from '@/hooks/useLoad'
import { stamp } from '@/features/developers/shared'

const ids = (text) => [
  ...new Set(
    text
      .split(/[\s,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  ),
]

export function CreateFlagDialog({ onClose, onCreated }) {
  const [f, setF] = useState({ key: '', name: '', description: '', kind: 'release', module: '' })
  const [busy, setBusy] = useState(false)
  const errors = f.key || f.name ? validateFlagInput(f) : []
  const save = async () => {
    setBusy(true)
    try {
      await createFlag(f)
      toast.success(`Flag “${f.name}” created. It is off in every environment.`)
      onCreated()
      onClose()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="New flag"
      description="A new flag starts switched off in every environment."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy} disabled={!f.key || !f.name || errors.length > 0}>
            Create flag
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Key" hint="Lowercase letters, digits and underscores, with optional dots: module.insights">
          <Input value={f.key} onChange={(e) => setF({ ...f, key: e.target.value.trim() })} placeholder="exp.new_card" />
        </Field>
        <Field label="Name">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={80} />
        </Field>
        <Field label="Description">
          <Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={500} rows={2} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kind" hint="Experiments can be stopped together with one control">
            <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
              {FLAG_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Module (optional)" hint="Lets a module be switched off in one go">
            <Input value={f.module} onChange={(e) => setF({ ...f, module: e.target.value.trim().toLowerCase() })} placeholder="insights" />
          </Field>
        </div>
        {errors.length > 0 && (
          <ul role="alert" className="list-disc pl-5 text-xs text-danger">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  )
}

/** One flag: its details, the targeting of one environment (rollout, roles, allow and block lists) and its recent history. */
export function FlagDialog({ flag, env, onClose, onChanged }) {
  const confirm = useConfirm()
  const e = flag.envs?.[env] ?? { enabled: false, default_value: false, rollout_percent: 100, allow_users: [], block_users: [], roles: [] }
  const [meta, setMeta] = useState({ name: flag.name, description: flag.description, module: flag.module ?? '' })
  const [t, setT] = useState({
    enabled: e.enabled,
    rollout: String(Number(e.rollout_percent)),
    roles: e.roles ?? [],
    allow: (e.allow_users ?? []).join('\n'),
    block: (e.block_users ?? []).join('\n'),
    fallback: e.default_value,
  })
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const locked = flag.protected || flag.archived
  const patch = {
    enabled: t.enabled,
    default_value: t.fallback,
    rollout_percent: Number(t.rollout),
    roles: t.roles,
    allow_users: ids(t.allow),
    block_users: ids(t.block),
  }
  const problems = validateEnvInput(patch)
  const hist = useLoad(() => flagHistory({ key: flag.key, pageSize: 5 }), [flag.key])
  const run = async (fn, done) => {
    setBusy(true)
    try {
      await fn()
      toast.success(done)
      onChanged()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }
  const saveTargeting = async () => {
    const wider = e.enabled && Number(t.rollout) > Number(e.rollout_percent)
    if (env === 'production' && (t.enabled !== e.enabled || wider || t.enabled)) {
      const ok = await confirm({
        title: `Apply to production?`,
        description: `“${flag.name}” will be ${t.enabled ? `on for ${Number(t.rollout)}% of people${t.roles.length ? ` (${t.roles.join(', ')} only)` : ''}` : 'off'} in production. You can roll this back from the history.`,
        confirmLabel: 'Apply',
        destructive: false,
      })
      if (!ok) return
    }
    await run(() => setFlagEnv(flag.key, env, patch, reason), `Saved the ${env} settings.`)
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={flag.name}
      description={flag.key}
      className="max-w-2xl"
      footer={
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-5">
        {flag.protected && (
          <p className="rounded-md bg-success/10 p-3 text-sm" data-testid="protected-note">
            This is a protected part of the product. It is always on and no flag, emergency control or experiment can switch it off.
          </p>
        )}
        {flag.archived && (
          <p className="rounded-md bg-muted p-3 text-sm">
            Archived: it evaluates to its default and cannot be changed until it is restored.
          </p>
        )}

        <section aria-label="Details" className="space-y-3">
          <h3 className="text-sm font-semibold">Details</h3>
          <Field label="Name">
            <Input
              value={meta.name}
              disabled={flag.protected}
              onChange={(x) => setMeta({ ...meta, name: x.target.value })}
              maxLength={80}
            />
          </Field>
          <Field label="Description">
            <Textarea
              value={meta.description}
              disabled={flag.protected}
              onChange={(x) => setMeta({ ...meta, description: x.target.value })}
              rows={2}
              maxLength={500}
            />
          </Field>
          {!flag.protected && (
            <div className="flex items-end gap-2">
              <Field label="Module" className="flex-1" hint="Used by the module emergency control">
                <Input value={meta.module} onChange={(x) => setMeta({ ...meta, module: x.target.value.trim().toLowerCase() })} />
              </Field>
              <Button variant="outline" loading={busy} onClick={() => run(() => updateFlag(flag.key, meta), 'Details saved.')}>
                Save details
              </Button>
            </div>
          )}
        </section>

        {!flag.protected && (
          <section aria-label={`Targeting in ${env}`} className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              Targeting in <Badge tone="primary">{env}</Badge>
            </h3>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Enabled in {env}</span>
              <Switch checked={t.enabled} label={`Enabled in ${env}`} onChange={(v) => !locked && setT({ ...t, enabled: v })} />
            </label>
            <Field
              label={`Rollout: ${t.rollout}% of people`}
              hint="Each person is placed at a fixed point for this flag, so raising the number only adds people and nobody flips back and forth."
            >
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={t.rollout}
                disabled={locked}
                onChange={(x) => setT({ ...t, rollout: x.target.value })}
                className="w-full accent-[rgb(var(--primary))]"
                aria-label="Rollout percentage"
              />
            </Field>
            <div>
              <p className="mb-1 text-[13px] font-medium">Roles</p>
              <div className="flex gap-4">
                {ROLES.map((r) => (
                  <Checkbox
                    key={r}
                    label={r}
                    disabled={locked}
                    checked={t.roles.includes(r)}
                    onChange={(v) => setT({ ...t, roles: v ? [...t.roles, r] : t.roles.filter((x) => x !== r) })}
                  />
                ))}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">None ticked = everyone. Ticked = only those roles are eligible.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Always on for (user ids)" hint="One per line. Beats the rollout.">
                <Textarea rows={3} disabled={locked} value={t.allow} onChange={(x) => setT({ ...t, allow: x.target.value })} />
              </Field>
              <Field label="Never for (user ids)" hint="One per line. Beats everything else.">
                <Textarea rows={3} disabled={locked} value={t.block} onChange={(x) => setT({ ...t, block: x.target.value })} />
              </Field>
            </div>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Value for people outside the rollout</span>
              <Switch
                checked={t.fallback}
                label="Value for people outside the rollout"
                onChange={(v) => !locked && setT({ ...t, fallback: v })}
              />
            </label>
            <Field label="Reason (shown in the history)">
              <Input value={reason} onChange={(x) => setReason(x.target.value)} maxLength={200} placeholder="Why this change?" />
            </Field>
            {problems.length > 0 && (
              <ul role="alert" className="list-disc pl-5 text-xs text-danger">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap justify-between gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  const restore = flag.archived
                  if (
                    !restore &&
                    !(await confirm({
                      title: `Archive “${flag.name}”?`,
                      description: 'It evaluates to its default and stops being editable. Its history is kept and it can be restored.',
                      confirmLabel: 'Archive',
                    }))
                  )
                    return
                  run(() => archiveFlag(flag.key, !restore, reason), restore ? 'Restored.' : 'Archived.').then(onClose)
                }}
              >
                {flag.archived ? 'Restore flag' : 'Archive flag'}
              </Button>
              <Button onClick={saveTargeting} loading={busy} disabled={locked || problems.length > 0}>
                Save {env} settings
              </Button>
            </div>
          </section>
        )}

        <section aria-label="Recent changes" className="space-y-2">
          <h3 className="text-sm font-semibold">Recent changes</h3>
          {!hist.data?.items?.length ? (
            <p className="text-xs text-muted-foreground">No changes recorded yet.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {hist.data.items.map((h) => (
                <li key={h.id} className="flex flex-wrap gap-2 text-muted-foreground">
                  <span>{stamp(h.at)}</span>
                  <span className="text-foreground">{h.actor}</span>
                  <span>
                    {h.action}
                    {h.env ? ` (${h.env})` : ''}
                    {h.reason ? ` · ${h.reason}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Dialog>
  )
}
