import { useNavigate } from 'react-router-dom'
import { Copy, Pencil, Trash2, Zap } from 'lucide-react'
import { triggerNode, triggerSummary, validateWorkflow } from '@lifetrack/core/automation'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/misc'
import { Switch } from '@/components/ui/form'
import { Menu } from '@/components/ui/menu'
import { ago, statusMeta } from './format'

/** One workflow in the list: what starts it, whether it is on, how its last run went. */
export function WorkflowCard({ workflow: w, last, act }) {
  const nav = useNavigate()
  const t = triggerNode(w.graph)
  const problems = validateWorkflow(w).errors.length
  const s = last ? statusMeta(last.status) : null
  return (
    <Card interactive className="flex items-center gap-3 p-3.5">
      <span className="lt-icon-tile h-10 w-10 shrink-0 rounded-xl">
        <Zap className="h-4 w-4" aria-hidden />
      </span>
      <button type="button" onClick={() => nav(`/automation/${w.id}`)} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-semibold">{w.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{t ? triggerSummary(t.kind, t.config) : 'No trigger yet'}</span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {problems > 0 && <Badge tone="warning">Incomplete</Badge>}
          {s ? (
            <Badge tone={s.tone}>
              {s.label} {ago(last.created_at)}
            </Badge>
          ) : (
            <Badge>Never run</Badge>
          )}
        </span>
      </button>
      <Switch checked={w.enabled} onChange={(on) => act.toggle(w, on)} label={`${w.enabled ? 'Switch off' : 'Switch on'} ${w.name}`} />
      <Menu
        label={`Actions for ${w.name}`}
        items={[
          { label: 'Edit', icon: Pencil, onClick: () => nav(`/automation/${w.id}`) },
          { label: 'Duplicate', icon: Copy, onClick: () => act.duplicate(w) },
          { label: 'Delete', icon: Trash2, danger: true, onClick: () => act.remove(w) },
        ]}
      />
    </Card>
  )
}
