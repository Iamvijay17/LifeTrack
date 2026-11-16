import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Switch } from '@/components/ui/form'
import { MAX_NAME, cleanConfig, defaultConfig, widgetDef } from '@lifetrack/core/dashboardBuilder'

/** A widget's title and the options it declares (number of rows, ...). Only what the catalog lists is offered, so nothing here can break a card. */
export function WidgetSettings({ widget, onClose, onSave }) {
  const def = widget && widgetDef(widget.type)
  const [title, setTitle] = useState('')
  const [config, setConfig] = useState({})
  useEffect(() => {
    if (widget) {
      setTitle(widget.title ?? '')
      setConfig(widget.config ?? {})
    }
  }, [widget])
  if (!def) return null
  const set = (k, v) => setConfig((c) => ({ ...c, [k]: v }))
  const save = () => {
    onSave(widget.id, { title, config: cleanConfig(widget.type, config) })
    onClose()
  }
  return (
    <Dialog
      open={!!widget}
      onOpenChange={(o) => !o && onClose()}
      title={`${def.label} settings`}
      description="Only changes how this card looks on this dashboard."
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              setTitle('')
              setConfig(defaultConfig(widget.type))
            }}
          >
            Restore defaults
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Apply</Button>
        </>
      }
    >
      <div className="space-y-4 p-5">
        <Field label="Title" hint={`Shown above the card. Leave empty to use “${def.label}” as it is.`}>
          <Input value={title} maxLength={MAX_NAME} onChange={(e) => setTitle(e.target.value)} placeholder={def.label} />
        </Field>
        {def.config.map((c) => (
          <Field key={c.key} label={c.label}>
            {c.type === 'number' ? (
              <Input
                type="number"
                inputMode="numeric"
                min={c.min}
                max={c.max}
                value={config[c.key] ?? c.default}
                onChange={(e) => set(c.key, e.target.value)}
              />
            ) : (
              <Switch checked={!!(config[c.key] ?? c.default)} onChange={(v) => set(c.key, v)} label={c.label} />
            )}
          </Field>
        ))}
        {def.config.length === 0 && <p className="text-sm text-muted-foreground">This widget has no other options.</p>}
      </div>
    </Dialog>
  )
}
