import { cn } from '@/lib/utils'
import { MinusCircle, CheckCircle2, XCircle, CircleDashed } from 'lucide-react'
import { when } from './format'

const ICON = {
  ok: [CheckCircle2, 'text-success'],
  failed: [XCircle, 'text-danger'],
  skipped: [MinusCircle, 'text-muted-foreground'],
  planned: [CircleDashed, 'text-muted-foreground'],
}

/** The inside of one run: the lifecycle times, then every step with what it did and why. */
export function ExecutionDetail({ execution: e, tz }) {
  return (
    <div className="space-y-3 border-t border-border/70 bg-surface-2/40 px-3.5 py-3 text-[13px]">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
        {[
          ['Started by', e.trigger_info?.label || e.trigger_kind],
          ['Created', when(e.created_at, tz)],
          ['Started', when(e.started_at, tz) || 'n/a'],
          ['Finished', when(e.finished_at, tz) || 'n/a'],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="truncate">{v}</dd>
          </div>
        ))}
      </dl>
      {e.status === 'failed' && (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-danger">
          {e.error || 'This run failed.'}{' '}
          {e.retryable ? 'It will be tried again automatically.' : 'It will not be retried automatically; you can retry it.'}
        </p>
      )}
      {e.status === 'skipped' && e.reason && <p className="rounded-lg bg-muted/60 px-3 py-2 text-muted-foreground">{e.reason}</p>}
      <ol className="space-y-1.5" aria-label="Steps">
        {(e.steps ?? []).map((s, i) => {
          const [Icon, tone] = ICON[s.status] ?? ICON.planned
          return (
            <li key={`${s.node_id}-${i}`} className="flex gap-2.5">
              <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone)} aria-hidden />
              <div className="min-w-0">
                <p className={cn(s.status === 'skipped' && 'text-muted-foreground')}>
                  <span className="mr-1.5 text-xs uppercase tracking-wide text-muted-foreground">{s.type}</span>
                  {s.detail}
                </p>
                {s.checks?.map((c, j) => (
                  <p key={j} className="text-xs text-muted-foreground">
                    {c.pass ? '✓' : '✗'} {c.label}: {String(c.actual)}
                  </p>
                ))}
                {s.error && <p className="text-xs text-danger">{s.error}</p>}
              </div>
            </li>
          )
        })}
        {!(e.steps ?? []).length && <li className="text-muted-foreground">No steps were recorded.</li>}
      </ol>
    </div>
  )
}
