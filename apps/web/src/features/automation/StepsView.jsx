import { AlertTriangle, ArrowDown } from 'lucide-react'
import { nodeSummary, nodeTitle, runOrder } from '@lifetrack/core/automation'
import { cn } from '@/lib/utils'
import { NODE_STYLE, nodeIcon } from './format'
import { Palette } from './Palette'

/**
 * The workflow as a list, in the order it runs. It is the phone's viewer and its simplified editor (tap a step to edit it, add steps from the
 * list below), and an alternative to the canvas on any screen.
 */
export function StepsView({ graph, selection, issues, onSelect, onAdd }) {
  const order = runOrder(graph)
  const rest = graph.nodes.filter((n) => !order.includes(n.id))
  const nodes = [...order, ...rest.map((n) => n.id)].map((id) => graph.nodes.find((n) => n.id === id))
  return (
    <div className="space-y-3" data-testid="steps-view">
      <ol className="space-y-1.5" aria-label="Steps in the order they run">
        {nodes.map((n, i) => {
          const st = NODE_STYLE[n.type]
          const Icon = nodeIcon(n)
          const issue = issues.get(n.id)
          const next = graph.edges.filter((e) => e.from === n.id).length
          return (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => onSelect({ kind: 'node', id: n.id })}
                aria-pressed={selection?.id === n.id}
                className={cn(
                  'flex w-full items-start gap-3 rounded-xl border bg-card p-3 text-left shadow-card transition-colors',
                  selection?.id === n.id ? 'border-mod' : 'border-border',
                  issue === 'error' && 'border-danger/60',
                )}
              >
                <span className={cn('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg', st.chip)}>
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{st.label}</span>
                  <span className="block text-sm font-semibold">{nodeTitle(n)}</span>
                  <span className="block text-[13px] leading-snug text-muted-foreground">{nodeSummary(n)}</span>
                </span>
                {issue && (
                  <AlertTriangle
                    className={cn('mt-1 h-4 w-4 shrink-0', issue === 'error' ? 'text-danger' : 'text-warning')}
                    aria-label={issue === 'error' ? 'Needs attention' : 'Warning'}
                  />
                )}
              </button>
              {i < nodes.length - 1 && next > 0 && (
                <div className="flex justify-center py-0.5 text-muted-foreground" aria-hidden>
                  <ArrowDown className="h-4 w-4" />
                </div>
              )}
            </li>
          )
        })}
      </ol>
      <details className="rounded-xl border border-border bg-card p-3">
        <summary className="cursor-pointer text-sm font-medium">Add a step</summary>
        <Palette onAdd={onAdd} className="mt-3 max-h-72" />
      </details>
    </div>
  )
}
