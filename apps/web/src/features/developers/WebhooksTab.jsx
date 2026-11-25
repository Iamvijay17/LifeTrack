import { useState } from 'react'
import { toast } from 'sonner'
import { ChevronDown, Pencil, Plus, RefreshCw, RotateCcw, Send, Trash2, Webhook } from 'lucide-react'
import { DataGate, EmptyState } from '@/components/shared/states'
import { FormDialog } from '@/components/shared/FormDialog'
import { useConfirm } from '@/components/shared/Confirm'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/misc'
import { Checkbox, Field, Input, Select, Switch } from '@/components/ui/form'
import { useLoad } from '@/hooks/useLoad'
import { useAction } from '@/hooks/useAction'
import { WEBHOOK_EVENTS, checkWebhookUrl } from '@lifetrack/core/platformApi'
import {
  createWebhook,
  deleteWebhook,
  deliverNow,
  listAttempts,
  listDeliveries,
  listWebhooks,
  retryDelivery,
  rotateWebhookSecret,
  sendTest,
  updateWebhook,
} from '@/services/platform'
import { SecretDialog, ago, stamp } from './shared'

const STATUS = {
  pending: ['neutral', 'Queued'],
  sending: ['neutral', 'Sending'],
  retrying: ['warning', 'Retrying'],
  delivered: ['success', 'Delivered'],
  dead: ['danger', 'Failed (dead letter)'],
}

function EndpointForm({ open, onOpenChange, editing, onSaved }) {
  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState({})
  const f = form ?? {
    url: editing?.url ?? 'https://',
    description: editing?.description ?? '',
    events: editing?.events ?? [],
    timeout: String((editing?.timeout_ms ?? 5000) / 1000),
    attempts: String(editing?.max_attempts ?? 6),
    enabled: editing?.enabled ?? true,
  }
  const set = (p) => setForm({ ...f, ...p })
  const [save, saving] = useAction(async () => {
    const e = {}
    const chk = checkWebhookUrl(f.url.trim())
    if (!chk.ok) e.url = chk.reason
    if (!f.events.length) e.events = 'Choose at least one event.'
    const t = Number(f.timeout)
    const a = Number(f.attempts)
    if (!(t >= 1 && t <= 15)) e.timeout = 'From 1 to 15 seconds.'
    if (!Number.isInteger(a) || a < 1 || a > 10) e.attempts = 'From 1 to 10.'
    setErrors(e)
    if (Object.keys(e).length) return
    const body = { url: f.url.trim(), description: f.description, events: f.events, timeoutMs: Math.round(t * 1000), maxAttempts: a }
    if (editing) {
      await updateWebhook(editing.id, { ...body, enabled: f.enabled })
      toast.success('Webhook updated')
      onSaved(null)
    } else onSaved(await createWebhook(body))
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
      title={editing ? 'Edit webhook' : 'New webhook'}
      description="LifeTrack sends a signed HTTPS POST to this address when the events you pick happen."
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      pending={saving}
      submitLabel={editing ? 'Save' : 'Add webhook'}
    >
      <Field label="Endpoint URL" error={errors.url} hint="Must be a public https:// address. Internal and IP addresses are refused.">
        <Input type="url" inputMode="url" value={f.url} onChange={(e) => set({ url: e.target.value })} />
      </Field>
      <Field label="Description (optional)">
        <Input value={f.description} maxLength={200} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      <fieldset className="space-y-2">
        <legend className="text-[13px] font-medium">Events</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {WEBHOOK_EVENTS.map((ev) => (
            <Checkbox
              key={ev.key}
              checked={f.events.includes(ev.key)}
              label={
                <span>
                  <span className="font-mono text-xs">{ev.key}</span>
                  <span className="block text-xs text-muted-foreground">{ev.label}</span>
                </span>
              }
              onChange={(on) => set({ events: on ? [...f.events, ev.key] : f.events.filter((x) => x !== ev.key) })}
            />
          ))}
        </div>
        {errors.events && (
          <p role="alert" className="text-xs text-danger">
            {errors.events}
          </p>
        )}
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Timeout (seconds)" error={errors.timeout}>
          <Input type="number" min={1} max={15} step={1} value={f.timeout} onChange={(e) => set({ timeout: e.target.value })} />
        </Field>
        <Field label="Attempts before giving up" error={errors.attempts} hint="Retries wait 30 s, 1 min, 2 min, … up to 6 h.">
          <Input type="number" min={1} max={10} value={f.attempts} onChange={(e) => set({ attempts: e.target.value })} />
        </Field>
      </div>
      {editing && (
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={f.enabled} onChange={(v) => set({ enabled: v })} label="Enabled" /> Enabled
        </label>
      )}
    </FormDialog>
  )
}

function Attempts({ delivery }) {
  const { data, loading } = useLoad(() => listAttempts(delivery.id), [delivery.id, delivery.attempts])
  if (loading && !data)
    return (
      <p className="px-3 py-2 text-xs text-muted-foreground" role="status">
        Loading attempts…
      </p>
    )
  if (!data?.length) return <p className="px-3 py-2 text-xs text-muted-foreground">No attempt has been made yet.</p>
  return (
    <ol className="space-y-1 px-3 py-2 text-xs" aria-label="Delivery attempts">
      {data.map((a) => (
        <li key={a.id} className="flex flex-wrap gap-x-3">
          <span className="font-medium">#{a.attempt}</span>
          <Badge tone={a.ok ? 'success' : 'danger'}>{a.ok ? 'OK' : 'Failed'}</Badge>
          <span>{a.status ? `HTTP ${a.status}` : a.error}</span>
          <span className="text-muted-foreground">
            {a.duration_ms} ms · {stamp(a.created_at)}
          </span>
        </li>
      ))}
    </ol>
  )
}

function Deliveries({ endpoints, refreshKey }) {
  const [endpointId, setEndpointId] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState(null)
  const { data, loading, error, reload } = useLoad(
    () => listDeliveries({ endpointId: endpointId || undefined, status: status || undefined, page }),
    [endpointId, status, page, refreshKey],
  )
  const [retry, retrying] = useAction(async (d) => {
    await retryDelivery(d.id)
    toast.success('Queued for another attempt')
    try {
      await deliverNow()
    } catch {
      /* the scheduler will pick it up */
    }
    await reload()
  })
  const names = Object.fromEntries(endpoints.map((e) => [e.id, new URL(e.url).hostname]))
  const rows = data?.rows ?? []
  return (
    <Card>
      <CardHeader className="flex-wrap gap-2">
        <CardTitle as="h3">Delivery history</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Select
            aria-label="Endpoint"
            className="w-44"
            value={endpointId}
            onChange={(e) => {
              setEndpointId(e.target.value)
              setPage(0)
            }}
          >
            <option value="">All endpoints</option>
            {endpoints.map((e) => (
              <option key={e.id} value={e.id}>
                {names[e.id]}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Status"
            className="w-40"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(0)
            }}
          >
            <option value="">Any status</option>
            {Object.entries(STATUS).map(([k, [, l]]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <DataGate loading={loading && !data} error={error?.message} onRetry={reload} skeleton="list">
          {!rows.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No deliveries yet. They appear here when one of your events happens, or when you send a test.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {rows.map((d) => {
                const [tone, label] = STATUS[d.status] ?? ['neutral', d.status]
                return (
                  <li key={d.id} data-testid="delivery">
                    <div className="flex flex-wrap items-center gap-2 py-2.5">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        aria-expanded={open === d.id}
                        onClick={() => setOpen(open === d.id ? null : d.id)}
                      >
                        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open === d.id ? 'rotate-180' : ''}`} aria-hidden />
                        <span className="min-w-0">
                          <span className="block font-mono text-xs">{d.event_type}</span>
                          <span className="text-xs text-muted-foreground">
                            {names[d.endpoint_id] ?? 'Deleted endpoint'} · {stamp(d.created_at)} · {d.attempts} attempt
                            {d.attempts === 1 ? '' : 's'}
                            {d.last_error ? ` · ${d.last_error}` : ''}
                          </span>
                        </span>
                      </button>
                      <Badge tone={tone}>{label}</Badge>
                      {(d.status === 'dead' || d.status === 'retrying') && (
                        <Button size="sm" variant="outline" onClick={() => retry(d)} disabled={retrying}>
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Retry
                        </Button>
                      )}
                    </div>
                    {open === d.id && (
                      <div className="mb-2 rounded-md bg-muted/30">
                        <Attempts delivery={d} />
                        {d.status === 'retrying' && (
                          <p className="px-3 pb-2 text-xs text-muted-foreground">
                            Next attempt{' '}
                            {ago(d.next_attempt_at).replace(' ago', '') === 'just now' ? 'is due' : `at ${stamp(d.next_attempt_at)}`}.
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {(data?.total ?? 0) > 20 && (
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {page * 20 + 1}–{page * 20 + rows.length} of {data.total}
              </span>
              <span className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  Newer
                </Button>
                <Button size="sm" variant="outline" disabled={(page + 1) * 20 >= data.total} onClick={() => setPage(page + 1)}>
                  Older
                </Button>
              </span>
            </div>
          )}
        </DataGate>
      </CardContent>
    </Card>
  )
}

export function WebhooksTab() {
  const confirm = useConfirm()
  const { data: endpoints, loading, error, reload } = useLoad(listWebhooks, [])
  const [form, setForm] = useState({ open: false, editing: null })
  const [secret, setSecret] = useState(null)
  const [tick, setTick] = useState(0)
  const bump = async () => {
    await reload()
    setTick((t) => t + 1)
  }
  const [test, testing] = useAction(async (e) => {
    const r = await sendTest(e.id)
    toast.success('Test event sent', {
      description: r?.delivered ? 'The endpoint answered with a success status.' : 'See the delivery history for the result.',
    })
    await bump()
  })
  const [flush, flushing] = useAction(async () => {
    const r = await deliverNow()
    toast.success(r.claimed ? `Sent ${r.claimed} queued event${r.claimed === 1 ? '' : 's'}` : 'Nothing was waiting')
    await bump()
  })
  const [toggle] = useAction(async (e, enabled) => {
    await updateWebhook(e.id, {
      url: e.url,
      description: e.description,
      events: e.events,
      enabled,
      timeoutMs: e.timeout_ms,
      maxAttempts: e.max_attempts,
    })
    await reload()
  })
  const [rotate] = useAction(async (e) => {
    if (
      !(await confirm({
        title: 'Rotate the signing secret?',
        description: 'The old secret stops working immediately. Update your receiver with the new one.',
        confirmLabel: 'Rotate secret',
        destructive: false,
      }))
    )
      return
    setSecret({ name: new URL(e.url).hostname, secret: await rotateWebhookSecret(e.id) })
  })
  const [remove] = useAction(async (e) => {
    if (
      !(await confirm({
        title: 'Delete this webhook?',
        description: `${e.url}\nIts delivery history is deleted with it. Events that have not been sent yet are dropped.`,
        confirmLabel: 'Delete webhook',
      }))
    )
      return
    await deleteWebhook(e.id)
    toast.success('Webhook deleted')
    await bump()
  })
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Webhooks tell another system the moment something happens in LifeTrack. Each delivery is signed so the receiver can prove it came
          from you, and failed deliveries are retried.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => flush()} loading={flushing}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Deliver queued now
          </Button>
          <Button onClick={() => setForm({ open: true, editing: null })}>
            <Plus className="h-4 w-4" aria-hidden /> New webhook
          </Button>
        </div>
      </div>
      <DataGate loading={loading && !endpoints} error={error?.message} onRetry={reload} skeleton="list">
        {!endpoints?.length ? (
          <EmptyState
            icon={Webhook}
            title="No webhooks yet"
            description="Add the address of a server you control and choose which events it should hear about."
            action={<Button onClick={() => setForm({ open: true, editing: null })}>Add a webhook</Button>}
          />
        ) : (
          <ul className="space-y-3">
            {endpoints.map((e) => (
              <li key={e.id}>
                <Card>
                  <CardContent className="space-y-2" data-testid="webhook">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <h3 className="break-all font-medium">{e.url}</h3>
                        <Badge tone={e.enabled ? 'success' : 'warning'}>{e.enabled ? 'Enabled' : 'Off'}</Badge>
                      </div>
                      <Switch checked={e.enabled} onChange={(v) => toggle(e, v)} label={`${e.enabled ? 'Disable' : 'Enable'} ${e.url}`} />
                    </div>
                    {e.description && <p className="text-sm text-muted-foreground">{e.description}</p>}
                    {e.disabled_reason && !e.enabled && <p className="text-xs text-warning">{e.disabled_reason}</p>}
                    <div className="flex flex-wrap gap-1">
                      {e.events.map((v) => (
                        <Badge key={v} className="font-mono">
                          {v}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Timeout {e.timeout_ms / 1000} s · up to {e.max_attempts} attempts · last delivery {ago(e.last_delivery_at)}
                      {e.consecutive_failures ? ` · ${e.consecutive_failures} failed in a row` : ''}
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => test(e)} disabled={testing}>
                        <Send className="h-3.5 w-3.5" aria-hidden /> Send test
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setForm({ open: true, editing: e })}>
                        <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => rotate(e)}>
                        Rotate secret
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => remove(e)}>
                        <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </DataGate>
      {endpoints?.length > 0 && <Deliveries endpoints={endpoints} refreshKey={tick} />}
      <EndpointForm
        key={form.editing?.id ?? 'new'}
        open={form.open}
        onOpenChange={(o) => setForm((x) => ({ ...x, open: o }))}
        editing={form.editing}
        onSaved={async (created) => {
          if (created) setSecret({ name: 'new webhook', secret: created.secret })
          await bump()
        }}
      />
      <SecretDialog
        open={Boolean(secret)}
        onClose={() => setSecret(null)}
        title="Signing secret"
        intro="Your receiver uses this secret to check the X-LifeTrack-Signature header of every delivery. It is shown only now."
        secret={secret?.secret ?? ''}
      />
    </div>
  )
}
