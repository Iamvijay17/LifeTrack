import { useState } from 'react'
import { Activity } from 'lucide-react'
import { DataGate, EmptyState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/misc'
import { Checkbox, Select } from '@/components/ui/form'
import { Card, CardContent } from '@/components/ui/card'
import { useLoad } from '@/hooks/useLoad'
import { listApiKeys, listApiRequests } from '@/services/platform'
import { stamp } from './shared'

const tone = (s) => (s < 300 ? 'success' : s === 429 ? 'warning' : s < 500 ? 'warning' : 'danger')

/** The request history of the person's own keys: method, path, status, time taken. Never the key, the body or the response. */
export function ActivityTab() {
  const [keyId, setKeyId] = useState('')
  const [onlyErrors, setOnlyErrors] = useState(false)
  const [page, setPage] = useState(0)
  const { data: keys } = useLoad(listApiKeys, [])
  const { data, loading, error, reload } = useLoad(
    () => listApiRequests({ keyId: keyId || undefined, onlyErrors, page }),
    [keyId, onlyErrors, page],
  )
  const names = Object.fromEntries((keys ?? []).map((k) => [k.id, k.name]))
  const rows = data?.rows ?? []
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          aria-label="Key"
          className="w-56"
          value={keyId}
          onChange={(e) => {
            setKeyId(e.target.value)
            setPage(0)
          }}
        >
          <option value="">All keys</option>
          {(keys ?? []).map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </Select>
        <Checkbox
          checked={onlyErrors}
          onChange={(v) => {
            setOnlyErrors(v)
            setPage(0)
          }}
          label="Errors only (the API error log)"
        />
      </div>
      <DataGate loading={loading && !data} error={error?.message} onRetry={reload} skeleton="table">
        {!rows.length ? (
          <EmptyState
            icon={Activity}
            title={onlyErrors ? 'No failed requests' : 'No API requests yet'}
            description="Requests made with your keys appear here for 30 days: the method, the path, the result and how long it took."
          />
        ) : (
          <Card>
            <CardContent className="overflow-x-auto !p-0">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">API request history</caption>
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    {['When', 'Key', 'Request', 'Status', 'Time', 'Request id'].map((h) => (
                      <th key={h} scope="col" className="px-3 py-2 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-border/60">
                      <td className="whitespace-nowrap px-3 py-2">{stamp(r.created_at)}</td>
                      <td className="px-3 py-2">{names[r.key_id] ?? 'Deleted key'}</td>
                      <td className="px-3 py-2 font-mono">
                        {r.method} {r.path}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={tone(r.status)}>
                          {r.status}
                          {r.error_code ? ` ${r.error_code}` : ''}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 tabular-nums">{r.duration_ms} ms</td>
                      <td className="max-w-[10rem] truncate px-3 py-2 font-mono text-muted-foreground" title={r.request_id ?? ''}>
                        {r.request_id ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
        {(data?.total ?? 0) > 25 && (
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {page * 25 + 1}–{page * 25 + rows.length} of {data.total}
            </span>
            <span className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
                Newer
              </Button>
              <Button size="sm" variant="outline" disabled={(page + 1) * 25 >= data.total} onClick={() => setPage(page + 1)}>
                Older
              </Button>
            </span>
          </div>
        )}
      </DataGate>
    </div>
  )
}
