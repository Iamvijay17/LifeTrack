import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeftRight, Check, Crosshair, ExternalLink, Link2, Pencil, Trash2, Undo2, Unlink, X } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/form'
import { Badge, Progress } from '@/components/ui/misc'
import { useAction } from '@/hooks/useAction'
import { useConfirmedDelete } from '@/hooks/useConfirmedDelete'
import * as store from '@/hooks/store'
import { linkNodes, reverseLink } from '@/services/api'
import { checkLink } from '@/domain/lifeMap'
import { fmtDay } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { KIND_STYLE, kindColor } from './kinds'

function Chip({ n, onClick, trailing }) {
  const st = KIND_STYLE[n.kind]
  const Icon = st.icon
  return (
    <li className="flex items-center gap-1">
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-mod"
      >
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: kindColor(n) }} aria-hidden />
        <span className="min-w-0 flex-1 truncate">{n.title}</span>
        <span className={cn('shrink-0 text-[11px]', n.status === 'done' ? 'text-success' : 'text-muted-foreground')}>
          {n.status === 'done' ? 'Done' : n.detail}
        </span>
      </button>
      {trailing}
    </li>
  )
}

/** Add a connection from the panel: the keyboard- and touch-friendly twin of dragging from the dot. */
function Connector({ map, node }) {
  const [dir, setDir] = useState('to') // 'to': this contributes to X. 'from': X contributes to this.
  const [other, setOther] = useState('')
  const [label, setLabel] = useState('')
  const [save, pending] = useAction(
    async () => {
      const [from, to] = dir === 'to' ? [node.key, other] : [other, node.key]
      await linkNodes(map, from, to, label)
      setOther('')
      setLabel('')
    },
    { success: 'Connected' },
  )
  const options = map.nodes.filter((n) => n.key !== node.key && !checkLink(map, ...(dir === 'to' ? [node.key, n.key] : [n.key, node.key])))
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (other) save()
      }}
      className="space-y-2 rounded-lg border border-border p-2.5"
    >
      <p className="flex items-center gap-1.5 text-xs font-medium">
        <Link2 className="h-3.5 w-3.5" aria-hidden />
        Connect to
      </p>
      <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label="Direction">
        {[
          ['to', 'Feeds into…'],
          ['from', 'Is fed by…'],
        ].map(([v, text]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={dir === v}
            onClick={() => {
              setDir(v)
              setOther('')
            }}
            className={cn(
              'rounded-md border px-2 py-1 text-xs',
              dir === v ? 'border-mod bg-mod/10 text-mod-text' : 'border-border text-muted-foreground',
            )}
          >
            {text}
          </button>
        ))}
      </div>
      <Select aria-label="Item to connect" className="h-9" value={other} onChange={(e) => setOther(e.target.value)}>
        <option value="">Choose an item…</option>
        {Object.keys(KIND_STYLE).map((kind) => {
          const list = options.filter((n) => n.kind === kind)
          return (
            list.length > 0 && (
              <optgroup key={kind} label={KIND_STYLE[kind].label}>
                {list.map((n) => (
                  <option key={n.key} value={n.key}>
                    {n.title}
                  </option>
                ))}
              </optgroup>
            )
          )
        })}
      </Select>
      <Input
        aria-label="Label (optional)"
        className="h-9"
        placeholder="Label (optional)"
        maxLength={60}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
      <Button type="submit" size="sm" className="w-full" disabled={!other || pending}>
        Connect
      </Button>
    </form>
  )
}

function EdgePanel({ map, edge, onSelect, onClose }) {
  const from = map.byKey.get(edge.from)
  const to = map.byKey.get(edge.to)
  const link = edge.id ? store.peek('life_map_links').find((l) => l.id === edge.id) : null
  const [label, setLabel] = useState(edge.label ?? '')
  const [saveLabel, savingLabel] = useAction(() => store.update('life_map_links', edge.id, { label: label.trim().slice(0, 60) }), {
    success: 'Label saved',
  })
  const [flip, flipping] = useAction(() => reverseLink(edge.id), { success: 'Direction reversed' })
  const [remove, removing] = useAction(() => store.remove('life_map_links', edge.id), { success: 'Connection removed' })
  return (
    <div className="space-y-3">
      <Header
        title="Connection"
        onClose={onClose}
        badge={<Badge tone={edge.state === 'done' ? 'success' : undefined}>{edge.state === 'done' ? 'Complete' : 'Pending'}</Badge>}
      />
      <ul className="space-y-0.5">
        <Chip n={from} onClick={() => onSelect({ type: 'node', key: from.key })} />
        <li aria-hidden className="pl-4 text-xs text-muted-foreground">
          contributes to ↓
        </li>
        <Chip n={to} onClick={() => onSelect({ type: 'node', key: to.key })} />
      </ul>
      {!link ? (
        <p className="rounded-lg bg-surface-2/60 p-3 text-xs text-muted-foreground">
          This connection comes from the milestone itself (it belongs to that goal), so it can&apos;t be removed here.
        </p>
      ) : (
        <>
          <Field label="Label (optional)">
            <div className="flex gap-1.5">
              <Input value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
              <Button variant="outline" onClick={saveLabel} disabled={savingLabel || label.trim() === (link.label ?? '')}>
                Save
              </Button>
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={flip} disabled={flipping}>
              <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden />
              Reverse
            </Button>
            <Button variant="outline" size="sm" onClick={remove} disabled={removing}>
              <Unlink className="h-3.5 w-3.5" aria-hidden />
              Remove
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

function Header({ title, onClose, badge, kind }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        {kind && <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{kind}</p>}
        <h2 className="break-words text-base font-semibold leading-snug">{title}</h2>
        {badge && <div className="mt-1">{badge}</div>}
      </div>
      <Button variant="ghost" size="icon-sm" aria-label="Close details" onClick={onClose}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}

/** Details for the selected node or connection: progress, what feeds it and what it feeds, and every edit that does not need dragging. */
export function Inspector({ map, selected, onSelect, onClose, onFocus, onCenter, onEdit }) {
  const removeNode = useConfirmedDelete('life_map_nodes', 'Removed from your map')
  const [toggleDone] = useAction((n) => store.update('life_map_nodes', n.id, { status: n.status === 'done' ? 'active' : 'done' }))
  const [unlink] = useAction((id) => store.remove('life_map_links', id), { success: 'Connection removed' })
  if (!selected) return null
  if (selected.type === 'edge') {
    const edge = map.edges.find((e) => e.key === selected.key)
    return edge ? <EdgePanel key={edge.key} map={map} edge={edge} onSelect={onSelect} onClose={onClose} /> : null
  }
  const n = map.byKey.get(selected.key)
  if (!n) return null
  const style = KIND_STYLE[n.kind]
  const fedBy = map.edges.filter((e) => e.to === n.key)
  const feeds = map.edges.filter((e) => e.from === n.key)
  const pct = Math.round(n.progress * 100)
  const list = (edges, side) =>
    edges.length > 0 && (
      <div>
        <h3 className="mb-1 text-xs font-medium text-muted-foreground">
          {side === 'from' ? `Fed by (${edges.length})` : `Feeds into (${edges.length})`}
        </h3>
        <ul>
          {edges.map((e) => (
            <Chip
              key={e.key}
              n={map.byKey.get(side === 'from' ? e.from : e.to)}
              onClick={() => onSelect({ type: 'node', key: side === 'from' ? e.from : e.to })}
              trailing={
                e.id && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove connection to ${map.byKey.get(side === 'from' ? e.from : e.to).title}`}
                    onClick={() => unlink(e.id)}
                  >
                    <Unlink className="h-3.5 w-3.5" />
                  </Button>
                )
              }
            />
          ))}
        </ul>
      </div>
    )
  return (
    <div className="space-y-4">
      <Header
        kind={style.label}
        title={n.title}
        onClose={onClose}
        badge={
          <span className="flex flex-wrap gap-1.5">
            <Badge tone={n.status === 'done' ? 'success' : undefined}>
              {n.status === 'done' ? 'Complete' : n.status === 'paused' ? 'Paused' : 'In progress'}
            </Badge>
            {n.category && <Badge>{n.category}</Badge>}
          </span>
        }
      />
      <div>
        <div className="mb-1 flex items-baseline justify-between text-xs">
          <span className="text-muted-foreground">{n.detail}</span>
          <span className="tabular-nums font-medium">{pct}%</span>
        </div>
        <Progress value={pct} label={`${n.title} progress`} tone={n.status === 'done' ? 'success' : undefined} />
        {n.feeders > 0 && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            {n.feedersDone} of {n.feeders} things feeding it {n.feedersDone === 1 ? 'is' : 'are'} done.
          </p>
        )}
      </div>
      {n.due && <p className="text-xs text-muted-foreground">Due {fmtDay(n.due, 'd MMM yyyy')}</p>}
      {n.notes && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{n.notes}</p>}

      <div className="flex flex-wrap gap-1.5">
        <Button variant="outline" size="sm" onClick={() => onFocus(n.key)}>
          <Crosshair className="h-3.5 w-3.5" aria-hidden />
          Focus
        </Button>
        <Button variant="outline" size="sm" onClick={() => onCenter(n)}>
          Centre
        </Button>
        {n.href && (
          <Link to={n.href} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            Open
          </Link>
        )}
        {n.own && (
          <>
            <Button variant="outline" size="sm" onClick={() => onEdit(n)}>
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              Edit
            </Button>
            <Button variant="outline" size="sm" onClick={() => toggleDone(n)}>
              {n.status === 'done' ? <Undo2 className="h-3.5 w-3.5" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
              {n.status === 'done' ? 'Reopen' : 'Mark done'}
            </Button>
          </>
        )}
      </div>

      {list(fedBy, 'from')}
      {list(feeds, 'to')}
      <Connector key={n.key} map={map} node={n} />

      {n.own && (
        <Button
          variant="ghost"
          size="sm"
          className="text-danger"
          onClick={async () => {
            if (
              await removeNode(n.id, {
                title: `Delete "${n.title}"?`,
                description: 'This removes it and its connections from the map. Nothing else in LifeTrack is affected.',
              })
            )
              onClose()
          }}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          Delete from map
        </Button>
      )}
    </div>
  )
}
