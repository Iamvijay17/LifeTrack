import { useState } from 'react'
import { Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/misc'
import { DataGate } from '@/components/shared/states'
import { useConfirm } from '@/components/shared/Confirm'
import { useLoad } from '@/hooks/useLoad'
import { flagHistory, rollbackFlag } from '@/services/platform'
import { stamp } from '@/features/developers/shared'

const PAGE = 15
const describe = (h) => {
  const b = h.before ?? {}
  const a = h.after ?? {}
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
  const show = (v) =>
    Array.isArray(v)
      ? v.length
        ? `${v.length} item${v.length === 1 ? '' : 's'}`
        : 'none'
      : v === null || v === undefined
        ? '—'
        : String(v)
  return keys.map((k) => `${k.replace(/_/g, ' ')}: ${show(b[k])} → ${show(a[k])}`).join(' · ')
}

/** Every change to a flag, experiment or emergency control: who, what (before → after), when and why. Flag and control changes can be rolled back. */
export function HistoryTab({ reloadFlags }) {
  const confirm = useConfirm()
  const [page, setPage] = useState(0)
  const { data, loading, error, reload } = useLoad(() => flagHistory({ page, pageSize: PAGE }), [page])
  const undo = async (h) => {
    const ok = await confirm({
      title: 'Roll this change back?',
      description: `The settings go back to what they were before: ${describe({ before: h.after, after: h.before }) || 'the earlier state'}. The rollback is recorded as a new change, so it can be undone too.`,
      confirmLabel: 'Roll back',
      destructive: false,
    })
    if (!ok) return
    try {
      await rollbackFlag(h.id)
      toast.success('Rolled back.')
      reload()
      reloadFlags()
    } catch (e) {
      toast.error(e.message)
    }
  }
  const items = data?.items ?? []
  return (
    <Card>
      <CardContent className="p-0">
        <DataGate loading={loading && !data} error={error?.message} onRetry={reload} skeleton="list">
          {!items.length ? (
            <p className="p-8 text-center text-sm text-muted-foreground">Nothing has been changed yet.</p>
          ) : (
            <ul className="divide-y divide-border/60" aria-label="Change history">
              {items.map((h) => (
                <li key={h.id} className="flex flex-wrap items-start gap-3 p-4" data-testid={`history-${h.id}`}>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="flex flex-wrap items-center gap-2">
                      <code className="text-xs">{h.ref_key}</code>
                      <Badge>{h.action}</Badge>
                      {h.env && <Badge tone="primary">{h.env}</Badge>}
                    </span>
                    {describe(h) && <span className="mt-0.5 block break-words text-xs">{describe(h)}</span>}
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {stamp(h.at)} · {h.actor}
                      {h.reason ? ` · “${h.reason}”` : ''}
                    </span>
                  </span>
                  {['env_set', 'rollback', 'controls'].includes(h.action) && h.before && (
                    <Button size="sm" variant="outline" onClick={() => undo(h)}>
                      <Undo2 className="h-3.5 w-3.5" aria-hidden /> Roll back
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {(data?.total ?? 0) > PAGE && (
            <div className="flex items-center justify-between border-t border-border/60 p-3 text-xs text-muted-foreground">
              <span>
                {page * PAGE + 1}–{page * PAGE + items.length} of {data.total}
              </span>
              <span className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  Newer
                </Button>
                <Button size="sm" variant="outline" disabled={(page + 1) * PAGE >= data.total} onClick={() => setPage(page + 1)}>
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
