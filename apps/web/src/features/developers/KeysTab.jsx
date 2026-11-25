import { useState } from 'react'
import { Area, AreaChart } from 'recharts'
import { toast } from 'sonner'
import { KeyRound, Pencil, Plus, Trash2 } from 'lucide-react'
import { DataGate, EmptyState } from '@/components/shared/states'
import { FormDialog } from '@/components/shared/FormDialog'
import { useConfirm } from '@/components/shared/Confirm'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/misc'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form'
import { Chart, grid, tooltip, xAxis, yAxis } from '@/components/shared/charts'
import { useLoad } from '@/hooks/useLoad'
import { useAction } from '@/hooks/useAction'
import { API_SCOPES } from '@lifetrack/core/platformApi'
import { apiUsage, createApiKey, listApiKeys, revokeApiKey, updateApiKey } from '@/services/platform'
import { SecretDialog, ago, stamp } from './shared'

const EXPIRY = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' },
  { value: '', label: 'Never expires' },
]
const state = (k) =>
  k.revoked_at
    ? { tone: 'neutral', label: 'Revoked' }
    : k.expires_at && Date.parse(k.expires_at) <= Date.now()
      ? { tone: 'warning', label: 'Expired' }
      : { tone: 'success', label: 'Active' }

function KeyForm({ open, onOpenChange, editing, onSaved }) {
  const [form, setForm] = useState(null)
  const f = form ?? {
    name: editing?.name ?? '',
    description: editing?.description ?? '',
    scopes: [],
    expires: '90',
    rate: String(editing?.rate_limit_per_min ?? 60),
  }
  const set = (patch) => setForm({ ...f, ...patch })
  const [errors, setErrors] = useState({})
  const [save, saving] = useAction(async () => {
    const e = {}
    if (!f.name.trim()) e.name = 'Give the key a name.'
    if (!editing && !f.scopes.length) e.scopes = 'Choose at least one permission.'
    const rate = Number(f.rate)
    if (!Number.isInteger(rate) || rate < 1 || rate > 600) e.rate = 'Enter a whole number from 1 to 600.'
    setErrors(e)
    if (Object.keys(e).length) return
    if (editing) {
      await updateApiKey(editing.id, { name: f.name.trim(), description: f.description, rateLimit: rate })
      toast.success('Key updated')
      onSaved(null)
    } else {
      onSaved(
        await createApiKey({
          name: f.name.trim(),
          description: f.description,
          scopes: f.scopes,
          expiresDays: f.expires ? Number(f.expires) : null,
          rateLimit: rate,
        }),
      )
    }
    setForm(null)
    onOpenChange(false)
  })
  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setForm(null)
          setErrors({})
        }
        onOpenChange(o)
      }}
      title={editing ? 'Edit API key' : 'New API key'}
      description={
        editing
          ? 'Permissions and expiry cannot change after creation. Create a new key if you need different ones.'
          : 'The key is shown once, right after you create it.'
      }
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      pending={saving}
      submitLabel={editing ? 'Save' : 'Create key'}
    >
      <Field label="Name" error={errors.name}>
        <Input value={f.name} maxLength={60} placeholder="e.g. Home server" onChange={(e) => set({ name: e.target.value })} />
      </Field>
      <Field label="Description (optional)">
        <Textarea rows={2} maxLength={300} value={f.description} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      {!editing && (
        <>
          <fieldset className="space-y-2">
            <legend className="text-[13px] font-medium">Permissions</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {API_SCOPES.map((s) => (
                <Checkbox
                  key={s.key}
                  checked={f.scopes.includes(s.key)}
                  label={
                    <span>
                      <span className="font-mono text-xs">{s.key}</span>
                      <span className="block text-xs text-muted-foreground">{s.label}</span>
                    </span>
                  }
                  onChange={(on) => set({ scopes: on ? [...f.scopes, s.key] : f.scopes.filter((x) => x !== s.key) })}
                />
              ))}
            </div>
            {errors.scopes && (
              <p role="alert" className="text-xs text-danger">
                {errors.scopes}
              </p>
            )}
          </fieldset>
          <Field label="Expires">
            <Select value={f.expires} onChange={(e) => set({ expires: e.target.value })}>
              {EXPIRY.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </>
      )}
      <Field label="Rate limit (requests per minute)" error={errors.rate} hint="Requests over the limit get a 429 until the minute ends.">
        <Input type="number" min={1} max={600} value={f.rate} onChange={(e) => set({ rate: e.target.value })} />
      </Field>
    </FormDialog>
  )
}

function Usage() {
  const { data, loading, error, reload } = useLoad(() => apiUsage(14), [])
  const t = data?.totals
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h3">Usage, last 14 days</CardTitle>
      </CardHeader>
      <CardContent>
        <DataGate loading={loading && !data} error={error?.message} onRetry={reload} skeleton="chart">
          <dl className="mb-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            {[
              ['Requests', t?.requests],
              ['Succeeded', t?.ok],
              ['Client errors', t?.client_errors],
              ['Server errors', t?.server_errors],
              ['Rate limited', t?.rate_limited],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="text-lg font-semibold tabular-nums">{v ?? 0}</dd>
              </div>
            ))}
          </dl>
          <Chart height={140} empty={!t?.requests} emptyText="No API requests yet." summary="API requests per day over the last 14 days">
            <AreaChart data={(data?.daily ?? []).map((d) => ({ ...d, label: d.day.slice(5) }))}>
              {grid()}
              {xAxis({ dataKey: 'label' })}
              {yAxis({ allowDecimals: false })}
              {tooltip()}
              <Area type="monotone" dataKey="requests" name="Requests" stroke="#8B5CF6" fill="#8B5CF633" strokeWidth={2} />
              <Area type="monotone" dataKey="errors" name="Errors" stroke="#EF4444" fill="#EF444422" strokeWidth={1.5} />
            </AreaChart>
          </Chart>
          {data?.top?.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs">
              {data.top.map((r) => (
                <li key={r.method + r.path} className="flex justify-between gap-3">
                  <code>
                    {r.method} {r.path}
                  </code>
                  <span className="text-muted-foreground">
                    {r.requests} requests{r.errors ? ` · ${r.errors} errors` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DataGate>
      </CardContent>
    </Card>
  )
}

export function KeysTab() {
  const confirm = useConfirm()
  const { data: keys, loading, error, reload } = useLoad(listApiKeys, [])
  const [form, setForm] = useState({ open: false, editing: null })
  const [secret, setSecret] = useState(null)
  const [revoke, revoking] = useAction(async (k) => {
    if (
      !(await confirm({
        title: `Revoke “${k.name}”?`,
        description: 'Anything using this key stops working immediately. This cannot be undone: create a new key if you need one again.',
        confirmLabel: 'Revoke key',
      }))
    )
      return
    await revokeApiKey(k.id)
    toast.success('Key revoked')
    await reload()
  })
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          API keys let your own scripts and tools read (and, where you allow it, write) your LifeTrack data. Use them from a server you
          control, never in a web page or app.
        </p>
        <Button onClick={() => setForm({ open: true, editing: null })}>
          <Plus className="h-4 w-4" aria-hidden /> New key
        </Button>
      </div>
      <DataGate loading={loading && !keys} error={error?.message} onRetry={reload} skeleton="list">
        {!keys?.length ? (
          <EmptyState
            icon={KeyRound}
            title="No API keys yet"
            description="Create a key to use the LifeTrack API. You choose exactly what it may do, how long it lasts and how fast it may call."
            action={<Button onClick={() => setForm({ open: true, editing: null })}>Create your first key</Button>}
          />
        ) : (
          <ul className="space-y-3">
            {keys.map((k) => {
              const s = state(k)
              return (
                <li key={k.id}>
                  <Card>
                    <CardContent className="space-y-2" data-testid="api-key">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden />
                          <h3 className="font-medium">{k.name}</h3>
                          <Badge tone={s.tone}>{s.label}</Badge>
                        </div>
                        {!k.revoked_at && (
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => setForm({ open: true, editing: k })}>
                              <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => revoke(k)} disabled={revoking}>
                              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Revoke
                            </Button>
                          </div>
                        )}
                      </div>
                      {k.description && <p className="text-sm text-muted-foreground">{k.description}</p>}
                      <p className="font-mono text-xs text-muted-foreground">{k.key_prefix}…</p>
                      <div className="flex flex-wrap gap-1">
                        {k.scopes.map((s2) => (
                          <Badge key={s2} className="font-mono">
                            {s2}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Created {stamp(k.created_at)} · {k.expires_at ? `expires ${stamp(k.expires_at)}` : 'never expires'} · last used{' '}
                        {ago(k.last_used_at)} · {k.request_count} request{Number(k.request_count) === 1 ? '' : 's'} · {k.rate_limit_per_min}
                        /min
                      </p>
                    </CardContent>
                  </Card>
                </li>
              )
            })}
          </ul>
        )}
      </DataGate>
      <Usage />
      <KeyForm
        key={form.editing?.id ?? 'new'}
        open={form.open}
        onOpenChange={(o) => setForm((x) => ({ ...x, open: o }))}
        editing={form.editing}
        onSaved={async (created) => {
          if (created) setSecret(created)
          await reload()
        }}
      />
      <SecretDialog
        open={Boolean(secret)}
        onClose={() => setSecret(null)}
        title="Your new API key"
        intro={secret ? `Copy “${secret.name}” now. For your security only its fingerprint is stored, so it cannot be shown again.` : ''}
        secret={secret?.key ?? ''}
      />
    </div>
  )
}
