import { Plus, X } from 'lucide-react'
import { CONDITION_FIELDS, OPS, VARIABLES, WEEKDAYS, WEEKDAYS_SHORT, conditionField, fieldsForSubject } from '@lifetrack/core/automation'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { Segmented } from '@/components/ui/misc'
import { cn } from '@/lib/utils'

const showing = (f, config) => !f.showWhen || Object.entries(f.showWhen).every(([k, v]) => config[k] === v)

function Weekdays({ value = [], onChange, label }) {
  const on = new Set(value)
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1">
      {WEEKDAYS_SHORT.map((d, i) => (
        <button
          key={d}
          type="button"
          aria-pressed={on.has(i)}
          aria-label={WEEKDAYS[i]}
          onClick={() => onChange(on.has(i) ? value.filter((x) => x !== i) : [...value, i].sort())}
          className={cn(
            'h-9 min-w-10 rounded-lg border px-2 text-xs font-medium transition-colors',
            on.has(i) ? 'border-mod bg-mod/15 text-mod-text' : 'border-border text-muted-foreground hover:bg-muted',
          )}
        >
          {d}
        </button>
      ))}
    </div>
  )
}

/** The inputs for one node's configuration, generated from the catalogue so every advertised option is editable. */
export function ConfigFields({ fields, config, onChange, data, nodeType, subject }) {
  const set = (key, value) => onChange({ ...config, [key]: value })
  const emptyLabel = nodeType === 'trigger' ? 'Any' : 'The one that started the run'
  const vars = nodeType === 'action' ? [...(VARIABLES[subject] ?? []), ...VARIABLES.all] : []
  return (
    <div className="space-y-3.5">
      {fields
        .filter((f) => showing(f, config))
        .map((f) => {
          const v = config[f.key]
          let control
          if (f.type === 'time') control = <Input type="time" value={v ?? ''} onChange={(e) => set(f.key, e.target.value)} />
          else if (f.type === 'date')
            control = <Input type="date" value={v ?? ''} clearable={false} onChange={(e) => set(f.key, e.target.value)} />
          else if (f.type === 'number')
            control = (
              <Input
                type="number"
                inputMode="numeric"
                min={f.min}
                max={f.max}
                value={v ?? ''}
                onChange={(e) => set(f.key, e.target.value === '' ? '' : Number(e.target.value))}
              />
            )
          else if (f.type === 'textarea')
            control = <Textarea rows={3} maxLength={f.max} value={v ?? ''} onChange={(e) => set(f.key, e.target.value)} />
          else if (f.type === 'text')
            control = <Input type="text" maxLength={f.max} value={v ?? ''} onChange={(e) => set(f.key, e.target.value)} />
          else if (f.type === 'weekdays') control = <Weekdays label={f.label} value={v} onChange={(x) => set(f.key, x)} />
          else if (f.type === 'weekday')
            control = (
              <Select value={String(v ?? '')} onChange={(e) => set(f.key, Number(e.target.value))}>
                {WEEKDAYS.map((d, i) => (
                  <option key={d} value={String(i)}>
                    {d}
                  </option>
                ))}
              </Select>
            )
          else if (f.type === 'select')
            control = (
              <Select value={String(v ?? '')} onChange={(e) => set(f.key, e.target.value)}>
                {f.options.map((o) => (
                  <option key={String(o.value)} value={String(o.value)}>
                    {o.label}
                  </option>
                ))}
              </Select>
            )
          else {
            const list =
              {
                habit: data.habits.filter((h) => !h.archived_at).map((h) => [h.id, h.name]),
                goal: data.goals.filter((g) => g.status === 'active').map((g) => [g.id, g.title]),
                reminder: data.reminders.map((r) => [r.id, r.title]),
              }[f.type] ?? []
            control = (
              <Select value={v ?? ''} onChange={(e) => set(f.key, e.target.value)}>
                <option value="">{emptyLabel}</option>
                {list.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </Select>
            )
          }
          const wide = f.type === 'weekdays'
          return (
            <div key={f.key}>
              {/* Field wires its label to a single child, so the variable chips sit beside it, not inside it. */}
              <Field label={f.label} hint={f.hint}>
                {wide ? <div>{control}</div> : control}
              </Field>
              {(f.type === 'text' || f.type === 'textarea') && vars.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1" role="group" aria-label={`Insert into ${f.label}`}>
                  {vars.map((x) => (
                    <button
                      key={x}
                      type="button"
                      onClick={() => set(f.key, `${v ?? ''}{{${x}}}`)}
                      className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                    >
                      {`{{${x}}}`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
    </div>
  )
}

const firstValue = (f) => (f.type === 'select' ? String(f.options[0].value) : '')

/** The rules of a condition node: AND/OR over any number of rules. (Nesting is done by chaining condition nodes.) */
export function ConditionEditor({ config, onChange, subject }) {
  const rules = config.rules ?? []
  const available = fieldsForSubject(subject)
  const setRule = (i, patch) => onChange({ ...config, rules: rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) })
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1 text-[13px] font-medium">Run the next steps when</p>
        <Segmented
          value={config.mode ?? 'all'}
          onChange={(mode) => onChange({ ...config, mode })}
          options={[
            { value: 'all', label: 'All rules match (AND)' },
            { value: 'any', label: 'Any rule matches (OR)' },
          ]}
        />
      </div>
      {rules.map((r, i) => {
        const f = conditionField(r.field)
        return (
          <fieldset key={i} className="space-y-2 rounded-lg border border-border/70 p-2.5">
            <legend className="px-1 text-[11px] uppercase tracking-wide text-muted-foreground">Rule {i + 1}</legend>
            <Select
              aria-label={`Rule ${i + 1}: what to check`}
              value={r.field}
              onChange={(e) => {
                const nf = conditionField(e.target.value)
                setRule(i, { field: e.target.value, op: nf.ops[0], value: firstValue(nf) })
              }}
            >
              <option value="">Choose…</option>
              {available.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.label}
                </option>
              ))}
              {f && !available.includes(f) && <option value={f.key}>{f.label} (not available for this trigger)</option>}
            </Select>
            {f && (
              <div className="grid grid-cols-2 gap-2">
                <Select aria-label={`Rule ${i + 1}: comparison`} value={r.op} onChange={(e) => setRule(i, { op: e.target.value })}>
                  {f.ops.map((o) => (
                    <option key={o} value={o}>
                      {OPS[o]}
                    </option>
                  ))}
                </Select>
                {f.type === 'select' ? (
                  <Select
                    aria-label={`Rule ${i + 1}: value`}
                    value={String(r.value ?? '')}
                    onChange={(e) => setRule(i, { value: e.target.value })}
                  >
                    {f.options.map((o) => (
                      <option key={o.value} value={String(o.value)}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    aria-label={`Rule ${i + 1}: value`}
                    type={f.type === 'number' ? 'number' : 'text'}
                    value={r.value ?? ''}
                    onChange={(e) =>
                      setRule(i, { value: f.type === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value })
                    }
                  />
                )}
              </div>
            )}
            {rules.length > 1 && (
              <Button variant="ghost" size="sm" onClick={() => onChange({ ...config, rules: rules.filter((_, j) => j !== i) })}>
                <X className="h-3.5 w-3.5" aria-hidden /> Remove rule
              </Button>
            )}
          </fieldset>
        )
      })}
      <Button variant="outline" size="sm" onClick={() => onChange({ ...config, rules: [...rules, { field: '', op: 'eq', value: '' }] })}>
        <Plus className="h-3.5 w-3.5" aria-hidden /> Add a rule
      </Button>
      {CONDITION_FIELDS.length > 0 && available.length === fieldsForSubject(null).length && (
        <p className="text-xs text-muted-foreground">
          Only day-based rules are available for a time trigger. Choose a task, habit or goal trigger for more.
        </p>
      )}
    </div>
  )
}
