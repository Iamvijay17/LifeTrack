import { memo } from 'react'
import { AlertTriangle } from 'lucide-react'
import { NODE_H, NODE_W, nodeSummary, nodeTitle } from '@lifetrack/core/automation'
import { cn } from '@/lib/utils'
import { NODE_STYLE, nodeIcon } from './format'

/** One step on the canvas. Drag it by its body, connect it from the round handle on its right edge. */
export const NodeCard = memo(function NodeCard({ node, selected, issue, onPointerDown, onHandleDown, onKeyDown, onSelect }) {
  const st = NODE_STYLE[node.type]
  const Icon = nodeIcon(node)
  return (
    <div
      data-node-id={node.id}
      role="button"
      tabIndex={0}
      aria-label={`${st.label}: ${nodeTitle(node)}. ${nodeSummary(node)}${issue ? `. ${issue === 'error' ? 'Needs attention' : 'Warning'}` : ''}`}
      aria-pressed={selected}
      onPointerDown={(e) => onPointerDown(e, node)}
      onKeyDown={(e) => onKeyDown(e, node)}
      onFocus={() => onSelect(node)}
      style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H }}
      className={cn(
        'group absolute cursor-grab touch-none select-none rounded-xl border bg-card p-3 text-left shadow-card outline-none transition-[box-shadow,border-color] duration-150 active:cursor-grabbing',
        'hover:shadow-lg focus-visible:ring-2 focus-visible:ring-mod',
        selected ? 'border-mod shadow-[0_0_0_3px_rgb(var(--mod)/0.25)]' : 'border-border',
        issue === 'error' && !selected && 'border-danger/60',
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-lg', st.chip)}>
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{st.label}</span>
          <span className="block truncate text-[13px] font-semibold leading-tight">{nodeTitle(node)}</span>
        </span>
        {issue && <AlertTriangle className={cn('h-4 w-4 shrink-0', issue === 'error' ? 'text-danger' : 'text-warning')} aria-hidden />}
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-snug text-muted-foreground">{nodeSummary(node)}</p>
      {node.type !== 'trigger' && (
        <span
          aria-hidden
          data-handle-in
          className={cn('absolute -left-[7px] top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 border-card', st.dot)}
        />
      )}
      <span
        aria-hidden
        data-handle-out
        onPointerDown={(e) => onHandleDown(e, node)}
        className={cn(
          'absolute -right-[9px] top-1/2 h-[18px] w-[18px] -translate-y-1/2 cursor-crosshair rounded-full border-2 border-card transition-transform hover:scale-125',
          st.dot,
        )}
      />
    </div>
  )
})
