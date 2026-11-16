import { useState } from 'react'
import { LayoutTemplate, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/form'
import { Badge } from '@/components/ui/misc'
import { MAX_NAME, allBuiltinTemplates, instantiateTemplate, widgetDef } from '@lifetrack/core/dashboardBuilder'
import { useConfirm } from '@/components/shared/Confirm'

/** The template laid out as it would be on the large grid: blocks in their real proportions, named. */
function Preview({ tpl }) {
  const { widgets, layouts } = instantiateTemplate(tpl)
  const rows = Math.max(1, ...layouts.lg.map((it) => it.y + it.h))
  return (
    <div
      aria-hidden
      className="grid gap-1 rounded-lg border border-border bg-surface-2/60 p-1.5"
      style={{ gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gridTemplateRows: `repeat(${rows}, minmax(0, 7px))` }}
    >
      {layouts.lg.map((it) => {
        const w = widgets.find((x) => x.id === it.i)
        return (
          <span
            key={it.i}
            className="overflow-hidden rounded bg-primary/25 px-1 text-[8px] leading-[10px] text-foreground/80"
            style={{ gridColumn: `${it.x + 1} / span ${it.w}`, gridRow: `${it.y + 1} / span ${it.h}` }}
          >
            {widgetDef(w.type)?.label}
          </span>
        )
      })}
    </div>
  )
}

/**
 * Built-in and saved templates: preview one, apply it to this workspace, start a new workspace from it, or save the current layout as one.
 * Applying only rearranges widgets; no tasks, habits, transactions... are touched.
 */
export function TemplatesDialog({ open, onOpenChange, workspace, templates, onApply, onNew, onSave, onDelete }) {
  const [name, setName] = useState('')
  const confirm = useConfirm()
  const all = [...allBuiltinTemplates(), ...templates]
  const apply = async (tpl) => {
    const ok = await confirm({
      title: `Apply “${tpl.name}” to ${workspace.name}?`,
      description:
        'This replaces the widgets on this dashboard. Your tasks, habits, goals and other data are not changed. In edit mode you can still cancel.',
      confirmLabel: 'Apply',
      destructive: false,
    })
    if (ok) {
      onApply(tpl)
      onOpenChange(false)
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Dashboard templates"
      description="Start from a ready-made layout, then adjust it."
      className="md:max-w-3xl"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
        <ul className="grid gap-3 sm:grid-cols-2">
          {all.map((tpl) => (
            <li
              key={tpl.id}
              data-testid={`template-${tpl.id}`}
              className="flex flex-col gap-2 rounded-xl border border-border bg-card/60 p-3"
            >
              <Preview tpl={tpl} />
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold">{tpl.name}</h3>
                  <p className="text-xs text-muted-foreground">{tpl.description ?? `${tpl.widgets.length} widgets`}</p>
                </div>
                {!tpl.builtin && <Badge>Yours</Badge>}
              </div>
              <div className="mt-auto flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => apply(tpl)}>
                  Apply here
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    onNew(tpl)
                    onOpenChange(false)
                  }}
                >
                  New workspace
                </Button>
                {!tpl.builtin && (
                  <Button size="icon-sm" variant="ghost" aria-label={`Delete template ${tpl.name}`} onClick={() => onDelete(tpl.id)}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
        <form
          className="flex flex-wrap items-end gap-2 border-t border-border pt-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            onSave(name)
            setName('')
          }}
        >
          <Field label="Save this dashboard as a template" className="min-w-0 flex-1 basis-56">
            <Input value={name} maxLength={MAX_NAME} onChange={(e) => setName(e.target.value)} placeholder="Template name" />
          </Field>
          <Button type="submit" variant="outline" disabled={!name.trim()}>
            <LayoutTemplate className="h-4 w-4" aria-hidden />
            Save template
          </Button>
        </form>
      </div>
    </Dialog>
  )
}
