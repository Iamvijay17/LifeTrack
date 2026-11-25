import { Plus } from 'lucide-react'
import { ACTIONS, TRIGGERS, TRIGGER_GROUPS } from '@lifetrack/core/automation'
import { cn } from '@/lib/utils'
import { NODE_STYLE, nodeIcon } from './format'

function Item({ type, kind, label, onAdd }) {
  const st = NODE_STYLE[type]
  const Icon = nodeIcon({ type, kind })
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-lt-node', JSON.stringify({ type, kind }))
        e.dataTransfer.effectAllowed = 'copy'
      }}
      onClick={() => onAdd({ type, kind })}
      aria-label={`Add ${st.label.toLowerCase()}: ${label}`}
      className="group flex w-full items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left text-[13px] transition-colors hover:border-border hover:bg-muted/60"
    >
      <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-md', st.chip)}>
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <Plus
        className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        aria-hidden
      />
    </button>
  )
}

/** The steps you can add. Click one (it joins the selected step) or drag it onto the canvas. */
export function Palette({ onAdd, className }) {
  return (
    <nav aria-label="Add a step" className={cn('space-y-4 overflow-y-auto', className)}>
      <section>
        <h2 className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Condition</h2>
        <Item type="condition" kind="condition" label="If … (AND / OR rules)" onAdd={onAdd} />
      </section>
      <section>
        <h2 className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</h2>
        {ACTIONS.map((a) => (
          <Item key={a.kind} type="action" kind={a.kind} label={a.label} onAdd={onAdd} />
        ))}
      </section>
      <section>
        <h2 className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Change the trigger</h2>
        {TRIGGER_GROUPS.map((g) => (
          <details key={g} className="group/d">
            <summary className="cursor-pointer rounded-md px-2 py-1 text-[13px] text-muted-foreground hover:text-foreground">{g}</summary>
            <div className="ml-1">
              {TRIGGERS.filter((t) => t.group === g).map((t) => (
                <Item key={t.kind} type="trigger" kind={t.kind} label={t.label} onAdd={onAdd} />
              ))}
            </div>
          </details>
        ))}
      </section>
    </nav>
  )
}
